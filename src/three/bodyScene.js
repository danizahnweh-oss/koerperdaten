// 3D-Viewer: rotierende Hologramm-Figur mit echtem Shading, Mess-Ringe,
// HUD-Labels mit Leader-Linien, die der Silhouette jedes Frames folgen.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildFigure, buildRings, setRingRadius, radiusFromCircumference, ringEdgeScreen, ACCENT, BAD } from "./figure.js";
import { db, selectMetric } from "../store.js";
import { metric, trendOf } from "../metrics.js";
import { fmtNum, reducedMotion } from "../util.js";

let renderer, scene, camera, controls, bodyGroup;
let rings=[];          // [{def, holder, ring, hit, mat, label, line, dot}]
let container, labelLayer, leaderSvg;
let hoveredId=null;
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
const _edge=new THREE.Vector2();

const SVGNS="http://www.w3.org/2000/svg";

export function initBodyScene(){
  container=document.getElementById("viewer");
  labelLayer=document.getElementById("ringLabels");
  leaderSvg=document.getElementById("leaderSvg");

  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x0a0e16, 0.07);
  camera=new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(1.15, 1.12, 3.15);

  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  container.prepend(renderer.domElement);

  // Studio-Beleuchtung für den "Body-Scan"-Look: helles Key-Licht,
  // weiches Fill, dezenter kühler Rim, alles auf neutralem Grau.
  scene.add(new THREE.HemisphereLight(0xc7d2dc, 0x141a22, 0.55));
  const key=new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-1.7, 3.0, 2.6);
  key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.near=0.5; key.shadow.camera.far=8;
  key.shadow.camera.left=-1.2; key.shadow.camera.right=1.2;
  key.shadow.camera.top=2.4; key.shadow.camera.bottom=-0.2;
  key.shadow.bias=-0.0008; key.shadow.radius=4;
  scene.add(key);
  const fill=new THREE.DirectionalLight(0x9fb4c8, 0.7);
  fill.position.set(2.6, 1.4, 1.8);
  scene.add(fill);
  const rim=new THREE.DirectionalLight(0x5fbfff, 1.0);
  rim.position.set(0.6, 1.6, -3.0);
  scene.add(rim);

  controls=new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.98, 0);
  controls.enablePan=false;
  controls.enableZoom=false;
  controls.enableDamping=true;
  controls.dampingFactor=0.07;
  controls.minPolarAngle=Math.PI*0.40;
  controls.maxPolarAngle=Math.PI*0.56;
  controls.autoRotate=true;                 // dreht sich als Default ab Start
  controls.autoRotateSpeed=reducedMotion ? 0.6 : 1.5;

  // Nach manuellem Drehen kurz pausieren, dann weiterdrehen
  let resumeTimer=null;
  controls.addEventListener("start", ()=>{ controls.autoRotate=false; clearTimeout(resumeTimer); });
  controls.addEventListener("end", ()=>{
    clearTimeout(resumeTimer);
    resumeTimer=setTimeout(()=>{ controls.autoRotate=true; }, 2200);
  });

  // Figur + alle Ringe rotieren gemeinsam
  bodyGroup=new THREE.Group();
  bodyGroup.add(buildFigure());
  scene.add(bodyGroup);

  rings=buildRings();
  rings.forEach(r=>{
    bodyGroup.add(r.holder);
    r.label=makeLabel(r.def);
    r.line=document.createElementNS(SVGNS,"line");
    r.line.setAttribute("stroke","rgba(214,226,238,.55)");
    r.line.setAttribute("stroke-width","1");
    leaderSvg.appendChild(r.line);
    r.dot=document.createElementNS(SVGNS,"circle");
    r.dot.setAttribute("r","2.8");
    r.dot.setAttribute("fill","#dce6f2");
    leaderSvg.appendChild(r.dot);
  });

  // Boden: fängt den weichen Schatten auf (sonst unsichtbar)
  const floor=new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 64),
    new THREE.ShadowMaterial({opacity:0.4})
  );
  floor.rotation.x=-Math.PI/2;
  floor.position.y=0.001;
  floor.receiveShadow=true;
  scene.add(floor);
  // dezenter Standkreis
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(0.74, 0.755, 80),
    new THREE.MeshBasicMaterial({color:0x3fc6ff, transparent:true, opacity:0.25, side:THREE.DoubleSide})
  );
  ring.rotation.x=-Math.PI/2;
  ring.position.y=0.002;
  scene.add(ring);

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
  renderer.domElement.addEventListener("click", ()=>{ if(hoveredId) selectMetric(hoveredId); });

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
    r.mat.opacity = hl?1 : (r.def.id===db.activeMetric?0.95:(r.hasData?0.85:0.3));
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
      r.mat.opacity=0.85;
      setRingRadius(r.holder, r.def, radiusFromCircumference(t.v, db.settings.height));
      r.line.setAttribute("stroke", t.bad?"rgba(240,131,114,.55)":"rgba(214,226,238,.55)");
      r.dot.setAttribute("fill", t.bad?"#f08372":"#dce6f2");
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
  rings.forEach(r=>r.label.classList.toggle("active", r.def.id===db.activeMetric));
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

  // Labels an die feste Bildschirmseite pinnen, Leader-Linie an die
  // jeweils zur Seite zeigende Silhouetten-Kante des Rings führen.
  const w=container.clientWidth, h=container.clientHeight;
  rings.forEach(r=>{
    const sideSign=r.def.side==="right"?1:-1;
    ringEdgeScreen(r, sideSign, camera, w, h, _edge);

    const labelW=r.label.offsetWidth;
    const lx=r.def.side==="right" ? w-12-labelW : 12+labelW;
    const ly=Math.max(24, Math.min(h-40, _edge.y));
    r.label.style.top=ly+"px";

    r.line.setAttribute("x1", lx);
    r.line.setAttribute("y1", ly);
    r.line.setAttribute("x2", _edge.x);
    r.line.setAttribute("y2", _edge.y);
    r.dot.setAttribute("cx", _edge.x);
    r.dot.setAttribute("cy", _edge.y);
  });

  renderer.render(scene, camera);
}
