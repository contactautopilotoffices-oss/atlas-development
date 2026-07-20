/* ============================================================================
   ATLAS — DIGITAL CITY KIT · ASSET LAYER
   A reusable library that sits ALONGSIDE BUILDING_REGISTRY (mapbox_app.js).
   Buildings/props reference shared assets + materials instead of embedding
   one-off geometry, so the kit scales from BKC → all of Mumbai → other cities.

     MATERIALS      — a few standardized PBR families, reused everywhere
     ASSET_REGISTRY — reusable props (trees, lamps, cars, street furniture)
     AssetLoader    — loads each GLB once, hands out clones / instanced meshes

   Loaded as a classic script BEFORE mapbox_app.js; initialised by the world
   layer with the THREE module the app already imports (no double-load).
   ============================================================================ */
window.AtlasAssets = (function () {
  const KIT = "./assets/kit/";

  /* Reusable props — MIT low-poly kit (dgreenheck/simcity-threejs-clone).
     kind:'car' feeds the traffic engine; 'tree'/'street' feed the prop layer.
     scale is metres-of-final-height ÷ model-height (kit models are ~unit-sized). */
  const ASSET_REGISTRY = {
    // vehicles (traffic)
    car_sedan:   { glb: "car-passenger.glb",      kind: "car", scale: 4.4,  yaw: Math.PI / 2 },
    car_taxi:    { glb: "car-taxi.glb",           kind: "car", scale: 4.4,  yaw: Math.PI / 2 },
    car_van:     { glb: "car-hippie-van.glb",     kind: "car", scale: 4.8,  yaw: Math.PI / 2 },
    car_sport:   { glb: "car-passenger-race.glb", kind: "car", scale: 4.3,  yaw: Math.PI / 2 },
    truck:       { glb: "truck.glb",              kind: "car", scale: 6.5,  yaw: Math.PI / 2 },
    bus:         { glb: "bus-passenger.glb",      kind: "car", scale: 10.0, yaw: Math.PI / 2 },
    // vegetation
    tree_oak:    { glb: "tree-oak.glb",    kind: "tree",   scale: 7.0 },
    tree_round:  { glb: "tree-round.glb",  kind: "tree",   scale: 6.0 },
    tree_tall:   { glb: "tree-tall.glb",   kind: "tree",   scale: 9.0 },
    tree_poplar: { glb: "tree-poplar.glb", kind: "tree",   scale: 8.0 },
    palm:        { glb: "palm.glb",        kind: "tree",   scale: 7.5 },
    // street furniture
    lamp:        { glb: "lamp-road.glb",        kind: "street", scale: 6.0 },
    lamp_double: { glb: "lamp-road-double.glb", kind: "street", scale: 6.0 },
    lamp_city:   { glb: "lamp-city.glb",        kind: "street", scale: 4.5 },
    bench:       { glb: "bench-old.glb",        kind: "street", scale: 1.4 },
    bus_stop:    { glb: "bus-stop.glb",         kind: "street", scale: 3.2 },
    hydrant:     { glb: "fire-hydrant.glb",     kind: "street", scale: 1.0 },
    signal:      { glb: "traffic-lights.glb",   kind: "street", scale: 5.5 },
  };

  let THREE = null, gltfLoader = null, mergeGeometries = null;
  let baseTex = null, specTex = null;
  let _mats = null;
  const _loaded = {};   // id → { root, baked:{geometry,material} }  (baked lazily)

  /* -------- MATERIALS: the standardized PBR families (cached singletons) ------
     One glass, one concrete, one metal … reused across every building so the
     city reads as one cohesive place. Tuned for the shared astronomical sun. */
  function materials() {
    if (_mats) return _mats;
    const M = (o) => new THREE.MeshStandardMaterial(o);
    _mats = {
      glassBlue:    M({ color: 0x3a5f86, metalness: 0.75, roughness: 0.12, envMapIntensity: 1.1 }),
      glassCurtain: M({ color: 0x8aa0b4, metalness: 0.6,  roughness: 0.18 }),
      glassGreen:   M({ color: 0x2f5f52, metalness: 0.7,  roughness: 0.15 }),
      concrete:     M({ color: 0xb9bcc0, metalness: 0.0,  roughness: 0.9 }),
      concreteWarm: M({ color: 0xcabfac, metalness: 0.0,  roughness: 0.92 }),
      aluminium:    M({ color: 0xc7ced6, metalness: 0.85, roughness: 0.35 }),
      granite:      M({ color: 0x5c5f66, metalness: 0.1,  roughness: 0.6 }),
      steel:        M({ color: 0x9aa2ab, metalness: 0.95, roughness: 0.4 }),
      asphalt:      M({ color: 0x2c2f34, metalness: 0.0,  roughness: 0.95 }),
      roadPaint:    M({ color: 0xdfe3e6, metalness: 0.0,  roughness: 0.7 }),
      landscaping:  M({ color: 0x4a7a45, metalness: 0.0,  roughness: 1.0 }),
      rooftop:      M({ color: 0x8b9097, metalness: 0.3,  roughness: 0.7 }),
      water:        M({ color: 0x223a4d, metalness: 0.2,  roughness: 0.08, transparent: true, opacity: 0.85 }),
    };
    return _mats;
  }

  async function init(_THREE) {
    if (THREE) return api;          // idempotent
    THREE = _THREE;
    const { GLTFLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js");
    const BGU = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js");
    mergeGeometries = BGU.mergeGeometries;
    gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    baseTex = texLoader.load(KIT + "base.png"); baseTex.colorSpace = THREE.SRGBColorSpace; baseTex.flipY = false;
    specTex = texLoader.load(KIT + "specular.png"); specTex.flipY = false;
    return api;
  }

  /* The kit re-skins every model from a single palette atlas (base.png).
     Reapply it as a PBR material so props respond to the shared sun. */
  function kitMaterial() {
    return new THREE.MeshStandardMaterial({ map: baseTex, roughnessMap: specTex, roughness: 0.85, metalness: 0.1 });
  }

  function _loadRoot(id) {
    const reg = ASSET_REGISTRY[id];
    if (!reg) return Promise.reject(new Error("unknown asset " + id));
    if (_loaded[id]?.root) return Promise.resolve(_loaded[id].root);
    return new Promise((res, rej) => {
      gltfLoader.load(KIT + reg.glb, (glb) => {
        const root = glb.scene;
        const km = kitMaterial();
        // Normalise to metres: kit models are ~1 unit; scale so height ≈ reg.scale
        const box = new THREE.Box3().setFromObject(root);
        const h = Math.max(box.max.y - box.min.y, 0.001);
        const s = (reg.scale || 1) / h;
        root.scale.setScalar(s);
        root.traverse((o) => { if (o.isMesh) { o.material = km; o.castShadow = true; o.receiveShadow = true; } });
        root.updateMatrixWorld(true);
        (_loaded[id] ||= {}).root = root;
        res(root);
      }, undefined, rej);
    });
  }

  /** A fresh clone of an asset, ready to position (few-count: hero surroundings). */
  async function getModel(id) {
    const root = await _loadRoot(id);
    return root.clone(true);
  }

  /** Baked {geometry, material} for InstancedMesh scatter (many-count: trees/props).
      All kit meshes share one atlas material, so we merge into a single geometry. */
  async function bake(id) {
    if (_loaded[id]?.baked) return _loaded[id].baked;
    const root = await _loadRoot(id);
    const geos = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      // keep only position/normal/uv so merge never fails on attribute mismatch
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      geos.push(g);
    });
    const geometry = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    const baked = { geometry, material: kitMaterial() };
    (_loaded[id] ||= {}).baked = baked;
    return baked;
  }

  /** InstancedMesh of `count` copies of `id`. Fill via mesh.setMatrixAt(...). */
  async function getInstancedMesh(id, count) {
    const { geometry, material } = await bake(id);
    return new THREE.InstancedMesh(geometry, material, count);
  }

  function idsByKind(kind) { return Object.keys(ASSET_REGISTRY).filter((k) => ASSET_REGISTRY[k].kind === kind); }

  const api = { init, ASSET_REGISTRY, materials, getModel, getInstancedMesh, bake, idsByKind };
  return api;
})();
