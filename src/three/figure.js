// Prozedurale "Body-Scan"-Figur (~1,80 Einheiten hoch, Füße bei y=0).
// Heller, matter Graukörper im Studio-Licht – wie ein 3D-Körperscan.
// Athletische Proportionen mit Muskelandeutungen (Brust, Schultern,
// Gesäß, Waden). Plus Mess-Ringe, deren Radius auf die echten Umfänge skaliert.
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";

export const ACCENT = 0x3fc6ff;   // Scan-Blau für die Ringe
export const BAD = 0xf08372;
const FIG_HEIGHT = 1.8;
const V=(x,y,z=0)=>new THREE.Vector3(x,y,z);

// Matter, heller Körper – bekommt Form allein durchs Licht
const bodyMat = new THREE.MeshStandardMaterial({
  color:0x9aa3ad, roughness:0.72, metalness:0.0,
});

// Globaler Fülligkeits-Regler (zum Feintuning an einer Stelle)
const GIRTH = 0.3;
const SUB = 12;          // Metaball-Falloff
const CY = 0.9;          // Feld-Mittelpunkt (Welt-y)

// Ein Metaball an Welt-Koordinaten (Feld erwartet [0,1])
function ball(eff, x, y, z, strength){
  eff.addBall(x/2+0.5, (y-CY)/2+0.5, z/2+0.5, strength*GIRTH, SUB);
}
// Bälle-Kette zwischen zwei Punkten -> glatter "Knochen"
function tube(eff, a, b, n, strength){
  for(let i=0;i<=n;i++){
    const t=i/n;
    ball(eff, a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t, a.z+(b.z-a.z)*t, strength);
  }
}

// Verschmolzener Körper aus Metaballs -> eine durchgehende, glatte Oberfläche
export function buildFigure(){
  const eff=new MarchingCubes(96, bodyMat, true, false, 200000);
  eff.position.set(0, CY, 0);
  eff.scale.set(1,1,1);
  eff.isolation=80;
  eff.castShadow=true; eff.receiveShadow=true;
  eff.reset();

  // Kopf, Hals, Trapez
  ball(eff, 0, 1.715, 0.006, 0.6);           // Kopf
  ball(eff, 0, 1.605, -0.006, 0.32);         // Hals
  tube(eff, V(-0.055,1.535,-0.02), V(0.055,1.535,-0.02), 2, 0.23); // Trapez

  // Rumpf: V-Taper über die vertikale Kette + seitliche Massen
  ball(eff, 0, 1.0, 0, 0.28);                // Becken
  ball(eff,  0.1, 1.01, 0, 0.26); ball(eff, -0.1, 1.01, 0, 0.26); // Hüften
  ball(eff,  0.07, 0.99, -0.06, 0.2); ball(eff, -0.07, 0.99, -0.06, 0.2); // Gesäß
  ball(eff, 0, 1.1, 0, 0.29);                // Unterbauch
  ball(eff, 0, 1.19, 0, 0.25);               // Taille (schmal)
  ball(eff, 0, 1.29, 0.02, 0.29);            // oberer Bauch
  ball(eff, 0, 1.4, 0.03, 0.34);             // Brustkorb
  ball(eff,  0.082, 1.41, 0.06, 0.22); ball(eff, -0.082, 1.41, 0.06, 0.22); // Pecs
  ball(eff,  0.165, 1.48, 0, 0.28); ball(eff, -0.165, 1.48, 0, 0.28); // Schultern/Deltoid

  // Arme: Schulter -> Ellbogen -> Handgelenk + Hand (leichte A-Pose)
  for(const s of [1,-1]){
    const shoulder=V(s*0.165,1.47,0), elbow=V(s*0.225,1.16,0.02), wrist=V(s*0.255,0.86,0.04);
    tube(eff, shoulder, elbow, 6, 0.18);  // Oberarm/Bizeps
    tube(eff, elbow, wrist, 6, 0.15);     // Unterarm
    ball(eff, s*0.262, 0.805, 0.05, 0.14);// Hand
  }
  // Beine: weiter auseinander, länger getrennt
  for(const s of [1,-1]){
    const hip=V(s*0.105,0.99,0), knee=V(s*0.108,0.52,0.02), ankle=V(s*0.11,0.09,0);
    tube(eff, hip, knee, 7, 0.3);         // Oberschenkel
    tube(eff, knee, ankle, 7, 0.23);      // Wade/Schienbein
    tube(eff, V(s*0.11,0.05,-0.01), V(s*0.11,0.04,0.16), 3, 0.15); // Fuß
  }

  if(typeof eff.update==="function") eff.update();
  return eff;
}

// Mess-Ringe: id, Höhe, Standardradius, Mittelpunkt-x (Gliedmaßen), z-Stauchung, Label-Seite
export const RING_DEFS=[
  {id:"neck",  y:1.535, r:0.065, cx:0,     squash:0.84, side:"right"},
  {id:"chest", y:1.41,  r:0.195, cx:0,     squash:0.62, side:"right"},
  {id:"arm",   y:1.33,  r:0.06,  cx:0.215, squash:1,    side:"left"},
  {id:"waist", y:1.19,  r:0.13,  cx:0,     squash:0.62, side:"right"},
  {id:"hip",   y:1.02,  r:0.175, cx:0,     squash:0.66, side:"right"},
  {id:"thigh", y:0.78,  r:0.098, cx:0.097, squash:1,    side:"left"},
];

export function buildRings(){
  return RING_DEFS.map(def=>{
    const holder=new THREE.Group();
    holder.position.set(def.cx, def.y, 0);

    const mat=new THREE.MeshBasicMaterial({
      color:ACCENT, transparent:true, opacity:0.95, depthWrite:false, depthTest:false,
    });
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1, 0.009, 10, 96), mat);
    ring.rotation.x=Math.PI/2;
    ring.renderOrder=3;
    holder.add(ring);

    const hit=new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 6, 40),
      new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false})
    );
    hit.rotation.x=Math.PI/2;
    hit.userData.ringId=def.id;
    holder.add(hit);

    setRingRadius(holder, def, def.r);
    return { def, holder, ring, hit, mat, baseR:def.r };
  });
}

// Umfang (cm) -> Weltradius, skaliert über die Körpergröße
export function radiusFromCircumference(cm, personHeightCm){
  const h=(personHeightCm||180)/100;
  const r=(cm/100)/(2*Math.PI) * (FIG_HEIGHT/h);
  return Math.min(0.3, Math.max(0.04, r));
}

export function setRingRadius(holder, def, r){
  holder.scale.set(r, 1, r*def.squash);
}

// Vorberechnete Kreis-Stützpunkte: pro Frame die Silhouetten-Kante des
// Rings (am nächsten zur Label-Seite) finden.
const RING_SAMPLES = Array.from({length:32}, (_,i)=>{
  const a=(i/32)*Math.PI*2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
});
const _p=new THREE.Vector3();
export function ringEdgeScreen(entry, sideSign, camera, w, h, out){
  let bestX = sideSign>0 ? -Infinity : Infinity, sx=0, sy=0;
  entry.holder.updateWorldMatrix(true, false);
  for(const s of RING_SAMPLES){
    _p.copy(s).applyMatrix4(entry.holder.matrixWorld).project(camera);
    const px=( _p.x*0.5+0.5)*w;
    if(sideSign>0 ? px>bestX : px<bestX){ bestX=px; sx=px; sy=(-_p.y*0.5+0.5)*h; }
  }
  out.x=sx; out.y=sy;
  return out;
}
