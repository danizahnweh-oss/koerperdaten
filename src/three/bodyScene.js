// 3D-Viewer: rotierende Hologramm-Figur, Mess-Ringe, HUD-Labels mit
// Leader-Linien, die der Projektion jedes Frames folgen.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildFigure, buildRings, setRingRadius, radiusFromCircumference, ringAnchor, ACCENT, BAD } from "./figure.js";
import { db, selectMetric } from "../store.js";
import { metric, trendOf } from "../metrics.js";
import { fmtNum, reducedMotion } from "../util.js";

let renderer, scene, camera, controls, bodyGroup;
let rings=[];          // [{def, holder, ring, hit, mat, label, line}]
let container, labelLayer, leaderSvg;
let hoveredId=null;
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
const _world=new THREE.Vector3();

const SVGNS="http://www.w3.org/2000/svg";

export function initBodyScene(){
  container=document.getElementById("viewer");
  labelLayer=document.getElementById("ringLabels");
  leaderSvg=document.getElementById("leaderSvg");

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(0, 1.15, 2.9);

  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.prepend(renderer.domElement);

  controls=new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.enablePan=false;
  controls.enableZoom=false;
  controls.enableDamping=true;
  controls.dampingFactor=0.06;
  controls.minPolarAngle=Math.PI*0.40;
  controls.maxPolarAngle=Math.PI*0.55;
  controls.autoRotate=!reducedMotion;
  controls.autoRotateSpeed=1.1;

  // Nach Interaktion kurz pausieren, dann weiterdrehen
  let resumeTimer=null;
  controls.addEventListener("start", ()=>{
    controls.autoRotate=false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", ()=>{
    clearTimeout(resumeTimer);
    if(!reducedMotion) resumeTimer=setTimeout(()=>{ controls.autoRotate=true; }, 2500);
  });

  // Figur (die Ringe an Gliedmaßen drehen mit)
  bodyGroup=new THREE.Group();
  bodyGroup.add(buildFigure());
  scene.add(bodyGroup);

  rings=buildRings();
  rings.forEach(r=>{
    (r.def.limb ? bodyGroup : scene).add(r.holder);
    r.label=makeLabel(r.def);
    r.line=document.createElementNS(SVGNS,"line");
    r.line.setAttribute("stroke","rgba(70,216,232,.4)");
    r.line.setAttribute("stroke-width","1");
    leaderSvg.appendChild(r.line);
    r.dot=document.createElementNS(SVGNS,"circle");
    r.dot.setAttribute("r","2.5");
    r.dot.setAttribute("fill","#46d8e8");
    leaderSvg.appendChild(r.dot);
  });

  // Boden: polares Gitter + leuchtender Ring
  const grid=new THREE.PolarGridHelper(0.85, 12, 5, 56, 0x1d4a55, 0x16323d);
  grid.material.transparent=true;
  grid.material.opacity=0.5;
  scene.add(grid);
  const glowRing=new THREE.Mesh(
    new THREE.RingGeometry(0.82, 0.86, 72),
    new THREE.MeshBasicMaterial({color:ACCENT, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, side:THREE.DoubleSide})
  );
  glowRing.rotation.x=-Math.PI/2;
  glowRing.position.y=0.002;
  scene.add(glowRing);

  // Hover über Ringe
  renderer.domElement.addEventListener("pointermove", ev=>{
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer, camera);
    const hits=raycaster.intersectObjects(rings.map(r=>r.hit), false);
    setHover(hits.length ? hits[0].object.userData.ringId : null);
  });
  renderer.domElement.addEventListener("pointerleave", ()=>setHover(null));
  renderer.domElement.addEventListener("click", ()=>{
    if(hoveredId) selectMetric(hoveredId);
  });

  new ResizeObserver(resize).observe(container);
  resize();
  renderer.setAnimationLoop(tick);
  updateBodyData();
}

function makeLabel(def){
  const m=metric(def.id);
  const el=document.createElement("button");
  el.type="button";
  el.className=`ring-label ${def.side}`;
  el.innerHTML=`<span class="rl-name">${m.label}</span><span class="rl-val">–</span>`;
  el.addEventListener("click", ()=>selectMetric(def.id));
  el.addEventListener("mouseenter", ()=>setHover(def.id, true));
  el.addEventListener("mouseleave", ()=>setHover(null, true));
  labelLayer.appendChild(el);
  return el;
}

function setHover(id, fromLabel=false){
  if(id===hoveredId && !fromLabel) return;
  hoveredId=id;
  renderer.domElement.style.cursor=id?"pointer":"";
  rings.forEach(r=>{
    const hl=r.def.id===id;
    r.label.classList.toggle("hl", hl);
    r.mat.opacity = hl?1 : (r.def.id===db.activeMetric?0.95:(r.hasData?0.8:0.3));
  });
}

// Werte, Trends und Ringradien aus den Daten aktualisieren
export function updateBodyData(){
  rings.forEach(r=>{
    const m=metric(r.def.id);
    const t=trendOf(r.def.id);
    r.hasData=!!t;
    const valEl=r.label.querySelector(".rl-val");
    if(t){
      let trend="";
      if(t.moved){
        trend=`<span class="rl-trend ${t.bad?"bad":"good"}">${t.diff>0?"▲":"▼"}${fmtNum(Math.abs(t.diff))}</span>`;
      }
      valEl.innerHTML=`${t.calc?"≈ ":""}${fmtNum(t.v)} ${m.unit}${trend}`;
      r.label.classList.remove("dim");
      r.mat.color.setHex(t.bad?BAD:ACCENT);
      r.mat.opacity=0.8;
      setRingRadius(r.holder, r.def, radiusFromCircumference(t.v, db.settings.height));
      r.line.setAttribute("stroke", t.bad?"rgba(240,131,114,.45)":"rgba(70,216,232,.4)");
      r.dot.setAttribute("fill", t.bad?"#f08372":"#46d8e8");
    }else{
      valEl.textContent="–";
      r.label.classList.add("dim");
      r.mat.color.setHex(ACCENT);
      r.mat.opacity=0.3;
      setRingRadius(r.holder, r.def, r.baseR);
    }
  });
  setActiveRing();
}

export function setActiveRing(){
  rings.forEach(r=>{
    r.label.classList.toggle("active", r.def.id===db.activeMetric);
  });
}

function resize(){
  const w=container.clientWidth, h=container.clientHeight;
  if(!w||!h) return;
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  leaderSvg.setAttribute("viewBox",`0 0 ${w} ${h}`);
}

function tick(){
  controls.update();

  // Labels und Leader-Linien an die projizierten Ringpositionen heften
  const w=container.clientWidth, h=container.clientHeight;
  rings.forEach(r=>{
    const sideSign=r.def.side==="right"?1:-1;
    ringAnchor(r, sideSign, _world);
    _world.project(camera);
    const sx=( _world.x*0.5+0.5)*w;
    const sy=(-_world.y*0.5+0.5)*h;

    const labelW=r.label.offsetWidth;
    const lx=r.def.side==="right" ? w-12-labelW : 12+labelW;
    const ly=Math.max(26, Math.min(h-40, sy));
    r.label.style.top=ly+"px";

    r.line.setAttribute("x1", lx);
    r.line.setAttribute("y1", ly);
    r.line.setAttribute("x2", sx);
    r.line.setAttribute("y2", sy);
    r.dot.setAttribute("cx", sx);
    r.dot.setAttribute("cy", sy);
  });

  renderer.render(scene, camera);
}
