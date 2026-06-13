// Prozedurale Hologramm-Figur (~1,80 Einheiten hoch, Füße bei y=0)
// plus Mess-Ringe, deren Radius auf die echten Umfänge skaliert.
import * as THREE from "three";

export const ACCENT = 0x46d8e8;
export const BAD = 0xf08372;
const FIG_HEIGHT = 1.8;

// Fresnel-Shader: leuchtende Kanten, durchscheinende Mitte
function holoMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{ uColor:{value:new THREE.Color(ACCENT)}, uStrength:{value:0.55} },
    vertexShader:`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader:`
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor, 0.04 + f*uStrength);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
}
const wireMaterial = new THREE.MeshBasicMaterial({
  color:ACCENT, wireframe:true, transparent:true, opacity:0.02,
  blending:THREE.AdditiveBlending, depthWrite:false,
});

function addPart(group, geo, pos, rot){
  const solid=new THREE.Mesh(geo, holoMaterial());
  const wire=new THREE.Mesh(geo, wireMaterial);
  [solid,wire].forEach(m=>{
    if(pos) m.position.set(...pos);
    if(rot) m.rotation.set(...rot);
    group.add(m);
  });
  return solid;
}

export function buildFigure(){
  const group=new THREE.Group();

  // Kopf + Hals
  addPart(group, new THREE.SphereGeometry(0.105, 28, 22), [0,1.685,0]);
  addPart(group, new THREE.CylinderGeometry(0.05,0.062,0.12,18), [0,1.575,0]);

  // Rumpf als Drehkörper (Schulter -> Brust -> Taille -> Hüfte), elliptisch gestaucht
  const profile=[
    [0.001,1.555],[0.075,1.545],[0.13,1.52],[0.165,1.49],[0.176,1.44],[0.17,1.38],
    [0.155,1.30],[0.135,1.24],[0.125,1.20],[0.13,1.14],[0.15,1.08],[0.162,1.03],
    [0.15,0.99],[0.11,0.955],[0.001,0.95],
  ].map(p=>new THREE.Vector2(p[0],p[1]));
  const torso=addPart(group, new THREE.LatheGeometry(profile, 40));
  torso.scale.z=0.66;
  group.children.find(c=>c!==torso && c.geometry===torso.geometry).scale.z=0.66;

  // Arme (leicht abgespreizt, nah am Rumpf)
  const armGeo=new THREE.CapsuleGeometry(0.042, 0.54, 6, 16);
  addPart(group, armGeo, [ 0.218,1.16,0], [0,0,-0.08]);
  addPart(group, armGeo, [-0.218,1.16,0], [0,0, 0.08]);

  // Beine + Füße
  const legGeo=new THREE.CapsuleGeometry(0.071, 0.78, 6, 16);
  addPart(group, legGeo, [ 0.091,0.49,0], [0,0,-0.012]);
  addPart(group, legGeo, [-0.091,0.49,0], [0,0, 0.012]);
  const footGeo=new THREE.CapsuleGeometry(0.048, 0.12, 4, 12);
  addPart(group, footGeo, [ 0.10,0.052,0.07], [Math.PI/2,0,0]);
  addPart(group, footGeo, [-0.10,0.052,0.07], [Math.PI/2,0,0]);

  return group;
}

// Mess-Ringe: id, Höhe, Standardradius, Mittelpunkt-x (Gliedmaßen), z-Stauchung, Label-Seite
export const RING_DEFS=[
  {id:"neck",  y:1.575, r:0.072, cx:0,     squash:0.85, side:"right", limb:false},
  {id:"chest", y:1.44,  r:0.195, cx:0,     squash:0.68, side:"right", limb:false},
  {id:"arm",   y:1.30,  r:0.058, cx:0.228, squash:1,    side:"left",  limb:true, tilt:-0.08},
  {id:"waist", y:1.20,  r:0.145, cx:0,     squash:0.68, side:"right", limb:false},
  {id:"hip",   y:1.045, r:0.182, cx:0,     squash:0.72, side:"right", limb:false},
  {id:"thigh", y:0.74,  r:0.098, cx:0.093, squash:1,    side:"left",  limb:true},
];

export function buildRings(){
  return RING_DEFS.map(def=>{
    const holder=new THREE.Group();
    holder.position.set(def.cx, def.y, 0);
    if(def.tilt) holder.rotation.z=def.tilt;

    const mat=new THREE.MeshBasicMaterial({
      color:ACCENT, transparent:true, opacity:0.8,
      blending:THREE.AdditiveBlending, depthWrite:false,
    });
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1, 0.0085, 10, 72), mat);
    ring.rotation.x=Math.PI/2;
    holder.add(ring);

    // unsichtbare, dickere Trefffläche für Maus-Picking
    const hit=new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.045, 6, 36),
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
  return Math.min(0.32, Math.max(0.04, r));
}

export function setRingRadius(holder, def, r){
  // Torus liegt in XZ-Ebene: x-Radius = r, z-Radius = r*squash
  holder.scale.set(r, 1, r*def.squash);
}

// Außenpunkt des Rings in Weltkoordinaten (für die Leader-Linie zum Label).
// (1,0,0) im Holder-Raum wird durch dessen Skalierung zum Außenradius.
const _v=new THREE.Vector3();
export function ringAnchor(entry, sideSign, target){
  _v.set(sideSign, 0, 0);
  return entry.holder.localToWorld(target.copy(_v));
}
