// Trainings-Zustand: Plan, laufende Einheit, abgeschlossene Einheiten.
// Progression: doppelte Progression. Alle Sätze am oberen Ende des
// Wiederholungsbereichs UND sauber ausgeführt -> nächstes Mal +Steigerung.
const TKEY = "koerperdaten.training.v1";

export const tbus = new EventTarget();
export function emitTraining(){ tbus.dispatchEvent(new Event("change")); }

export const tdb = load();

function load(){
  const def = { plan:{ days:[] }, sessions:[], active:null, seeded:false };
  try{
    const d = JSON.parse(localStorage.getItem(TKEY));
    if(!d || typeof d!=="object") return def;
    return {
      plan: d.plan && Array.isArray(d.plan.days) ? d.plan : def.plan,
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      active: d.active || null,
      seeded: !!d.seeded,
    };
  }catch(e){ return def; }
}

export function saveTraining(){
  try{ localStorage.setItem(TKEY, JSON.stringify(tdb)); }catch(e){ /* Speicher voll/gesperrt */ }
}

export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
export const roundW = w => Math.round(w*4)/4;   // auf 0,25 kg

// Startplan (Daniels 3-Tage-Plan). Nur einmalig, danach frei editierbar.
const SEED = [
  ["Montag – Kraft A", [
    ["Kniebeugen", 77.5, 3, 5, 5, 2.5],
    ["Bankdrücken", 50, 3, 5, 5, 2.5],
    ["Langhantelrudern", 47.5, 3, 8, 8, 2.5],
  ]],
  ["Mittwoch – Oberkörper", [
    ["Schrägbankdrücken", 45, 2, 8, 8, 2.5],
    ["Langhantelrudern", 42.5, 2, 8, 8, 2.5],
    ["Schulterdrücken", 25, 2, 8, 8, 2.5],
    ["Curls", 20, 2, 10, 12, 2.5],
    ["Seitheben", 7, 2, 10, 10, 1],
  ]],
  ["Freitag – Kraft B", [
    ["Kniebeugen", 75, 3, 5, 5, 2.5],
    ["Schulterdrücken", 27.5, 3, 5, 5, 2.5],
    ["Kreuzheben", 85, 1, 5, 5, 2.5],
  ]],
];
function seedIfEmpty(){
  if(tdb.seeded || tdb.plan.days.length) return;
  tdb.plan.days = SEED.map(([name, exs])=>({
    id:uid(), name,
    exercises: exs.map(([n,w,sets,repMin,repMax,increment])=>({ id:uid(), name:n, weight:w, sets, repMin, repMax, increment, bodyweight:false })),
  }));
  tdb.seeded = true;
  saveTraining();
}

// ---------- Plan ----------
export function newExercise(){
  return { id:uid(), name:"", sets:3, repMin:8, repMax:12, weight:0, increment:2.5, bodyweight:false };
}
export function newDay(name){
  return { id:uid(), name:name||"Neuer Tag", exercises:[] };
}
export function findDay(id){ return tdb.plan.days.find(d=>d.id===id); }
export function findExercise(exId){
  for(const d of tdb.plan.days){
    const ex = d.exercises.find(e=>e.id===exId);
    if(ex) return ex;
  }
  return null;
}

// Nächster Tag in der Rotation: der nach dem zuletzt trainierten.
export function suggestedDayId(){
  const days = tdb.plan.days;
  if(!days.length) return null;
  const last = sortedSessions().at(-1);
  if(!last) return days[0].id;
  const i = days.findIndex(d=>d.id===last.dayId);
  return i<0 ? days[0].id : days[(i+1)%days.length].id;
}

// ---------- Historie ----------
export function sortedSessions(){
  return [...tdb.sessions].sort((a,b)=> a.date===b.date ? (a.finishedAt||0)-(b.finishedAt||0) : a.date<b.date?-1:1);
}
export function lastResultFor(exId){
  const s = sortedSessions();
  for(let i=s.length-1;i>=0;i--){
    const r = s[i].exercises.find(e=>e.exId===exId);
    if(r && r.sets.some(x=>x.reps!=null)) return { ...r, date:s[i].date };
  }
  return null;
}
// Wie viele Einheiten in Folge ohne Steigerung (für Stagnations-Hinweis)
export function stallCount(exId){
  const s = sortedSessions();
  let n = 0;
  for(let i=s.length-1;i>=0;i--){
    const r = s[i].exercises.find(e=>e.exId===exId);
    if(!r || !r.sets.some(x=>x.reps!=null)) continue;
    if(r.progressed) break;
    n++;
  }
  return n;
}

// Zielwiederholung je Satz: nach Steigerung unteres Ende, sonst letztes Mal +1 (max. oberes Ende)
export function targetReps(ex, setIdx){
  const last = lastResultFor(ex.id);
  if(!last || last.weight!==ex.weight) return ex.repMin;
  const prev = last.sets[setIdx]?.reps;
  if(prev==null) return ex.repMin;
  return Math.min(ex.repMax, Math.max(ex.repMin, prev+1));
}

// ---------- Laufende Einheit ----------
export function startSession(dayId, date){
  const day = findDay(dayId);
  if(!day) return null;
  tdb.active = {
    id:uid(), date, dayId, dayName:day.name, startedAt:Date.now(),
    exercises: day.exercises.map(ex=>({
      exId:ex.id, name:ex.name, weight:ex.weight, increment:ex.increment,
      repMin:ex.repMin, repMax:ex.repMax, bodyweight:!!ex.bodyweight,
      sets: Array.from({length:ex.sets}, (_,i)=>({ reps:null, clean:true, target:targetReps(ex,i) })),
    })),
  };
  saveTraining();
  return tdb.active;
}

export function cancelSession(){ tdb.active=null; saveTraining(); }

// Entscheidet je Übung, ob gesteigert wird.
export function evaluate(r){
  const done = r.sets.filter(s=>s.reps!=null);
  const allDone = done.length===r.sets.length && r.sets.length>0;
  const allTop = allDone && r.sets.every(s=>s.reps>=r.repMax);
  const allClean = allDone && r.sets.every(s=>s.clean);
  if(allTop && allClean) return { up:true, reason:"top" };
  if(!allDone) return { up:false, reason: done.length ? "incomplete" : "skipped" };
  if(allTop && !allClean) return { up:false, reason:"unclean" };
  return { up:false, reason:"reps" };
}

// Einheit abschließen: Ergebnis speichern, Plan-Gewichte anpassen.
export function finishSession(){
  const a = tdb.active;
  if(!a) return null;
  const changes = [];
  a.exercises.forEach(r=>{
    const ev = evaluate(r);
    r.progressed = ev.up;
    r.reason = ev.reason;
    const ex = findExercise(r.exId);
    if(!ex || ev.reason==="skipped") return;
    const from = ex.weight;
    // Arbeitsgewicht dieser Einheit ist die Basis (falls während des Trainings angepasst)
    const to = ev.up ? roundW(r.weight + r.increment) : r.weight;
    if(to!==from){
      ex.weight = to;
      r.planFrom = from; r.planTo = to;
    }
    changes.push({ name:r.name, from:r.weight, to, up:ev.up, reason:ev.reason, bodyweight:r.bodyweight });
  });
  a.finishedAt = Date.now();
  tdb.sessions.push(a);
  tdb.active = null;
  saveTraining();
  return { session:a, changes };
}

// Einheit löschen; Plan-Gewicht zurücksetzen, wenn diese Einheit es zuletzt gesetzt hat.
export function deleteSession(id){
  const s = tdb.sessions.find(x=>x.id===id);
  if(!s) return;
  const isLatestFor = exId => {
    const later = sortedSessions().filter(o=>o.id!==id && o.exercises.some(e=>e.exId===exId && e.sets.some(x=>x.reps!=null)));
    const last = later.at(-1);
    return !last || last.date<s.date || (last.date===s.date && (last.finishedAt||0)<(s.finishedAt||0));
  };
  s.exercises.forEach(r=>{
    if(r.planTo==null) return;
    const ex = findExercise(r.exId);
    if(ex && ex.weight===r.planTo && isLatestFor(r.exId)) ex.weight = r.planFrom;
  });
  tdb.sessions = tdb.sessions.filter(x=>x.id!==id);
  saveTraining();
}

// ---------- Kennzahlen ----------
// Geschätztes 1RM (Epley) – bei Körpergewichtsübungen inkl. Körpergewicht.
export function e1rm(weight, reps){ return reps>0 ? weight*(1+reps/30) : weight; }
export function bestSet(r, bodyKg){
  let best = null;
  r.sets.forEach(s=>{
    if(s.reps==null || s.reps<=0) return;
    const load = r.bodyweight ? (bodyKg||0)+r.weight : r.weight;
    const v = e1rm(load, s.reps);
    if(!best || v>best.v) best = { v, reps:s.reps };
  });
  return best;
}
export const normName = n => (n||"").trim().toLowerCase();
// Verlauf nach Übungsname: gleiche Übung an verschiedenen Tagen (z. B. Kniebeugen Mo/Fr) zusammen.
export function historyByName(name){
  const key = normName(name);
  const out = [];
  sortedSessions().forEach(s=>s.exercises.forEach(r=>{
    if(normName(r.name)===key && r.sets.some(y=>y.reps!=null)) out.push({ s, r });
  }));
  return out;
}
export function exerciseNames(){
  const seen = new Map();
  tdb.plan.days.forEach(d=>d.exercises.forEach(e=>{ if(e.name.trim() && !seen.has(normName(e.name))) seen.set(normName(e.name), e.name.trim()); }));
  tdb.sessions.forEach(s=>s.exercises.forEach(e=>{ if(e.name && !seen.has(normName(e.name))) seen.set(normName(e.name), e.name.trim()); }));
  return [...seen.values()];
}

// ---------- Export / Import ----------
export function exportTraining(){ return { plan:tdb.plan, sessions:tdb.sessions }; }
export function importTraining(t){
  if(!t || typeof t!=="object") return 0;
  if(t.plan && Array.isArray(t.plan.days) && t.plan.days.length) tdb.plan = t.plan;
  let n = 0;
  if(Array.isArray(t.sessions)){
    const map = {};
    tdb.sessions.forEach(s=>map[s.id]=s);
    t.sessions.forEach(s=>{ if(s && s.id && Array.isArray(s.exercises)){ map[s.id]=s; n++; } });
    tdb.sessions = Object.values(map);
  }
  saveTraining();
  return n;
}

seedIfEmpty();
