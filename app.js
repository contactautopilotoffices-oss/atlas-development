/* ============================================================================
   BKC DIGITAL TWIN — APP LAYER  (Three.js, no build step)
   Role: 3D geospatial intelligence view for pitching BKC offices to tenants.
   ============================================================================ */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const D = window.BKC;

/* ---- tunables (guide: expose constants) ---- */
const CFG = {
  bloom: 0.55, bloomRadius: 0.6, bloomThreshold: 0.85,
  sunAngle: 0.34, fogDensity: 0.00055,
  dayFog: 0xdfe6ea, nightFog: 0x0a0f1a,
};

let scene, camera, renderer, labelRenderer, controls, composer, bloomPass;
let clock = new THREE.Clock();
const pickables = [];               // meshes that can be clicked (option buildings)
const buildingMeshes = {};          // id -> group
const trains = [];                  // {mesh, curve, t, speed}
let sun, hemi, ambient, skyMesh;
let night = false, cinematic = false, showLabels = true, showMetroDist = true;
let selectedId = null;
let distGroup = null;               // metro-distance line + label
const labelObjs = [];               // CSS2D labels (toggle)

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let fly = null;                     // active camera tween

/* ============================================================ INIT */
function init(){
  const canvasWrap = document.getElementById("scene");

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CFG.dayFog, CFG.fogDensity);

  camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 1, 6000);
  camera.position.set(-380, 340, 620);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasWrap.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = "label-layer";
  canvasWrap.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = true; controls.screenSpacePanning = true; controls.panSpeed = 1.3;
  // free-roam defaults — wide distance, but keep camera above ground so building undersides aren't exposed
  controls.maxPolarAngle = Math.PI*0.5;   // stay above the horizon / ground plane
  controls.minDistance = 10; controls.maxDistance = 4000;
  controls.target.set(0, 30, 40);

  buildLighting();
  buildSky();
  buildGround();
  buildRiver();
  buildRoads();
  buildTrees();
  D.BUILDINGS.forEach(buildBuilding);
  buildMetroLine("aqua", D.METRO.aqua);
  buildMetroLine("yellow", D.METRO.yellow);
  buildNeighborhoods();

  buildLeaderboard();
  wireUI();

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyMove);
  // use canvas for controls; detect clicks vs drags so building selection still works
  let clickStart = null;
  renderer.domElement.addEventListener("pointerdown", e=>{
    if(e.button!==0) return;
    clickStart = {x:e.clientX, y:e.clientY, ev:e};
  });
  renderer.domElement.addEventListener("pointerup", e=>{
    if(!clickStart) return;
    const dx=e.clientX-clickStart.x, dy=e.clientY-clickStart.y;
    const startEv = clickStart.ev; clickStart=null;
    if(dx*dx+dy*dy < 64) onPointerDown(startEv);
  });

  // post
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight),
                                  CFG.bloom, CFG.bloomRadius, CFG.bloomThreshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* ============================================================ LIGHTS / SKY */
function buildLighting(){
  hemi = new THREE.HemisphereLight(0xfff2d6, 0x40506a, 0.75);
  scene.add(hemi);
  ambient = new THREE.AmbientLight(0xffffff, 0.18); scene.add(ambient);

  sun = new THREE.DirectionalLight(0xffd9a0, 2.1);
  const a = CFG.sunAngle;
  sun.position.set(Math.cos(a)*-700, Math.sin(a)*620+180, 360);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  const s = 900;
  Object.assign(sun.shadow.camera, {left:-s,right:s,top:s,bottom:-s,near:1,far:2600});
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
}

function buildSky(){
  const geo = new THREE.SphereGeometry(3400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite:false,
    uniforms:{ top:{value:new THREE.Color(0x2a5c9a)}, bot:{value:new THREE.Color(0xffd9a8)},
               off:{value:0.15} },
    vertexShader:`varying vec3 v; void main(){ v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 v; uniform vec3 top; uniform vec3 bot; uniform float off;
      void main(){ float h=normalize(v).y*0.5+0.5; float t=smoothstep(0.15+off,0.62,h);
      gl_FragColor=vec4(mix(bot,top,t),1.0);} `
  });
  skyMesh = new THREE.Mesh(geo, mat); scene.add(skyMesh);
}

/* ============================================================ GROUND */
function buildGround(){
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(6000,6000),
    new THREE.MeshStandardMaterial({color:0x8fa07e, roughness:1})
  );
  g.rotation.x = -Math.PI/2; g.position.y = -0.2; g.receiveShadow = true;
  scene.add(g);

  // BKC land pad — lighter, slightly raised, defines the complex footprint
  const padShape = new THREE.Shape();
  const pts = [[-360,-380],[420,-360],[560,-120],[560,320],[380,520],[-260,480],[-380,120],[-360,-380]];
  padShape.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(p=>padShape.lineTo(p[0],p[1]));
  const pad = new THREE.Mesh(
    new THREE.ShapeGeometry(padShape),
    new THREE.MeshStandardMaterial({color:0xb9bcae, roughness:0.95})
  );
  pad.rotation.x = -Math.PI/2; pad.position.y = 0.0; pad.receiveShadow = true;
  scene.add(pad);
}

function buildRiver(){
  const curve = new THREE.CatmullRomCurve3(D.RIVER_PATH.map(p=>new THREE.Vector3(p[0],0,p[1])));
  const pts = curve.getPoints(120);
  const shape = new THREE.Shape();
  const width = 46;
  // build a ribbon
  const left=[], right=[];
  for(let i=0;i<pts.length;i++){
    const a = pts[Math.max(0,i-1)], b = pts[Math.min(pts.length-1,i+1)];
    const dir = new THREE.Vector3().subVectors(b,a).normalize();
    const n = new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(width);
    left.push(new THREE.Vector3().addVectors(pts[i],n));
    right.push(new THREE.Vector3().subVectors(pts[i],n));
  }
  const all = left.concat(right.reverse());
  shape.moveTo(all[0].x, all[0].z);
  all.slice(1).forEach(p=>shape.lineTo(p.x,p.z));
  const river = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({color:0x2f6d86, roughness:0.15, metalness:0.4, transparent:true, opacity:0.92})
  );
  river.rotation.x = -Math.PI/2; river.position.y = 0.4;
  river.userData.river = true;
  scene.add(river);
}

function buildRoads(){
  // a few arterial ribbons across the pad for a "city" read
  const roadMat = new THREE.MeshStandardMaterial({color:0x3b3f45, roughness:0.9});
  const arterials = [
    [[-360,-40],[560,-40]], [[-360,180],[520,180]],
    [[40,-360],[40,500]], [[280,-360],[300,480]], [[-200,-380],[-180,480]]
  ];
  arterials.forEach(seg=>{
    const a=new THREE.Vector3(seg[0][0],0,seg[0][1]), b=new THREE.Vector3(seg[1][0],0,seg[1][1]);
    const len=a.distanceTo(b), mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5);
    const road=new THREE.Mesh(new THREE.PlaneGeometry(len,20), roadMat);
    road.rotation.x=-Math.PI/2; road.position.set(mid.x,0.25,mid.z);
    road.rotation.z=-Math.atan2(b.z-a.z,b.x-a.x);
    road.receiveShadow=true; scene.add(road);
  });
}

function buildTrees(){
  const trunkG = new THREE.CylinderGeometry(1.1,1.4,7,5);
  const leafG  = new THREE.IcosahedronGeometry(7,0);
  const trunkM = new THREE.MeshStandardMaterial({color:0x5b4634, roughness:1});
  const leafM  = new THREE.MeshStandardMaterial({color:0x3f7d4a, roughness:1});
  const N=260;
  const trunks=new THREE.InstancedMesh(trunkG,trunkM,N);
  const leaves=new THREE.InstancedMesh(leafG,leafM,N);
  leaves.castShadow=true;
  const m=new THREE.Matrix4(); let c=0;
  for(let i=0;i<N*3 && c<N;i++){
    const x=(Math.random()-0.5)*880, z=(Math.random()-0.4)*820;
    // keep off buildings-ish and on the pad
    if(x< -380||x>560||z< -370||z>500) continue;
    if(Math.abs(x+40)<70 && Math.abs(z-40)<60) continue;
    const s=0.7+Math.random()*0.8;
    m.makeTranslation(x,3.5*s,z); m.scale(new THREE.Vector3(s,s,s));
    trunks.setMatrixAt(c,m);
    m.makeTranslation(x,8.5*s,z); m.scale(new THREE.Vector3(s,s,s));
    leaves.setMatrixAt(c,m); c++;
  }
  trunks.count=c; leaves.count=c;
  trunks.instanceMatrix.needsUpdate=true; leaves.instanceMatrix.needsUpdate=true;
  scene.add(trunks); scene.add(leaves);
}

/* ============================================================ BUILDINGS */
function windowTexture(){
  const c=document.createElement("canvas"); c.width=64;c.height=128;
  const x=c.getContext("2d");
  x.fillStyle="#2a3340"; x.fillRect(0,0,64,128);
  for(let j=6;j<128;j+=12) for(let i=6;i<64;i+=14){
    x.fillStyle = Math.random()<0.5 ? "#6f8194" : "#3a4655";
    x.fillRect(i,j,9,7);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
const winTex = windowTexture();

function facadeMat(color, glass){
  return new THREE.MeshStandardMaterial({
    color, roughness: glass?0.15:0.6, metalness: glass?0.55:0.1,
    emissive: 0x0a0e14, emissiveIntensity: 0
  });
}

function makeLabel(text, cls){
  const div=document.createElement("div"); div.className="lbl "+(cls||""); div.textContent=text;
  const o=new CSS2DObject(div); labelObjs.push(o); return o;
}

function buildBuilding(b){
  const grp = new THREE.Group();
  grp.position.set(b.x, 0, b.z);
  const glass = ["oval","tower","slab","twin"].includes(b.type);
  const mat = facadeMat(b.color, glass);
  let body;

  if(b.type==="oval"){
    body = new THREE.Mesh(new THREE.CylinderGeometry(1,1,b.h,40,1), mat);
    body.scale.set(b.w/2, 1, b.d/2);
    body.position.y=b.h/2;
    const cap=new THREE.Mesh(new THREE.SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2),
      facadeMat(b.color,true));
    cap.scale.set(b.w/2,b.h*0.16,b.d/2); cap.position.y=b.h; grp.add(cap);
  } else if(b.type==="slab"){
    body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), mat); body.position.y=b.h/2;
  } else if(b.type==="twin"){
    const g=new THREE.BoxGeometry(b.w*0.42,b.h,b.d);
    const l=new THREE.Mesh(g,mat), r=new THREE.Mesh(g,mat);
    l.position.set(-b.w*0.28,b.h/2,0); r.position.set(b.w*0.28,b.h/2,0);
    grp.add(l,r); body=l; r.castShadow=r.receiveShadow=true;
  } else if(b.type==="convention"){
    body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), facadeMat(b.color,false)); body.position.y=b.h/2;
    const roof=new THREE.Mesh(new THREE.CylinderGeometry(b.d*0.5,b.d*0.5,b.w,24,1,false,0,Math.PI),
      facadeMat(0xf2ecdf,false));
    roof.rotation.z=Math.PI/2; roof.position.y=b.h; grp.add(roof);
  } else if(b.type==="complex"){
    body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), facadeMat(b.color,false)); body.position.y=b.h/2;
    for(let i=0;i<3;i++){ const w=new THREE.Mesh(new THREE.BoxGeometry(b.w*0.9,b.h*1.1,b.d*0.18),
      facadeMat(b.color,false)); w.position.set(0,b.h*0.55,(i-1)*b.d*0.34); w.castShadow=true; grp.add(w);}
  } else if(b.type==="secure"){
    body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), facadeMat(b.color,false)); body.position.y=b.h/2;
    const lawn=new THREE.Mesh(new THREE.PlaneGeometry(b.w*1.6,b.d*1.6),
      new THREE.MeshStandardMaterial({color:0x4f7a45,roughness:1}));
    lawn.rotation.x=-Math.PI/2; lawn.position.y=0.3; grp.add(lawn);
  } else if(b.type==="hotel"){
    body=new THREE.Mesh(new THREE.CylinderGeometry(b.w*0.42,b.w*0.5,b.h,6), facadeMat(b.color,true));
    body.position.y=b.h/2;
  } else { // tower / block
    body=new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d), mat); body.position.y=b.h/2;
  }
  body.castShadow=true; body.receiveShadow=true;
  if(glass && body.material){ body.material.map=winTex; body.material.map.repeat.set(2, Math.max(3,b.h/16)); }
  grp.add(body);

  // podium
  const pod=new THREE.Mesh(new THREE.BoxGeometry(b.w*1.25,8,b.d*1.25),
    new THREE.MeshStandardMaterial({color:0x9aa0a6,roughness:0.9}));
  pod.position.y=4; pod.castShadow=pod.receiveShadow=true; grp.add(pod);

  // label
  const lbl=makeLabel(b.name, b.isOption?"lbl-opt":"lbl-ctx");
  lbl.position.set(0, b.h+16, 0); grp.add(lbl);

  // selectable
  grp.userData = { building:b };
  if(b.isOption){
    body.userData.pickId=b.id; pickables.push(body);
    grp.userData.body=body; grp.userData.baseColor=new THREE.Color(b.color);
  }
  buildingMeshes[b.id]=grp;
  scene.add(grp);
}

/* ============================================================ METRO */
function buildMetroLine(key, line){
  const curve = new THREE.CatmullRomCurve3(line.path.map(p=>new THREE.Vector3(p[0],0,p[1])));
  const H = 26; // elevated deck height
  // deck
  const deckGeo = new THREE.TubeGeometry(offsetCurve(curve,H), 200, 3.2, 8, false);
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({color:0x6b7078,roughness:0.8}));
  deck.castShadow=true; scene.add(deck);
  // rails (glow)
  const railMat=new THREE.MeshStandardMaterial({color:line.color, emissive:line.color, emissiveIntensity:0.8, roughness:0.4});
  [-1.4,1.4].forEach(o=>{
    const r=new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(curve,H+3.6,o),200,0.5,6,false), railMat);
    scene.add(r);
  });
  // pillars
  const pillM=new THREE.MeshStandardMaterial({color:0x8a8f96,roughness:0.9});
  const n=Math.floor(curve.getLength()/60);
  for(let i=1;i<n;i++){
    const p=curve.getPoint(i/n);
    const pil=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.2,H,10),pillM);
    pil.position.set(p.x,H/2,p.z); pil.castShadow=true; scene.add(pil);
  }
  // stations
  line.stations.forEach(st=>{
    const g=new THREE.Group(); g.position.set(st.x, H, st.z);
    const box=new THREE.Mesh(new THREE.BoxGeometry(26,10,14),
      new THREE.MeshStandardMaterial({color:0xf5f5f5,roughness:0.6,emissive:line.color,emissiveIntensity:0.12}));
    box.position.y=5; box.castShadow=true; g.add(box);
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(30,1.4,18),
      new THREE.MeshStandardMaterial({color:line.color,emissive:line.color,emissiveIntensity:0.5,roughness:0.4}));
    canopy.position.y=11; g.add(canopy);
    const lbl=makeLabel("🚆 "+st.name, "lbl-metro");
    lbl.element.style.background = "#"+line.color.toString(16).padStart(6,"0");
    lbl.position.set(0,20,0); g.add(lbl);
    scene.add(g);
  });
  // train — each car follows the track independently so it takes curves cleanly
  const trainCurve=offsetCurve(curve,H+4.1);
  const train=makeTrain(line.color, trainCurve);
  scene.add(train);
  trains.push({ mesh:train, curve:trainCurve, t:Math.random(), speed:0.018+Math.random()*0.01 });
}

function offsetCurve(curve, y, lateral){
  const pts=curve.getPoints(160).map((p,i,arr)=>{
    const v=p.clone(); v.y=y;
    if(lateral){ const b=arr[Math.min(arr.length-1,i+1)], a=arr[Math.max(0,i-1)];
      const dir=new THREE.Vector3().subVectors(b,a).normalize();
      const nrm=new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(lateral); v.add(nrm);}
    return v;
  });
  return new THREE.CatmullRomCurve3(pts);
}

function makeTrain(color, curve){
  const g=new THREE.Group();
  const bodyM=new THREE.MeshStandardMaterial({color, roughness:0.35, metalness:0.4,
    emissive:color, emissiveIntensity:0.25});
  const roofM=new THREE.MeshStandardMaterial({color:0x1a1f26, roughness:0.5, metalness:0.4});
  const winM=new THREE.MeshStandardMaterial({color:0x22303a, roughness:0.2, metalness:0.6});
  const bogieM=new THREE.MeshStandardMaterial({color:0x2a2f36, roughness:0.7, metalness:0.4});
  const curveLen = curve.getLength();
  for(let i=0;i<4;i++){
    const car=new THREE.Group();
    // cars are laid out along the train's Z axis so +Z points forward along the track
    const b=new THREE.Mesh(new THREE.BoxGeometry(4.2,4.6,9.4), bodyM);
    b.position.y=2.6; car.add(b);
    const r=new THREE.Mesh(new THREE.BoxGeometry(4.3,0.35,9.5), roofM);
    r.position.y=5.05; car.add(r);
    const w=new THREE.Mesh(new THREE.BoxGeometry(4.3,1.7,9.5), winM); w.position.y=3.4; car.add(w);
    const u=new THREE.Mesh(new THREE.BoxGeometry(3.0,0.9,7.0), bogieM);
    u.position.y=0.55; car.add(u);
    const z = (i-1.5)*10.5;
    car.position.z = z;
    car.userData.tOffset = z / curveLen; // each car tracks its own point on the curve
    car.castShadow=true; g.add(car);
  }
  return g;
}

/* ============================================================ NEIGHBORHOODS */
function buildNeighborhoods(){
  D.NEIGHBORHOODS.forEach(n=>{
    const g=new THREE.Group(); g.position.set(n.x,0,n.z);
    const pin=new THREE.Mesh(new THREE.ConeGeometry(6,18,4),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffcf6b,emissiveIntensity:0.4}));
    pin.rotation.x=Math.PI; pin.position.y=24; g.add(pin);
    const lbl=makeLabel("★ "+n.name+"  ·  "+n.tag, "lbl-hood");
    lbl.position.set(0,40,0); g.add(lbl);
    scene.add(g);
  });
}

/* ============================================================ INTERACTION */
function onPointerDown(e){
  pointer.x=(e.clientX/window.innerWidth)*2-1;
  pointer.y=-(e.clientY/window.innerHeight)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(pickables,false);
  if(hits.length) selectBuilding(hits[0].object.userData.pickId);
}

function selectBuilding(id){
  if(!buildingMeshes[id]) return;
  selectedId=id;
  const b=D.BUILDINGS.find(x=>x.id===id);
  highlightSelected(id);
  flyToBuilding(b);
  openCard(b);
  drawMetroDistance(b);
  document.querySelectorAll(".lb-row").forEach(r=>r.classList.toggle("active", r.dataset.bldg===id));
}

function highlightSelected(id){
  D.BUILDINGS.forEach(b=>{
    if(!b.isOption) return;
    const grp=buildingMeshes[b.id];
    const body=grp.userData.body;
    if(!body||!body.material) return;
    if(b.id===id){ body.material.emissive=new THREE.Color(0x2fbf71); body.material.emissiveIntensity=0.5; }
    else { body.material.emissive=new THREE.Color(0x0a0e14); body.material.emissiveIntensity= night?0.35:0; }
  });
}

function flyToBuilding(b){
  const dist = 90 + b.h*1.6;
  const dir = new THREE.Vector3(0.7,0.6,0.9).normalize();
  const to = new THREE.Vector3(b.x,0,b.z).add(dir.multiplyScalar(dist));
  to.y = Math.max(70, b.h*0.9+60);
  fly = { fromP:camera.position.clone(), toP:to,
          fromT:controls.target.clone(), toT:new THREE.Vector3(b.x,b.h*0.45,b.z),
          t:0, dur:1.1 };
}

function drawMetroDistance(b){
  if(distGroup){ scene.remove(distGroup); distGroup.traverse(o=>{if(o.isCSS2DObject)o.element.remove();}); }
  distGroup=new THREE.Group();
  if(!showMetroDist){ scene.add(distGroup); return; }
  // nearest Aqua station
  const st=D.METRO.aqua.stations[0];
  const a=new THREE.Vector3(st.x,30,st.z), c=new THREE.Vector3(b.x,20,b.z);
  const mid=new THREE.Vector3().addVectors(a,c).multiplyScalar(0.5); mid.y=70;
  const curve=new THREE.QuadraticBezierCurve3(a,mid,c);
  const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,40,1.6,6,false),
    new THREE.MeshStandardMaterial({color:0x14b8c4,emissive:0x14b8c4,emissiveIntensity:0.9,roughness:0.3}));
  distGroup.add(tube);
  const pin=new THREE.Mesh(new THREE.SphereGeometry(4,16,12),
    new THREE.MeshStandardMaterial({color:0xd1495b,emissive:0xd1495b,emissiveIntensity:0.7}));
  pin.position.copy(c); pin.position.y=b.h+10; distGroup.add(pin);
  const walk=Math.max(1,Math.round(b.aqua*12));       // ~12 min per km walk
  const lblDiv=document.createElement("div"); lblDiv.className="lbl lbl-dist";
  lblDiv.innerHTML=`<b>${b.aqua} km</b> to Aqua Line<br>~${walk} min walk`;
  const lbl=new CSS2DObject(lblDiv); lbl.position.copy(mid); distGroup.add(lbl);
  scene.add(distGroup);
}

/* ============================================================ CARD */
const floorLevel = { "Ground":0,"1st":1,"2nd":2,"3rd":3,"4th":4,"5th":5,"14th":14 };

function openCard(b){
  const units=D.OPTIONS.filter(o=>o.bldg===b.id).sort((x,y)=>x.rank-y.rank);
  const best=units[0];
  const card=document.getElementById("card");
  const fit = best?best.fit:"—";
  const fitColor = best? D.FIT_COLORS[best.fit] : "#888";

  card.innerHTML = `
    <button id="cardClose" aria-label="close">✕</button>
    <div class="card-head">
      <div class="card-block">${b.block}${b.grade?` &nbsp;·&nbsp; <span class="grade-chip grade-${b.grade[0]}">Grade ${b.grade}</span>`:""}</div>
      <div class="card-title">${b.name}</div>
      ${best?`<div class="card-rank">Best unit ranks <b>#${best.rank}</b> of 13 · Feasibility
        <b>${best.score.toFixed(2)}</b>/10 <span class="chip" style="background:${fitColor}">${fit}</span></div>`:
        `<div class="card-rank">Context landmark</div>`}
      <div class="card-sub">${b.tenants||""}</div>
      ${b.gradeNote?`<div class="card-sub grade-note">🏆 ${b.gradeNote}</div>`:""}
    </div>

    ${units.length?`
    <div class="sec"><h4>Available units</h4>
      <div class="units">
        ${units.map(u=>`<div class="unit" data-rank="${u.rank}" style="border-left-color:${D.FIT_COLORS[u.fit]}">
          <div class="unit-top"><b>${u.floor} floor</b> · ${u.carpet.toLocaleString()} sqft carpet
            <span class="unit-score">#${u.rank} · ${u.score.toFixed(2)}</span></div>
          <div class="unit-grid">
            <span>Chargeable</span><span>${u.charge.toLocaleString()} sqft</span>
            <span>Efficiency</span><span>${Math.round(u.eff*100)}%</span>
            <span>Furnishing</span><span>${u.furn}</span>
            <span>Parking</span><span>${u.parking}</span>
            <span>Possession</span><span>${u.poss}</span>
          </div>
          <div class="unit-note">${u.note}</div>
        </div>`).join("")}
      </div>
    </div>`:""}

    <div class="sec floors-sec"><h4>Floor stack — <span class="muted">green = unit available</span></h4>
      <div class="floorstack" id="floorstack">${floorStackSVG(b,units)}</div>
      <div class="floor-detail" id="floorDetail">Click a highlighted floor to inspect the unit.</div>
    </div>

    <div class="sec"><h4>Connectivity — decision-maker view</h4>
      <div class="conn">
        <div class="conn-row"><span class="ic aqua">M3</span>
          <div><b>${b.aqua} km</b> to BKC Aqua Line (Line&nbsp;3) · ~${Math.max(1,Math.round(b.aqua*12))} min walk
          <div class="muted">Operational since Oct 2024 · ~7 min peak frequency</div></div></div>
        <div class="conn-row"><span class="ic yellow">2B</span>
          <div>Yellow Line 2B (ITO/IL&FS/MTNL BKC) — <b>upcoming 2026–27</b>
          <div class="muted">Under construction at BKC; not live yet</div></div></div>
        <div class="conn-row"><span class="ic rail">R</span>
          <div>Bandra suburban rail <b>${b.bandra?b.bandra+" km":"—"}</b> · BEST feeders + BKC AC shuttle</div></div>
        <div class="conn-row"><span class="ic bus">B</span>
          <div>${b.busStops}<div class="muted">Routes: ${b.busRoutes}</div></div></div>
      </div>
    </div>

    <div class="sec"><h4>Around this address</h4>
      <div class="poshwrap">${(b.posh||[]).map(p=>`<span class="posh">★ ${p}</span>`).join("")}</div>
    </div>

    <div class="card-cta">
      <button class="btn-primary" id="pitchBtn">Add to VFS shortlist</button>
    </div>`;

  card.classList.add("open");
  document.getElementById("cardClose").onclick=()=>closeCard();
  document.getElementById("pitchBtn")?.addEventListener("click",()=>{
    document.getElementById("pitchBtn").textContent="✓ Added to shortlist";
  });
  // floor clicks
  card.querySelectorAll(".fl-rect[data-avail='1']").forEach(r=>{
    r.addEventListener("click",()=>{
      card.querySelectorAll(".fl-rect").forEach(x=>x.classList.remove("sel"));
      r.classList.add("sel");
      const u=units.find(u=>String(floorLevel[u.floor])===r.dataset.level);
      const fd=document.getElementById("floorDetail");
      fd.innerHTML = u? `<b>${u.floor} floor</b> — ${u.carpet.toLocaleString()} sqft carpet /
        ${u.charge.toLocaleString()} chargeable · <span style="color:${D.FIT_COLORS[u.fit]}">${u.fit}</span>`
        : "No listed unit on this floor.";
    });
  });
}

function floorStackSVG(b,units){
  const total=Math.min(b.floors||14, 22);
  const avail=new Set(units.map(u=>floorLevel[u.floor]));
  const H=Math.max(150, total*11), fh=H/total, W=190;
  let s=`<svg viewBox="0 0 ${W} ${H+14}" width="100%" style="max-height:230px">`;
  for(let lvl=0;lvl<total;lvl++){
    const y=H-(lvl+1)*fh;
    const isA=avail.has(lvl);
    const fill=isA?"#2fbf71":"#39424e";
    s+=`<rect class="fl-rect${isA?" av":""}" data-avail="${isA?1:0}" data-level="${lvl}"
        x="10" y="${y}" width="${W-20}" height="${fh-2}" rx="2" fill="${fill}"
        stroke="#0c1016" stroke-width="1"/>`;
    if(isA||lvl===0||lvl===total-1)
      s+=`<text x="${W-16}" y="${y+fh-4}" text-anchor="end" font-size="8" fill="#cdd5df">${lvl===0?"G":lvl}</text>`;
  }
  s+=`</svg>`; return s;
}

function closeCard(){
  document.getElementById("card").classList.remove("open");
  selectedId=null; highlightSelected(null);
  if(distGroup){ scene.remove(distGroup); distGroup.traverse(o=>{if(o.isCSS2DObject)o.element.remove();}); distGroup=null; }
  document.querySelectorAll(".lb-row").forEach(r=>r.classList.remove("active"));
}

/* ============================================================ LEADERBOARD */
function buildLeaderboard(){
  const lb=document.getElementById("lb-list");
  // one row per option, decreasing feasibility (already ranked)
  lb.innerHTML=D.OPTIONS.map(o=>{
    const c=D.FIT_COLORS[o.fit];
    const bldg=D.BUILDINGS.find(x=>x.id===o.bldg);
    const grade=bldg&&bldg.grade?`Grade ${bldg.grade} · `:"";
    return `<div class="lb-row" data-bldg="${o.bldg}">
      <div class="lb-rank">${o.rank}</div>
      <div class="lb-main">
        <div class="lb-name">${o.unit}</div>
        <div class="lb-meta"><span class="dot" style="background:${c}"></span>${grade}${o.fit} · ${o.floor} · ${o.carpet.toLocaleString()} sqft · ${o.aqua} km</div>
        <div class="lb-bar"><span style="width:${o.score*10}%;background:${c}"></span></div>
      </div>
      <div class="lb-score">${o.score.toFixed(1)}</div>
    </div>`;
  }).join("");
  lb.querySelectorAll(".lb-row").forEach(r=>{
    r.addEventListener("click",()=>selectBuilding(r.dataset.bldg));
  });
}

/* ============================================================ UI / TOGGLES */
function wireUI(){
  const set=(id,fn)=>document.getElementById(id).addEventListener("click",fn);
  set("t-cine",e=>{ cinematic=!cinematic; controls.autoRotate=cinematic; controls.autoRotateSpeed=0.6;
    e.currentTarget.classList.toggle("on",cinematic); });
  set("t-night",e=>{ night=!night; applyNight(); e.currentTarget.classList.toggle("on",night); });
  set("t-labels",e=>{ showLabels=!showLabels; labelObjs.forEach(o=>o.element.style.display=showLabels?"":"none");
    e.currentTarget.classList.toggle("on",showLabels); });
  set("t-dist",e=>{ showMetroDist=!showMetroDist; e.currentTarget.classList.toggle("on",showMetroDist);
    if(selectedId) drawMetroDistance(D.BUILDINGS.find(b=>b.id===selectedId)); });
  set("t-reset",()=>{ closeCard(); fly={fromP:camera.position.clone(),toP:new THREE.Vector3(-380,340,620),
    fromT:controls.target.clone(),toT:new THREE.Vector3(0,30,40),t:0,dur:1.1}; });
  set("winnerBtn",()=>selectBuilding(D.META.winner));
  document.getElementById("t-labels").classList.add("on");
  document.getElementById("t-dist").classList.add("on");

  // retractable leaderboard
  const lb = document.getElementById("lb");
  const lbTab = document.getElementById("lb-tab");
  document.getElementById("lb-collapse").addEventListener("click", ()=>{
    lb.classList.add("collapsed"); lbTab.classList.add("show");
  });
  lbTab.addEventListener("click", ()=>{
    lb.classList.remove("collapsed"); lbTab.classList.remove("show");
  });
}

/* keyboard free roam (WASD / arrows + Q/E height) */
function onKeyMove(e){
  if(e.target.matches("input,textarea")) return;
  if(!camera || !controls) return;
  const step = e.shiftKey ? 140 : 55;
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
  const up = new THREE.Vector3(0,1,0);
  switch(e.key){
    case "w": case "W": case "ArrowUp":
      camera.position.addScaledVector(fwd, step); controls.target.addScaledVector(fwd, step); break;
    case "s": case "S": case "ArrowDown":
      camera.position.addScaledVector(fwd, -step); controls.target.addScaledVector(fwd, -step); break;
    case "a": case "A": case "ArrowLeft":
      camera.position.addScaledVector(right, -step); controls.target.addScaledVector(right, -step); break;
    case "d": case "D": case "ArrowRight":
      camera.position.addScaledVector(right, step); controls.target.addScaledVector(right, step); break;
    case "q": case "Q": camera.position.addScaledVector(up, step*0.6); controls.target.addScaledVector(up, step*0.6); break;
    case "e": case "E": camera.position.addScaledVector(up, -step*0.6); controls.target.addScaledVector(up, -step*0.6); break;
    default: return;
  }
  // never let the camera dive below ground level
  const minY = 30;
  camera.position.y = Math.max(minY, camera.position.y);
  controls.target.y = Math.max(minY, controls.target.y);
  controls.update();
}

function applyNight(){
  const fogC = night?CFG.nightFog:CFG.dayFog;
  scene.fog.color.setHex(fogC);
  skyMesh.material.uniforms.top.value.setHex(night?0x05070d:0x2a5c9a);
  skyMesh.material.uniforms.bot.value.setHex(night?0x141a2a:0xffd9a8);
  sun.intensity=night?0.35:2.1; hemi.intensity=night?0.25:0.75;
  bloomPass.strength=night?1.1:CFG.bloom;
  // window glow
  D.BUILDINGS.forEach(b=>{
    const grp=buildingMeshes[b.id]; if(!grp) return;
    grp.traverse(o=>{ if(o.isMesh&&o.material&&o.material.map===winTex){
      o.material.emissive=new THREE.Color(night?0xffcf82:0x0a0e14);
      o.material.emissiveIntensity=night?0.4:0;
    }});
  });
  if(selectedId) highlightSelected(selectedId);
}

/* ============================================================ LOOP */
function onResize(){
  camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
  labelRenderer.setSize(window.innerWidth,window.innerHeight);
  composer.setSize(window.innerWidth,window.innerHeight);
}

function animate(){
  requestAnimationFrame(animate);
  if(window.__paused){ return; }
  const dt=clock.getDelta();
  // trains — each car follows its own point on the curve so the train bends naturally
  trains.forEach(tr=>{
    tr.t=(tr.t+dt*tr.speed)%1;
    tr.mesh.children.forEach(car=>{
      const carT = (tr.t + car.userData.tOffset + 1) % 1;
      const p=tr.curve.getPointAt(carT);
      const tangent=tr.curve.getTangentAt(carT).normalize();

      // curvature direction from neighbouring tangents
      const t1=tr.curve.getTangentAt(Math.max(0,carT-0.02)).normalize();
      const t2=tr.curve.getTangentAt(Math.min(1,carT+0.02)).normalize();
      const turn = new THREE.Vector3().crossVectors(t1,t2).y; // positive = turning left
      const bank = THREE.MathUtils.clamp(-turn*1.0, -0.35, 0.35);

      const worldUp = new THREE.Vector3(0,1,0);
      let right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      if(right.lengthSq()<0.001) right = new THREE.Vector3(1,0,0);
      let up = new THREE.Vector3().crossVectors(right, tangent).normalize();
      up.applyAxisAngle(tangent, bank);          // lean into the turn
      right.crossVectors(tangent, up).normalize();

      const m = new THREE.Matrix4().makeBasis(right, up, tangent);
      car.position.copy(p);
      car.quaternion.setFromRotationMatrix(m);
    });
  });
  // camera fly
  if(fly){
    fly.t=Math.min(1, fly.t+dt/fly.dur);
    const e=easeInOut(fly.t);
    camera.position.lerpVectors(fly.fromP,fly.toP,e);
    controls.target.lerpVectors(fly.fromT,fly.toT,e);
    if(fly.t>=1) fly=null;
  }
  controls.update();
  composer.render();
  labelRenderer.render(scene,camera);
}
function easeInOut(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

// expose for the intro button
window.__selectWinner=()=>selectBuilding(D.META.winner);

/* ============================================================ START */
init();
animate();
