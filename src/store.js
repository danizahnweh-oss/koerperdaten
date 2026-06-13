// Zentraler Zustand + localStorage-Persistenz.
// Schlüssel sind identisch zur v1-App, damit bestehende Daten erhalten bleiben.
const KEY = "koerperdaten.v1";
const SKEY = "koerperdaten.settings.v1";

export const bus = new EventTarget();
// "change"        -> Daten oder Einstellungen geändert, alles neu rendern
// "select-metric" -> aktive Metrik gewechselt (detail = Metrik-id)

export const db = {
  entries: loadEntries(),
  settings: loadSettings(),
  activeMetric: "weight",
};

function loadEntries(){
  try{
    const d = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(d) ? d : [];
  }catch(e){ return []; }
}
function loadSettings(){
  const def = { height:null, name:"", gender:"", birthYear:null };
  try{
    return Object.assign(def, JSON.parse(localStorage.getItem(SKEY)) || {});
  }catch(e){ return def; }
}

export function saveEntries(){ localStorage.setItem(KEY, JSON.stringify(db.entries)); }
export function saveSettings(){ localStorage.setItem(SKEY, JSON.stringify(db.settings)); }

export function emitChange(){ bus.dispatchEvent(new Event("change")); }
export function selectMetric(id){
  db.activeMetric = id;
  bus.dispatchEvent(new CustomEvent("select-metric", { detail:id }));
}

export function upsertEntry(entry){
  const idx = db.entries.findIndex(e=>e.date===entry.date);
  const updated = idx>=0;
  if(updated) db.entries[idx]=entry; else db.entries.push(entry);
  saveEntries();
  return updated;
}
export function deleteEntry(date){
  db.entries = db.entries.filter(e=>e.date!==date);
  saveEntries();
}
export function clearAll(){
  db.entries = [];
  saveEntries();
}
// Import: Einträge per Datum zusammenführen, Einstellungen übernehmen
export function importData(data){
  const imp = Array.isArray(data) ? data : data.entries;
  if(!Array.isArray(imp)) throw new Error("Format");
  const map = {};
  db.entries.forEach(e=>map[e.date]=e);
  imp.forEach(e=>{ if(e && e.date) map[e.date]=e; });
  db.entries = Object.values(map);
  if(data.settings) Object.assign(db.settings, data.settings);
  saveEntries(); saveSettings();
  return imp.length;
}
