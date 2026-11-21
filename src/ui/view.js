// Umschalten Körper <-> Training: Tabs oben, Wischen auf Handy/Tablet, #hash merkt die Ansicht.
const VIEWS = ["body", "training"];
let current = null;
let onChange = ()=>{};

export function initViews(cb){
  onChange = cb || onChange;
  document.querySelectorAll(".viewswitch [data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));
  window.addEventListener("hashchange", ()=>setView(fromHash(), false));
  initSwipe();
  setView(fromHash(), false, true);
}

function fromHash(){ return location.hash==="#training" ? "training" : "body"; }

export function setView(v, push=true, initial=false){
  if(!VIEWS.includes(v) || (v===current && !initial)) return;
  current = v;
  VIEWS.forEach(id=>{
    document.getElementById("view-"+id).hidden = id!==v;
    const tab = document.getElementById("tab-"+id);
    tab.setAttribute("aria-selected", id===v);
    tab.classList.toggle("active", id===v);
  });
  if(push) history.replaceState(null, "", v==="training" ? "#training" : location.pathname+location.search);
  if(!initial) window.scrollTo({ top:0 });
  onChange(v);
}

// Horizontales Wischen wechselt die Ansicht. Ausgenommen: 3D-Viewer (Drehen),
// horizontal scrollbare Bereiche, Eingabefelder, Charts, offene Dialoge.
function initSwipe(){
  let sx=0, sy=0, t0=0, active=false;
  const blocked = el => el.closest("canvas, .viewer, .table-wrap, .tabs, .chart-box, input, textarea, select, .modal-bg.open, [data-noswipe]");
  document.addEventListener("touchstart", e=>{
    if(e.touches.length!==1 || blocked(e.target)){ active=false; return; }
    active=true; sx=e.touches[0].clientX; sy=e.touches[0].clientY; t0=Date.now();
  }, { passive:true });
  document.addEventListener("touchend", e=>{
    if(!active) return;
    active=false;
    const t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
    if(Date.now()-t0>700 || Math.abs(dx)<70 || Math.abs(dy)>Math.abs(dx)*0.6) return;
    const i = VIEWS.indexOf(current) + (dx<0 ? 1 : -1);
    if(i>=0 && i<VIEWS.length) setView(VIEWS[i]);
  }, { passive:true });
}
