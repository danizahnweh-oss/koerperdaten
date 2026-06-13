import { db, selectMetric } from "../store.js";
import { metric, seriesFor } from "../metrics.js";
import { fmtNum } from "../util.js";

const CARD_IDS=["weight","fat","muscle","bmi"];

function sparkSvg(vals){
  if(vals.length<2) return "";
  const n=vals.length, min=Math.min(...vals), max=Math.max(...vals), r=(max-min)||1;
  const pts=vals.map((v,i)=>[(i/(n-1))*100, 26-((v-min)/r)*22]);
  const d="M"+pts.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L ");
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L 100 30 L 0 30 Z" fill="rgba(70,216,232,.10)"></path>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
  </svg>`;
}

export function renderStats(){
  const wrap=document.getElementById("stats");
  wrap.innerHTML="";
  CARD_IDS.forEach(id=>{
    const m=metric(id);
    const s=seriesFor(id);
    const card=document.createElement("button");
    card.type="button";
    card.className="stat"+(db.activeMetric===id?" active":"");
    if(s.length===0){
      card.innerHTML=`<div class="label">${m.label}</div><div class="empty">Keine Daten</div>`;
    }else{
      const cur=s[s.length-1].v, diff=cur-s[0].v;
      let cls="flat", arrow="→", sign="";
      if(Math.abs(diff)>=0.05){
        const bad=m.goodDown ? diff>0 : diff<0;
        cls=bad?"pos":"neg";
        arrow=diff>0?"↑":"↓";
        sign=diff>0?"+":"";
      }
      const approx=s[s.length-1].calc?`<span class="approx" title="automatisch berechnet">≈ </span>`:"";
      card.innerHTML=`
        <div class="label">${m.label}</div>
        <div class="value">${approx}${fmtNum(cur)}<span class="unit">${m.unit}</span></div>
        <div class="delta ${cls}">${arrow} ${sign}${fmtNum(diff)} ${m.unit} gesamt</div>
        ${sparkSvg(s.map(p=>p.v))}`;
    }
    card.addEventListener("click", ()=>selectMetric(id));
    wrap.appendChild(card);
  });
}
