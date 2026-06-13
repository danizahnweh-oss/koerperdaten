import { sorted, metricValue, metricComputed } from "../metrics.js";
import { db, deleteEntry, emitChange } from "../store.js";
import { fmtNum, fmtDate } from "../util.js";
import { toast } from "./toast.js";

const COLS=[
  {id:"weight",l:"Gewicht"},{id:"fat",l:"Fett %"},{id:"muscle",l:"Muskel"},
  {id:"neck",l:"Hals"},{id:"waist",l:"Taille"},{id:"chest",l:"Brust"},
  {id:"hip",l:"Hüfte"},{id:"arm",l:"Arm"},{id:"thigh",l:"Bein"},
];

export function renderTable(){
  const t=document.getElementById("historyTable");
  const emptyEl=document.getElementById("historyEmpty");
  const count=document.getElementById("count");
  const rows=sorted().reverse();
  count.textContent = db.entries.length ? db.entries.length+" Einträge" : "";

  if(rows.length===0){ t.innerHTML=""; emptyEl.style.display="block"; return; }
  emptyEl.style.display="none";

  let html="<thead><tr><th>Datum</th>";
  COLS.forEach(c=>html+=`<th>${c.l}</th>`);
  html+="<th>Notiz</th><th></th></tr></thead><tbody>";
  rows.forEach(e=>{
    html+=`<tr><td>${fmtDate(e.date)}</td>`;
    COLS.forEach(c=>{
      const v=metricValue(e,c.id);
      const calc=metricComputed(e,c.id);
      html+=`<td>${v!=null?(calc?'<span class="approx" title="automatisch berechnet">≈ </span>':"")+fmtNum(v):"–"}</td>`;
    });
    html+=`<td class="note" title="${(e.notes||"").replace(/"/g,"&quot;")}">${e.notes||""}</td>`;
    html+=`<td><button class="row-del" data-date="${e.date}" title="Eintrag löschen">✕</button></td></tr>`;
  });
  html+="</tbody>";
  t.innerHTML=html;
  t.querySelectorAll(".row-del").forEach(b=>{
    b.onclick=()=>{
      deleteEntry(b.dataset.date);
      emitChange();
      toast("Eintrag gelöscht");
    };
  });
}
