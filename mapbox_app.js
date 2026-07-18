/* ============================================================================
   BKC PROPERTY MAP — MAPBOX APP LAYER  (Phase 1: Markers + Footprint Extrusion)
   PRD: Only database buildings receive enhanced 3D treatment.
   Mapbox renders the full BKC geography for all surrounding context.
   ============================================================================ */

const D = window.BKC;
// MAPBOX_TOKEN should be provided via config.js (which is gitignored to avoid pushing secrets)
const MAPBOX_TOKEN = window.MAPBOX_TOKEN || "REPLACE_WITH_YOUR_MAPBOX_TOKEN";

/* ---- Tunable map defaults ---- */
const MAP_CENTER = [72.8636, 19.0632];   // BKC G-Block core
const MAP_ZOOM   = 15.4;
const MAP_PITCH  = 62;
const MAP_BEARING = -22;

/* ---- Property 3D Registry (PRD §31)
   renderMode: "extrusion" | "custom-model"
   heightMeters: overrides data.js b.h if present
   footprintOverride: manual OSM name or GeoJSON featureId if auto-match fails
   ----------------------------------------------------------------- */
const BUILDING_REGISTRY = {
  capital:  { renderMode: "extrusion", heightMeters: 96,  color: "#347055", footprintName: "The Capital" },
  naman:    { renderMode: "extrusion", heightMeters: 60,  color: "#8fa3b5", footprintName: "Naman Chambers" },
  parinee:  { renderMode: "extrusion", heightMeters: 85,  color: "#354f52", footprintName: "Parinee Cresenzo" },
  adani:    { renderMode: "extrusion", heightMeters: 118, color: "#cdd3da", footprintName: "Adani Inspire" },
  laxmi:    { renderMode: "extrusion", heightMeters: 74,  color: "#c7ccd2", footprintName: "Laxmi Tower" },
  onebkc: { 
    renderMode: "gltf-model", 
    modelUrl: "./GLB_3D/One%20BKC%203D%20Model.glb", 
    heightMeters: 132, 
    color: "#8fb4d9", 
    footprintName: "One BKC",
    geoReference: { anchorLng: 72.8650, anchorLat: 19.0606 },
    modelReference: { origin: "artist-defined" },
    transform: { rotationDegrees: 271, uniformScale: 1.011, offsetX: 9, offsetZ: 5 }
  },
  vaibhav:  { renderMode: "extrusion", heightMeters: 60,  color: "#d0d6dc", footprintName: "Vaibhav Chambers" },
  vibgyor:  { renderMode: "extrusion", heightMeters: 70,  color: "#7a6352", footprintName: "Vibgyor Tower" },
  pittie:   { renderMode: "extrusion", heightMeters: 56,  color: "#b9a48c", footprintName: "Pittie Chambers" },
  jioconv:  { renderMode: "extrusion", heightMeters: 45,  color: "#decab3", footprintName: "Jio World Convention Centre" },
  bkcstation:{ renderMode: "extrusion", heightMeters: 15,  color: "#14b8c4", footprintName: "BKC Metro Station" },
};

/* ---- State ---- */
let map = null;
let selectedId = null;
let night = false;
let showLabels = true;
let propertyMarkers = {};     // id → mapboxgl.Marker (dot)
let labelMarkers   = {};      // id → mapboxgl.Marker (name tag)
let debugMode = new URLSearchParams(window.location.search).has("debug");

/* ---- Footprint match results (logged in debug mode) ---- */
const matchResults = {};
window.__matchResults = matchResults;  // expose for console debugging

/* ============================================================
   ENTRY POINT — called from index.html after gate passes
   ============================================================ */
window.__initMapboxApp = function() {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    pitch: MAP_PITCH,
    bearing: MAP_BEARING,
    antialias: true,
  });

  map.on('style.load', () => {
    // Mapbox Standard handles 3D terrain and lighting intrinsically.
    // Configure to use the 'dusk' preset for a dark-themed aesthetic.
    map.setConfigProperty('basemap', 'lightPreset', 'dusk');
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
    map.setConfigProperty('basemap', 'showTransitLabels', true);
    map.setConfigProperty('basemap', 'show3dObjects', true);
  });

  // Add navigation control (zoom/rotate)
  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

  map.on("load", () => {
    // Enhance Mapbox's built-in building layer for surrounding context
    enhanceSurroundingBuildings();

    // Metro lines (GeoJSON layers)
    addMetroLines();

    // Database property footprint extrusions
    addExtrusionLayers();

    // Interactions (click on extrusions)
    addInteractions();

    // Property markers (teal dots) + name labels
    initDbMarkers();

    // Wire UI toggles
    wireUI();

    // Build leaderboard
    buildLeaderboard();

    // Debug overlay
    if (debugMode) renderDebugOverlay();

    // Signal loading complete
    setTimeout(() => {
      const loading = document.getElementById("loading");
      if (loading) { loading.style.opacity = 0; setTimeout(() => loading.remove(), 700); }
    }, 800);

    console.log("[Atlas] Mapbox map loaded. Phase 1 active.");
    console.log("[Atlas] Database buildings:", D.BUILDINGS.filter(b => b.isOption).map(b => `${b.id} [${b.lat?.toFixed(5)}, ${b.lng?.toFixed(5)}]`));
  });
};

/* ============================================================
   SURROUNDING BUILDINGS — enhance Mapbox's default 3D buildings
   so they stand out but remain visually secondary to our database.
   ============================================================ */
function enhanceSurroundingBuildings() {
  const layers = map.getStyle().layers;
  let firstSymbolId;
  for (const layer of layers) {
    if (layer.type === "symbol") { firstSymbolId = layer.id; break; }
  }

  // 1. Water enhancement
  map.addLayer({
    id: "bkc-water-enhance",
    type: "fill",
    source: "composite",
    "source-layer": "water",
    paint: {
      "fill-color": "#05111c",
      "fill-opacity": 0.8
    }
  }, firstSymbolId);

  // 2. Parks / Green Areas
  map.addLayer({
    id: "bkc-parks",
    type: "fill",
    source: "composite",
    "source-layer": "landuse",
    filter: ["match", ["get", "class"], ["park", "pitch", "grass"], true, false],
    paint: {
      "fill-color": "#0a1c14",
      "fill-opacity": 0.6
    }
  }, firstSymbolId);

  // 3. Road Hierarchy
  map.addLayer({
    id: "bkc-roads-primary",
    type: "line",
    source: "composite",
    "source-layer": "road",
    filter: ["match", ["get", "class"], ["primary", "secondary", "trunk"], true, false],
    paint: {
      "line-color": "#232e3d",
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 6]
    }
  }, firstSymbolId);

  // 4. Enhanced 3D Buildings
  map.addLayer({
    id: "surrounding-buildings-3d",
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "yes"],
    paint: {
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["get", "height"],
        0, "#10131a",
        50, "#19202c",
        150, "#253142"
      ],
      "fill-extrusion-height": [
        "interpolate", ["linear"], ["zoom"],
        14, 0,
        14.5, ["get", "height"]
      ],
      "fill-extrusion-base": [
        "interpolate", ["linear"], ["zoom"],
        14, 0,
        14.5, ["get", "min_height"]
      ],
      "fill-extrusion-opacity": 0.8
    }
  }, firstSymbolId);

  // Auto-hide the generic Mapbox buildings where we have highly detailed custom GLB models
  const gltfBuildings = D.BUILDINGS.filter(b => b.lat && b.lng && BUILDING_REGISTRY[b.id]?.renderMode === "gltf-model");
  const hiddenMvtIds = new Set();
  
  const hideInterval = setInterval(() => {
    let changed = false;
    gltfBuildings.forEach(b => {
      // Create a bounding box (~40m around the center) to ensure we hit the Mapbox footprint
      // even if the exact center coordinate falls in an empty courtyard (like One BKC's L-shape)
      const p1 = map.project([b.lng - 0.0004, b.lat - 0.0004]);
      const p2 = map.project([b.lng + 0.0004, b.lat + 0.0004]);
      
      const bbox = [
        [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
        [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)]
      ];
      
      const feats = map.queryRenderedFeatures(bbox, { layers: ['surrounding-buildings-3d'] });
      if (feats && feats.length > 0) {
        feats.forEach(f => {
          if (f.id && !hiddenMvtIds.has(f.id)) {
            hiddenMvtIds.add(f.id);
            changed = true;
          }
        });
      }
    });
    if (changed && hiddenMvtIds.size > 0) {
      const filterExpr = [
        "all",
        ["==", "extrude", "yes"],
        ["!in", ["id"], ...Array.from(hiddenMvtIds)]
      ];
      map.setFilter("surrounding-buildings-3d", filterExpr);
    }
  }, 1000);
  
  // Stop checking after 10 seconds (tiles should be loaded by then)
  setTimeout(() => clearInterval(hideInterval), 10000);
}

/* ============================================================
   FOOTPRINT MATCHER (PRD §32)
   Searches BKC_GEOJSON for a polygon matching the property.
   Returns: { feature, confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" }
   ============================================================ */
function footprintMatcher(propertyId, lat, lng) {
  const geojson = window.BKC_GEOJSON;
  if (!geojson || !geojson.features) return { feature: null, confidence: "NONE" };

  const reg = BUILDING_REGISTRY[propertyId];
  const nameHint = reg?.footprintName?.toLowerCase() || "";

  // Pass 1: Name match (HIGH confidence)
  if (nameHint) {
    const byName = geojson.features.find(f => {
      const n = (f.properties?.name || "").toLowerCase();
      if (!n || (!n.includes(nameHint) && !nameHint.includes(n))) return false;
      // Validate distance (must be within 150m of our database coordinate)
      if (!f.geometry || f.geometry.type !== "Polygon") return false;
      const centroid = polygonCentroid(f.geometry.coordinates[0]);
      const dist = haversineMeters(lat, lng, centroid[1], centroid[0]);
      return dist < 150;
    });
    if (byName) {
      if (debugMode) console.log(`[Match] ${propertyId} → HIGH (name: "${byName.properties.name}")`);
      return { feature: byName, confidence: "HIGH" };
    }
  }

  // Pass 2: Point-in-polygon (MEDIUM confidence)
  // Also require the polygon centroid to be within 60m of our coordinate (prevents wrong-building match)
  const pip = geojson.features.find(f => {
    if (!f.geometry || f.geometry.type !== "Polygon") return false;
    if (!pointInPolygon([lng, lat], f.geometry.coordinates[0])) return false;
    // Validate centroid is close enough
    const centroid = polygonCentroid(f.geometry.coordinates[0]);
    const dist = haversineMeters(lat, lng, centroid[1], centroid[0]);
    return dist < 60;
  });
  if (pip) {
    if (debugMode) console.log(`[Match] ${propertyId} → MEDIUM (point-in-polygon, name: "${pip.properties?.name}")`);
    return { feature: pip, confidence: "MEDIUM" };
  }

  // Pass 3: Nearest polygon within 40m (LOW confidence)
  let nearest = null, nearestDist = Infinity;
  geojson.features.forEach(f => {
    if (!f.geometry || f.geometry.type !== "Polygon") return;
    const centroid = polygonCentroid(f.geometry.coordinates[0]);
    const dist = haversineMeters(lat, lng, centroid[1], centroid[0]);
    if (dist < nearestDist) { nearestDist = dist; nearest = f; }
  });
  if (nearest && nearestDist < 40) {
    if (debugMode) console.log(`[Match] ${propertyId} → LOW (nearest ${Math.round(nearestDist)}m, name: "${nearest.properties?.name}")`);
    return { feature: nearest, confidence: "LOW" };
  }

  if (debugMode) console.warn(`[Match] ${propertyId} → NO MATCH`);
  return { feature: null, confidence: "NONE" };
}

/* ============================================================
   FOOTPRINT EXTRUSION LAYERS (PRD §10 / §13)
   Only database buildings. Actual footprint preserved. Real height.
   ============================================================ */
function addExtrusionLayers() {
  const dbBuildings = D.BUILDINGS.filter(b => b.isOption && b.lat && b.lng);

  dbBuildings.forEach(b => {
    const reg = BUILDING_REGISTRY[b.id];
    if (b.id === 'onebkc') console.log(`[Atlas] Debug onebkc loop: reg=`, reg);
    if (!reg) return;

    if (reg.renderMode === "custom-model") {
      addCustomThreeLayer(b, reg);
      return;
    }

    if (reg.renderMode === "gltf-model") {
      addGltfModel(b, reg);
      return;
    }

    const match = footprintMatcher(b.id, b.lat, b.lng);
    matchResults[b.id] = match;

    const heightM = reg.heightMeters || b.h || 50;
    const color   = reg.color || "#2fbf71";

    // Try OSM footprint first; fall back to coordinate box if geometry is bad
    if (match.feature && match.confidence !== "NONE") {
      const ok = tryAddOsmExtrusion(b, match.feature, heightM, color);
      if (!ok) {
        console.warn(`[Atlas] ${b.id}: OSM geometry failed, using coordinate box fallback`);
        addFallbackBox(b, reg, heightM, color);
      }
    } else {
      console.warn(`[Atlas] ${b.id} (${b.name}): no footprint match, using coordinate box fallback`);
      addFallbackBox(b, reg, heightM, color);
    }
  });
}

/* ============================================================
   CUSTOM 3D MODEL LAYER (THREE.JS)
   ============================================================ */
function addCustomThreeLayer(b, reg) {
  if (!THREE) {
    setTimeout(() => addCustomThreeLayer(b, reg), 100);
    return;
  }

  const match = footprintMatcher(b.id, b.lat, b.lng);
  matchResults[b.id] = match;
  const heightM = reg.heightMeters || b.h || 50;
  
  let coords = [];
  if (match.feature && match.confidence !== "NONE") {
    coords = match.feature.geometry.coordinates[0];
  } else {
    console.warn(`[Atlas] ${b.id}: No OSM footprint found. Generating rectangular footprint.`);
    const w = b.w || 50;
    const d = b.d || 50;
    const dLat = (d / 2) / 111320;
    const dLng = (w / 2) / (111320 * Math.cos(b.lat * Math.PI / 180));
    
    coords = [
      [b.lng - dLng, b.lat - dLat],
      [b.lng + dLng, b.lat - dLat],
      [b.lng + dLng, b.lat + dLat],
      [b.lng - dLng, b.lat + dLat],
      [b.lng - dLng, b.lat - dLat] // close polygon
    ];
  }
  
  const modelOrigin = [b.lng, b.lat];
  const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(modelOrigin, 0);
  const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
  
  const customLayer = {
    id: `custom-3d-model-${b.id}`,
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambient);
      const directional = new THREE.DirectionalLight(0xffffff, 1.0);
      directional.position.set(50, 100, 50).normalize();
      this.scene.add(directional);

      const shape = new THREE.Shape();
      const R = 6378137;
      coords.forEach((ll, i) => {
        const x = (ll[0] - b.lng) * (Math.PI / 180) * R * Math.cos(b.lat * Math.PI / 180);
        const y = (ll[1] - b.lat) * (Math.PI / 180) * R;
        if(i===0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: heightM, bevelEnabled: false });

      function createBuildingTextures(){
        const cw = 256, ch = 256;
        const c1=document.createElement("canvas"); c1.width=cw; c1.height=ch;
        const c2=document.createElement("canvas"); c2.width=cw; c2.height=ch;
        const c3=document.createElement("canvas"); c3.width=cw; c3.height=ch;
        const ctx1=c1.getContext("2d"), ctx2=c2.getContext("2d"), ctx3=c3.getContext("2d");
        
        // Walls (using registry colors)
        const wallColor = reg.color || b.color || "#5a636c";
        ctx1.fillStyle = wallColor; ctx1.fillRect(0,0,cw,ch);
        ctx2.fillStyle = "#000000"; ctx2.fillRect(0,0,cw,ch); // Emissive map (walls don't glow)
        ctx3.fillStyle = "#e0e0e0"; ctx3.fillRect(0,0,cw,ch); // Roughness map (walls are matte)
        
        // Windows
        const winW = 16, winH = 24, padX = 8, padY = 12;
        for(let y=padY; y<ch; y+=winH+padY) {
          for(let x=padX; x<cw; x+=winW+padX) {
            // Dark glass
            ctx1.fillStyle = "#0a0f14"; ctx1.fillRect(x,y,winW,winH);
            ctx3.fillStyle = "#111111"; ctx3.fillRect(x,y,winW,winH); // Glass is smooth
            
            // Randomly lit windows
            if(Math.random() < 0.25) {
              const lit = Math.random() < 0.5 ? "#fceaba" : "#d8f2f2"; // Warm or cool light
              ctx1.fillStyle = lit; ctx1.fillRect(x,y,winW,winH);
              ctx2.fillStyle = lit; ctx2.fillRect(x,y,winW,winH); // Lit windows glow in emissive map
            }
          }
        }
        
        const tex = {
          map: new THREE.CanvasTexture(c1),
          emissiveMap: new THREE.CanvasTexture(c2),
          roughnessMap: new THREE.CanvasTexture(c3)
        };
        Object.values(tex).forEach(t => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(0.04, 0.02);
        });
        return tex;
      }

      const textures = createBuildingTextures();
      const mat = new THREE.MeshStandardMaterial({
        color: "#ffffff", // Texture dictates color
        map: textures.map,
        emissive: "#ffffff",
        emissiveMap: textures.emissiveMap,
        emissiveIntensity: 0.9,
        roughnessMap: textures.roughnessMap,
        metalness: 0.25,
        transparent: false // Solid walls!
      });

      const mesh = new THREE.Mesh(geometry, mat);
      this.scene.add(mesh);
      
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      try {
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(modelAsMercatorCoordinate.x, modelAsMercatorCoordinate.y, modelAsMercatorCoordinate.z)
          .scale(new THREE.Vector3(scale, -scale, scale));
            
        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        map.triggerRepaint();
      } catch (e) {
        console.error("RenderError_Message: " + (e.message || String(e)));
      }
    }
  };
  
  map.addLayer(customLayer);
  console.log(`[Atlas] Added Custom Three.js Model for ${b.id}`);
}

/* ============================================================
   NATIVE 3D MODEL LAYER (GLTF/GLB) - Mapbox v3 Standard
   ============================================================ */
async function addGltfModel(b, reg) {
  console.log(`[Atlas] addGltfModel CALLED for ${b.id}`);
  if (!reg.modelUrl) {
    console.warn(`[Atlas] ${b.id}: missing modelUrl in registry`);
    return;
  }

  const modelOrigin = [b.lng, b.lat];
  const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(modelOrigin, 0);
  // Base scale before we apply our auto-scale
  const baseScale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
  
  // Extract footprint for developer visualization
  const match = footprintMatcher(b.id, b.lat, b.lng);
  let coords = [];
  if (match.feature && match.confidence !== "NONE") {
    coords = match.feature.geometry.coordinates;
  }

  // Dynamically load Three.js and GLTFLoader since Mapbox native models are too strict/unpredictable
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');

  const customLayer = {
    id: `custom-gltf-${b.id}`,
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      this.scene.add(ambient);
      const directional = new THREE.DirectionalLight(0xffffff, 1.2);
      directional.position.set(50, 100, 50).normalize();
      this.scene.add(directional);

      const loader = new GLTFLoader();
      loader.load(reg.modelUrl, (gltf) => {
        const model = gltf.scene;
        
        // Auto-center and auto-scale!
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        // Center the model's bottom face at Y=0, but use the artist's original X and Z origin!
        // If we force -center.x, it messes up asymmetrical L-shaped buildings.
        model.position.y = -box.min.y; 
        // model.position.x = -center.x; 
        // model.position.z = -center.z;
        
        // Create a wrapper group so we can scale the whole thing easily
        const group = new THREE.Group();
        group.add(model);
        
        // Scale according to transform if provided, otherwise fallback to height target
        let scaleFactor = 1;
        if (reg.transform && reg.transform.uniformScale !== undefined) {
           scaleFactor = reg.transform.uniformScale;
        } else if (reg.heightMeters) {
           scaleFactor = reg.heightMeters / size.y;
        }
        group.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        if (reg.transform) {
           group.rotation.set(0, reg.transform.rotationDegrees * Math.PI / 180, 0);
           group.position.set(reg.transform.offsetX || 0, 0, reg.transform.offsetZ || 0);
        } else if (reg.modelRotation) {
           group.rotation.set(reg.modelRotation[0], reg.modelRotation[1], reg.modelRotation[2]);
        }
        
        this.scene.add(group);
        map.triggerRepaint();
        
        // Expose globally for tweaking via Developer UI
        window.activeGltfGroup = group;
        window.activeGltfReg = reg;
        window.activeGltfId = b.id;
        
        window.tweakModel = (rotDeg, scale, dx, dz) => {
           group.rotation.set(0, rotDeg * Math.PI / 180, 0);
           group.scale.set(scale, scale, scale);
           group.position.set(dx, 0, dz);
           map.triggerRepaint();
        };
        
        console.log(`[Atlas] Loaded Georeferenced GLTF for ${b.id}`);
      });

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
      
      // Developer Mode: Draw GIS Footprint outline
      if (window.location.search.includes('dev=1') && coords.length > 0) {
        if (!map.getSource(`footprint-${b.id}`)) {
          map.addSource(`footprint-${b.id}`, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } }
          });
          map.addLayer({
            id: `footprint-line-${b.id}`,
            type: 'line',
            source: `footprint-${b.id}`,
            paint: { 'line-color': '#00ffcc', 'line-width': 4, 'line-opacity': 0.8 }
          });
        }
      }
    },
    render: function (gl, matrix) {
      try {
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(modelAsMercatorCoordinate.x, modelAsMercatorCoordinate.y, modelAsMercatorCoordinate.z)
          .scale(new THREE.Vector3(baseScale, -baseScale, baseScale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            
        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        map.triggerRepaint();
      } catch (e) {
        console.error("RenderError_Message: " + (e.message || String(e)));
      }
    }
  };
  
  map.addLayer(customLayer);
}

/** Try to add an OSM footprint extrusion. Returns false if Mapbox rejects it. */
function tryAddOsmExtrusion(b, feature, heightM, color) {
  // Basic geometry validation — reject degenerate or tiny polygons
  const ring = feature.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return false;

  // Check bounding box has meaningful area (> ~5m × 5m)
  const lngs = ring.map(c => c[0]);
  const lats = ring.map(c => c[1]);
  const dLng = Math.max(...lngs) - Math.min(...lngs);
  const dLat = Math.max(...lats) - Math.min(...lats);
  if (dLng < 0.00004 || dLat < 0.00004) return false;  // < ~4m

  const sourceId = `db-building-src-${b.id}`;
  const layerId  = `db-building-${b.id}`;

  const featureWithHeight = {
    ...feature,
    properties: {
      ...feature.properties,
      height: heightM,
      base_height: 0,
      propertyId: b.id,
      confidence: matchResults[b.id]?.confidence,
    }
  };

  try {
    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [featureWithHeight] }
    });
  } catch (err) {
    console.error(`[Atlas] ${b.id}: failed to add source:`, err.message);
    return false;
  }

  try {
    map.addLayer({
      id: layerId,
      type: "fill-extrusion",
      source: sourceId,
      paint: {
        "fill-extrusion-color": color,
        "fill-extrusion-height": heightM,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.88,
      }
    });
  } catch (err) {
    console.error(`[Atlas] ${b.id}: failed to add layer:`, err.message);
    // Clean up the source we already added
    try { map.removeSource(sourceId); } catch (_) {}
    return false;
  }

  console.log(`[Atlas] Extruded ${b.id} (${b.name}) at ${heightM}m — ${matchResults[b.id]?.confidence} match`);
  return true;
}

/* Fallback: accurate GeoJSON rectangle using real building dimensions from database */
function addFallbackBox(b, reg, heightM, color) {
  // Convert metres to approximate degrees at BKC latitude (~19°N)
  // 1° lat ≈ 111,320m; 1° lng ≈ 111,320 * cos(19°) ≈ 105,200m
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(b.lat * Math.PI / 180);

  const halfLatDeg = ((b.d || 50) / 2) / mPerDegLat;
  const halfLngDeg = ((b.w || 50) / 2) / mPerDegLng;

  const coords = [
    [b.lng - halfLngDeg, b.lat - halfLatDeg],
    [b.lng + halfLngDeg, b.lat - halfLatDeg],
    [b.lng + halfLngDeg, b.lat + halfLatDeg],
    [b.lng - halfLngDeg, b.lat + halfLatDeg],
    [b.lng - halfLngDeg, b.lat - halfLatDeg],
  ];

  const sourceId = `db-building-src-${b.id}`;
  const layerId  = `db-building-${b.id}`;

  try {
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { height: heightM, base_height: 0, propertyId: b.id, confidence: "FALLBACK" },
          geometry: { type: "Polygon", coordinates: [coords] }
        }]
      }
    });
    map.addLayer({
      id: layerId,
      type: "fill-extrusion",
      source: sourceId,
      paint: {
        "fill-extrusion-color": color,
        "fill-extrusion-height": heightM,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.88,
      }
    });
    console.log(`[Atlas] ${b.id} (${b.name}): FALLBACK box ${b.w || 50}×${b.d || 50}m at ${heightM}m`);
  } catch (err) {
    console.error(`[Atlas] ${b.id}: fallback box failed:`, err.message);
  }
}

/* ============================================================
   METRO LINES (simplified GeoJSON layers — Aqua + Yellow)
   ============================================================ */
function addMetroLines() {
  // Approximate BKC metro route coordinates
  const metroData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { line: "aqua", name: "Aqua Line — Metro Line 3" },
        geometry: {
          type: "LineString",
          coordinates: [
            [72.8260, 18.9750], [72.8340, 18.9990], [72.8445, 19.0180], [72.8570, 19.0380],
            [72.8612, 19.0610], [72.8655, 19.0820], [72.8710, 19.1050],
          ]
        }
      },
      {
        type: "Feature",
        properties: { line: "yellow", name: "Yellow Line — Metro Line 2B" },
        geometry: {
          type: "LineString",
          coordinates: [
            [72.8520, 19.0520], [72.8590, 19.0590], [72.8640, 19.0640], [72.8700, 19.0700], [72.8780, 19.0760],
          ]
        }
      },
    ]
  };

  map.addSource("metro-lines", { type: "geojson", data: metroData });

  // 1. Aqua Line Outer Glow
  map.addLayer({
    id: "metro-aqua-glow",
    type: "line",
    source: "metro-lines",
    filter: ["==", "line", "aqua"],
    paint: {
      "line-color": "#14b8c4",
      "line-width": 8,
      "line-opacity": 0.3,
      "line-blur": 6
    }
  });

  // 2. Aqua Line Core
  map.addLayer({
    id: "metro-aqua",
    type: "line",
    source: "metro-lines",
    filter: ["==", "line", "aqua"],
    paint: {
      "line-color": "#14b8c4",
      "line-width": 3,
      "line-opacity": 0.9
    }
  });

  // 3. Yellow Line (Upcoming - Dashed)
  map.addLayer({
    id: "metro-yellow",
    type: "line",
    source: "metro-lines",
    filter: ["==", "line", "yellow"],
    paint: {
      "line-color": "#f2c200",
      "line-width": 4,
      "line-opacity": 0.5,
      "line-dasharray": [3, 3],
    }
  });

  // Metro Station Markers (HTML/CSS)
  const stations = [
    { id: "bkc-metro", name: "BKC (Aqua)", line: "aqua", coords: [72.8612, 19.0610] },
    { id: "ito-metro", name: "ITO BKC (Upcoming)", line: "yellow", coords: [72.8640, 19.0640] }
  ];

  stations.forEach(s => {
    const el = document.createElement('div');
    el.className = 'metro-marker';
    const color = s.line === "aqua" ? "#14b8c4" : "#f2c200";
    el.innerHTML = `
      <div style="background: rgba(10, 15, 26, 0.9); border: 2px solid ${color}; border-radius: 8px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.6); backdrop-filter: blur(4px);">
        <span style="font-size: 14px;">🚇</span>
        <span style="color: #fff; font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; white-space: nowrap;">${s.name}</span>
      </div>
      <div style="width: 2px; height: 16px; background: ${color}; margin: 0 auto;"></div>
      <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin: 0 auto; box-shadow: 0 0 10px ${color};"></div>
    `;
    
    new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(s.coords)
      .addTo(map);
  });

  // Animated Train Marker (fallback for 3D model)
  const trainEl = document.createElement('div');
  trainEl.innerHTML = `<div style="font-size: 24px; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.5)); transform: scaleX(-1); transition: transform 0.3s;">🚆</div>`;
  const trainMarker = new mapboxgl.Marker({ element: trainEl, anchor: 'center' })
    .setLngLat(metroData.features[0].geometry.coordinates[0])
    .addTo(map);

  let trainProgress = 0;
  let trainDirection = 1;
  const trainCoords = metroData.features[0].geometry.coordinates;

  function animateTrain() {
    // Adjust speed (0.001 is moderate)
    trainProgress += 0.001 * trainDirection;
    
    // Reverse direction at ends
    if (trainProgress >= 1) { 
      trainProgress = 1; 
      trainDirection = -1; 
      trainEl.children[0].style.transform = 'scaleX(1)'; 
    }
    if (trainProgress <= 0) { 
      trainProgress = 0; 
      trainDirection = 1; 
      trainEl.children[0].style.transform = 'scaleX(-1)'; 
    }

    const totalSegments = trainCoords.length - 1;
    const currentSegmentFloat = trainProgress * totalSegments;
    const segmentIndex = Math.min(Math.floor(currentSegmentFloat), totalSegments - 1);
    const segmentProgress = currentSegmentFloat - segmentIndex;

    const p1 = trainCoords[segmentIndex];
    const p2 = trainCoords[segmentIndex + 1];
    
    // Linear interpolation
    const lng = p1[0] + (p2[0] - p1[0]) * segmentProgress;
    const lat = p1[1] + (p2[1] - p1[1]) * segmentProgress;
    
    trainMarker.setLngLat([lng, lat]);
    
    requestAnimationFrame(animateTrain);
  }
  
  // Start animation loop
  animateTrain();
}

/* ============================================================
   DATABASE PROPERTY MARKERS + LABELS (PRD §24)
   ONLY database buildings get custom markers.
   ============================================================ */
function initDbMarkers() {
  const dbBuildings = D.BUILDINGS.filter(b => b.isOption && b.lat && b.lng);

  dbBuildings.forEach(b => {
    // Teal dot marker
    const dot = document.createElement("div");
    dot.className = "db-dot";
    dot.style.cssText = `
      width:12px; height:12px; border-radius:50%;
      background:#2fbf71; border:2px solid #fff;
      box-shadow:0 0 8px rgba(47,191,113,0.7);
      cursor:pointer;
    `;
    dot.addEventListener("click", () => selectBuilding(b.id));

    const marker = new mapboxgl.Marker({ element: dot, anchor: "center" })
      .setLngLat([b.lng, b.lat])
      .addTo(map);
    propertyMarkers[b.id] = marker;

    const reg = BUILDING_REGISTRY[b.id] || {};
    const heightM = reg.heightMeters || b.h || 50;
    
    // Name label tag
    const tag = document.createElement("div");
    tag.className = "mm-opt";
    tag.textContent = b.name;
    tag.style.cssText = `
      background:rgba(47,191,113,0.92); color:#04150c;
      font-family:system-ui,sans-serif; font-size:11px;
      font-weight:700; padding:3px 9px; border-radius:5px;
      white-space:nowrap; pointer-events:none; cursor:default;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      text-shadow:none; margin-bottom:4px;
    `;

    const labelMarker = new mapboxgl.Marker({
      element: tag,
      anchor: "bottom",
      offset: [0, -10]
    })
      .setLngLat([b.lng, b.lat, heightM + 5]) // Pass altitude (Z-coordinate) to elevate it!
      .addTo(map);
      
    labelMarkers[b.id] = labelMarker;
  });
}

/* ============================================================
   INTERACTIONS — click on extrusion layer (PRD §25)
   ============================================================ */
function addInteractions() {
  const dbBuildings = D.BUILDINGS.filter(b => b.isOption);
  const layerIds = dbBuildings.map(b => `db-building-${b.id}`).filter(id => map.getLayer(id));

  // Click on any database building extrusion
  layerIds.forEach(layerId => {
    map.on("click", layerId, e => {
      const props = e.features[0]?.properties;
      if (props?.propertyId) selectBuilding(props.propertyId);
    });

    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
      const propId = layerId.replace("db-building-", "");
      highlightBuilding(propId, true);
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      const propId = layerId.replace("db-building-", "");
      highlightBuilding(propId, false);
    });
  });
}

/* ============================================================
   SELECT BUILDING — the central event (PRD §25–27)
   ============================================================ */
function selectBuilding(id) {
  if (!id) return;
  const b = D.BUILDINGS.find(x => x.id === id);
  if (!b) return;

  selectedId = id;

  // Highlight
  unhighlightAll();
  highlightBuilding(id, true, true);

  // Fly camera to building (PRD §27)
  if (b.lat && b.lng) {
    map.flyTo({
      center: [b.lng, b.lat],
      zoom: 17,
      pitch: 65,
      bearing: map.getBearing() + 10,
      duration: 1800,
      essential: true,
    });
  }

  // Open property card (reuses existing HTML)
  openCard(b);

  // Metro distance line
  showMetroDistance(b);

  // Sync leaderboard
  document.querySelectorAll(".lb-row").forEach(r =>
    r.classList.toggle("active", r.dataset.bldg === id));
}

function highlightBuilding(id, on, selected = false) {
  const layerId = `db-building-${id}`;
  if (!map.getLayer(layerId)) return;

  const reg = BUILDING_REGISTRY[id];
  if (on) {
    map.setPaintProperty(layerId, "fill-extrusion-color", selected ? "#2fbf71" : "#5de39a");
    map.setPaintProperty(layerId, "fill-extrusion-opacity", 1.0);
  } else if (id !== selectedId) {
    map.setPaintProperty(layerId, "fill-extrusion-color", reg?.color || "#2fbf71");
    map.setPaintProperty(layerId, "fill-extrusion-opacity", 0.88);
  }
}

function unhighlightAll() {
  D.BUILDINGS.filter(b => b.isOption && b.id !== selectedId).forEach(b => {
    highlightBuilding(b.id, false);
  });
}

/* ============================================================
   METRO DISTANCE OVERLAY (matching the Three.js version)
   ============================================================ */
const routeCache = {};
let currentRouteId = null;
let metroPopup = null;

async function fetchWalkingRoute(startLng, startLat, endLng, endLat) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.routes && data.routes.length > 0) {
    return data.routes[0];
  }
  return null;
}

function clearMetroRoute() {
  if (metroPopup) { metroPopup.remove(); metroPopup = null; }
  if (map.getLayer("bkc-walking-route-glow")) map.removeLayer("bkc-walking-route-glow");
  if (map.getLayer("bkc-walking-route")) map.removeLayer("bkc-walking-route");
  if (map.getSource("bkc-walking-route-src")) map.removeSource("bkc-walking-route-src");
  currentRouteId = null;
}

async function showMetroDistance(b) {
  clearMetroRoute();
  if (!b.lat || !b.lng) return;
  if (!document.getElementById("t-dist").classList.contains("on")) return; // Only show if toggle is active

  // Currently BKC Aqua Line is the primary active station.
  const stationLng = 72.8612;
  const stationLat = 19.0610;
  const stationName = "BKC (Aqua)";

  const cacheKey = `${b.id}-bkc-metro-walking`;
  let route = routeCache[cacheKey];

  if (!route) {
    // Show a loading popup
    metroPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10], className: "metro-dist-popup" })
      .setLngLat([b.lng, b.lat])
      .setHTML(`<div style="background:rgba(20,26,36,.9);color:#fff;padding:8px;border-radius:6px;font-size:11px;">Calculating walking route...</div>`)
      .addTo(map);

    route = await fetchWalkingRoute(b.lng, b.lat, stationLng, stationLat);
    if (route) routeCache[cacheKey] = route;
  }

  if (metroPopup) metroPopup.remove();

  if (!route) {
    metroPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -10], className: "metro-dist-popup" })
      .setLngLat([b.lng, b.lat])
      .setHTML(`<div style="background:rgba(209,73,91,.9);color:#fff;padding:8px;border-radius:6px;font-size:11px;">Walking route unavailable</div>`)
      .addTo(map);
    return;
  }

  const distKm = (route.distance / 1000).toFixed(2);
  const durationMin = Math.ceil(route.duration / 60);

  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:11px;color:#fff;
                background:rgba(20,26,36,.95);padding:10px 14px;border-radius:10px;
                border:1px solid #14b8c4;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.6)">
      <div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Nearest Metro</div>
      <div style="font-weight:700;font-size:13px;color:#14b8c4;margin-bottom:6px;">${stationName}</div>
      <div style="display:flex;gap:12px;">
        <div><b>${distKm} km</b><br><span style="color:rgba(255,255,255,.5);font-size:10px;">Walking Dist</span></div>
        <div><b>~${durationMin} min</b><br><span style="color:rgba(255,255,255,.5);font-size:10px;">Est. Time</span></div>
      </div>
    </div>`;

  metroPopup = new mapboxgl.Popup({
    closeButton: false, closeOnClick: false,
    offset: [0, -10], className: "metro-dist-popup"
  })
    .setLngLat([b.lng, b.lat])
    .setHTML(html)
    .addTo(map);

  currentRouteId = b.id;

  // Render Route on Map
  map.addSource("bkc-walking-route-src", {
    type: "geojson",
    data: route.geometry
  });

  map.addLayer({
    id: "bkc-walking-route-glow",
    type: "line",
    source: "bkc-walking-route-src",
    paint: {
      "line-color": "#14b8c4",
      "line-width": 10,
      "line-opacity": 0.4,
      "line-blur": 8
    }
  });

  map.addLayer({
    id: "bkc-walking-route",
    type: "line",
    source: "bkc-walking-route-src",
    paint: {
      "line-color": "#14b8c4",
      "line-width": 4,
      "line-opacity": 1,
      "line-dasharray": [0, 2] // To animate later
    }
  });

  // Fit bounds to route
  const coordinates = route.geometry.coordinates;
  const bounds = coordinates.reduce((bnd, coord) => bnd.extend(coord), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
  
  map.fitBounds(bounds, {
    padding: 80,
    pitch: 60,
    duration: 2000
  });
}

/* ============================================================
   PROPERTY CARD (PRD §25 — reuses existing UI from index.html)
   ============================================================ */
const floorLevel = { "Ground": 0, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "14th": 14 };

function openCard(b) {
  const units = D.OPTIONS.filter(o => o.bldg === b.id).sort((x, y) => x.rank - y.rank);
  const best = units[0];
  const card = document.getElementById("card");
  const fitColor = best ? D.FIT_COLORS[best.fit] : "#888";

  card.innerHTML = `
    <button id="cardClose" aria-label="close">✕</button>
    <div class="card-head">
      <div class="card-block">${b.block}${b.grade ? ` &nbsp;·&nbsp; <span class="grade-chip grade-${b.grade[0]}">Grade ${b.grade}</span>` : ""}</div>
      <div class="card-title">${b.name}</div>
      ${best ? `<div class="card-rank">Best unit ranks <b>#${best.rank}</b> of 13 · Feasibility
        <b>${best.score.toFixed(2)}</b>/10 <span class="chip" style="background:${fitColor}">${best.fit}</span></div>` :
        `<div class="card-rank">Context landmark</div>`}
      <div class="card-sub">${b.tenants || ""}</div>
      ${b.gradeNote ? `<div class="card-sub grade-note">🏆 ${b.gradeNote}</div>` : ""}
    </div>

    ${units.length ? `
    <div class="sec"><h4>Available units</h4>
      <div class="units">
        ${units.map(u => `<div class="unit" data-rank="${u.rank}" style="border-left-color:${D.FIT_COLORS[u.fit]}">
          <div class="unit-top"><b>${u.floor} floor</b> · ${u.carpet.toLocaleString()} sqft carpet
            <span class="unit-score">#${u.rank} · ${u.score.toFixed(2)}</span></div>
          <div class="unit-grid">
            <span>Chargeable</span><span>${u.charge.toLocaleString()} sqft</span>
            <span>Efficiency</span><span>${Math.round(u.eff * 100)}%</span>
            <span>Furnishing</span><span>${u.furn}</span>
            <span>Parking</span><span>${u.parking}</span>
            <span>Possession</span><span>${u.poss}</span>
          </div>
          <div class="unit-note">${u.note}</div>
        </div>`).join("")}
      </div>
    </div>` : ""}

    <div class="sec floors-sec"><h4>Floor stack — <span class="muted">green = unit available</span></h4>
      <div class="floorstack" id="floorstack">${floorStackSVG(b, units)}</div>
      <div class="floor-detail" id="floorDetail">Click a highlighted floor to inspect the unit.</div>
    </div>

    <div class="sec"><h4>Connectivity — decision-maker view</h4>
      <div class="conn">
        <div class="conn-row"><span class="ic aqua">M3</span>
          <div><b>${b.aqua} km</b> to BKC Aqua Line (Line&nbsp;3) · ~${Math.max(1, Math.round(b.aqua * 14.4))} min walk
          <div class="muted">Operational since Oct 2024 · ~7 min peak frequency</div></div></div>
        <div class="conn-row"><span class="ic yellow">2B</span>
          <div>Yellow Line 2B (ITO/IL&FS/MTNL BKC) — <b>upcoming 2026–27</b>
          <div class="muted">Under construction at BKC; not live yet</div></div></div>
        <div class="conn-row"><span class="ic rail">R</span>
          <div>Bandra suburban rail <b>${b.bandra ? b.bandra + " km" : "—"}</b> · BEST feeders + BKC AC shuttle</div></div>
        <div class="conn-row"><span class="ic bus">B</span>
          <div>${b.busStops || "—"}<div class="muted">Routes: ${b.busRoutes || "—"}</div></div></div>
      </div>
    </div>

    <div class="sec"><h4>Around this address</h4>
      <div class="poshwrap">${(b.posh || []).map(p => `<span class="posh">★ ${p}</span>`).join("")}</div>
    </div>

    <div class="card-cta">
      <button class="btn-primary" id="pitchBtn">Add to VFS shortlist</button>
      <button class="btn-primary" id="wtBtn" style="margin-top:10px; background:#f0a020; color:#121214; border:none;">Virtual Walkthrough</button>
    </div>`;

  card.classList.add("open");

  document.getElementById("cardClose").onclick = () => closeCard();
  document.getElementById("pitchBtn")?.addEventListener("click", () => {
    document.getElementById("pitchBtn").textContent = "✓ Added to shortlist";
  });
  document.getElementById("wtBtn")?.addEventListener("click", () => {
    openWalkthrough(b);
  });

  card.querySelectorAll(".fl-rect[data-avail='1']").forEach(r => {
    r.addEventListener("click", () => {
      card.querySelectorAll(".fl-rect").forEach(x => x.classList.remove("sel"));
      r.classList.add("sel");
      const u = units.find(u => String(floorLevel[u.floor]) === r.dataset.level);
      const fd = document.getElementById("floorDetail");
      fd.innerHTML = u
        ? `<b>${u.floor} floor</b> — ${u.carpet.toLocaleString()} sqft carpet /
           ${u.charge.toLocaleString()} chargeable · <span style="color:${D.FIT_COLORS[u.fit]}">${u.fit}</span>`
        : "No listed unit on this floor.";
    });
  });
}

function floorStackSVG(b, units) {
  const total = Math.min(b.floors || 14, 22);
  const avail = new Set(units.map(u => floorLevel[u.floor]));
  const H = Math.max(150, total * 11), fh = H / total, W = 190;
  let s = `<svg viewBox="0 0 ${W} ${H + 14}" width="100%" style="max-height:230px">`;
  for (let lvl = 0; lvl < total; lvl++) {
    const y = H - (lvl + 1) * fh;
    const isA = avail.has(lvl);
    s += `<rect class="fl-rect${isA ? " av" : ""}" data-avail="${isA ? 1 : 0}" data-level="${lvl}"
        x="10" y="${y}" width="${W - 20}" height="${fh - 2}" rx="2" fill="${isA ? "#2fbf71" : "#39424e"}"
        stroke="#0c1016" stroke-width="1"/>`;
    if (isA || lvl === 0 || lvl === total - 1)
      s += `<text x="${W - 16}" y="${y + fh - 4}" text-anchor="end" font-size="8" fill="#cdd5df">${lvl === 0 ? "G" : lvl}</text>`;
  }
  s += `</svg>`;
  return s;
}

function closeCard() {
  document.getElementById("card").classList.remove("open");
  if (selectedId) {
    const reg = BUILDING_REGISTRY[selectedId];
    const layerId = `db-building-${selectedId}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "fill-extrusion-color", reg?.color || "#2fbf71");
      map.setPaintProperty(layerId, "fill-extrusion-opacity", 0.88);
    }
  }
  selectedId = null;
  clearMetroRoute();
  document.querySelectorAll(".lb-row").forEach(r => r.classList.remove("active"));
}

/* ============================================================
   LEADERBOARD (same data/HTML as app.js)
   ============================================================ */
function buildLeaderboard() {
  const lb = document.getElementById("lb-list");
  lb.innerHTML = D.OPTIONS.map(o => {
    const c = D.FIT_COLORS[o.fit];
    const bldg = D.BUILDINGS.find(x => x.id === o.bldg);
    const grade = bldg && bldg.grade ? `Grade ${bldg.grade} · ` : "";
    return `<div class="lb-row" data-bldg="${o.bldg}">
      <div class="lb-rank">${o.rank}</div>
      <div class="lb-main">
        <div class="lb-name">${o.unit}</div>
        <div class="lb-meta"><span class="dot" style="background:${c}"></span>${grade}${o.fit} · ${o.floor} · ${o.carpet.toLocaleString()} sqft · ${o.aqua} km</div>
        <div class="lb-bar"><span style="width:${o.score * 10}%;background:${c}"></span></div>
      </div>
      <div class="lb-score">${o.score.toFixed(1)}</div>
    </div>`;
  }).join("");

  lb.querySelectorAll(".lb-row").forEach(r => {
    r.addEventListener("click", () => selectBuilding(r.dataset.bldg));
  });
}

/* ============================================================
   UI TOGGLES (Night, Labels, Cinematic, Reset, Winner)
   ============================================================ */
function wireUI() {
  const set = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };

  const themes = ['dawn', 'day', 'dusk', 'night'];
  const themeEmojis = ['🌅', '🌤', '🌇', '☾'];
  const themeNames = ['Dawn', 'Day', 'Dusk', 'Night'];
  let currentThemeIndex = 2; // Starts at dusk

  set("t-theme", e => {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const theme = themes[currentThemeIndex];
    e.currentTarget.innerHTML = `${themeEmojis[currentThemeIndex]} Theme: ${themeNames[currentThemeIndex]}`;
    
    // Dynamically update the Mapbox Standard lighting preset
    map.setConfigProperty('basemap', 'lightPreset', theme);
  });

  set("t-labels", e => {
    showLabels = !showLabels;
    e.currentTarget.classList.toggle("on", showLabels);
    Object.values(labelMarkers).forEach(m => {
      m.getElement().style.display = showLabels ? "" : "none";
    });
    // Also toggle Mapbox label layers visibility
    ["metro-station-labels"].forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showLabels ? "visible" : "none");
      }
    });
  });

  set("t-cine", e => {
    const on = e.currentTarget.classList.toggle("on");
    if (on) {
      // Slow auto-orbit using Mapbox's camera
      let bearing = map.getBearing();
      const cinemaLoop = setInterval(() => {
        if (!document.getElementById("t-cine").classList.contains("on")) {
          clearInterval(cinemaLoop);
          return;
        }
        bearing += 0.15;
        map.setBearing(bearing);
      }, 50);
    }
  });

  set("t-dist", e => {
    const on = e.currentTarget.classList.toggle("on");
    if (!on) { clearMetroRoute(); }
    else if (on && selectedId) {
      showMetroDistance(D.BUILDINGS.find(b => b.id === selectedId));
    }
  });

  set("t-reset", () => {
    closeCard();
    map.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, pitch: MAP_PITCH, bearing: MAP_BEARING, duration: 1500 });
  });

  set("winnerBtn", () => selectBuilding(D.META.winner));

  // Leaderboard collapse
  const lb = document.getElementById("lb");
  const lbTab = document.getElementById("lb-tab");
  document.getElementById("lb-collapse")?.addEventListener("click", () => {
    lb.classList.add("collapsed"); lbTab.classList.add("show");
  });
  lbTab?.addEventListener("click", () => {
    lb.classList.remove("collapsed"); lbTab.classList.remove("show");
  });

  // Default on state
  document.getElementById("t-labels")?.classList.add("on");
  document.getElementById("t-dist")?.classList.add("on");
}

/* ============================================================
   DEBUG OVERLAY (PRD §34) — activated by ?debug=1 in URL
   ============================================================ */
function renderDebugOverlay() {
  const dbBuildings = D.BUILDINGS.filter(b => b.isOption && b.lat && b.lng);

  dbBuildings.forEach(b => {
    const result = matchResults[b.id] || { confidence: "UNKNOWN" };
    const confidenceColor = {
      HIGH: "#2fbf71", MEDIUM: "#f0a020", LOW: "#d1495b",
      NONE: "#ff0000", FALLBACK: "#aa00ff", UNKNOWN: "#888"
    }[result.confidence] || "#888";

    // Footprint outline
    if (result.feature) {
      const outlineId = `debug-outline-${b.id}`;
      map.addSource(outlineId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [result.feature] }
      });
      map.addLayer({
        id: outlineId,
        type: "line",
        source: outlineId,
        paint: { "line-color": confidenceColor, "line-width": 2.5, "line-opacity": 0.9 }
      });
    }
  });

  console.table(
    Object.entries(matchResults).map(([id, r]) => ({
      id,
      name: D.BUILDINGS.find(b => b.id === id)?.name,
      confidence: r.confidence,
      osm_name: r.feature?.properties?.name || "—",
      height: BUILDING_REGISTRY[id]?.heightMeters + "m"
    }))
  );
}

/* ============================================================
   GEOMETRY UTILITIES
   ============================================================ */

/** Ray-casting point-in-polygon for GeoJSON [lng, lat] coordinates */
function pointInPolygon(point, ring) {
  let inside = false;
  const [px, py] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Centroid of a GeoJSON ring → [lng, lat] */
function polygonCentroid(ring) {
  let x = 0, y = 0;
  ring.forEach(([lng, lat]) => { x += lng; y += lat; });
  return [x / ring.length, y / ring.length];
}

/** Haversine distance in metres between two lat/lng pairs */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============================================================
   WALKTHROUGH GALLERY (WebGL 2.5D Transition)
   ============================================================ */
const WT_IMAGES = Array.from({length: 19}, (_, i) => `walkthrough/IMG_${7945 + i}.jpeg`);

let wtTextures = [];
let wtCurrentIndex = 0;
let wtIsAnimating = false;
let wtMaterial = null;
let wtScene, wtCamera, wtRenderer;
let wtMouse = { x: 0, y: 0 }, wtTargetMouse = { x: 0, y: 0 };
let THREE = null;

// Dynamic import Three.js
import('three').then(m => THREE = m);

function openWalkthrough(b) {
  document.getElementById("wt-overlay").classList.add("show");
  
  // Show loader immediately
  const loader = document.getElementById("wt-loader");
  if(loader) {
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'all';
  }

  if (b && b.lat && b.lng && map) {
    map.flyTo({
      center: [b.lng, b.lat],
      zoom: 21.5,
      pitch: 85,
      bearing: 30,
      duration: 3500,
      essential: true
    });
    map.once('moveend', () => startWalkthroughLoading());
  } else {
    startWalkthroughLoading();
  }
}

function startWalkthroughLoading() {
  if (!THREE) {
    setTimeout(startWalkthroughLoading, 100);
    return;
  }
  
  if (wtTextures.length === WT_IMAGES.length) {
    finishWalkthroughLoading();
    return;
  }

  const loader = new THREE.TextureLoader();
  let loadedCount = 0;
  
  WT_IMAGES.forEach((src, i) => {
    loader.load(src, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      wtTextures[i] = tex;
      loadedCount++;
      const progEl = document.getElementById("wt-loader-progress");
      if(progEl) progEl.innerText = `${loadedCount} / ${WT_IMAGES.length}`;
      
      if (loadedCount === WT_IMAGES.length) {
        initWalkthroughWebGL();
        finishWalkthroughLoading();
      }
    });
  });
}

function initWalkthroughWebGL() {
  if (wtRenderer) return;

  const container = document.getElementById("wt-canvas-container");
  wtScene = new THREE.Scene();
  wtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  wtRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  wtRenderer.setSize(window.innerWidth, window.innerHeight);
  wtRenderer.setPixelRatio(window.devicePixelRatio);
  if(container) container.appendChild(wtRenderer.domElement);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    uniform sampler2D tex1;
    uniform sampler2D tex2;
    uniform float progress;
    uniform vec2 mouse;
    uniform float direction;
    uniform float aspectRatio;
    uniform float imageAspectRatio;

    varying vec2 vUv;

    void main() {
      vec2 parallaxUv = vUv + mouse * 0.05;
      vec2 ratio = vec2(max(aspectRatio / imageAspectRatio, 1.0), max(imageAspectRatio / aspectRatio, 1.0));
      vec2 uvCover = (parallaxUv - 0.5) * ratio + 0.5;

      vec2 uv1 = uvCover;
      vec2 uv2 = uvCover;

      if (direction > 0.0) {
        uv1 = (uvCover - 0.5) * (1.0 - progress * 0.5) + 0.5;
        uv2 = (uvCover - 0.5) * (1.5 - progress * 0.5) + 0.5;
      } else {
        uv1 = (uvCover - 0.5) * (1.0 + progress * 0.5) + 0.5;
        uv2 = (uvCover - 0.5) * (0.5 + progress * 0.5) + 0.5;
      }

      vec4 t1 = texture2D(tex1, clamp(uv1, 0.0, 1.0));
      vec4 t2 = texture2D(tex2, clamp(uv2, 0.0, 1.0));
      float mixProg = smoothstep(0.0, 1.0, progress);
      gl_FragColor = mix(t1, t2, mixProg);
    }
  `;

  wtMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tex1: { value: wtTextures[0] },
      tex2: { value: wtTextures[1] },
      progress: { value: 0.0 },
      mouse: { value: new THREE.Vector2(0, 0) },
      direction: { value: 1.0 },
      aspectRatio: { value: window.innerWidth / window.innerHeight },
      imageAspectRatio: { value: wtTextures[0].image.width / wtTextures[0].image.height }
    }
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wtMaterial);
  wtScene.add(mesh);
  
  window.addEventListener('resize', () => {
    if(wtRenderer) {
      wtRenderer.setSize(window.innerWidth, window.innerHeight);
      if(wtMaterial) wtMaterial.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight;
    }
  });

  animateWt();
}

function animateWt() {
  if (document.getElementById("wt-overlay")?.classList.contains("show")) {
    wtMouse.x += (wtTargetMouse.x - wtMouse.x) * 0.1;
    wtMouse.y += (wtTargetMouse.y - wtMouse.y) * 0.1;
    if (wtMaterial) wtMaterial.uniforms.mouse.value.set(wtMouse.x, wtMouse.y);
    if (wtRenderer && wtScene && wtCamera) wtRenderer.render(wtScene, wtCamera);
  }
  requestAnimationFrame(animateWt);
}

window.addEventListener('mousemove', (e) => {
  if (!document.getElementById("wt-overlay")?.classList.contains("show")) return;
  wtTargetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  wtTargetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

function finishWalkthroughLoading() {
  const loader = document.getElementById("wt-loader");
  if(loader) {
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
  }
  wtCurrentIndex = 0;
  if(wtMaterial) {
    wtMaterial.uniforms.tex1.value = wtTextures[0];
    wtMaterial.uniforms.tex2.value = wtTextures[0];
    wtMaterial.uniforms.progress.value = 0.0;
  }
  updateWtUI();
}

function goToWtIndex(newIndex) {
  if (!wtMaterial || wtIsAnimating || newIndex < 0 || newIndex >= WT_IMAGES.length || newIndex === wtCurrentIndex) return;
  
  wtIsAnimating = true;
  const oldIndex = wtCurrentIndex;
  wtCurrentIndex = newIndex;
  updateWtUI();
  
  const direction = newIndex > oldIndex ? 1.0 : -1.0;
  
  wtMaterial.uniforms.tex1.value = wtTextures[oldIndex];
  wtMaterial.uniforms.tex2.value = wtTextures[wtCurrentIndex];
  wtMaterial.uniforms.progress.value = 0.0;
  wtMaterial.uniforms.direction.value = direction;
  wtMaterial.uniforms.imageAspectRatio.value = wtTextures[wtCurrentIndex].image.width / wtTextures[wtCurrentIndex].image.height;

  gsap.to(wtMaterial.uniforms.progress, {
    value: 1.0,
    duration: 1.2,
    ease: "power2.inOut",
    onComplete: () => {
      wtMaterial.uniforms.tex1.value = wtTextures[wtCurrentIndex];
      wtMaterial.uniforms.progress.value = 0.0;
      wtIsAnimating = false;
    }
  });
}

function updateWtUI() {
  const fwd = document.getElementById('forward-arrow');
  const bwd = document.getElementById('backward-arrow');
  const txt = document.getElementById('wt-progress-text');
  if(!fwd || !bwd || !txt) return;
  
  if (wtCurrentIndex === 0) bwd.classList.add('disabled');
  else bwd.classList.remove('disabled');

  if (wtCurrentIndex === WT_IMAGES.length - 1) fwd.classList.add('disabled');
  else fwd.classList.remove('disabled');

  txt.innerText = `${wtCurrentIndex + 1} / ${WT_IMAGES.length}`;
}

  document.getElementById("wtClose")?.addEventListener("click", () => {
    document.getElementById("wt-overlay").classList.remove("show");
  });
  
  document.getElementById("forward-arrow")?.addEventListener("click", () => goToWtIndex(wtCurrentIndex + 1));
  document.getElementById("backward-arrow")?.addEventListener("click", () => goToWtIndex(wtCurrentIndex - 1));

  let wheelTimeout;
  window.addEventListener('wheel', (e) => {
    if (!document.getElementById("wt-overlay")?.classList.contains("show")) return;
    if (wtIsAnimating) return;
    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      if (e.deltaY > 0) goToWtIndex(wtCurrentIndex + 1);
      else goToWtIndex(wtCurrentIndex - 1);
    }, 50);
  });

  window.addEventListener('keydown', (e) => {
    if (!document.getElementById("wt-overlay")?.classList.contains("show")) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') goToWtIndex(wtCurrentIndex + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 's') goToWtIndex(wtCurrentIndex - 1);
  });

function initDeveloperMode() {
  if (!window.location.search.includes('dev=1')) return;
  
  const bId = D.BUILDINGS.find(b => b.isOption && BUILDING_REGISTRY[b.id]?.renderMode === "gltf-model")?.id || "onebkc";
  const reg = BUILDING_REGISTRY[bId] || {};
  const t = reg.transform || { rotationDegrees: 180, uniformScale: 1.0, offsetX: 0, offsetZ: 0 };

  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(0,0,0,0.8);padding:15px;border:1px solid #444;border-radius:8px;color:#fff;z-index:9999;font-family:monospace;width:300px;';
  ui.innerHTML = `
    <h3 style="margin:0 0 10px 0;color:#ff00ff">3D Georeference Tool</h3>
    <div style="margin-bottom:8px;">
      <label>Rotate (deg): <span id="dev-rot-val">${t.rotationDegrees}</span></label><br/>
      <input type="range" id="dev-rot" min="0" max="360" value="${t.rotationDegrees}" style="width:100%">
    </div>
    <div style="margin-bottom:8px;">
      <label>Uniform Scale: <span id="dev-scale-val">${t.uniformScale}</span></label><br/>
      <input type="range" id="dev-scale" min="0.001" max="10.0" step="0.01" value="${t.uniformScale}" style="width:100%">
      <input type="number" id="dev-scale-num" value="${t.uniformScale}" step="0.001" style="width:100%; margin-top:5px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; padding:4px;">
    </div>
    <div style="margin-bottom:8px;">
      <label>Offset X (m): <span id="dev-x-val">${t.offsetX}</span></label><br/>
      <input type="range" id="dev-x" min="-100" max="100" value="${t.offsetX}" style="width:100%">
    </div>
    <div style="margin-bottom:15px;">
      <label>Offset Z (m): <span id="dev-z-val">${t.offsetZ}</span></label><br/>
      <input type="range" id="dev-z" min="-100" max="100" value="${t.offsetZ}" style="width:100%">
    </div>
    <button id="dev-copy" style="width:100%;padding:8px;background:#347055;color:#fff;border:none;cursor:pointer;">Copy Transform JSON</button>
  `;
  document.body.appendChild(ui);
  
  const rot = document.getElementById('dev-rot');
  const scale = document.getElementById('dev-scale');
  const scaleNum = document.getElementById('dev-scale-num');
  const x = document.getElementById('dev-x');
  const z = document.getElementById('dev-z');
  
  function update() {
    document.getElementById('dev-rot-val').innerText = rot.value;
    
    // Read directly from the number input so it can exceed the slider's max
    const currentScale = parseFloat(scaleNum.value) || 1.0;
    document.getElementById('dev-scale-val').innerText = currentScale;
    
    document.getElementById('dev-x-val').innerText = x.value;
    document.getElementById('dev-z-val').innerText = z.value;
    
    if (window.tweakModel) {
      window.tweakModel(parseFloat(rot.value), currentScale, parseFloat(x.value), parseFloat(z.value));
    }
  }
  
  rot.addEventListener('input', update);
  scale.addEventListener('input', () => { scaleNum.value = scale.value; update(); });
  scaleNum.addEventListener('input', update);
  x.addEventListener('input', update);
  z.addEventListener('input', update);
  
  document.getElementById('dev-copy').addEventListener('click', () => {
    const json = JSON.stringify({
      rotationDegrees: parseFloat(rot.value),
      uniformScale: parseFloat(scale.value),
      offsetX: parseFloat(x.value),
      offsetZ: parseFloat(z.value)
    }, null, 2);
    navigator.clipboard.writeText(json);
    alert('Transform Copied:\\n' + json);
  });
}
initDeveloperMode();

