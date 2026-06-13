import { db, saveSettings, clearAll, importData, emitChange } from "../store.js";
import { todayISO } from "../util.js";
import { toast } from "./toast.js";

export function initSettings(){
  const sm=document.getElementById("settingsModal");

  document.getElementById("settingsBtn").onclick=()=>{
    document.getElementById("s-height").value=db.settings.height||"";
    document.getElementById("s-gender").value=db.settings.gender||"";
    document.getElementById("s-birth").value=db.settings.birthYear||"";
    document.getElementById("s-name").value=db.settings.name||"";
    sm.classList.add("open");
  };
  document.getElementById("settingsCancel").onclick=()=>sm.classList.remove("open");
  sm.addEventListener("click", e=>{ if(e.target===sm) sm.classList.remove("open"); });

  document.getElementById("settingsSave").onclick=()=>{
    const h=parseFloat(document.getElementById("s-height").value.replace(",","."));
    db.settings.height=isNaN(h)?null:h;
    db.settings.gender=document.getElementById("s-gender").value;
    const by=parseInt(document.getElementById("s-birth").value,10);
    db.settings.birthYear=(by>=1900 && by<=2026)?by:null;
    db.settings.name=document.getElementById("s-name").value.trim();
    saveSettings();
    sm.classList.remove("open");
    emitChange();
    toast("Einstellungen gespeichert");
  };

  document.getElementById("clearAllBtn").onclick=()=>{
    if(confirm("Wirklich ALLE Einträge unwiderruflich löschen? Tipp: vorher exportieren.")){
      clearAll();
      sm.classList.remove("open");
      emitChange();
      toast("Alle Daten gelöscht");
    }
  };

  // Export / Import
  document.getElementById("exportBtn").onclick=()=>{
    const payload={app:"koerperdaten",version:2,exportedAt:new Date().toISOString(),settings:db.settings,entries:db.entries};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="koerperdaten-"+todayISO()+".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Daten exportiert");
  };
  document.getElementById("importBtn").onclick=()=>document.getElementById("importFile").click();
  document.getElementById("importFile").onchange=ev=>{
    const file=ev.target.files[0];
    if(!file) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const n=importData(JSON.parse(r.result));
        emitChange();
        toast(n+" Einträge importiert");
      }catch(e){
        toast("Import fehlgeschlagen: ungültige Datei");
      }
      ev.target.value="";
    };
    r.readAsText(file);
  };
}
