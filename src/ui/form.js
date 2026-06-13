import { upsertEntry, emitChange } from "../store.js";
import { MEASURE_IDS } from "../metrics.js";
import { todayISO } from "../util.js";
import { toast } from "./toast.js";

export function initForm(){
  const form=document.getElementById("entryForm");
  document.getElementById("f-date").value=todayISO();

  form.addEventListener("submit", ev=>{
    ev.preventDefault();
    const g=id=>{
      const v=document.getElementById(id).value.trim();
      return v==="" ? null : parseFloat(v.replace(",","."));
    };
    const date=document.getElementById("f-date").value;
    if(!date){ toast("Bitte ein Datum wählen"); return; }
    const entry={
      date,
      weight:g("f-weight"), fat:g("f-fat"), muscle:g("f-muscle"),
      neck:g("f-neck"), waist:g("f-waist"), chest:g("f-chest"), hip:g("f-hip"),
      arm:g("f-arm"), thigh:g("f-thigh"),
      notes:document.getElementById("f-notes").value.trim()||null,
    };
    if(!MEASURE_IDS.some(k=>entry[k]!=null)){
      toast("Bitte mindestens einen Wert eingeben");
      return;
    }
    const updated=upsertEntry(entry);
    form.reset();
    document.getElementById("f-date").value=todayISO();
    emitChange();
    toast(updated?"Eintrag aktualisiert":"Messung gespeichert");
  });
}
