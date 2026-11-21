// Baut src/three/body.bin aus den MakeHuman-Grafikdaten (CC0).
// Aufruf: node tools/build-body.mjs <Ordner mit base.obj und *.target>
// Quelle der Daten: https://github.com/makehumancommunity/makehuman (makehuman/data)
//
// Enthalten: Körper + Augen (ohne Hilfsgeometrie), Gelenk-Marker für Messebenen,
// je Geschlecht eine Grundform sowie Verformungen für Muskel/Fett und die
// Umfangs-Verformungen (Brust, Taille, Hüfte, Hals, Oberarm, Oberschenkel).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SRC = process.argv[2];
if(!SRC){ console.error("Quellordner fehlt"); process.exit(1); }
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src/three/body.bin");

// ---------- OBJ ----------
const V = [];            // [x,y,z]
const faces = [];        // {g, v:[...]}
let g = "";
for(const line of fs.readFileSync(path.join(SRC,"base.obj"),"utf8").split("\n")){
  if(line.startsWith("v ")){ const p=line.split(/\s+/); V.push([+p[1],+p[2],+p[3]]); }
  else if(line.startsWith("g ")) g=line.slice(2).trim();
  else if(line.startsWith("f ")) faces.push({ g, v:line.trim().split(/\s+/).slice(1).map(s=>parseInt(s,10)-1) });
}

const JOINTS = ["neck","head","l-shoulder","l-elbow","l-hand","l-upper-leg","l-knee","l-ankle","pelvis","spine-1","spine-2","spine-3","spine-4","l-clavicle","r-shoulder","r-upper-leg"];
const keepFace = f => f.g==="body" || f.g==="helper-l-eye" || f.g==="helper-r-eye";

// Verwendete Vertices neu nummerieren: Körper, Augen, dann Gelenk-Marker
const remap = new Map();
const order = [];
const use = i => { if(!remap.has(i)){ remap.set(i, order.length); order.push(i); } return remap.get(i); };
const tris = [];
let nBody = 0;
for(const pass of ["body","helper-l-eye","helper-r-eye"]){
  for(const f of faces){
    if(f.g!==pass) continue;
    const idx = f.v.map(use);
    for(let k=1;k<idx.length-1;k++) tris.push(idx[0], idx[k], idx[k+1]);
  }
  if(pass==="body") nBody = order.length;
}
const nSkin = order.length;                     // Körper + Augen
const nTriBody = tris.length/3;                 // Dreiecke gesamt (Augen am Ende)
let nBodyTris = 0;
for(let t=0;t<tris.length;t+=3) if(tris[t]<nBody) nBodyTris++;
const joints = {};
for(const name of JOINTS){
  const vs = new Set();
  for(const f of faces) if(f.g==="joint-"+name) f.v.forEach(i=>vs.add(i));
  if(!vs.size) throw new Error("Gelenk fehlt: "+name);
  joints[name] = [...vs].map(use);
}
const N = order.length;
if(N>65535) throw new Error("zu viele Vertices");

// ---------- Targets ----------
function readTarget(name){
  const d = new Float32Array(N*3);
  for(const line of fs.readFileSync(path.join(SRC,name+".target"),"utf8").split("\n")){
    if(!line || line[0]==="#") continue;
    const p = line.trim().split(/\s+/);
    const i = remap.get(parseInt(p[0],10));
    if(i==null) continue;
    d[i*3]=+p[1]; d[i*3+1]=+p[2]; d[i*3+2]=+p[3];
  }
  return d;
}
const add = (a,b,s=1) => { const o=new Float32Array(a); for(let i=0;i<o.length;i++) o[i]+=b[i]*s; return o; };
const rms = d => { let s=0; for(const x of d) s+=x*x; return Math.sqrt(s/(d.length/3)); };

const base0 = new Float32Array(N*3);
order.forEach((src,i)=>{ base0[i*3]=V[src][0]; base0[i*3+1]=V[src][1]; base0[i*3+2]=V[src][2]; });

// ---------- Binär-Schreiber ----------
const chunks = []; let off = 0;
function push(typed){
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (buf.length%4))%4;
  const o = off;
  chunks.push(buf); if(pad) chunks.push(Buffer.alloc(pad));
  off += buf.length + pad;
  return o;
}
const POS_SCALE = 1/1500;
function packDense(f32){                 // int16, fester Maßstab
  const q = new Int16Array(f32.length);
  for(let i=0;i<q.length;i++) q[i]=Math.round(f32[i]/POS_SCALE);
  return { off:push(q) };
}
function packDelta(f32, dense){          // int16 mit eigenem Maßstab, optional dünn besetzt
  let max = 0; for(const x of f32) max=Math.max(max, Math.abs(x));
  const scale = (max||1)/32767;
  if(dense){
    const q = new Int16Array(f32.length);
    for(let i=0;i<q.length;i++) q[i]=Math.round(f32[i]/scale);
    return { scale, off:push(q) };
  }
  const idx = [], val = [];
  for(let i=0;i<N;i++){
    const x=f32[i*3], y=f32[i*3+1], z=f32[i*3+2];
    if(Math.hypot(x,y,z) < 2e-4) continue;
    idx.push(i); val.push(Math.round(x/scale), Math.round(y/scale), Math.round(z/scale));
  }
  return { scale, n:idx.length, idx:push(new Uint16Array(idx)), off:push(new Int16Array(val)) };
}

const header = { N, nSkin, nBody, nTris:tris.length/3, nBodyTris, posScale:POS_SCALE, joints, genders:{}, measures:{}, anchors:{} };
header.tris = push(new Uint16Array(tris));

for(const gd of ["male","female"]){
  const avg = add(add(base0, readTarget(`caucasian-${gd}-young`)), readTarget(`universal-${gd}-young-averagemuscle-averageweight`));
  const m = n => readTarget(`universal-${gd}-young-${n}`);
  const rel = n => add(m(n), m("averagemuscle-averageweight"), -1);
  const axes = {
    musclePos: rel("maxmuscle-averageweight"), muscleNeg: rel("minmuscle-averageweight"),
    fatPos:    rel("averagemuscle-maxweight"), fatNeg:    rel("averagemuscle-minweight"),
  };
  // Ecken: Abweichung von der reinen Summe der Achsen (Muskel und Fett wirken nicht rein additiv)
  const corner = (mu, fa, a, b) => add(add(rel(`${mu}-${fa}`), axes[a], -1), axes[b], -1);
  const corners = {
    mPfP: corner("maxmuscle","maxweight","musclePos","fatPos"),
    mPfN: corner("maxmuscle","minweight","musclePos","fatNeg"),
    mNfP: corner("minmuscle","maxweight","muscleNeg","fatPos"),
    mNfN: corner("minmuscle","minweight","muscleNeg","fatNeg"),
  };
  const G = { base:packDense(avg).off, morphs:{} };
  for(const [k,d] of Object.entries(axes)){ G.morphs[k]=packDelta(d,true); console.log(gd,k,"rms",rms(d).toFixed(4)); }
  for(const [k,d] of Object.entries(corners)){ G.morphs[k]=packDelta(d,true); console.log(gd,k,"rms",rms(d).toFixed(4)); }
  header.genders[gd] = G;
}

// Umfangs-Verformungen (für beide Geschlechter gleich)
const MEAS = { chest:"bust", waist:"waist", hip:"hips", neck:"neck", arm:"upperarm", thigh:"thigh" };
for(const [id, mh] of Object.entries(MEAS)){
  const inc = readTarget(`measure-${mh}-circ-incr`), dec = readTarget(`measure-${mh}-circ-decr`);
  header.measures[id] = { pos:packDelta(inc,false), neg:packDelta(dec,false) };
  // Anker: Vertices mit der stärksten Wirkung (linke Körperseite bei Gliedmaßen) -> Lage der Messebene
  const limb = id==="arm" || id==="thigh";
  const cand = [];
  for(let i=0;i<nBody;i++){
    const mag = Math.hypot(inc[i*3],inc[i*3+1],inc[i*3+2]);
    if(mag>0 && (!limb || base0[i*3]>0.3)) cand.push([mag,i]);
  }
  cand.sort((a,b)=>b[0]-a[0]);
  header.anchors[id] = cand.slice(0, 40).map(c=>c[1]);
  const ys = header.anchors[id].map(i=>base0[i*3+1]);
  console.log(id, "n+", header.measures[id].pos.n, "n-", header.measures[id].neg.n, "anchor y", (ys.reduce((a,b)=>a+b)/ys.length).toFixed(2));
}

const hbuf = Buffer.from(JSON.stringify(header));
const hpad = (4 - (hbuf.length%4))%4;
const len = Buffer.alloc(4); len.writeUInt32LE(hbuf.length+hpad);
const raw = Buffer.concat([len, hbuf, Buffer.alloc(hpad, 0x20), ...chunks]);
const gz = zlib.gzipSync(raw, { level:9 });
fs.writeFileSync(OUT, gz);
console.log(`Vertices ${N} (Körper ${nBody}), Dreiecke ${tris.length/3}, roh ${(raw.length/1024).toFixed(0)} KB, gzip ${(gz.length/1024).toFixed(0)} KB -> ${OUT}`);
