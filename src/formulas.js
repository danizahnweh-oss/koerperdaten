// Hintergrund-Formeln: füllen Lücken, wenn Werte nicht gemessen wurden.
import { db } from "./store.js";

function ageAt(dateISO){
  if(!db.settings.birthYear) return null;
  return parseInt(dateISO.slice(0,4),10) - db.settings.birthYear;
}

// Körperfett nach US-Navy-Methode
// (braucht Größe, Geschlecht, Hals, Taille; Frauen zusätzlich Hüfte)
export function calcFatNavy(e){
  const s=db.settings;
  if(!s.height || !s.gender || e.waist==null || e.neck==null) return null;
  const log=Math.log10, h=s.height;
  let bf=null;
  if(s.gender==="m"){
    if(e.waist-e.neck<=0) return null;
    bf = 495/(1.0324 - 0.19077*log(e.waist-e.neck) + 0.15456*log(h)) - 450;
  }else{
    if(e.hip==null || e.waist+e.hip-e.neck<=0) return null;
    bf = 495/(1.29579 - 0.35004*log(e.waist+e.hip-e.neck) + 0.22100*log(h)) - 450;
  }
  return (bf>1 && bf<75) ? bf : null;
}

// Skelettmuskelmasse nach Lee-Formel
// (braucht Gewicht, Größe, Alter, Geschlecht)
export function calcMuscleLee(e){
  const s=db.settings;
  if(e.weight==null || !s.height || !s.gender) return null;
  const age=ageAt(e.date);
  if(age==null || age<10 || age>110) return null;
  const sm = 0.244*e.weight + 7.80*(s.height/100) - 0.098*age + (s.gender==="m"?6.6:0) - 3.3;
  return (sm>0 && e.weight>sm) ? sm : null;
}

export function calcBmi(e){
  if(!db.settings.height || e.weight==null) return null;
  const h=db.settings.height/100;
  return e.weight/(h*h);
}
