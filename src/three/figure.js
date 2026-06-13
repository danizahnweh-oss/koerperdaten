// Prozedurale Hologramm-Figur (~1,80 Einheiten hoch, Füße bei y=0).
// "Solider Scan"-Look: lit MeshStandardMaterial für echtes Volumen,
// darüber eine Fresnel-Hülle für den leuchtenden Hologramm-Rand.
// Plus Mess-Ringe, deren Radius auf die echten Umfänge skaliert.
import * as THREE from "three";

export const ACCENT = 0x46d8e8;
export const BAD = 0xf08372;
const FIG_HEIGHT = 1.8;
const UP = new THREE.Vector3(0,1,0);

// Solider Körper – bekommt durch die Lichter im Scene echtes Shading
const solidMat = new THREE.MeshStandardMaterial({
  color:0x0b2a31, emissive:0x0c4a55, emissiveIntensity:0.55,
  metalness:0.35, roughness:0.45, transparent:true, opacity:0.94,
});

// Fresnel-Hülle: leuchtende Silhouette, durchscheinende Mitte
function fresnelMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{ uColor:{value:new THREE.Color(ACCENT)}, uStrength:{value:0.7} },
    vertexShader:`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader:`
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
        gl_FragColor = vec4(uColor, f * uStrength);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
}
const fresnelMat = fresnelMaterial();

// Mesh als solider Körper + Fresnel-Hülle ablegen
function emit(group, geo, pos, quat, scale){
  const solid=new THREE.Mesh(geo, solidMat);
  if(pos) solid.position.copy(pos);
  if(quat) solid.quaternion.copy(quat);
  if(scale) solid.scale.copy(scale);
  const shell=new THREE.Mesh(geo, fresnelMat);
  shell.position.copy(solid.position);
  shell.quaternion.copy(solid.quaternion);
  shell.scale.copy(solid.scale);
  shell.renderOrder=1;
  group.add(solid, shell);
}

// Kapsel-Segment zwischen zwei Gelenkpunkten (für Arme/Beine)
const _dir=new THREE.Vector3(), _mid=new THREE.Vector3(), _q=new THREE.Quaternion();
function segment(group, a, b, r){
  _dir.subVectors(b,a);
  const len=_dir.length();
  const geo=new THREE.CapsuleGeometry(r, Math.max(0.001,len-r*1.2), 8, 18);
  _mid.addVectors(a,b).multiplyScalar(0.5);
  _q.setFromUnitVectors(UP, _dir.normalize());
  emit(group, geo, _mid, _q, null);
}
function joint(group, p, r, squashZ=1){
  emit(group, new THREE.SphereGeometry(r, 20, 16), p, null, new THREE.Vector3(1,1,squashZ));
}
const P=(x,y,z=0)=>new THREE.Vector3(x,y,z);

export function buildFigure(){
  const g=new THREE.Group();

  // Kopf (leicht eiförmig) + Hals
  emit(g, new THREE.SphereGeometry(0.108, 28, 24), P(0,1.695,0), null, new THREE.Vector3(0.92,1.08,0.96));
  segment(g, P(0,1.515,0), P(0,1.595,0.004), 0.052);

  // Rumpf als elliptischer Drehkörper: Schulter → Brust → Taille → Hüfte
  const profile=[
    [0.001,1.565],[0.058,1.555],[0.11,1.545],[0.168,1.515],[0.196,1.49],
    [0.19,1.45],[0.176,1.40],[0.152,1.32],[0.133,1.24],[0.127,1.18],
    [0.137,1.11],[0.158,1.045],[0.16,1.005],[0.142,0.97],[0.001,0.952],
  ].map(p=>new THREE.Vector2(p[0],p[1]));
  const torsoGeo=new THREE.LatheGeometry(profile, 48);
  emit(g, torsoGeo, P(0,0,0), null, new THREE.Vector3(1,1,0.62)); // tiefer gestaucht = menschlicher Querschnitt

  // Schulter- und Hüftgelenke füllen die Übergänge
  joint(g, P( 0.182,1.485,0), 0.062, 0.85);
  joint(g, P(-0.182,1.485,0), 0.062, 0.85);
  joint(g, P( 0.092,1.0,0), 0.075, 0.85);
  joint(g, P(-0.092,1.0,0), 0.075, 0.85);

  // Arme: Schulter → Ellbogen → Handgelenk, Hände
  buildArm(g,  1);
  buildArm(g, -1);
  // Beine: Hüfte → Knie → Knöchel, Füße
  buildLeg(g,  1);
  buildLeg(g, -1);

  return g;
}

function buildArm(g, s){
  const shoulder=P(s*0.198,1.485,0), elbow=P(s*0.214,1.155,0.01), wrist=P(s*0.222,0.86,0.02);
  segment(g, shoulder, elbow, 0.046);
  joint(g, elbow, 0.044);
  segment(g, elbow, wrist, 0.04);
  joint(g, wrist, 0.034);                                   // Handgelenk
  emit(g, new THREE.SphereGeometry(0.05,16,12), P(s*0.224,0.815,0.03), null, new THREE.Vector3(0.7,1.15,0.45)); // Hand
}
function buildLeg(g, s){
  const hip=P(s*0.092,1.0,0), knee=P(s*0.099,0.5,0.01), ankle=P(s*0.104,0.085,0);
  segment(g, hip, knee, 0.072);
  joint(g, knee, 0.06);
  segment(g, knee, ankle, 0.055);
  // Fuß nach vorn
  emit(g, new THREE.CapsuleGeometry(0.05,0.1,6,12), P(s*0.104,0.04,0.075),
    _q.setFromUnitVectors(UP, P(0,0.25,1).normalize()), new THREE.Vector3(0.85,1,1));
}

// Mess-Ringe: id, Höhe, Standardradius, Mittelpunkt-x (Gliedmaßen), z-Stauchung, Label-Seite
export const RING_DEFS=[
  {id:"neck",  y:1.535, r:0.062, cx:0,     squash:0.86, side:"right"},
  {id:"chest", y:1.41,  r:0.185, cx:0,     squash:0.64, side:"right"},
  {id:"arm",   y:1.30,  r:0.055, cx:0.205, squash:1,    side:"left"},
  {id:"waist", y:1.19,  r:0.135, cx:0,     squash:0.64, side:"right"},
  {id:"hip",   y:1.04,  r:0.17,  cx:0,     squash:0.68, side:"right"},
  {id:"thigh", y:0.78,  r:0.092, cx:0.096, squash:1,    side:"left"},
];

export function buildRings(){
  return RING_DEFS.map(def=>{
    const holder=new THREE.Group();
    holder.position.set(def.cx, def.y, 0);

    const mat=new THREE.MeshBasicMaterial({
      color:ACCENT, transparent:true, opacity:0.85,
      blending:THREE.AdditiveBlending, depthWrite:false,
    });
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 12, 80), mat);
    ring.rotation.x=Math.PI/2;
    holder.add(ring);

    // unsichtbare, dickere Trefffläche fürs Maus-Picking
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
  // Torus liegt in der XZ-Ebene: x-Radius = r, z-Radius = r*squash
  holder.scale.set(r, 1, r*def.squash);
}

// Vorberechnete Kreis-Stützpunkte, um pro Frame die Silhouetten-Kante
// des Rings (am nächsten zur Label-Seite) zu finden.
const RING_SAMPLES = Array.from({length:32}, (_,i)=>{
  const a=(i/32)*Math.PI*2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
});
const _p=new THREE.Vector3();
// Liefert den Bildschirm-Punkt am Ring-Rand, der am weitesten zur
// Label-Seite (sideSign: +1 rechts, -1 links) liegt.
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
