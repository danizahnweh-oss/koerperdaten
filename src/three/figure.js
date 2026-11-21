// Mess-Ringe: liegen wie ein Maßband direkt auf der Körperkontur der Figur
// (Kontur kommt aus human.js, dort wird der Körper an die Maße angepasst).
import * as THREE from "three";

export const ACCENT = 0x3fc6ff;   // Scan-Blau für die Ringe
export const BAD = 0xf08372;

// id + Seite, an der das Label im Viewer hängt
export const RING_DEFS=[
  {id:"neck",  side:"right"},
  {id:"chest", side:"right"},
  {id:"arm",   side:"left"},
  {id:"waist", side:"right"},
  {id:"hip",   side:"right"},
  {id:"thigh", side:"left"},
];

export function buildRings(){
  return RING_DEFS.map(def=>{
    const holder=new THREE.Group();
    const mat=new THREE.MeshBasicMaterial({
      color:ACCENT, transparent:true, opacity:0.3, depthWrite:false, depthTest:false,
    });
    const ring=new THREE.Mesh(new THREE.BufferGeometry(), mat);
    ring.renderOrder=3;
    ring.visible=false;
    holder.add(ring);

    const hit=new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false})
    );
    hit.userData.ringId=def.id;
    hit.visible=false;
    holder.add(hit);

    return { def, holder, ring, hit, mat, samples:[] };
  });
}

// Kontur (Weltpunkte im Figur-Raum) als geschlossenes Band setzen
const _c=new THREE.Vector3();
export function setRingLoop(entry, pts){
  entry.ring.geometry.dispose();
  entry.hit.geometry.dispose();
  if(!pts || pts.length<4){
    entry.ring.visible=entry.hit.visible=false;
    entry.samples=[];
    return;
  }
  _c.set(0,0,0);
  pts.forEach(p=>_c.add(p));
  _c.multiplyScalar(1/pts.length);
  // minimal nach außen, damit das Band auf der Haut aufliegt
  const lifted=pts.map(p=>p.clone().sub(_c).multiplyScalar(1.025).add(_c));
  const curve=new THREE.CatmullRomCurve3(lifted, true, "centripetal");
  entry.ring.geometry=new THREE.TubeGeometry(curve, 120, 0.0055, 6, true);
  entry.hit.geometry=new THREE.TubeGeometry(curve, 48, 0.045, 5, true);
  entry.ring.visible=entry.hit.visible=true;
  entry.samples=curve.getPoints(40);
}

// Pro Frame die Silhouetten-Kante des Rings (am nächsten zur Label-Seite) finden.
const _p=new THREE.Vector3();
export function ringEdgeScreen(entry, sideSign, camera, w, h, out){
  let bestX = sideSign>0 ? -Infinity : Infinity, sx=0, sy=0;
  entry.holder.updateWorldMatrix(true, false);
  for(const s of entry.samples){
    _p.copy(s).applyMatrix4(entry.holder.matrixWorld).project(camera);
    const px=( _p.x*0.5+0.5)*w;
    if(sideSign>0 ? px>bestX : px<bestX){ bestX=px; sx=px; sy=(-_p.y*0.5+0.5)*h; }
  }
  out.x=sx; out.y=sy;
  return out;
}
