// Körperkomposition + Einordnungs-Skalen (Körperfett, BMI)
import { db } from "../store.js";
import { latestOf } from "../metrics.js";
import { fmtNum } from "../util.js";

const C={blue:"var(--z-blue)",green:"var(--z-green)",lime:"var(--z-lime)",amber:"var(--z-amber)",red:"var(--z-red)"};

function fatZones(){
  return db.settings.gender==="w"
    ? [{to:14,l:"Essentiell",c:C.blue},{to:21,l:"Athletisch",c:C.green},{to:25,l:"Fit",c:C.lime},{to:32,l:"Durchschnitt",c:C.amber},{to:45,l:"Hoch",c:C.red}]
    : [{to:6,l:"Essentiell",c:C.blue},{to:14,l:"Athletisch",c:C.green},{to:18,l:"Fit",c:C.lime},{to:25,l:"Durchschnitt",c:C.amber},{to:40,l:"Hoch",c:C.red}];
}
const BMI_ZONES=[{to:18.5,l:"Untergewicht",c:C.blue},{to:25,l:"Normal",c:C.green},{to:30,l:"Übergewicht",c:C.amber},{to:40,l:"Adipositas",c:C.red}];

function zoneBlock(title, zones, vmin, vmax, cur, unit){
  if(!cur) return "";
  const v=cur.v;
  const pct=Math.max(0,Math.min(100,(v-vmin)/(vmax-vmin)*100));
  const zone=zones.find(z=>v<z.to)||zones[zones.length-1];
  let from=vmin, segs="";
  zones.forEach(z=>{
    const wPct=(Math.min(z.to,vmax)-from)/(vmax-vmin)*100;
    segs+=`<div class="zseg" style="width:${wPct}%;background:${z.c}" title="${z.l}: ${fmtNum(from)}–${fmtNum(Math.min(z.to,vmax))} ${unit}"></div>`;
    from=z.to;
  });
  return `<div class="xblock">
    <div class="xtitle">${title}<span class="zcat" style="color:${zone.c}">${zone.l}</span></div>
    <div class="xval">${cur.calc?'<span class="approx">≈ </span>':""}${fmtNum(v)}<span class="unit">${unit}</span></div>
    <div class="zbar">${segs}<div class="zmark" style="left:${pct}%"></div></div>
    <div class="zends"><span>${fmtNum(vmin)}</span><span>${fmtNum(vmax)} ${unit}</span></div>
  </div>`;
}

function compBlock(){
  const w=latestOf("weight"), fm=latestOf("fatMass");
  if(!w || !fm) return "";
  const mu=latestOf("muscle");
  const fat=fm.v;
  const muscle=(mu && mu.v<w.v-fat) ? mu.v : null;
  const rest=w.v-fat-(muscle||0);
  const seg=(kg,c)=>`<div class="cseg" style="width:${(kg/w.v*100).toFixed(1)}%;background:${c}"></div>`;
  const leg=(c,l,kg,calc)=>`<span><span class="cdot" style="background:${c}"></span>${l} <b>${calc?"≈ ":""}${fmtNum(kg)} kg</b></span>`;
  return `<div class="xblock">
    <div class="xtitle">Körperkomposition</div>
    <div class="xval">${fmtNum(w.v)}<span class="unit">kg gesamt</span></div>
    <div class="cbar">
      ${muscle!=null?seg(muscle,C.green):""}
      ${seg(rest,"#55617a")}
      ${seg(fat,C.red)}
    </div>
    <div class="clegend">
      ${muscle!=null?leg(C.green,"Muskeln",muscle,mu.calc):""}
      ${leg("#55617a",muscle!=null?"Übrige Magermasse":"Magermasse",rest,true)}
      ${leg(C.red,"Fett",fat,fm.calc)}
    </div>
  </div>`;
}

export function renderZones(){
  const el=document.getElementById("bodyExtra");
  const html =
    compBlock() +
    zoneBlock("Körperfett", fatZones(), db.settings.gender==="w"?10:3, db.settings.gender==="w"?45:40, latestOf("fat"), "%") +
    zoneBlock("BMI", BMI_ZONES, 15, 40, latestOf("bmi"), "");
  el.innerHTML = html || `<div class="x-empty">Trag deine erste Messung ein und hinterlege Größe, Geschlecht und Geburtsjahr in den Einstellungen – dann erscheinen hier Komposition und Einordnung.</div>`;
}
