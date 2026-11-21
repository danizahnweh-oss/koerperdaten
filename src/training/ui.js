import {
  tdb, tbus, emitTraining, saveTraining, uid, roundW,
  newExercise, newDay, findDay, suggestedDayId, sortedSessions, lastResultFor, stallCount,
  startSession, cancelSession, finishSession, deleteSession, evaluate,
  bestSet, historyByName, exerciseNames, normName,
} from "./store.js";
import { latestOf } from "../metrics.js";
import { fmtNum, fmtDate, todayISO } from "../util.js";
import { drawLineChart } from "../ui/chart.js";
import { toast } from "../ui/toast.js";

const $ = id => document.getElementById(id);
const esc = s => String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kg = w => fmtNum(w)+" kg";
const scheme = ex => `${ex.sets} × ${ex.repMin===ex.repMax ? ex.repMin : ex.repMin+"–"+ex.repMax}`;
const bodyKg = () => latestOf("weight")?.v ?? null;
const loadLabel = r => r.bodyweight ? (r.weight ? `KG + ${kg(r.weight)}` : "Körpergewicht") : kg(r.weight);

let pickedDay = null;       // im Start-Panel gewählter Tag
let progressName = null;    // im Fortschritt-Chart gewählte Übung
const openDays = new Set(); // aufgeklappte Tage im Plan-Editor

// ======================= Heute / laufende Einheit =======================
function renderToday(){
  const box = $("tToday");
  if(tdb.active){ renderSession(box); return; }

  const days = tdb.plan.days;
  if(!days.length){
    box.innerHTML = `<div class="panel-head"><h2>Training</h2></div>
      <div class="empty-state">Noch kein Trainingsplan. Leg unten im Plan einen Trainingstag an.</div>`;
    return;
  }
  const sug = suggestedDayId();
  if(!pickedDay || !findDay(pickedDay)) pickedDay = sug;
  const last = sortedSessions().at(-1);
  const weekCount = sessionsThisWeek();

  box.innerHTML = `
    <div class="panel-head">
      <h2>Training starten</h2>
      <span class="sub">${weekCount} ${weekCount===1?"Einheit":"Einheiten"} diese Woche${last?` · zuletzt ${fmtDate(last.date)}`:""}</span>
    </div>
    <div class="day-pick" role="radiogroup" aria-label="Trainingstag">
      ${days.map(d=>`
        <button type="button" class="day-card${d.id===pickedDay?" active":""}" role="radio" aria-checked="${d.id===pickedDay}" data-day="${d.id}">
          <span class="dc-name">${esc(d.name)}</span>
          <span class="dc-meta">${d.exercises.length} Übungen${d.id===sug?` <span class="dc-next">als Nächstes</span>`:""}</span>
          <span class="dc-list">${d.exercises.map(e=>esc(e.name)).join(" · ")||"–"}</span>
        </button>`).join("")}
    </div>
    <div class="start-row">
      <div class="field"><label for="tDate">Datum</label><input type="date" id="tDate" value="${todayISO()}"></div>
      <button type="button" class="btn primary big" id="tStart">Training starten</button>
    </div>`;

  box.querySelectorAll(".day-card").forEach(b=>b.onclick=()=>{ pickedDay=b.dataset.day; renderToday(); });
  $("tStart").onclick = ()=>{
    const day = findDay(pickedDay);
    if(!day || !day.exercises.length){ toast("Dieser Tag hat noch keine Übungen"); return; }
    startSession(pickedDay, $("tDate").value || todayISO());
    renderToday();
    window.scrollTo({ top: $("tToday").offsetTop - 12 });
  };
}

function sessionsThisWeek(){
  const now = new Date(); const dow = (now.getDay()+6)%7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate()-dow);
  const iso = new Date(monday - monday.getTimezoneOffset()*60000).toISOString().slice(0,10);
  return tdb.sessions.filter(s=>s.date>=iso).length;
}

function renderSession(box){
  const a = tdb.active;
  box.innerHTML = `
    <div class="panel-head">
      <h2>${esc(a.dayName)}</h2>
      <span class="sub">${fmtDate(a.date)} · läuft</span>
    </div>
    <p class="session-help">Pro Satz <b>+</b> tippen trägt das Ziel ein, dann mit − / + anpassen. Satz nicht sauber? Auf <b>Sauber</b> tippen.</p>
    <div class="ex-list" id="exList"></div>
    <div class="form-actions">
      <button type="button" class="btn ghost" id="tCancel">Abbrechen</button>
      <button type="button" class="btn primary big" id="tFinish">Training abschließen</button>
    </div>`;
  const list = $("exList");
  a.exercises.forEach((r, i)=>list.appendChild(exerciseCard(r, i)));

  $("tCancel").onclick = ()=>{
    if(!confirm("Laufendes Training verwerfen? Eingetragene Sätze gehen verloren.")) return;
    cancelSession(); renderToday();
  };
  $("tFinish").onclick = ()=>{
    const open = a.exercises.some(r=>r.sets.some(s=>s.reps==null));
    if(open && !confirm("Nicht alle Sätze eingetragen. Trotzdem abschließen? Übungen mit fehlenden Sätzen werden nicht gesteigert.")) return;
    const res = finishSession();
    pickedDay = null;   // nächster Tag der Rotation wird vorgeschlagen
    showSummary(res);
    emitTraining();
  };
}

function exerciseCard(r, idx){
  const card = document.createElement("article");
  card.className = "ex-card";
  const last = lastResultFor(r.exId);
  const stall = stallCount(r.exId);
  const bw = bodyKg();
  card.innerHTML = `
    <div class="ex-head">
      <h3>${esc(r.name)}</h3>
      <span class="ex-scheme">${scheme({sets:r.sets.length, repMin:r.repMin, repMax:r.repMax})}</span>
    </div>
    <div class="ex-load">
      <button type="button" class="step" data-w="-1" aria-label="Gewicht verringern">−</button>
      <span class="ex-weight" aria-live="polite"></span>
      <button type="button" class="step" data-w="1" aria-label="Gewicht erhöhen">+</button>
    </div>
    <div class="ex-last">${last
      ? `Letztes Mal (${fmtDate(last.date)}): ${loadLabel(last)} × ${last.sets.map(s=>s.reps??"–").join(" · ")}`
      : "Erstes Mal mit dieser Übung"}${r.bodyweight && bw ? ` · Körpergewicht ${kg(bw)}` : ""}</div>
    ${stall>=3 ? `<div class="ex-hint">Seit ${stall} Einheiten keine Steigerung. Tipp: Gewicht um ca. 10 % senken und neu aufbauen.</div>` : ""}
    <div class="sets"></div>
    <div class="ex-verdict" aria-live="polite"></div>`;

  const setsBox = card.querySelector(".sets");
  r.sets.forEach((s, si)=>{
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `
      <span class="set-no">${si+1}</span>
      <button type="button" class="step" data-r="-1" aria-label="Satz ${si+1}: Wiederholung weniger">−</button>
      <input type="number" inputmode="numeric" min="0" max="99" class="reps" aria-label="Satz ${si+1}: Wiederholungen" placeholder="${s.target}">
      <button type="button" class="step" data-r="1" aria-label="Satz ${si+1}: Wiederholung mehr">+</button>
      <button type="button" class="clean-btn" aria-pressed="true"></button>`;
    const inp = row.querySelector(".reps");
    const cleanBtn = row.querySelector(".clean-btn");
    const sync = ()=>{
      inp.value = s.reps ?? "";
      row.classList.toggle("done", s.reps!=null);
      row.classList.toggle("top", s.reps!=null && s.reps>=r.repMax);
      cleanBtn.setAttribute("aria-pressed", s.clean);
      cleanBtn.classList.toggle("bad", !s.clean);
      cleanBtn.innerHTML = s.clean ? "✓ Sauber" : "✗ Unsauber";
    };
    row.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
      const d = +b.dataset.r;
      if(s.reps==null) s.reps = d>0 ? s.target : Math.max(0, s.target-1);
      else s.reps = Math.max(0, Math.min(99, s.reps+d));
      sync(); update();
    });
    inp.addEventListener("input", ()=>{
      const v = parseInt(inp.value, 10);
      s.reps = isNaN(v) ? null : Math.max(0, Math.min(99, v));
      row.classList.toggle("done", s.reps!=null);
      row.classList.toggle("top", s.reps!=null && s.reps>=r.repMax);
      update();
    });
    cleanBtn.onclick = ()=>{ s.clean = !s.clean; sync(); update(); };
    sync();
    setsBox.appendChild(row);
  });

  card.querySelectorAll("[data-w]").forEach(b=>b.onclick=()=>{
    const step = r.increment>0 ? r.increment : 1;
    r.weight = Math.max(0, roundW(r.weight + step*(+b.dataset.w)));
    update();
  });

  function update(){
    card.querySelector(".ex-weight").textContent = loadLabel(r);
    const ev = evaluate(r);
    const v = card.querySelector(".ex-verdict");
    const next = roundW(r.weight + r.increment);
    const msg = {
      top:        `Alle Sätze sauber am Ziel → nächstes Mal <b>${r.bodyweight?"KG + ":""}${kg(next)}</b>`,
      unclean:    `Wdh. geschafft, aber nicht alle sauber → Gewicht bleibt`,
      reps:       r.repMin===r.repMax
                    ? `Noch nicht alle Sätze mit ${r.repMax} Wdh. → Gewicht bleibt`
                    : `Für die Steigerung alle Sätze auf ${r.repMax} Wdh. bringen`,
      incomplete: `Noch ${r.sets.filter(s=>s.reps==null).length} Satz/Sätze offen`,
      skipped:    `Noch kein Satz eingetragen`,
    }[ev.reason];
    v.innerHTML = msg;
    v.className = "ex-verdict " + (ev.up ? "up" : ev.reason==="skipped"||ev.reason==="incomplete" ? "" : "hold");
    card.classList.toggle("ok", ev.up);
    saveTraining();
  }
  update();
  return card;
}

function showSummary(res){
  if(!res) return;
  const ups = res.changes.filter(c=>c.up);
  const bg = $("tSummary");
  bg.querySelector(".modal").innerHTML = `
    <h3>${ups.length ? `Stark. ${ups.length}× Steigerung` : "Training gespeichert"}</h3>
    <p>${esc(res.session.dayName)} · ${fmtDate(res.session.date)}</p>
    <ul class="sum-list">
      ${res.changes.map(c=>`
        <li class="${c.up?"up":""}">
          <span>${esc(c.name)}</span>
          <span>${c.up
            ? `${kg(c.from)} → <b>${kg(c.to)}</b> ▲`
            : `bleibt ${kg(c.to)} <small>${{unclean:"nicht sauber",reps:"Wdh. fehlen",incomplete:"Sätze offen"}[c.reason]||""}</small>`}</span>
        </li>`).join("") || "<li>Keine Sätze eingetragen.</li>"}
    </ul>
    <div class="modal-actions"><button type="button" class="btn primary" id="tSumOk">Weiter</button></div>`;
  bg.classList.add("open");
  $("tSumOk").focus();
  $("tSumOk").onclick = ()=>bg.classList.remove("open");
}

// ======================= Fortschritt =======================
function renderProgress(){
  const names = exerciseNames();
  const tabs = $("tProgTabs");
  if(!progressName || !names.some(n=>normName(n)===normName(progressName))) progressName = names[0]||null;
  tabs.innerHTML = names.map(n=>{
    const has = historyByName(n).length>0;
    return `<button type="button" class="tab${normName(n)===normName(progressName)?" active":""}" data-n="${esc(n)}" style="opacity:${has?1:.45}">${esc(n)}</button>`;
  }).join("");
  tabs.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{ progressName=b.dataset.n; renderProgress(); });
  drawProgressChart();
}

function drawProgressChart(){
  const svg = $("tChart"), empty = $("tChartEmpty"), info = $("tProgInfo");
  const bw = bodyKg();
  const hist = progressName ? historyByName(progressName) : [];
  const data = hist.map(({s,r})=>{
    const b = bestSet(r, bw);
    return b ? { date:s.date, v:b.v, r, reps:b.reps, day:s.dayName } : null;
  }).filter(Boolean);

  if(!data.length){
    svg.innerHTML = "";
    empty.style.display = "grid";
    empty.textContent = progressName ? `Noch keine Einheit mit „${progressName}".` : "Noch keine Übungen.";
    info.innerHTML = "";
    return;
  }
  empty.style.display = "none";
  drawLineChart(svg, $("tTooltip"), data, p=>
    `<b>≈ ${fmtNum(p.v)} kg 1RM</b><div class="tt-date">${loadLabel(p.r)} × ${p.reps} · ${fmtDate(p.date)}</div>`);

  const first = data[0].v, cur = data.at(-1).v, diff = cur-first;
  const current = [];
  tdb.plan.days.forEach(d=>d.exercises.forEach(e=>{
    if(normName(e.name)===normName(progressName)) current.push(`${esc(d.name.split(/\s+[–-]\s+/)[0])}: <b>${e.bodyweight?"KG + ":""}${kg(e.weight)}</b>`);
  }));
  const rel = bw && !data.at(-1).r.bodyweight ? ` · <b>${fmtNum(cur/bw)} ×</b> Körpergewicht` : "";
  info.innerHTML = `
    <span>Geschätztes Maximum: <b>${fmtNum(cur)} kg</b>${data.length>1?` <span class="delta ${diff>=0?"neg":"pos"}">${diff>=0?"↑ +":"↓ "}${fmtNum(diff)} kg</span>`:""}${rel}</span>
    ${current.length?`<span>Nächstes Arbeitsgewicht: ${current.join(" · ")}</span>`:""}`;
}

// ======================= Plan-Editor =======================
function renderPlan(){
  const box = $("tPlan");
  box.innerHTML = "";
  tdb.plan.days.forEach((d, di)=>{
    const det = document.createElement("details");
    det.className = "plan-day";
    det.open = openDays.has(d.id);
    det.addEventListener("toggle", ()=>{ det.open ? openDays.add(d.id) : openDays.delete(d.id); });
    det.innerHTML = `
      <summary><span class="pd-name">${esc(d.name)}</span><span class="pd-meta">${d.exercises.map(e=>esc(e.name)).join(" · ")||"keine Übungen"}</span></summary>
      <div class="pd-body">
        <div class="pd-top">
          <div class="field grow"><label>Name des Tages</label><input type="text" class="pd-title" value="${esc(d.name)}"></div>
          <button type="button" class="icon-btn" data-act="dup" aria-label="Tag nach oben" ${di===0?"disabled":""}>↑</button>
          <button type="button" class="icon-btn" data-act="ddown" aria-label="Tag nach unten" ${di===tdb.plan.days.length-1?"disabled":""}>↓</button>
          <button type="button" class="icon-btn danger" data-act="ddel" aria-label="Tag löschen">✕</button>
        </div>
        <div class="pe-list"></div>
        <button type="button" class="btn ghost" data-act="addex">+ Übung</button>
      </div>`;
    det.querySelector(".pd-title").addEventListener("change", e=>{
      d.name = e.target.value.trim() || "Tag"; commit();
    });
    det.querySelector('[data-act="dup"]').onclick = ()=>{ move(tdb.plan.days, di, -1); commit(); };
    det.querySelector('[data-act="ddown"]').onclick = ()=>{ move(tdb.plan.days, di, 1); commit(); };
    det.querySelector('[data-act="ddel"]').onclick = ()=>{
      if(!confirm(`Tag „${d.name}" mit allen Übungen aus dem Plan löschen? Vergangene Einheiten bleiben erhalten.`)) return;
      tdb.plan.days.splice(di,1); commit();
    };
    det.querySelector('[data-act="addex"]').onclick = ()=>{ d.exercises.push(newExercise()); openDays.add(d.id); commit(true); };

    const list = det.querySelector(".pe-list");
    d.exercises.forEach((ex, ei)=>list.appendChild(exerciseEditor(d, ex, ei)));
    box.appendChild(det);
  });

  const add = document.createElement("button");
  add.type = "button"; add.className = "btn ghost"; add.textContent = "+ Trainingstag";
  add.onclick = ()=>{ const d = newDay("Tag "+(tdb.plan.days.length+1)); tdb.plan.days.push(d); openDays.add(d.id); commit(); };
  box.appendChild(add);
}

function exerciseEditor(day, ex, ei){
  const el = document.createElement("div");
  el.className = "pe-row";
  const n = (k, label, step, min=0) => `
    <div class="field"><label>${label}</label><input type="number" inputmode="decimal" step="${step}" min="${min}" data-k="${k}" value="${ex[k]}"></div>`;
  el.innerHTML = `
    <div class="pe-top">
      <div class="field grow"><label>Übung</label><input type="text" data-k="name" value="${esc(ex.name)}" placeholder="z. B. Kniebeugen"></div>
      <button type="button" class="icon-btn" data-act="up" aria-label="Übung nach oben" ${ei===0?"disabled":""}>↑</button>
      <button type="button" class="icon-btn" data-act="down" aria-label="Übung nach unten" ${ei===day.exercises.length-1?"disabled":""}>↓</button>
      <button type="button" class="icon-btn danger" data-act="del" aria-label="Übung löschen">✕</button>
    </div>
    <div class="pe-grid">
      ${n("sets","Sätze",1,1)}
      ${n("repMin","Wdh. von",1,1)}
      ${n("repMax","Wdh. bis",1,1)}
      ${n("weight", ex.bodyweight?"Zusatz (kg)":"Gewicht (kg)",0.25)}
      ${n("increment","Steigerung (kg)",0.25)}
    </div>
    <label class="check"><input type="checkbox" data-k="bodyweight" ${ex.bodyweight?"checked":""}> Körpergewichtsübung (Gewicht = Zusatzlast, nutzt dein Körpergewicht)</label>`;

  el.querySelectorAll("[data-k]").forEach(inp=>inp.addEventListener("change", ()=>{
    const k = inp.dataset.k;
    if(k==="name") ex.name = inp.value.trim();
    else if(k==="bodyweight") ex.bodyweight = inp.checked;
    else{
      let v = parseFloat(String(inp.value).replace(",","."));
      if(isNaN(v) || v<0) v = 0;
      if(k==="sets"||k==="repMin"||k==="repMax") v = Math.max(1, Math.round(v));
      if(k==="weight"||k==="increment") v = roundW(v);
      ex[k] = v;
      if(k==="repMin" && ex.repMax<v) ex.repMax = v;
      if(k==="repMax" && ex.repMin>v) ex.repMin = v;
    }
    commit(k==="bodyweight"||k==="repMin"||k==="repMax");
  }));
  el.querySelector('[data-act="up"]').onclick = ()=>{ move(day.exercises, ei, -1); commit(true); };
  el.querySelector('[data-act="down"]').onclick = ()=>{ move(day.exercises, ei, 1); commit(true); };
  el.querySelector('[data-act="del"]').onclick = ()=>{
    if(!confirm(`„${ex.name||"Übung"}" aus dem Plan löschen?`)) return;
    day.exercises.splice(ei,1); commit(true);
  };
  return el;
}

function move(arr, i, d){
  const j = i+d;
  if(j<0 || j>=arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
// rerenderPlan=false: Eingabefelder behalten Fokus (nur Name/Werte geändert)
function commit(rerenderPlan=true){
  saveTraining();
  if(rerenderPlan) renderPlan();
  else document.querySelectorAll(".plan-day").forEach((det,i)=>{
    const d = tdb.plan.days[i]; if(!d) return;
    det.querySelector(".pd-name").textContent = d.name;
    det.querySelector(".pd-meta").textContent = d.exercises.map(e=>e.name).join(" · ")||"keine Übungen";
  });
  if(!tdb.active) renderToday();
  renderProgress();
}

// ======================= Verlauf =======================
function renderHistory(){
  const box = $("tHistory");
  const s = sortedSessions().reverse();
  $("tHistCount").textContent = s.length ? s.length+" Einheiten" : "";
  if(!s.length){ box.innerHTML = `<div class="empty-state">Noch keine abgeschlossene Einheit.</div>`; return; }
  box.innerHTML = s.map(x=>`
    <div class="hist-item">
      <div class="hist-head">
        <div><b>${esc(x.dayName)}</b><span class="sub"> · ${fmtDate(x.date)}</span></div>
        <button type="button" class="icon-btn danger" data-del="${x.id}" aria-label="Einheit vom ${fmtDate(x.date)} löschen">✕</button>
      </div>
      <ul class="hist-ex">
        ${x.exercises.filter(r=>r.sets.some(y=>y.reps!=null)).map(r=>`
          <li><span>${esc(r.name)}${r.progressed?' <span class="up-tag">▲</span>':""}</span>
          <span class="mono">${loadLabel(r)} × ${r.sets.map(y=>y.reps==null?"–":y.reps+(y.clean?"":"*")).join(" · ")}</span></li>`).join("")}
      </ul>
    </div>`).join("") + `<p class="foot-note">▲ = danach gesteigert · * = Satz nicht sauber</p>`;
  box.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    if(!confirm("Diese Einheit löschen? Eine dadurch ausgelöste Steigerung wird zurückgenommen.")) return;
    deleteSession(b.dataset.del);
    emitTraining();
    toast("Einheit gelöscht");
  });
}

// ======================= Init =======================
export function renderTraining(){
  renderToday();
  renderProgress();
  renderPlan();
  renderHistory();
}
export function redrawTrainingChart(){ drawProgressChart(); }

export function initTraining(){
  tbus.addEventListener("change", renderTraining);
  const bg = $("tSummary");
  bg.addEventListener("click", e=>{ if(e.target===bg) bg.classList.remove("open"); });
  renderTraining();
}
