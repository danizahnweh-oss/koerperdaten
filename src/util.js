export function fmtNum(n){
  if(n==null || isNaN(n)) return "–";
  return (Math.round(n*10)/10).toLocaleString("de-DE");
}
export function fmtDate(iso){
  const d=new Date(iso+"T00:00:00");
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"short",year:"numeric"});
}
export function fmtDateShort(iso){
  const d=new Date(iso+"T00:00:00");
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}
export function todayISO(){
  const d=new Date();
  const off=d.getTimezoneOffset();
  return new Date(d-off*60000).toISOString().slice(0,10);
}
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
