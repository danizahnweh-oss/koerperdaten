import { db } from "./store.js";
import { calcFatNavy, calcMuscleLee, calcBmi } from "./formulas.js";

export const METRICS = [
  {id:"weight",  label:"Gewicht",       unit:"kg", goodDown:true},
  {id:"fat",     label:"Körperfett",    unit:"%",  goodDown:true},
  {id:"muscle",  label:"Muskelmasse",   unit:"kg", goodDown:false},
  {id:"bmi",     label:"BMI",           unit:"",   goodDown:true, computed:true},
  {id:"fatMass", label:"Fettmasse",     unit:"kg", goodDown:true, computed:true},
  {id:"ffm",     label:"Magermasse",    unit:"kg", goodDown:false, computed:true},
  {id:"neck",    label:"Hals",          unit:"cm", goodDown:true},
  {id:"chest",   label:"Brust",         unit:"cm", goodDown:false},
  {id:"waist",   label:"Taille",        unit:"cm", goodDown:true},
  {id:"hip",     label:"Hüfte",         unit:"cm", goodDown:true},
  {id:"arm",     label:"Oberarm",       unit:"cm", goodDown:false},
  {id:"thigh",   label:"Oberschenkel",  unit:"cm", goodDown:false},
];
export const MEASURE_IDS = ["weight","fat","muscle","neck","waist","chest","hip","arm","thigh"];
export const metric = id => METRICS.find(m=>m.id===id);

export function sorted(){
  return [...db.entries].sort((a,b)=> a.date<b.date?-1:1);
}

export function metricValue(e, id){
  switch(id){
    case "bmi":    return calcBmi(e);
    case "fat":    return e.fat!=null ? e.fat : calcFatNavy(e);
    case "muscle": return e.muscle!=null ? e.muscle : calcMuscleLee(e);
    case "fatMass":{
      const f=metricValue(e,"fat");
      return (f!=null && e.weight!=null) ? e.weight*f/100 : null;
    }
    case "ffm":{
      const fm=metricValue(e,"fatMass");
      return fm!=null ? e.weight-fm : null;
    }
    default: return e[id]!=null ? e[id] : null;
  }
}

// true, wenn der Wert aus einer Formel stammt statt gemessen wurde
export function metricComputed(e, id){
  if(id==="fat")    return e.fat==null    && calcFatNavy(e)!=null;
  if(id==="muscle") return e.muscle==null && calcMuscleLee(e)!=null;
  if(id==="bmi"||id==="fatMass"||id==="ffm") return metricValue(e,id)!=null;
  return false;
}

export function seriesFor(id){
  return sorted()
    .map(e=>({date:e.date, v:metricValue(e,id), calc:metricComputed(e,id)}))
    .filter(p=>p.v!=null);
}

// Letzter Wert + Gesamtveränderung seit der ersten Messung
export function latestOf(id){
  const s=seriesFor(id);
  if(!s.length) return null;
  const last=s[s.length-1], first=s[0];
  return { v:last.v, calc:last.calc, date:last.date, diff:last.v-first.v };
}

// Trend-Bewertung: {moved, bad} relativ zu goodDown der Metrik
export function trendOf(id){
  const m=metric(id), cur=latestOf(id);
  if(!cur) return null;
  const moved=Math.abs(cur.diff)>=0.05;
  const bad=moved && (m.goodDown ? cur.diff>0 : cur.diff<0);
  return { ...cur, moved, bad };
}
