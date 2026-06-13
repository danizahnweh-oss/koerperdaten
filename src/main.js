import "@fontsource-variable/space-grotesk";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/main.css";

import { db, bus } from "./store.js";
import { fmtDate } from "./util.js";
import { renderStats } from "./ui/stats.js";
import { renderZones } from "./ui/zones.js";
import { renderTabs, renderChart } from "./ui/chart.js";
import { renderTable } from "./ui/table.js";
import { initForm } from "./ui/form.js";
import { initSettings } from "./ui/settings.js";
import { initBodyScene, updateBodyData, setActiveRing } from "./three/bodyScene.js";

function renderMeta(){
  document.getElementById("subline").textContent =
    db.settings.name ? db.settings.name+" · persönliches Tracking" : "Dein persönliches Tracking";
  const dates=db.entries.map(e=>e.date).sort();
  document.getElementById("bodyDate").textContent =
    dates.length ? "Stand: "+fmtDate(dates[dates.length-1]) : "Noch keine Messung";
  document.getElementById("hipHint").textContent = db.settings.gender==="w" ? ", Hüfte" : "";
}

function renderAll(){
  renderStats();
  renderZones();
  renderTabs();
  renderChart();
  renderTable();
  renderMeta();
  updateBodyData();
}

bus.addEventListener("change", renderAll);
bus.addEventListener("select-metric", ()=>{
  renderStats();
  renderTabs();
  renderChart();
  setActiveRing();
});
window.addEventListener("resize", renderChart);

initForm();
initSettings();
initBodyScene();
renderAll();
