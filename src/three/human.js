// Realistische Körperfigur auf Basis der MakeHuman-Grafikdaten (CC0).
// Lädt body.bin (siehe tools/build-body.mjs), formt den Körper aus
// Muskel-/Fettanteil und passt Brust, Taille, Hüfte, Hals, Oberarm und
// Oberschenkel so an, dass die Umfänge der Figur den gemessenen entsprechen.
import * as THREE from "three";
import bodyUrl from "./body.bin?url";

export const FIG_HEIGHT = 1.8;
export const MEASURES = ["chest","waist","hip","neck","arm","thigh"];
const W_MIN = -1.6, W_MAX = 2.4;      // Grenzen der Umfangs-Verformung (darüber wird es unnatürlich)

export async function loadHuman(){
  const res = await fetch(bodyUrl);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  const hlen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  return new Human(header, buf, 4+hlen);
}

class Human{
  constructor(h, buf, p0){
    this.h = h; this.N = h.N;
    const i16 = (off, n) => new Int16Array(buf, p0+off, n);
    const u16 = (off, n) => new Uint16Array(buf, p0+off, n);
    this.tris = u16(h.tris, h.nTris*3);
    const dense = m => ({ scale:m.scale, d:i16(m.off, h.N*3) });
    this.genders = {};
    for(const g of ["male","female"]){
      const G = h.genders[g];
      this.genders[g] = { base:i16(G.base, h.N*3), morphs:Object.fromEntries(Object.entries(G.morphs).map(([k,m])=>[k,dense(m)])) };
    }
    const sparse = m => ({ scale:m.scale, idx:u16(m.idx, m.n), d:i16(m.off, m.n*3) });
    this.measures = Object.fromEntries(Object.entries(h.measures).map(([k,m])=>[k,{ pos:sparse(m.pos), neg:sparse(m.neg) }]));

    this.macroP = new Float32Array(h.N*3);
    this.P = new Float32Array(h.N*3);

    // Nachbarschaft (für die Hauttönung in Vertiefungen)
    const nb = Array.from({length:h.nSkin}, ()=>new Set());
    for(let t=0;t<this.tris.length;t+=3){
      const a=this.tris[t], b=this.tris[t+1], c=this.tris[t+2];
      nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
    }
    this.nb = nb.map(s=>Uint16Array.from(s));

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(h.nSkin*3), 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(h.nSkin*3), 3));
    this.geometry.setIndex(new THREE.BufferAttribute(this.tris, 1));
  }

  jointCenter(name, out=new THREE.Vector3()){
    const vs = this.h.joints[name], P = this.P;
    out.set(0,0,0);
    for(const i of vs){ out.x+=P[i*3]; out.y+=P[i*3+1]; out.z+=P[i*3+2]; }
    return out.multiplyScalar(1/vs.length);
  }
  anchorCenter(id, out=new THREE.Vector3()){
    const vs = this.h.anchors[id], P = this.P;
    out.set(0,0,0);
    for(const i of vs){ out.x+=P[i*3]; out.y+=P[i*3+1]; out.z+=P[i*3+2]; }
    return out.multiplyScalar(1/vs.length);
  }

  // Grundform aus Geschlecht, Muskel (m) und Fett (f), jeweils -1..1
  buildMacro(gender, m, f){
    const G = this.genders[gender], out = this.macroP, s = this.h.posScale;
    const b = G.base;
    for(let i=0;i<out.length;i++) out[i] = b[i]*s;
    const addDense = (mo, w) => { if(!w) return; const k = mo.scale*w, d = mo.d; for(let i=0;i<out.length;i++) out[i] += d[i]*k; };
    const M = G.morphs, am = Math.abs(m), af = Math.abs(f);
    addDense(m>=0 ? M.musclePos : M.muscleNeg, am);
    addDense(f>=0 ? M.fatPos : M.fatNeg, af);
    addDense(M[(m>=0?"mP":"mN")+(f>=0?"fP":"fN")], am*af);
    // Körpermaße der Grundform
    let lo=Infinity, hi=-Infinity;
    for(let i=0;i<this.h.nBody;i++){ const y=out[i*3+1]; if(y<lo) lo=y; if(y>hi) hi=y; }
    this.minY = lo; this.height = hi-lo;
  }

  applyMeasures(w){
    const P = this.P;
    P.set(this.macroP);
    for(const id of MEASURES){
      const wi = w[id]; if(!wi) continue;
      const mo = wi>0 ? this.measures[id].pos : this.measures[id].neg;
      const k = mo.scale*Math.abs(wi), idx = mo.idx, d = mo.d;
      for(let j=0;j<idx.length;j++){
        const v = idx[j]*3;
        P[v]+=d[j*3]*k; P[v+1]+=d[j*3+1]*k; P[v+2]+=d[j*3+2]*k;
      }
    }
  }

  // Je Maß nur die Dreiecke nahe der Messebene merken (spart ~95 % der Schnitt-Arbeit).
  // Der Abstand ist großzügig, damit die Auswahl auch nach der Verformung noch passt.
  prefilter(){
    const P = this.P, T = this.tris, nt = this.h.nBodyTris*3;
    this.sub = null;
    const sub = {};
    for(const id of MEASURES){
      const { p, n } = this.plane(id);
      const list = [];
      for(let t=0;t<nt;t+=3){
        let near = false;
        for(let k=0;k<3;k++){
          const i = T[t+k]*3;
          if(Math.abs((P[i]-p.x)*n.x + (P[i+1]-p.y)*n.y + (P[i+2]-p.z)*n.z) < 0.9){ near = true; break; }
        }
        if(near) list.push(t);
      }
      sub[id] = Uint32Array.from(list);
    }
    this.sub = sub;
  }

  // Messebene je Maß: Punkt + Normale (Modellraum)
  plane(id){
    const p = this.anchorCenter(id), n = new THREE.Vector3(0,1,0);
    if(id==="arm"){
      const a = this.jointCenter("l-shoulder"), b = this.jointCenter("l-elbow");
      n.subVectors(b,a).normalize();
      p.copy(a).lerp(b, 0.45);                    // dickste Stelle des Oberarms
    }else if(id==="thigh"){
      const a = this.jointCenter("l-upper-leg"), b = this.jointCenter("l-knee");
      n.subVectors(b,a).normalize();
      p.copy(a).lerp(b, 0.3);                     // oberer Oberschenkel, knapp unter dem Schritt
    }else if(id==="neck"){
      const a = this.jointCenter("neck"), b = this.jointCenter("head");
      n.subVectors(b,a).normalize();
      // Punkt bleibt der Anker (dort wirkt die Hals-Verformung): liegt auch bei
      // kräftigem Nacken sicher zwischen Schultern und Kinn
    }
    return { p, n };
  }

  // Schnitt Ebene/Körper -> Maßband-Kontur (konvexe Hülle) der nächstgelegenen Schnittinsel
  slice(id){
    const { p, n } = this.plane(id), P = this.P, T = this.tris;
    const sub = this.sub?.[id];
    const d = i => (P[i*3]-p.x)*n.x + (P[i*3+1]-p.y)*n.y + (P[i*3+2]-p.z)*n.z;
    const pts = new Map();          // Kanten-Schlüssel -> Punkt
    const adj = new Map();          // Kanten-Schlüssel -> Nachbar-Schlüssel
    const cut = (a, b, da, db) => {
      const key = a<b ? a*65536+b : b*65536+a;
      if(!pts.has(key)){
        const t = da/(da-db);
        pts.set(key, [P[a*3]+(P[b*3]-P[a*3])*t, P[a*3+1]+(P[b*3+1]-P[a*3+1])*t, P[a*3+2]+(P[b*3+2]-P[a*3+2])*t]);
      }
      return key;
    };
    const nt = sub ? sub.length : this.h.nBodyTris;
    for(let k0=0;k0<nt;k0++){
      const t = sub ? sub[k0] : k0*3;
      const a=T[t], b=T[t+1], c=T[t+2];
      const da=d(a), db=d(b), dc=d(c);
      const sa=da>=0, sb=db>=0, sc=dc>=0;
      if(sa===sb && sb===sc) continue;
      const k = [];
      if(sa!==sb) k.push(cut(a,b,da,db));
      if(sb!==sc) k.push(cut(b,c,db,dc));
      if(sc!==sa) k.push(cut(c,a,dc,da));
      if(k.length!==2) continue;
      (adj.get(k[0]) || adj.set(k[0],[]).get(k[0])).push(k[1]);
      (adj.get(k[1]) || adj.set(k[1],[]).get(k[1])).push(k[0]);
    }
    // Zusammenhängende Inseln; die mit dem Schwerpunkt am nächsten zum Ebenenpunkt gewinnt
    const seen = new Set();
    let best = null, bestD = Infinity;
    for(const start of pts.keys()){
      if(seen.has(start)) continue;
      const comp = [], stack = [start];
      seen.add(start);
      while(stack.length){
        const k = stack.pop(); comp.push(pts.get(k));
        for(const o of adj.get(k)||[]) if(!seen.has(o)){ seen.add(o); stack.push(o); }
      }
      if(comp.length<8) continue;
      let cx=0, cy=0, cz=0;
      for(const q of comp){ cx+=q[0]; cy+=q[1]; cz+=q[2]; }
      cx/=comp.length; cy/=comp.length; cz/=comp.length;
      const dist = Math.hypot(cx-p.x, cy-p.y, cz-p.z);
      if(dist<bestD){ bestD=dist; best=comp; }
    }
    if(!best) return { perimeter:0, loop:[] };
    // 2D-Basis in der Ebene, konvexe Hülle (so liegt auch ein Maßband an)
    const u = new THREE.Vector3(1,0,0).addScaledVector(n, -n.x).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const q2 = best.map(q=>{
      const x=q[0]-p.x, y=q[1]-p.y, z=q[2]-p.z;
      return [x*u.x+y*u.y+z*u.z, x*v.x+y*v.y+z*v.z, q];
    }).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
    const lower = [], upper = [];
    for(const q of q2){ while(lower.length>=2 && cross(lower.at(-2), lower.at(-1), q)<=0) lower.pop(); lower.push(q); }
    for(let i=q2.length-1;i>=0;i--){ const q=q2[i]; while(upper.length>=2 && cross(upper.at(-2), upper.at(-1), q)<=0) upper.pop(); upper.push(q); }
    const hull = lower.slice(0,-1).concat(upper.slice(0,-1));
    let per = 0;
    for(let i=0;i<hull.length;i++){ const a=hull[i], b=hull[(i+1)%hull.length]; per += Math.hypot(a[0]-b[0], a[1]-b[1]); }
    return { perimeter:per, loop:hull.map(q=>q[2]) };
  }

  // params: { gender:"male"|"female", heightCm, muscle, fat, targets:{id:cm|null} }
  fit(params){
    const heightCm = params.heightCm || 178;
    this.buildMacro(params.gender==="female" ? "female" : "male", params.muscle||0, params.fat||0);
    const cmPerUnit = heightCm/this.height;
    const w = Object.fromEntries(MEASURES.map(id=>[id,0]));
    const ids = MEASURES.filter(id=>params.targets?.[id]>0);
    this.applyMeasures(w);
    this.prefilter();
    for(let sweep=0; sweep<4; sweep++){
      for(const id of ids){
        const T = params.targets[id]/cmPerUnit;
        const c0 = this.slice(id).perimeter;
        if(!c0 || Math.abs(T-c0)*cmPerUnit<0.15) continue;
        const w0 = w[id], step = T>c0 ? 0.35 : -0.35;
        w[id] = w0+step; this.applyMeasures(w);
        const c1 = this.slice(id).perimeter;
        const sens = (c1-c0)/step;
        w[id] = sens>1e-4 ? Math.max(W_MIN, Math.min(W_MAX, w0 + (T-c0)/sens)) : w0;
        this.applyMeasures(w);
      }
    }
    // Ergebnis: Umfänge der Figur + Konturen in Weltkoordinaten
    const s = FIG_HEIGHT/this.height;
    const c = this.jointCenter("pelvis");
    this.toWorld = (q, out=new THREE.Vector3()) => out.set((q[0]-c.x)*s, (q[1]-this.minY)*s, (q[2]-c.z)*s);
    const out = { weights:w, circ:{}, loops:{}, cmPerUnit };
    for(const id of MEASURES){
      const sl = this.slice(id);
      out.circ[id] = sl.perimeter*cmPerUnit;
      out.loops[id] = sl.loop.map(q=>this.toWorld(q));
    }
    this.writeGeometry(s, c);
    return out;
  }

  writeGeometry(s, c){
    const P = this.P, n = this.h.nSkin, nBody = this.h.nBody;
    const pos = this.geometry.attributes.position, arr = pos.array;
    for(let i=0;i<n;i++){
      arr[i*3] = (P[i*3]-c.x)*s; arr[i*3+1] = (P[i*3+1]-this.minY)*s; arr[i*3+2] = (P[i*3+2]-c.z)*s;
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();

    // Hauttönung: Vertiefungen etwas dunkler/rötlicher, Wölbungen heller -> Muskeln lesbar ohne Textur
    const nor = this.geometry.attributes.normal.array;
    const cav = new Float32Array(n);
    for(let i=0;i<nBody;i++){
      const nb = this.nb[i]; if(!nb.length) continue;
      let lx=0, ly=0, lz=0, len=0;
      for(const j of nb){
        const dx=arr[j*3]-arr[i*3], dy=arr[j*3+1]-arr[i*3+1], dz=arr[j*3+2]-arr[i*3+2];
        lx+=dx; ly+=dy; lz+=dz; len+=Math.hypot(dx,dy,dz);
      }
      cav[i] = (lx*nor[i*3]+ly*nor[i*3+1]+lz*nor[i*3+2])/(len||1);   // >0 = Mulde
    }
    const sm = new Float32Array(n);
    for(let pass=0; pass<2; pass++){
      for(let i=0;i<nBody;i++){
        const nb = this.nb[i]; let a = cav[i];
        for(const j of nb) a += cav[j];
        sm[i] = a/(nb.length+1);
      }
      cav.set(sm);
    }
    const col = this.geometry.attributes.color.array;
    const skin = new THREE.Color(0xd8a383), deep = new THREE.Color(0x8f5343), light = new THREE.Color(0xf0c8ab);
    const tmp = new THREE.Color();
    for(let i=0;i<nBody;i++){
      const k = Math.max(-1, Math.min(1, cav[i]*5.5));
      tmp.copy(skin).lerp(k>0 ? deep : light, Math.abs(k)*(k>0 ? 0.6 : 0.4));
      col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
    }
    // Augen: heller Augapfel, dunkle Iris nach vorn
    const white = new THREE.Color(0xe6e0d8), iris = new THREE.Color(0x2c2018);
    for(const side of ["l","r"]){
      const ids = [];
      for(let i=nBody;i<n;i++) if((arr[i*3]>0)===(side==="l")) ids.push(i);
      let cx=0, cy=0, cz=0;
      for(const i of ids){ cx+=arr[i*3]; cy+=arr[i*3+1]; cz+=arr[i*3+2]; }
      cx/=ids.length; cy/=ids.length; cz/=ids.length;
      for(const i of ids){
        const dx=arr[i*3]-cx, dy=arr[i*3+1]-cy, dz=arr[i*3+2]-cz;
        const f = dz/(Math.hypot(dx,dy,dz)||1);
        tmp.copy(f>0.80 ? iris : white);
        col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
      }
    }
    this.geometry.attributes.color.needsUpdate = true;
  }
}

// Muskel- und Fettanteil der Grundform (-1..1) aus den Körperdaten ableiten.
// Fett: Körperfett-%, sonst BMI. Muskel: fettfreie Masse relativ zur Größe (FFMI).
export function shapeFromData({ gender, heightCm, weightKg, fatPct }){
  const female = gender==="female";
  const lin = (v, lo, mid, hi) => v>=mid ? (v-mid)/(hi-mid) : (v-mid)/(mid-lo);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hM = heightCm ? heightCm/100 : null;
  let fat = 0, muscle = 0;
  if(fatPct>0) fat = female ? lin(fatPct, 13, 24, 42) : lin(fatPct, 6, 15, 32);
  else if(hM && weightKg>0) fat = lin(weightKg/(hM*hM), 17.5, 22.5, 32);
  if(hM && weightKg>0 && fatPct>0){
    const ffmi = weightKg*(1-fatPct/100)/(hM*hM);
    muscle = female ? lin(ffmi, 13, 15.5, 20) : lin(ffmi, 16, 19, 25);
  }
  return { fat:clamp(fat, -1, 1.15), muscle:clamp(muscle, -1, 1.15) };
}

// Hautmaterial. Kleidung (Shorts, bei Frauen zusätzlich ein Top) wird im Shader
// als scharf begrenzte Zone über Höhe/Breite eingefärbt und folgt so jeder Körperform.
export function skinMaterial(){
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors:true, roughness:0.56, metalness:0,
    sheen:0.45, sheenRoughness:0.55, sheenColor:new THREE.Color(0xff8f70),
    clearcoat:0.06, clearcoatRoughness:0.6,
  });
  const u = mat.userData.uniforms = {
    uShorts: { value:new THREE.Vector3(9,8,0) },   // yUnten, yOben, xMax
    uTop:    { value:new THREE.Vector3(9,8,0) },
    uCloth:  { value:new THREE.Color(0x222b3d) },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vObj;
        uniform vec3 uShorts; uniform vec3 uTop; uniform vec3 uCloth;
        float zone(vec3 z){
          float e = 0.004;
          return smoothstep(z.x-e, z.x+e, vObj.y) * (1.0-smoothstep(z.y-e, z.y+e, vObj.y)) * (1.0-smoothstep(z.z-e, z.z+e, abs(vObj.x)));
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cloth = max(zone(uShorts), zone(uTop));
        diffuseColor.rgb = mix(diffuseColor.rgb, uCloth, cloth);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, cloth);`)
      .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
        material.sheenColor *= (1.0-cloth);`);   // kein Haut-Schimmer auf Stoff
  };
  return mat;
}

// Kleidungszonen aus dem Fit ableiten (Weltkoordinaten der Figur)
export function setClothing(mat, fit, female){
  const span = loop => {
    let lo=Infinity, hi=-Infinity, x=0;
    loop.forEach(p=>{ lo=Math.min(lo,p.y); hi=Math.max(hi,p.y); x=Math.max(x,Math.abs(p.x)); });
    return { lo, hi, x };
  };
  const u = mat.userData.uniforms;
  const hip = span(fit.loops.hip), thigh = span(fit.loops.thigh), chest = span(fit.loops.chest);
  if(fit.loops.hip.length && fit.loops.thigh.length)
    u.uShorts.value.set(thigh.lo-0.045, hip.hi+0.075, hip.x+0.03);
  if(female && fit.loops.chest.length) u.uTop.value.set(chest.lo-0.07, chest.hi+0.06, chest.x+0.004);
  else u.uTop.value.set(9,8,0);
}
