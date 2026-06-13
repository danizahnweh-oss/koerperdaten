import { db, selectMetric } from "../store.js";
import { METRICS, metric, seriesFor } from "../metrics.js";
import { fmtNum, fmtDate, fmtDateShort } from "../util.js";

const NS="http://www.w3.org/2000/svg";
const mk=(t,a)=>{const el=document.createElementNS(NS,t);for(const k in a)el.setAttribute(k,a[k]);return el;};

export function renderTabs(){
  const wrap=document.getElementById("metricTabs");
  wrap.innerHTML="";
  METRICS.forEach(m=>{
    if(m.id==="bmi" && !db.settings.height) return;
    const has=seriesFor(m.id).length>0;
    const b=document.createElement("button");
    b.className="tab"+(m.id===db.activeMetric?" active":"");
    b.textContent=m.label;
    b.style.opacity=has?1:.45;
    b.onclick=()=>selectMetric(m.id);
    wrap.appendChild(b);
  });
}

export function renderChart(){
  const svg=document.getElementById("chart");
  const box=svg.parentElement;
  const empty=document.getElementById("chartEmpty");
  const m=metric(db.activeMetric)||METRICS[0];
  const data=seriesFor(db.activeMetric);

  svg.innerHTML="";
  if(data.length===0){
    empty.style.display="grid";
    empty.textContent = db.entries.length
      ? `Keine Werte für „${m.label}".`
      : "Noch keine Daten. Trag unten deine erste Messung ein.";
    return;
  }
  empty.style.display="none";

  const W=box.clientWidth, H=box.clientHeight;
  const padL=48, padR=18, padT=16, padB=30;
  const iw=W-padL-padR, ih=H-padT-padB;

  const vals=data.map(d=>d.v);
  let min=Math.min(...vals), max=Math.max(...vals);
  if(min===max){ min-=1; max+=1; }
  const range=max-min; min-=range*0.12; max+=range*0.12;

  const n=data.length;
  const x=i=> n===1 ? padL+iw/2 : padL+(i/(n-1))*iw;
  const y=v=> padT+(1-(v-min)/(max-min))*ih;

  // Gitter + y-Beschriftung
  const ticks=4;
  for(let i=0;i<=ticks;i++){
    const val=min+(max-min)*(i/ticks);
    const yy=y(val);
    svg.appendChild(mk("line",{x1:padL,y1:yy,x2:W-padR,y2:yy,stroke:"#1b2233","stroke-width":1}));
    const lbl=mk("text",{x:padL-8,y:yy+4,"text-anchor":"end",fill:"#5d6880","font-size":11,"font-family":"var(--font-data)"});
    lbl.textContent=fmtNum(val);
    svg.appendChild(lbl);
  }
  // x-Beschriftung
  const step=Math.max(1,Math.ceil(n/6));
  for(let i=0;i<n;i+=step){
    const lbl=mk("text",{x:x(i),y:H-8,"text-anchor":"middle",fill:"#5d6880","font-size":11,"font-family":"var(--font-data)"});
    lbl.textContent=fmtDateShort(data[i].date);
    svg.appendChild(lbl);
  }

  // Fläche + Linie (mit Glow)
  let dPath="";
  data.forEach((p,i)=>{ dPath+=(i?"L":"M")+x(i)+" "+y(p.v)+" "; });
  const dArea=dPath+`L${x(n-1)} ${padT+ih} L${x(0)} ${padT+ih} Z`;

  const defs=mk("defs",{});
  const grad=mk("linearGradient",{id:"grad",x1:0,y1:0,x2:0,y2:1});
  grad.appendChild(mk("stop",{offset:"0%","stop-color":"#46d8e8","stop-opacity":.20}));
  grad.appendChild(mk("stop",{offset:"100%","stop-color":"#46d8e8","stop-opacity":0}));
  defs.appendChild(grad);
  const filter=mk("filter",{id:"lineGlow",x:"-20%",y:"-200%",width:"140%",height:"500%"});
  filter.appendChild(mk("feGaussianBlur",{stdDeviation:4}));
  defs.appendChild(filter);
  svg.appendChild(defs);

  svg.appendChild(mk("path",{d:dArea,fill:"url(#grad)"}));
  svg.appendChild(mk("path",{d:dPath,fill:"none",stroke:"#46d8e8","stroke-width":3,opacity:.5,filter:"url(#lineGlow)"}));
  svg.appendChild(mk("path",{d:dPath,fill:"none",stroke:"#46d8e8","stroke-width":2.2,"stroke-linejoin":"round","stroke-linecap":"round"}));

  // Punkte + Tooltip
  const tooltip=document.getElementById("tooltip");
  data.forEach((p,i)=>{
    const X=x(i),Y=y(p.v);
    const dot=mk("circle",{cx:X,cy:Y,r:n>40?2.5:4,fill:"#0a0e16",stroke:"#46d8e8","stroke-width":2});
    const hit=mk("circle",{cx:X,cy:Y,r:14,fill:"transparent",style:"cursor:pointer"});
    hit.addEventListener("mouseenter",()=>{
      dot.setAttribute("r",6);
      tooltip.innerHTML=`<b>${p.calc?"≈ ":""}${fmtNum(p.v)} ${m.unit}</b><div class="tt-date">${fmtDate(p.date)}${p.calc?" · berechnet":""}</div>`;
      tooltip.style.left=X+"px"; tooltip.style.top=Y+"px"; tooltip.style.opacity=1;
    });
    hit.addEventListener("mouseleave",()=>{ dot.setAttribute("r",n>40?2.5:4); tooltip.style.opacity=0; });
    svg.appendChild(dot); svg.appendChild(hit);
  });
}
