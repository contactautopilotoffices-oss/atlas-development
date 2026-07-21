/* ============================================================================
   BKC PROPERTY MAP — MAPBOX APP LAYER  (Phase 1: Markers + Footprint Extrusion)
   PRD: Only database buildings receive enhanced 3D treatment.
   Mapbox renders the full BKC geography for all surrounding context.
   ============================================================================ */

const D = window.BKC;
// MAPBOX_TOKEN is exposed on window.MAPBOX_TOKEN by config.js.
// config.js is gitignored locally; on Vercel it is generated at build time from
// the MAPBOX_TOKEN environment variable via scripts/build-config.js.
const MAPBOX_TOKEN = window.MAPBOX_TOKEN || "REPLACE_WITH_YOUR_MAPBOX_TOKEN";

/* ---- Tunable map defaults (client config may override) ---- */
const _CM = (window.CLIENT && window.CLIENT.map) || {};
const MAP_CENTER  = _CM.center  || [72.8636, 19.0632];   // BKC G-Block core
const MAP_ZOOM    = _CM.zoom    != null ? _CM.zoom    : 15.4;
const MAP_PITCH   = _CM.pitch   != null ? _CM.pitch   : 62;
const MAP_BEARING = _CM.bearing != null ? _CM.bearing : -22;

/* ---- Theme system (foundation → paint) ----
   The basemap (Mapbox Standard) owns water/roads/parks AND the context city
   via its own `3d-building` layer. We only restyle OUR layers per preset. */
const THEMES       = ['dawn', 'day', 'dusk', 'night', 'live'];
const THEME_EMOJI  = ['🌅', '🌤', '🌇', '☾', '🛰'];
const THEME_NAMES  = ['Dawn', 'Day', 'Dusk', 'Night', 'Live sky'];
let currentTheme   = 'dawn'; // resolved basemap preset (always one of the 4 — palettes key off this)
let themeMode      = 'dawn'; // UI choice — may be 'live' (real sun + real weather)

/* Option-building palette per theme family.
   Grammar: green is RESERVED for the winner + current selection. Everything
   else is a quiet neutral that still lifts off the context city. */
const GREEN = "#2fbf71", HOVER_GREEN = "#8ff0b6";
const DB_PALETTE = {
  light: { fill: "#e9e5da", stroke: "#ffffff" },  // dawn/day
  dark:  { fill: "#4d5f7e", stroke: "#e8eefc" },  // dusk/night
};
const themeFamily = t => (t === 'dawn' || t === 'day') ? 'light' : 'dark';

/* Tier-colour mode (client opt-in via CLIENT.tierColors): buildings wear their
   verdict — green/amber/red from FIT_COLORS — instead of the quiet neutral.
   Selection brightens the tier colour rather than forcing green (a red-tier
   building must stay red when selected). */
function lightenHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const L = c => Math.round(c + (255 - c) * f);
  return `#${((L(r) << 16) | (L(g) << 8) | L(b)).toString(16).padStart(6, "0")}`;
}
const tierColorOf = id => {
  if (!(window.CLIENT && window.CLIENT.tierColors)) return null;
  const o = D.OPTIONS.find(o => o.bldg === id);
  return o ? (D.FIT_COLORS[o.fit] || null) : null;
};
const optionFill = id => {
  const tier = tierColorOf(id);
  if (tier) return (id === selectedId) ? lightenHex(tier, 0.25) : tier;
  return (id === selectedId || id === D.META.winner) ? GREEN : DB_PALETTE[themeFamily(currentTheme)].fill;
};
const optionStroke = id => {
  const tier = tierColorOf(id);
  if (tier) return (id === selectedId) ? "#ffffff" : lightenHex(tier, 0.35);
  return (id === selectedId || id === D.META.winner) ? GREEN : DB_PALETTE[themeFamily(currentTheme)].stroke;
};

/* ============================================================
   MOVE 1 — ONE REAL SUN
   The old LIGHT_RIG was four hand-tuned fake suns. This computes the TRUE
   astronomical sun position (NOAA approximation, ±1°) for the site's real
   lat/lng at a real wall-clock time, and derives a three-tier rig from it:
     primary   — directional sun (colour ramps with elevation: golden → white)
     secondary — sky dome fill (hemisphere top colour)
     tertiary  — ground bounce (hemisphere bottom colour)
   Every theme is now just a TIME. 'live' uses the actual current time, so the
   twin's sky matches the sky outside the client's window.
   ============================================================ */
const SITE = { lat: MAP_CENTER[1], lng: MAP_CENTER[0] };
const THEME_HOURS = { dawn: 6.7, day: 12.5, dusk: 18.3, night: 22.5 }; // IST wall-clock

function sunDateFor(mode) {
  if (mode === 'live') return new Date();
  const h = THEME_HOURS[mode] != null ? THEME_HOURS[mode] : 12.5;
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0));
  d.setUTCMinutes(Math.round(h * 60) - 330); // IST = UTC+5:30
  return d;
}

/** True sun azimuth (rad, from north, CW) + elevation (rad) — NOAA low-precision model. */
function sunPositionAt(date) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;             // days since J2000
  const L = rad * (280.460 + 0.9856474 * d);                 // mean longitude
  const g = rad * (357.528 + 0.9856003 * d);                 // mean anomaly
  const ec = L + rad * (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)); // ecliptic lon
  const ob = rad * 23.439;
  const ra = Math.atan2(Math.cos(ob) * Math.sin(ec), Math.cos(ec));
  const dec = Math.asin(Math.sin(ob) * Math.sin(ec));
  const gmst = rad * ((280.46061837 + 360.98564736629 * d) % 360);
  const H = gmst + rad * SITE.lng - ra;                      // hour angle
  const la = rad * SITE.lat;
  const elevation = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(la) - Math.tan(dec) * Math.cos(la));
  return { elevation, azimuth: azS + Math.PI }; // from north, clockwise
}

function lerpHex(a, b, t) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  const L = (x, y) => Math.round(x + (y - x) * t);
  return (L(ar, br) << 16) | (L(ag, bg) << 8) | L(ab, bb);
}

/** Full light rig for a theme mode, weather-aware (cloud cover dims the sun). */
function getRig(mode) {
  const date = sunDateFor(mode || themeMode);
  const sun = sunPositionAt(date);
  const eDeg = sun.elevation * 180 / Math.PI;
  const cloud = Math.min(1, (WX.cloud || 0) / 100);

  let sunColor, sunI, skyColor, groundColor, hemiI, exposure;
  if (eDeg <= -4) {            // night — moonlight-ish
    sunColor = 0x93a7d8; sunI = 0.25; skyColor = 0x22304e; groundColor = 0x0c1018; hemiI = 0.55; exposure = 0.9;
  } else if (eDeg <= 14) {     // golden hour ramp
    const t = (eDeg + 4) / 18;
    sunColor = lerpHex(0xff7f3f, 0xffe4bb, t);
    sunI = 0.65 + 0.5 * t;
    skyColor = lerpHex(0x51628a, 0xa9c2de, t);
    groundColor = lerpHex(0x1a1712, 0x4c4a42, t);
    hemiI = 0.5 + 0.14 * t; exposure = 0.95;
  } else {                     // full day
    const t = Math.min(1, (eDeg - 14) / 40);
    sunColor = lerpHex(0xfff2dd, 0xffffff, t);
    sunI = 1.1 + 0.15 * t;
    skyColor = 0xbfd4ea; groundColor = 0x6b6f66; hemiI = 0.65; exposure = 1.0;
  }
  sunI *= (1 - 0.6 * cloud);           // overcast kills the primary
  hemiI *= (1 + 0.25 * cloud);         // ...and boosts the diffuse sky
  exposure *= (1 - 0.08 * cloud);

  // Direction vector (three.js, y-up): x=east, z=south
  const ce = Math.cos(sun.elevation);
  const sunVec = [
    Math.sin(sun.azimuth) * ce,
    Math.max(Math.sin(sun.elevation), 0.16), // never light from below the horizon
    -Math.cos(sun.azimuth) * ce,
  ];

  // Nearest basemap preset — dawn vs dusk disambiguated by IST hour
  const istHour = (date.getUTCHours() + 5.5) % 24;
  const preset = eDeg < -6 ? 'night' : eDeg < 9 ? (istHour < 12 ? 'dawn' : 'dusk') : 'day';
  return { sunVec, sunColor, sunI, skyColor, groundColor, hemiI, exposure, preset, eDeg };
}
let gltfRig = null; // { hemi, directional, renderer } — set when the GLB layer is added

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
/* Client config may supply its own registry (per-client buildings) */
if (window.CLIENT && window.CLIENT.registry) {
  for (const k of Object.keys(BUILDING_REGISTRY)) delete BUILDING_REGISTRY[k];
  Object.assign(BUILDING_REGISTRY, window.CLIENT.registry);
}

/* ---- State ---- */
let map = null;
let selectedId = null;
const shortlisted = new Set();   // building ids the user has starred — client-agnostic, drives the leaderboard star
let night = false;
let showLabels = false; // calm first frame — labels are a choice, not the default
let propertyMarkers = {};     // id → mapboxgl.Marker (dot)
let labelMarkers   = {};      // id → mapboxgl.Marker (name tag)
let debugMode = new URLSearchParams(window.location.search).has("debug");
/* Digital city kit — unified world layer for option buildings. ?citykit=off reverts. */
const CITYKIT = window.AtlasWorld && new URLSearchParams(window.location.search).get("citykit") !== "off";
const worldQueue = [];   // {ring, heightM, id} option buildings for the world layer

/* ---- Footprint match results (logged in debug mode) ---- */
const matchResults = {};
window.__matchResults = matchResults;  // expose for console debugging

/* ============================================================
   ENTRY POINT — called from index.html after gate passes
   ============================================================ */
window.__initMapboxApp = function() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  window.__map = null; // set after construction — console/dev access

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    pitch: MAP_PITCH,
    bearing: MAP_BEARING,
    antialias: true,
  });

  /* Trackpad-first navigation:
     - pinch / ctrl+two-finger = zoom
     - two-finger drag = pan
     - horizontal two-finger swipe = orbit/rotate bearing
     - physical mouse wheel = zoom
     - right-drag = rotate (Mapbox default)
     Wheel deltas are batched to one Mapbox update per frame to stay smooth. */
  map.scrollZoom.disable();
  let wheelFrame = null, wheelAcc = { dx: 0, dy: 0, pinch: false };
  map.getCanvas().addEventListener("wheel", (e) => {
    e.preventDefault();
    const dMode = e.deltaMode === 1 ? 16 : 1;
    wheelAcc.dx += e.deltaX * dMode;
    wheelAcc.dy += e.deltaY * dMode;
    wheelAcc.pinch = wheelAcc.pinch || e.ctrlKey || e.metaKey;
    if (wheelFrame) return;
    wheelFrame = requestAnimationFrame(() => {
      const dx = wheelAcc.dx, dy = wheelAcc.dy, pinch = wheelAcc.pinch;
      wheelAcc = { dx: 0, dy: 0, pinch: false };
      wheelFrame = null;

      // Pinch / ctrl+scroll = zoom
      if (pinch) {
        map.setZoom(map.getZoom() - dy * 0.02);
        return;
      }

      // Physical mouse wheel (vertical, integer deltas) = zoom
      if (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy)) {
        map.setZoom(map.getZoom() - dy * 0.003);
        return;
      }

      // Dominant horizontal two-finger swipe = orbit/rotate bearing
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        const b = selectedId ? D.BUILDINGS.find(x => x.id === selectedId) : null;
        const newBearing = map.getBearing() + dx * 0.12;
        if (b && b.lng != null && b.lat != null) {
          map.easeTo({ bearing: newBearing, around: [b.lng, b.lat], duration: 0 });
        } else {
          map.setBearing(newBearing);
        }
        return;
      }

      // Default: pan
      map.panBy([-dx, -dy], { duration: 0 });
    });
  }, { passive: false });

  map.on('style.load', () => {
    // Mapbox Standard owns the foundation: terrain, water, roads, POIs.
    // Its own 3D objects stay OFF — the context city is ours (see
    // integrateBasemap): Standard's import layers can't be filtered per-feature.
    map.setConfigProperty('basemap', 'lightPreset', currentTheme);
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
    map.setConfigProperty('basemap', 'showTransitLabels', true);
    map.setConfigProperty('basemap', 'show3dObjects', false);
  });

  // Add navigation control (zoom/rotate)
  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

  map.on("load", () => {
    window.__map = map;
    // Foundation: let Standard render the city; hide its footprints under ours
    integrateBasemap();

    // Metro lines (GeoJSON layers)
    addMetroLines();

    // Database property footprint extrusions
    addExtrusionLayers();

    // Unified world layer (city kit) — detailed Class-A option buildings
    initWorld();

    // Interactions (click on extrusions)
    addInteractions();

    // Property markers (teal dots) + name labels
    initDbMarkers();

    // Wire UI toggles
    wireUI();

    // Build leaderboard
    buildLeaderboard();

    // Moves 2–5: chrome, live weather, brief filters, traffic, construction
    injectMoveCSS();
    initWeather();
    if (hasScoringWeights()) buildFilterPanel();
    initTraffic();
    constructWorld();

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
   CLASS C — procedural background city (opt-in)
   Replaces flat Mapbox extrusions in view with varied procedural boxes
   (windows + roof units), then hides the originals. Bounded + logged.
   ============================================================ */
function initClassC() {
  const CAP = 500;                       // bound coverage; log what we drop
  const hidden = new Set();
  let built = 0;

  function harvest() {
    if (!map.getLayer("context-buildings")) return;
    const feats = map.queryRenderedFeatures({ layers: ["context-buildings"] });
    let added = 0;
    for (const f of feats) {
      if (built >= CAP) break;
      if (f.id == null || hidden.has(f.id)) continue;
      const ring = f.geometry?.coordinates?.[0];
      const h = f.properties?.height;
      if (!ring || ring.length < 4 || !(h > 0)) continue;
      AtlasWorld.addContext(ring, h);
      hidden.add(f.id); built++; added++;
    }
    if (!added) return;
    AtlasWorld.flushContext();
    map.setFilter("context-buildings", ["all",
      ["==", ["get", "extrude"], "true"],
      ["!=", ["get", "underground"], "true"],
      ["has", "height"],
      ["!", ["in", ["id"], ["literal", Array.from(hidden)]]]
    ]);
    if (built >= CAP) console.warn(`[Atlas] Class C capped at ${CAP} buildings; farther context stays flat.`);
    console.log(`[Atlas] Class C: ${built} procedural context buildings.`);
  }
  harvest();
  map.on("idle", harvest);
}

/* ============================================================
   BASEMAP INTEGRATION (foundation layer)
   The Standard basemap is an IMPORT: its `3d-building` layer is not
   addressable at runtime (can't be filtered per-feature). So Standard's own
   3D objects are switched OFF and we render the context city ourselves from
   the Mapbox Streets vector tiles — same recipe as the basemap (real
   footprints, vertical gradient, quiet height-ramped palette) but with full
   control: one renderer, no double-draw, and deterministic hiding of the
   footprint wherever OUR building sits on the same plot.
   ============================================================ */
const CONTEXT_RAMP = {
  light: ["interpolate", ["linear"], ["get", "height"], 0, "#d5d0c7", 60, "#ccd2d8", 150, "#e2e8ef"],
  dark:  ["interpolate", ["linear"], ["get", "height"], 0, "#232c3d", 60, "#2c3a50", 150, "#3a4c68"],
};
const contextRamp = () => CONTEXT_RAMP[themeFamily(currentTheme)];

function integrateBasemap() {
  map.addSource("bkc-streets", { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" });

  map.addLayer({
    id: "context-buildings",
    type: "fill-extrusion",
    source: "bkc-streets",
    "source-layer": "building",
    filter: ["all",
      ["==", ["get", "extrude"], "true"],
      ["!=", ["get", "underground"], "true"],
      ["has", "height"]
    ],
    paint: {
      "fill-extrusion-color": contextRamp(),
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true,
    }
  });

  // Hide the context footprint under each of our buildings, as tiles stream in.
  const targets = D.BUILDINGS.filter(b => b.isOption && b.lat && b.lng);
  const hiddenIds = new Set();

  const collectAndFilter = () => {
    if (!map.getLayer("context-buildings")) return;
    let changed = false;
    targets.forEach(b => {
      // ~60m box around the building's ground-truth anchor
      const [alng, alat] = buildingAnchor(b);
      const p1 = map.project([alng - 0.0006, alat - 0.0006]);
      const p2 = map.project([alng + 0.0006, alat + 0.0006]);
      const bbox = [
        [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
        [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)]
      ];
      map.queryRenderedFeatures(bbox, { layers: ["context-buildings"] }).forEach(f => {
        if (f.id != null && !hiddenIds.has(f.id)) { hiddenIds.add(f.id); changed = true; }
      });
    });
    if (!changed) return;
    map.setFilter("context-buildings", ["all",
      ["==", ["get", "extrude"], "true"],
      ["!=", ["get", "underground"], "true"],
      ["has", "height"],
      ["!", ["in", ["id"], ["literal", Array.from(hiddenIds)]]]
    ]);
    if (debugMode) console.log(`[Atlas] Hid ${hiddenIds.size} context footprint(s) under db buildings`);
  };

  // Tiles stream in — retry briefly, then re-check whenever the map settles.
  let tries = 0;
  const iv = setInterval(() => { if (++tries > 12) clearInterval(iv); collectAndFilter(); }, 800);
  map.on("idle", collectAndFilter);
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

  // Pass 1: Name match (HIGH confidence).
  // An EXACT OSM name equality trusts the real-world position up to 500m —
  // for a digital twin, OSM is ground truth and our workbook coordinates are
  // the approximations. Loose substring matches stay conservative at 150m.
  if (nameHint) {
    let best = null, bestDist = Infinity, bestExact = false;
    geojson.features.forEach(f => {
      const n = (f.properties?.name || "").toLowerCase();
      if (!n || !f.geometry || f.geometry.type !== "Polygon") return;
      const isExact = n === nameHint;
      if (!isExact && !n.includes(nameHint) && !nameHint.includes(n)) return;
      const centroid = polygonCentroid(f.geometry.coordinates[0]);
      const dist = haversineMeters(lat, lng, centroid[1], centroid[0]);
      if (dist < bestDist && (isExact ? dist < 500 : dist < 150)) {
        best = f; bestDist = dist; bestExact = isExact;
      }
    });
    if (best) {
      if (debugMode) console.log(`[Match] ${propertyId} → HIGH (name: "${best.properties.name}", ${Math.round(bestDist)}m${bestExact ? ", exact" : ""})`);
      return { feature: best, confidence: "HIGH", dist: bestDist };
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

    // City kit: the unified world layer renders the DETAILED Class-A shell for
    // EVERY option building — not just the ones with a confident OSM match.
    // A synthesized rectangle (same math as addFallbackBox) keeps buildings
    // like Adani/Vaibhav/Vibgyor/Pittie visually consistent with Capital,
    // instead of silently degrading to a flat box when OSM match fails.
    if (CITYKIT) {
      let ring = (match.feature && match.confidence !== "NONE")
        ? match.feature.geometry.coordinates[0]
        : null;
      if (!ring) {
        const w = b.w || 50, d = b.d || 50;
        const dLat = (d / 2) / 111320, dLng = (w / 2) / (111320 * Math.cos(b.lat * Math.PI / 180));
        ring = [
          [b.lng - dLng, b.lat - dLat], [b.lng + dLng, b.lat - dLat],
          [b.lng + dLng, b.lat + dLat], [b.lng - dLng, b.lat + dLat], [b.lng - dLng, b.lat - dLat],
        ];
      }
      worldQueue.push({ ring, heightM, id: b.id });
    }
  });
}

/* ============================================================
   UNIFIED WORLD LAYER BOOT (city kit) — Class-A option buildings
   ============================================================ */
async function initWorld() {
  if (!CITYKIT || !THREE) { if (!THREE && CITYKIT) return setTimeout(initWorld, 100); return; }
  try {
    await AtlasWorld.init({
      THREE, map, mapboxgl, center: MAP_CENTER,
      getRig, themeMode: () => themeMode,
    });
    worldQueue.forEach(({ ring, heightM, id }) => {
      AtlasWorld.addBuilding(ring, heightM, { id, cls: "A" });
      // hide the flat extrusion (keep it as an invisible click-pad); keep perimeter
      const layerId = `db-building-${id}`;
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, "fill-extrusion-opacity", 0);
    });
    AtlasWorld.relight(getRig(themeMode));
    console.log(`[Atlas] World layer: ${worldQueue.length} option buildings rendered as Class-A shells`);

    // Phase 3 — scatter instanced props (trees + lamps) along the real roads
    const heroCoords = worldQueue.map(w => {
      const b = D.BUILDINGS.find(x => x.id === w.id);
      return b ? [b.lng, b.lat] : null;
    }).filter(Boolean);
    resolveClientRoads()
      .then(roads => AtlasWorld.populateProps(roads, heroCoords))
      .catch(e => console.warn("[Atlas] props skipped:", e.message));

    // Phase 2 — Class C procedural context (opt-in: ?classc=on; needs a human eyeball)
    if (new URLSearchParams(location.search).get("classc") === "on") initClassC();
  } catch (e) {
    console.error("[Atlas] world layer init failed — reverting to flat extrusions:", e);
    worldQueue.forEach(({ id }) => {
      const layerId = `db-building-${id}`;
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, "fill-extrusion-opacity", 1);
    });
  }
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
/** Soft radial-gradient texture used as a fake ambient-occlusion contact patch. */
function makeContactShadowTexture(THREE) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.85)");
  g.addColorStop(0.55, "rgba(0,0,0,0.32)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Re-light the GLB scene from the real sun (one shared sun with the basemap). */
function applyGltfLighting(mode) {
  if (!gltfRig) return;
  const rig = getRig(mode || themeMode);
  gltfRig.hemi.color.setHex(rig.skyColor);        // secondary — sky dome
  gltfRig.hemi.groundColor.setHex(rig.groundColor); // tertiary — ground bounce
  gltfRig.hemi.intensity = rig.hemiI;
  gltfRig.directional.color.setHex(rig.sunColor);  // primary — the sun itself
  gltfRig.directional.intensity = rig.sunI;
  gltfRig.directional.position.set(...rig.sunVec).normalize();
  gltfRig.renderer.toneMappingExposure = rig.exposure;
}

/** Restyle the context city + our option fills + perimeters for the theme family. */
function applyDbPalette() {
  if (map.getLayer("context-buildings")) {
    map.setPaintProperty("context-buildings", "fill-extrusion-color", contextRamp());
  }
  D.BUILDINGS.filter(b => b.isOption).forEach(b => {
    const layerId = `db-building-${b.id}`, perimId = `db-perimeter-${b.id}`;
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, "fill-extrusion-color", optionFill(b.id));
    if (map.getLayer(perimId)) map.setPaintProperty(perimId, "line-color", optionStroke(b.id));
  });
}

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
  const { RoomEnvironment } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js');

  const customLayer = {
    id: `custom-gltf-${b.id}`,
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      // One sun for the whole world — the REAL astronomical sun (Move 1)
      const rig = getRig(themeMode);
      const hemi = new THREE.HemisphereLight(rig.skyColor, rig.groundColor, rig.hemiI);
      this.scene.add(hemi);
      const directional = new THREE.DirectionalLight(rig.sunColor, rig.sunI);
      directional.position.set(...rig.sunVec).normalize();
      this.scene.add(directional);

      const loader = new GLTFLoader();
      loader.load(reg.modelUrl, (gltf) => {
        const model = gltf.scene;

        // Normalize the artist export: AI-generated GLBs ship metalness=1 /
        // roughness=1, which kills the diffuse term — the baked texture (the
        // building's real colours) never shows and the tower goes black.
        // Clamp to an architectural range so the facade reads as albedo.
        model.traverse(o => {
          if (!o.isMesh) return;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => {
            if (m.metalness !== undefined) m.metalness = Math.min(m.metalness ?? 0, 0.15);
            if (m.roughness !== undefined) m.roughness = Math.max(m.roughness ?? 1, 0.75);
            m.needsUpdate = true;
          });
        });
        
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
        
        // Fit the model into its REAL confined space:
        // footprint bbox (from the OSM match) drives X/Z, real height drives Y.
        // Artist units are arbitrary (this export is ~0.6 units tall), so a
        // single uniformScale can never honour both height and plot.
        let sx = 1, sy = 1, sz = 1;
        const ring = (match.feature && match.confidence !== "NONE")
          ? match.feature.geometry.coordinates[0] : null;
        if (ring && size.x > 0.001 && size.z > 0.001) {
          const R = 6378137, latR = b.lat * Math.PI / 180;
          let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          ring.forEach(([lng, lat]) => {
            const x = (lng - b.lng) * (Math.PI / 180) * R * Math.cos(latR);
            const y = (lat - b.lat) * (Math.PI / 180) * R;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          });
          sx = (maxX - minX) / size.x;
          sz = (maxY - minY) / size.z;
        }
        if (reg.heightMeters && size.y > 0.001) sy = reg.heightMeters / size.y;
        else if (reg.transform && reg.transform.uniformScale !== undefined) sy = reg.transform.uniformScale;
        if (!ring) { sx = sy; sz = sy; } // no footprint → uniform height-based fallback
        group.scale.set(sx, sy, sz);
        const baseScale = { x: sx, y: sy, z: sz };
        
        if (reg.transform) {
           group.rotation.set(0, reg.transform.rotationDegrees * Math.PI / 180, 0);
           group.position.set(reg.transform.offsetX || 0, 0, reg.transform.offsetZ || 0);
        } else if (reg.modelRotation) {
           group.rotation.set(reg.modelRotation[0], reg.modelRotation[1], reg.modelRotation[2]);
        }
        
        this.scene.add(group);

        // Move 5 — the tower GROWS into place instead of popping in
        {
          const targetSY = group.scale.y;
          group.scale.y = targetSY * 0.02;
          const t0 = performance.now() + 600, dur = 1400;
          const grow = (now) => {
            const t = (now - t0) / dur;
            if (t < 0) { requestAnimationFrame(grow); return; }
            const k = 1 - Math.pow(1 - Math.min(1, t), 3);
            group.scale.y = targetSY * (0.02 + 0.98 * k);
            map.triggerRepaint();
            if (t < 1) requestAnimationFrame(grow);
          };
          requestAnimationFrame(grow);
        }

        // Contact shadow — a soft dark disc that seats the model on the ground
        // plane, so it stops looking like a sticker floating over the basemap.
        const shadowRadius = Math.max(size.x * sx, size.z * sz) * 0.5 * 1.15;
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(shadowRadius * 2, shadowRadius * 2),
          new THREE.MeshBasicMaterial({ map: makeContactShadowTexture(THREE), transparent: true, opacity: 0.42, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.3;
        this.scene.add(shadow);

        map.triggerRepaint();
        
        // Expose globally for tweaking via Developer UI
        window.activeGltfGroup = group;
        window.activeGltfReg = reg;
        window.activeGltfId = b.id;
        
        window.tweakModel = (rotDeg, scaleMul, dx, dz) => {
           group.rotation.set(0, rotDeg * Math.PI / 180, 0);
           group.scale.set(baseScale.x * scaleMul, baseScale.y * scaleMul, baseScale.z * scaleMul);
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
      // Match the basemap's filmic response so the model doesn't blow out
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = rig.exposure;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      gltfRig = { hemi, directional, renderer: this.renderer };

      // Image-based fill light — without an environment, the artist's PBR glass
      // (metalness > 0) has nothing to reflect and renders pitch black.
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

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
        "fill-extrusion-color": optionFill(b.id),
        "fill-extrusion-height": 0.01,   // Move 5 — born flat, constructWorld() raises it
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      }
    });
    constructTargets.push({ layerId, h: heightM });
    // Perimeter — the exact confined plot outline, drawn at ground level
    map.addLayer({
      id: `db-perimeter-${b.id}`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": optionStroke(b.id),
        "line-width": 1.5,
        "line-opacity": 0.95,
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
        "fill-extrusion-color": optionFill(b.id),
        "fill-extrusion-height": 0.01,   // Move 5 — born flat, constructWorld() raises it
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      }
    });
    constructTargets.push({ layerId, h: heightM });
    map.addLayer({
      id: `db-perimeter-${b.id}`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": optionStroke(b.id),
        "line-width": 1.5,
        "line-opacity": 0.95,
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
  // This is BKC transit data (real Line 3 alignment + indicative 2B).
  // Other clients bring their own geography — don't paint BKC's lines on it.
  if ((window.CLIENT_SLUG || "vfs-bkc") !== "vfs-bkc") return;

  // Aqua Line: REAL tunnel alignment from OSM (metro_line3.js), not schematic.
  // Yellow Line: indicative alignment (under construction, not yet surveyed).
  const aquaPath = (window.BKC_LINE3 && window.BKC_LINE3.path) || [
    [72.8260, 18.9750], [72.8340, 18.9990], [72.8445, 19.0180], [72.8570, 19.0380],
    [72.8612, 19.0610], [72.8655, 19.0820], [72.8710, 19.1050],
  ];
  const metroData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { line: "aqua", name: "Aqua Line — Metro Line 3" },
        geometry: { type: "LineString", coordinates: aquaPath }
      },
      {
        type: "Feature",
        properties: { line: "yellow", name: (D.METRO && D.METRO.yellow && D.METRO.yellow.name) || "Yellow Line — Metro Line 2B" },
        geometry: {
          type: "LineString",
          coordinates: (window.BKC_LINE2 && window.BKC_LINE2.path) || [
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

  // Metro stations — Aqua: real OSM station nodes. Yellow: indicative (u/c).
  const aquaStations = (window.BKC_LINE3 && window.BKC_LINE3.stations) || [];
  const stationData = {
    type: "FeatureCollection",
    features: [
      ...aquaStations.map(s => ({
        type: "Feature",
        properties: { name: s.name, line: "aqua", status: "open" },
        geometry: { type: "Point", coordinates: [s.lng, s.lat] }
      })),
      ...(window.BKC_LINE2 && window.BKC_LINE2.stations
        ? window.BKC_LINE2.stations.map(s => ({
            type: "Feature", properties: { name: s.name, line: "yellow", status: "open" },
            geometry: { type: "Point", coordinates: [s.lng, s.lat] }
          }))
        : [
      { type: "Feature", properties: { name: "ITO BKC · 2B (u/c)", line: "yellow", status: "upcoming" }, geometry: { type: "Point", coordinates: [72.8640, 19.0640] } },
      { type: "Feature", properties: { name: "IL&FS BKC · 2B (u/c)", line: "yellow", status: "upcoming" }, geometry: { type: "Point", coordinates: [72.8700, 19.0700] } },
      { type: "Feature", properties: { name: "MTNL BKC · 2B (u/c)", line: "yellow", status: "upcoming" }, geometry: { type: "Point", coordinates: [72.8755, 19.0738] } },
        ]),
    ]
  };
  map.addSource("metro-stations", { type: "geojson", data: stationData });

  map.addLayer({
    id: "metro-station-dots",
    type: "circle",
    source: "metro-stations",
    paint: {
      "circle-radius": ["case", ["==", ["get", "status"], "open"], 5.5, 4.5],
      "circle-color": ["case", ["==", ["get", "status"], "open"], "#ffffff", "#0b0f16"],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": ["match", ["get", "line"], "aqua", "#14b8c4", "#f2c200"],
    }
  });

  map.addLayer({
    id: "metro-station-labels",
    type: "symbol",
    source: "metro-stations",
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "visibility": showLabels ? "visible" : "none",
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(5,10,16,0.85)",
      "text-halo-width": 1.5,
    }
  });

  // Animated train — a calm glowing dot on the Aqua line, at a transit-like pace
  const trainEl = document.createElement('div');
  trainEl.style.cssText = `
    width:12px; height:12px; border-radius:50%;
    background:#ffffff; border:3px solid #14b8c4;
    box-shadow:0 0 10px 2px rgba(20,184,196,0.8);
  `;
  const trainMarker = new mapboxgl.Marker({ element: trainEl, anchor: 'center' })
    .setLngLat(metroData.features[0].geometry.coordinates[0])
    .addTo(map);

  let trainProgress = 0;
  let trainDirection = 1;
  const trainCoords = metroData.features[0].geometry.coordinates;
  const TRAIN_SPEED = 0.00025; // ~1 min end-to-end — reads as transit, not a racing sprite

  function animateTrain() {
    trainProgress += TRAIN_SPEED * trainDirection;

    // Reverse direction at ends
    if (trainProgress >= 1) {
      trainProgress = 1;
      trainDirection = -1;
    }
    if (trainProgress <= 0) {
      trainProgress = 0;
      trainDirection = 1;
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
    const isWinner = b.id === D.META.winner;

    // Dot marker — quiet neutral; green is reserved for the recommended winner
    const dot = document.createElement("div");
    dot.className = "db-dot";
    dot.style.cssText = `
      width:12px; height:12px; border-radius:50%;
      background:${isWinner ? GREEN : "#e8ecf2"};
      border:2px solid ${isWinner ? "#ffffff" : "rgba(20,26,36,0.85)"};
      box-shadow:${isWinner ? "0 0 8px rgba(47,191,113,0.7)" : "0 1px 4px rgba(0,0,0,0.45)"};
      cursor:pointer;
    `;
    dot.addEventListener("click", () => selectBuilding(b.id));

    // Sit the marker on the building's ground-truth anchor (OSM centroid when
    // the workbook coordinate was off), so dot, label and footprint coincide.
    const anchorLngLat = buildingAnchor(b);
    const marker = new mapboxgl.Marker({ element: dot, anchor: "center" })
      .setLngLat(anchorLngLat)
      .addTo(map);
    propertyMarkers[b.id] = marker;

    const reg = BUILDING_REGISTRY[b.id] || {};
    const heightM = reg.heightMeters || b.h || 50;

    // Name label tag — dark glass chip; winner reads green
    const tag = document.createElement("div");
    tag.className = "mm-opt";
    tag.textContent = b.name;
    tag.style.cssText = `
      background:${isWinner ? "rgba(47,191,113,0.92)" : "rgba(16,21,30,0.85)"};
      color:${isWinner ? "#04150c" : "#ffffff"};
      border:1px solid ${isWinner ? "transparent" : "rgba(255,255,255,0.14)"};
      font-family:system-ui,sans-serif; font-size:11px;
      font-weight:700; padding:3px 9px; border-radius:5px;
      white-space:nowrap; pointer-events:none; cursor:default;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      text-shadow:none; margin-bottom:4px;
      ${showLabels ? "" : "display:none;"}
    `;

    const labelMarker = new mapboxgl.Marker({
      element: tag,
      anchor: "bottom",
      offset: [0, -10]
    })
      .setLngLat([anchorLngLat[0], anchorLngLat[1], heightM + 5]) // altitude lifts it above the roofline
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

/** Keep map label chips in the colour grammar: green = winner + selection. */
function styleLabelChips() {
  Object.entries(labelMarkers).forEach(([id, m]) => {
    const el = m.getElement();
    const lit = id === selectedId || id === D.META.winner;
    el.style.background = lit ? "rgba(47,191,113,0.92)" : "rgba(16,21,30,0.85)";
    el.style.color = lit ? "#04150c" : "#ffffff";
    el.style.border = lit ? "1px solid transparent" : "1px solid rgba(255,255,255,0.14)";
  });
}

/* ============================================================
   HERO ORBIT — slow rotation around the selected building so its
   3D volume reads (parallax). Cancels on any user camera input,
   on deselect/reset, and defers to the Cinematic toggle.
   ============================================================ */
let heroOrbitRAF = null;
function stopHeroOrbit() {
  if (heroOrbitRAF) { cancelAnimationFrame(heroOrbitRAF); heroOrbitRAF = null; }
  if (map) ["dragstart", "wheel", "mousedown", "touchstart"].forEach(ev => map.off(ev, stopHeroOrbit));
}
function startHeroOrbit() {
  stopHeroOrbit();
  if (!map) return;
  if (document.getElementById("t-cine")?.classList.contains("on")) return; // cinematic owns the camera
  ["dragstart", "wheel", "mousedown", "touchstart"].forEach(ev => map.on(ev, stopHeroOrbit));
  const step = () => {
    map.setBearing(map.getBearing() + 0.07);   // ~4°/s — a full walk-around in ~90s
    heroOrbitRAF = requestAnimationFrame(step);
  };
  heroOrbitRAF = requestAnimationFrame(step);
}

/* ============================================================
   CAMERA CHOREOGRAPHY — facade-first fly-to
   ============================================================ */
function facadeBearing(b) {
  const w = b.w || 50, d = b.d || 50;
  // 3/4 view favouring the longer facade:
  //   w >= d  → building wider E-W, long facades face N/S, view from SW
  //   d >  w  → building deeper N-S, long facades face E/W, view from SE
  let base = (w >= d) ? 42 : -42;
  // Consistent per-building jitter so re-selects don't flip unpredictably
  const hash = b.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return base + ((hash % 14) - 7);
}

/* ============================================================
   CINEMATIC SHOT LIST — the camera is a real-estate cinematographer,
   not a map viewport. Each building gets a curated set of directed shots.
   The building is the movie star: low pitch, façade-first, framed left of
   the property card. No free auto-orbit during a showcase.
   ============================================================ */
const SHOT_ORDER = ["hero", "arrival", "street", "drone"];
const SHOT_LABEL = { hero: "◲ Hero", arrival: "▤ Arrival", street: "❏ Street", drone: "✧ District" };
let currentShot = "hero";

// Push the camera OFF the building along `bearing` so the tower fills the frame
// from a low angle instead of being viewed top-down. Card lives right → we frame left.
function buildingShots(b) {
  const size = Math.max(b.w || 50, b.d || 50);
  const bear = facadeBearing(b);
  const anchor = buildingAnchor(b);
  const pad = { right: 430, left: 60, top: 70, bottom: 60 };
  const big = size > 80, mid = size > 55;
  return {
    // 1 — Hero reveal: façade-on, low pitch, building ~45% of frame. The landing shot.
    hero:    { center: anchor, zoom: big ? 16.7 : mid ? 17.1 : 17.5, pitch: 32, bearing: bear, padding: pad },
    // 2 — Arrival: you're almost at the junction; entrance + lobby read; cars pass.
    arrival: { center: anchor, zoom: big ? 17.4 : 17.8, pitch: 16, bearing: bear, padding: pad },
    // 3 — Executive street level: opposite footpath, façade fills the screen.
    street:  { center: anchor, zoom: big ? 17.9 : 18.3, pitch: 9, bearing: bear + 8, padding: pad },
    // 4 — District/drone: connectivity — metro, roads, neighbours. (Cinematic lifts here.)
    drone:   { center: anchor, zoom: 15.2, pitch: 60, bearing: MAP_BEARING, padding: { right: 430, left: 60, top: 60, bottom: 60 } },
  };
}

function flyToShot(b, shot) {
  if (!b.lat || !b.lng) return;
  stopHeroOrbit();
  currentShot = shot;
  const s = buildingShots(b)[shot] || buildingShots(b).hero;
  map.flyTo({ ...s, duration: 1700, essential: true, curve: 1.42 });
  // reflect active shot in the switcher
  document.querySelectorAll("#shotbar .shot").forEach(el =>
    el.classList.toggle("on", el.dataset.shot === shot));
  // Only the district shot gets the slow drone orbit; showcase shots hold still.
  if (shot === "drone") map.once("moveend", () => { if (selectedId === b.id) startHeroOrbit(); });
}

function focusBuilding(b) { flyToShot(b, "hero"); }

/* Cinematic focus — everything that isn't the star recedes (luxury-auto style). */
function setCinematicFocus(on, keepId) {
  // context city dims; roads/greenery soften
  const dim = (layer, prop, v) => { if (map.getLayer(layer)) map.setPaintProperty(layer, prop, v); };
  dim("context-buildings", "fill-extrusion-opacity", on ? 0.45 : 1);
  ["metro-aqua", "metro-yellow", "metro-aqua-glow"].forEach(l => dim(l, "line-opacity", on ? 0.5 : 1));
  // other option buildings recede; the star stays full
  D.BUILDINGS.filter(x => x.isOption).forEach(x => {
    if (x.id === keepId) return;
    if (window.AtlasWorld && CITYKIT && AtlasWorld.hasBuilding(x.id)) AtlasWorld.setGhost(x.id, on);
    else dim(`db-building-${x.id}`, "fill-extrusion-opacity", on ? 0.3 : 1);
  });
}

/* The shot-switcher rail — appears when a building is selected. */
function showShotBar(b) {
  let bar = document.getElementById("shotbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "shotbar";
    document.body.appendChild(bar);
  }
  bar.innerHTML = SHOT_ORDER.map(s =>
    `<button class="shot${s === currentShot ? " on" : ""}" data-shot="${s}">${SHOT_LABEL[s]}</button>`).join("");
  bar.querySelectorAll(".shot").forEach(el =>
    el.addEventListener("click", () => flyToShot(b, el.dataset.shot)));
  bar.classList.add("show");
}
function hideShotBar() { document.getElementById("shotbar")?.classList.remove("show"); }

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
  styleLabelChips();

  // Cinematic: the building becomes the movie star — directed Hero shot,
  // everything else recedes, the shot-switcher rail appears.
  currentShot = "hero";
  focusBuilding(b);
  setCinematicFocus(true, id);
  showShotBar(b);

  // Open property card (reuses existing HTML)
  openCard(b);

  // One panel max — the card opens, the leaderboard folds to its rail tab
  document.getElementById("lb")?.classList.add("collapsed");
  document.getElementById("lb-tab")?.classList.add("show");

  // Metro distance line
  showMetroDistance(b);

  // Sync leaderboard
  document.querySelectorAll(".lb-row").forEach(r =>
    r.classList.toggle("active", r.dataset.bldg === id));
}

function highlightBuilding(id, on, selected = false) {
  const layerId = `db-building-${id}`;
  const perimId = `db-perimeter-${id}`;
  // City kit: drive the world-layer building's state (extrusion is an invisible pad)
  if (window.AtlasWorld && CITYKIT && AtlasWorld.hasBuilding(id)) {
    if (selected) AtlasWorld.setSelected(id, on);
    else AtlasWorld.setHighlight(id, on);
  }
  if (!map.getLayer(layerId)) return;

  if (on) {
    map.setPaintProperty(layerId, "fill-extrusion-color", selected ? GREEN : HOVER_GREEN);
    if (map.getLayer(perimId)) {
      map.setPaintProperty(perimId, "line-color", selected ? GREEN : HOVER_GREEN);
      map.setPaintProperty(perimId, "line-width", selected ? 2.5 : 2);
    }
  } else if (id !== selectedId) {
    map.setPaintProperty(layerId, "fill-extrusion-color", optionFill(id));
    if (map.getLayer(perimId)) {
      map.setPaintProperty(perimId, "line-color", optionStroke(id));
      map.setPaintProperty(perimId, "line-width", 1.5);
    }
  }
}

function unhighlightAll() {
  D.BUILDINGS.filter(b => b.isOption && b.id !== selectedId).forEach(b => {
    highlightBuilding(b.id, false);
  });
}

/* ============================================================
   METRO DIRECTIONS CARD — Google-Maps-style connectivity overlay.
   Walk + Drive are routed LIVE through the roads (Directions API).
   Bus is shown as feeder-route chips from the workbook — Mapbox has no
   transit routing engine, so no fake bus polyline is ever drawn.
   ============================================================ */
const routeCache = {};
let currentRouteId = null;
let metroPopup = null;
let metroMode = "walking";      // "walking" | "driving"
let metroBuildingId = null;     // building the card is open for

const BKC_STATION = { lng: 72.8546797, lat: 19.0606629, name: "BKC (Aqua)" };
const ROUTE_BLUE = "#2f7df0";   // Google-directions blue, readable dawn + dusk

async function fetchRoute(profile, startLng, startLat, endLng, endLat) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.routes && data.routes.length > 0) return data.routes[0];
  return null;
}

/** Per-building nearest station if the client data provides one (stnLng/
    stnLat/stnName); falls back to the BKC Aqua Line 3 station. */
function stationFor(b) {
  return {
    lng: b.stnLng != null ? b.stnLng : BKC_STATION.lng,
    lat: b.stnLat != null ? b.stnLat : BKC_STATION.lat,
    name: b.stnName || BKC_STATION.name,
  };
}

function removeRouteLayers() {
  ["bkc-walking-route", "bkc-walking-route-casing", "bkc-walking-route-ends"].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ["bkc-walking-route-src", "bkc-walking-route-ends"].forEach(id => {
    if (map.getSource(id)) map.removeSource(id);
  });
}

function clearMetroRoute() {
  if (metroPopup) { metroPopup.remove(); metroPopup = null; }
  removeRouteLayers();
  currentRouteId = null;
  metroBuildingId = null;
}

/* ---------- card HTML ---------- */
function modeTabHTML(mode, emoji, label) {
  const on = metroMode === mode;
  return `<button data-mode="${mode}" style="flex:1;padding:3px 4px;border-radius:5px;cursor:pointer;
    border:1px solid ${on ? ROUTE_BLUE : "rgba(255,255,255,.18)"};
    background:${on ? "rgba(47,125,240,.28)" : "transparent"};
    color:${on ? "#bcd6ff" : "rgba(255,255,255,.7)"};
    font:600 9px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:2px;">${emoji} ${label}</button>`;
}

function busChipsHTML(b) {
  const routes = (b.busRoutes || "").split(/[,+]/).map(s => s.trim()).filter(Boolean);
  if (!routes.length || /n\/a/i.test(b.busRoutes || "")) return "";
  return `<div style="margin-top:5px;padding-top:4px;border-top:1px solid rgba(255,255,255,.10)">
    <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;">
      <span style="font-size:8px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.5px;">Feeders</span>
      ${routes.map(r => `<span style="background:rgba(47,125,240,.16);border:1px solid rgba(47,125,240,.55);color:#9ec2ff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:4px;">${r}</span>`).join("")}
    </div>
  </div>`;
}

function metroCardHTML(b, st) {
  return `<div style="font-family:system-ui,sans-serif;color:#fff;background:rgba(16,21,30,.85);
      border:1px solid rgba(20,184,196,.45);border-radius:16px;padding:5px 8px;min-width:auto;max-width:180px;
      box-shadow:0 4px 14px rgba(0,0,0,.45);backdrop-filter:blur(8px)">
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
      <span style="font-size:10px;font-weight:700;color:#14b8c4;">${st.name}</span>
      <span class="md-summary" style="font-size:10px;color:rgba(255,255,255,.85);">…</span>
    </div>
    <div style="display:flex;gap:3px;margin-top:3px;">
      ${modeTabHTML("walking", "🚶", "Walk")}
      ${modeTabHTML("driving", "🚗", "Drive")}
    </div>
  </div>`;
}

function summaryHTML(route, mode) {
  if (!route) return `<span style="color:#ff9b9b">Route unavailable</span>`;
  const km = (route.distance / 1000).toFixed(2);
  const min = Math.ceil(route.duration / 60);
  return `<b style="font-size:15px;">~${min} min</b> <span style="color:rgba(255,255,255,.6);"> · ${km} km ${mode === "driving" ? "drive" : "walk"}</span>`;
}

/* ---------- route drawing (bold Google-style blue with white casing) ---------- */
function drawActiveRoute(b, st) {
  removeRouteLayers();
  const routes = routeCache[`${b.id}-${st.lng},${st.lat}`];
  const route = routes ? (metroMode === "driving" ? routes.drive : routes.walk) : null;

  const el = document.querySelector(".metro-dist-popup .md-summary");
  if (el) el.innerHTML = summaryHTML(route, metroMode);
  if (!route) return;

  const coordinates = route.geometry.coordinates;
  map.addSource("bkc-walking-route-src", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: route.geometry }
  });
  map.addLayer({
    id: "bkc-walking-route-casing",
    type: "line",
    source: "bkc-walking-route-src",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 8.5, "line-opacity": 0.9 }
  });
  map.addLayer({
    id: "bkc-walking-route",
    type: "line",
    source: "bkc-walking-route-src",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_BLUE, "line-width": 5, "line-opacity": 1 }
  });
  map.addSource("bkc-walking-route-ends", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [coordinates[0], coordinates[coordinates.length - 1]].map(c => ({
        type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c }
      }))
    }
  });
  map.addLayer({
    id: "bkc-walking-route-ends",
    type: "circle",
    source: "bkc-walking-route-ends",
    paint: {
      "circle-radius": 5.5,
      "circle-color": "#ffffff",
      "circle-stroke-color": ROUTE_BLUE,
      "circle-stroke-width": 3
    }
  });

}

function wireModeTabs(b, st) {
  document.querySelectorAll(".metro-dist-popup [data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      metroMode = btn.dataset.mode;
      document.querySelectorAll(".metro-dist-popup [data-mode]").forEach(x => {
        const on = x.dataset.mode === metroMode;
        x.style.border = `1px solid ${on ? ROUTE_BLUE : "rgba(255,255,255,.18)"}`;
        x.style.background = on ? "rgba(47,125,240,.28)" : "transparent";
        x.style.color = on ? "#bcd6ff" : "rgba(255,255,255,.7)";
      });
      drawActiveRoute(b, st);
    });
  });
}

async function showMetroDistance(b) {
  clearMetroRoute();
  if (!b.lat || !b.lng) return;
  if (!document.getElementById("t-dist").classList.contains("on")) return; // Only show if toggle is active
  metroBuildingId = b.id;

  const st = stationFor(b);
  const [blng, blat] = buildingAnchor(b);
  const cacheKey = `${b.id}-${st.lng},${st.lat}`;

  // Small world-chip anchored at the station so it never covers the building.
  metroPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -12], maxWidth: "180px", className: "metro-dist-popup" })
    .setLngLat([st.lng, st.lat])
    .setHTML(metroCardHTML(b, st))
    .addTo(map);
  wireModeTabs(b, st);
  currentRouteId = b.id;

  // Fetch BOTH modes once, in parallel, then draw the active one
  if (!routeCache[cacheKey]) {
    const [walk, drive] = await Promise.all([
      fetchRoute("walking", blng, blat, st.lng, st.lat),
      fetchRoute("driving", blng, blat, st.lng, st.lat),
    ]);
    routeCache[cacheKey] = { walk, drive };
  }
  if (metroBuildingId !== b.id) return; // user moved on meanwhile
  drawActiveRoute(b, st);
}

/* ============================================================
   PROPERTY CARD (PRD §25 — reuses existing UI from index.html)
   ============================================================ */
/* Parse a floor string into level numbers. Handles "Ground"→[0], "8th"→[8],
   and compound offers "3rd+4th" / "12th & 13th" → [3,4] / [12,13]. */
function floorLevels(floorStr) {
  if (floorStr == null) return [];
  const s = String(floorStr).trim();
  if (/^g/i.test(s)) return [0];
  return (s.match(/\d+/g) || []).map(Number);
}

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
      ${best ? `<div class="card-rank">Ranks <b>#${best.rank}</b> of ${D.OPTIONS.length} ·
        <b>${best.scoreLabel || (best.score.toFixed(2) + "/10")}</b> <span class="chip" style="background:${fitColor}">${best.fit}</span>${best.hops ? ` <span class="chip" style="background:${best.hops > 2 ? "#d1495b" : "#14b8c4"};color:#fff">${best.hops} hops</span>` : ""}</div>` :
        `<div class="card-rank">Context landmark</div>`}
      <div class="card-sub">${b.tenants || ""}</div>
      ${b.gradeNote ? `<div class="card-sub grade-note">🏆 ${b.gradeNote}</div>` : ""}
    </div>

    <div class="compact-cta">
      <button class="btn-explore" id="cardExpand">View Details</button>
      <button class="btn-walk" id="wtBtnCompact">Walkthrough</button>
    </div>

    <div class="detail-sections">
    ${units.length ? `
    <div class="sec"><h4>Available units</h4>
      <div class="units">
        ${units.map(u => `<div class="unit" data-rank="${u.rank}" style="border-left-color:${D.FIT_COLORS[u.fit]}">
          <div class="unit-top"><b>${u.floor} floor</b> · ${u.carpet.toLocaleString()} sqft carpet
            <span class="unit-score">#${u.rank} · ${u.scoreLabel || u.score.toFixed(2)}</span></div>
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

    <div class="sec floors-sec"><h4>Floor stack — <span class="muted">highlighted = floor on offer</span></h4>
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
      <button class="btn-primary" id="pitchBtn">${shortlisted.has(b.id) ? "✓ Added to shortlist" : ((window.CLIENT && window.CLIENT.shortlistText) || `Add to ${D.META.client} shortlist`)}</button>
      <button class="btn-primary" id="wtBtn" style="margin-top:10px; background:#f0a020; color:#121214; border:none;">Virtual Walkthrough</button>
    </div>
    </div>`;

  // Land in compact mode — small, bottom-left, out of the building's way.
  // "View Details" expands into the full right-side panel.
  card.className = "compact";
  requestAnimationFrame(() => card.classList.add("open"));

  document.getElementById("cardClose").onclick = () => closeCard();
  document.getElementById("cardExpand")?.addEventListener("click", () => card.classList.remove("compact"));
  document.getElementById("wtBtnCompact")?.addEventListener("click", () => openWalkthrough(b));
  document.getElementById("pitchBtn")?.addEventListener("click", () => toggleShortlist(b.id));
  document.getElementById("wtBtn")?.addEventListener("click", () => {
    openWalkthrough(b);
  });

  card.querySelectorAll(".fl-rect[data-avail='1']").forEach(r => {
    r.addEventListener("click", () => {
      card.querySelectorAll(".fl-rect").forEach(x => x.classList.remove("sel"));
      r.classList.add("sel");
      const u = units.find(u => floorLevels(u.floor).includes(Number(r.dataset.level)));
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
  // Map each level to the unit on offer there (supports compound "3rd+4th" offers)
  const levelUnit = {};
  units.forEach(u => floorLevels(u.floor).forEach(l => { if (!(l in levelUnit)) levelUnit[l] = u; }));
  const H = Math.max(150, total * 11), fh = H / total, W = 190;
  let s = `<svg viewBox="0 0 ${W} ${H + 14}" width="100%" style="max-height:230px">`;
  for (let lvl = 0; lvl < total; lvl++) {
    const y = H - (lvl + 1) * fh;
    const u = levelUnit[lvl];
    const isA = !!u;
    const fill = isA ? ((D.FIT_COLORS && D.FIT_COLORS[u.fit]) || "#2fbf71") : "#39424e";
    s += `<rect class="fl-rect${isA ? " av" : ""}" data-avail="${isA ? 1 : 0}" data-level="${lvl}"
        x="10" y="${y}" width="${W - 20}" height="${fh - 2}" rx="2" fill="${fill}"
        stroke="#0c1016" stroke-width="1"/>`;
    if (isA || lvl === 0 || lvl === total - 1)
      s += `<text x="${W - 16}" y="${y + fh - 4}" text-anchor="end" font-size="8" fill="#cdd5df">${lvl === 0 ? "G" : lvl}</text>`;
  }
  s += `</svg>`;
  return s;
}

function closeCard() {
  document.getElementById("card").classList.remove("open");
  stopHeroOrbit();
  hideShotBar();
  setCinematicFocus(false, null);   // the world comes back
  const prev = selectedId;
  selectedId = null;
  if (prev) highlightBuilding(prev, false);
  styleLabelChips();

  // Card closed — the leaderboard returns
  document.getElementById("lb")?.classList.remove("collapsed");
  document.getElementById("lb-tab")?.classList.remove("show");

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
    return `<div class="lb-row${o.rank > 3 ? " lb-extra" : ""}${shortlisted.has(o.bldg) ? " shortlisted" : ""}" data-bldg="${o.bldg}">
      <div class="lb-rank">${o.rank}</div>
      <div class="lb-main">
        <div class="lb-name">${o.unit}<span class="lb-star" title="Shortlisted">★</span></div>
        <div class="lb-meta"><span class="dot" style="background:${c}"></span>${grade}${o.fit} · ${o.floor} · ${o.carpet.toLocaleString()} sqft · ${o.aqua} km</div>
        <div class="lb-bar"><span style="width:${o.bar != null ? o.bar : o.score * 10}%;background:${c}"></span></div>
      </div>
      <div class="lb-score">${o.scoreLabel ? o.score : o.score.toFixed(1)}</div>
    </div>`;
  }).join("") + `<button id="lb-expand">See all ${D.OPTIONS.length} options ▾</button>`;

  lb.querySelectorAll(".lb-row").forEach(r => {
    r.addEventListener("click", () => selectBuilding(r.dataset.bldg));
  });

  // Density on demand — first frame shows the podium only
  document.getElementById("lb-expand")?.addEventListener("click", e => {
    const on = lb.classList.toggle("expanded");
    e.currentTarget.textContent = on ? "Show less ▴" : `See all ${D.OPTIONS.length} options ▾`;
  });
}

/* Shortlist — toggled from the property card, reflected as a star on every
   matching leaderboard row (a building can have multiple ranked units) and
   on the card's own CTA button. Client-agnostic: same behaviour for VFS/Flipkart. */
function toggleShortlist(bldgId) {
  const on = !shortlisted.has(bldgId);
  on ? shortlisted.add(bldgId) : shortlisted.delete(bldgId);

  document.querySelectorAll(`#lb-list .lb-row[data-bldg="${bldgId}"]`)
    .forEach(r => r.classList.toggle("shortlisted", on));

  const pitchBtn = document.getElementById("pitchBtn");
  if (pitchBtn) {
    pitchBtn.textContent = on ? "✓ Added to shortlist"
      : ((window.CLIENT && window.CLIENT.shortlistText) || `Add to ${D.META.client} shortlist`);
  }
}

/* ============================================================
   UI TOGGLES (Night, Labels, Cinematic, Reset, Winner)
   ============================================================ */
/** One switch for the whole world's light: real sun → basemap preset + fills + GLB + traffic. */
function applyTheme(mode) {
  themeMode = mode;
  const rig = getRig(mode);
  currentTheme = rig.preset;              // palettes key off the resolved 4-preset family
  map.setConfigProperty('basemap', 'lightPreset', rig.preset);
  applyDbPalette();
  applyGltfLighting(mode);
  if (window.AtlasWorld && CITYKIT) AtlasWorld.relight(rig);   // one sun for the world layer
  if (trafficAPI) trafficAPI.setNight(rig.eDeg < 2);  // headlights after real sundown
}

function wireUI() {
  const set = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };

  let currentThemeIndex = 0; // dawn — the calm light default

  set("t-theme", e => {
    currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
    const theme = THEMES[currentThemeIndex];
    e.currentTarget.innerHTML = `${THEME_EMOJI[currentThemeIndex]} Theme: ${THEME_NAMES[currentThemeIndex]}`;
    applyTheme(theme);
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
    map.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, pitch: MAP_PITCH, bearing: MAP_BEARING, duration: 1500,
                padding: { left: 0, right: 0, top: 0, bottom: 0 } });
  });

  set("winnerBtn", () => selectBuilding(D.META.winner));

  set("t-traffic", e => {
    trafficOn = !trafficOn;
    e.currentTarget.classList.toggle("on", trafficOn);
    map.triggerRepaint();
  });
  document.getElementById("t-traffic")?.classList.add("on");
  // (traffic toggle hides itself inside initTraffic if no roads resolve for this client)

  set("t-filters", e => {
    const p = document.getElementById("fl-panel");
    if (!p) return;
    const on = p.style.display !== "block";
    p.style.display = on ? "block" : "none";
    e.currentTarget.classList.toggle("on", on);
    if (on) applyFilters();
  });
  if (!hasScoringWeights()) document.getElementById("t-filters")?.style.setProperty("display", "none");

  // Leaderboard collapse
  const lb = document.getElementById("lb");
  const lbTab = document.getElementById("lb-tab");
  document.getElementById("lb-collapse")?.addEventListener("click", () => {
    lb.classList.add("collapsed"); lbTab.classList.add("show");
  });
  lbTab?.addEventListener("click", () => {
    lb.classList.remove("collapsed"); lbTab.classList.remove("show");
  });

  // Default on state (labels stay OFF — density is a choice)
  document.getElementById("t-dist")?.classList.add("on");
}

/* ============================================================
   MOVE 2 — REAL WEATHER (Open-Meteo, no key, no card)
   The twin's sky matches the sky outside the client's window: live rain on
   the lens, cloud cover dims the real sun, a chip reports what's driving it.
   ============================================================ */
const WX = { cloud: 0, precip: 0, temp: null, code: null, desc: "" };
const WX_CODES = { 0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",
  51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
  80:"Showers",81:"Showers",82:"Monsoon burst",95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm" };

async function refreshWeather() {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lng}` +
              `&current=temperature_2m,precipitation,cloud_cover,weather_code&timezone=Asia%2FKolkata`;
    const c = (await (await fetch(u)).json()).current;
    WX.cloud = c.cloud_cover; WX.precip = c.precipitation;
    WX.temp = c.temperature_2m; WX.code = c.weather_code;
    WX.desc = WX_CODES[c.weather_code] || "—";
    applyWeatherToWorld();
    renderWxChip();
  } catch (e) { console.warn("[Atlas] weather feed offline (world stays clear):", e.message); }
}

function applyWeatherToWorld() {
  const mm = WX.precip || 0;
  if (map.setRain) {                       // GL JS ≥ 3.9
    if (mm > 0.05) {
      const k = Math.min(1, mm / 8);       // 8 mm/h ≈ full monsoon
      map.setRain({
        density: 0.3 + 0.6 * k, intensity: 0.4 + 0.6 * k, opacity: 0.5,
        vignette: 0.3 + 0.4 * k, "vignette-color": "#0b0f16",
        direction: [0, 70], "droplet-size": [2.6, 13.2],
        "distortion-strength": 0.5, "center-thinning": 0.4, color: "#a8adbc",
      });
    } else map.setRain(null);
  }
  applyTheme(themeMode);                   // cloud cover re-dims the shared sun
}

function renderWxChip() {
  let el = document.getElementById("wx-chip");
  if (!el) {
    el = document.createElement("div");
    el.id = "wx-chip";
    el.title = "Live weather at site — drives the sky, sun and rain in the twin";
    document.getElementById("brand")?.appendChild(el);
  }
  const t = WX.temp != null ? Math.round(WX.temp) + "°C · " : "";
  el.innerHTML = `<span class="wx-dot"></span>${t}${WX.desc || "—"} · live at site`;
}

function initWeather() {
  refreshWeather();
  setInterval(refreshWeather, 10 * 60 * 1000);
}

/* ============================================================
   MOVE 3 — INTELLIGENCE FILTERS (the brief becomes an instrument)
   The client turns the knobs of their own brief; every option is re-scored
   on the workbook's weights, the leaderboard re-ranks, failing buildings
   ghost out on the map, and the green crown moves to the new winner.
   Only active for clients that ship WEIGHTS (formula-scored briefs).
   ============================================================ */
/* Move 3's numeric brief-filter needs floor/area/connectivity/possession weights.
   Flipkart also ships a WEIGHTS object (contiguity/connectivity/readiness — qualitative,
   categorical tiers by design) that must NOT trigger the VFS-style scored filter. */
function hasScoringWeights() {
  const W = D.WEIGHTS;
  return !!(W && W.floor != null && W.area != null && W.connectivity != null && W.possession != null);
}

const activeF = { maxCarpet: 2500, floors: { 0: true, 1: true, 2: false, 3: false }, furnishedOnly: false, maxAqua: 2.5 };
const FLOOR_LABELS = { 0: "G", 1: "1st", 2: "2nd", 3: "3rd+" };
const originalWinner = () => (window.CLIENT && window.CLIENT.data ? null : null);

function floorKeyOf(o) {
  if (/ground/i.test(o.floor)) return 0;
  const n = parseInt(o.floor) || 0;
  return n >= 3 ? 3 : n;
}

function rescoreOption(o) {
  const W = D.WEIGHTS;
  const fk = floorKeyOf(o);
  const passFloor = !!activeF.floors[fk];
  const passArea  = o.carpet <= activeF.maxCarpet;
  const passFurn  = !activeF.furnishedOnly || /furnish/i.test(o.furn || "");
  const passMetro = o.aqua <= activeF.maxAqua;
  const pass = passFloor && passArea && passFurn && passMetro;
  const sFloor = passFloor ? (fk === 0 ? 10 : fk === 1 ? 9.5 : fk === 2 ? 6.5 : 4) : 1.5;
  const sArea  = passArea
    ? 10 - 3 * (1 - Math.min(1, o.carpet / activeF.maxCarpet))     // close to the cap = efficient
    : Math.max(1, 10 - 10 * (o.carpet / activeF.maxCarpet - 1));   // linear penalty past the cap
  const sConn  = Math.max(1, 10 - 3.5 * (o.aqua || 0));
  const sPoss  = /immediate/i.test(o.poss || "") ? 10 : 5;
  const score  = W.floor * sFloor + W.area * sArea + W.connectivity * sConn + W.possession * sPoss;
  return { pass, score: +score.toFixed(2) };
}

function applyFilters() {
  if (!hasScoringWeights()) return;
  const scored = D.OPTIONS.map(o => ({ o, r: rescoreOption(o) }))
    .sort((a, b) => (b.r.pass - a.r.pass) || (b.r.score - a.r.score));
  const nPass = scored.filter(s => s.r.pass).length;

  // Leaderboard re-render (live rank + live score)
  const lb = document.getElementById("lb-list");
  if (lb) {
    lb.innerHTML = scored.map((s, i) => {
      const { o, r } = s;
      const c = D.FIT_COLORS[o.fit];
      const bldg = D.BUILDINGS.find(x => x.id === o.bldg);
      const grade = bldg && bldg.grade ? `Grade ${bldg.grade} · ` : "";
      return `<div class="lb-row${i >= 3 ? " lb-extra" : ""}${r.pass ? "" : " lb-fail"}" data-bldg="${o.bldg}">
        <div class="lb-rank">${r.pass ? i + 1 : "✕"}</div>
        <div class="lb-main">
          <div class="lb-name">${o.unit}</div>
          <div class="lb-meta"><span class="dot" style="background:${c}"></span>${grade}${o.fit} · ${o.floor} · ${o.carpet.toLocaleString()} sqft · ${o.aqua} km</div>
          <div class="lb-bar"><span style="width:${r.score * 10}%;background:${r.pass ? c : "#5a636c"}"></span></div>
        </div>
        <div class="lb-score">${r.score.toFixed(1)}</div>
      </div>`;
    }).join("") + `<button id="lb-expand">See all ${scored.length} options ▾</button>`;
    lb.querySelectorAll(".lb-row").forEach(r => r.addEventListener("click", () => selectBuilding(r.dataset.bldg)));
    document.getElementById("lb-expand")?.addEventListener("click", e => {
      const on = lb.classList.toggle("expanded");
      e.currentTarget.textContent = on ? "Show less ▴" : `See all ${scored.length} options ▾`;
    });
  }

  // Header tells the live story
  const h3 = document.querySelector("#lb h3");
  if (h3) h3.textContent = `${nPass} of ${scored.length} options fit this brief`;
  const why = document.querySelector("#lb .why");
  if (why) {
    const fl = Object.keys(activeF.floors).filter(k => activeF.floors[k]).map(k => FLOOR_LABELS[k]).join("/") || "none";
    why.innerHTML = `Live re-ranking on the workbook weights — <b>≤ ${activeF.maxCarpet.toLocaleString()} sqft</b> ·
      floors <b>${fl}</b> · metro <b>≤ ${activeF.maxAqua} km</b>${activeF.furnishedOnly ? " · <b>furnished only</b>" : ""}`;
  }

  // Map: failing buildings ghost; the crown follows the new winner
  const passByBldg = {};
  scored.forEach(({ o, r }) => { passByBldg[o.bldg] = passByBldg[o.bldg] || r.pass; });
  const citykit = window.AtlasWorld && CITYKIT;
  D.BUILDINGS.filter(b => b.isOption).forEach(b => {
    const ok = passByBldg[b.id] !== false;   // buildings with no options (landmarks) stay solid
    if (citykit && AtlasWorld.hasBuilding(b.id)) AtlasWorld.setGhost(b.id, !ok);   // ghost the 3D shell
    else if (map.getLayer(`db-building-${b.id}`))
      map.setPaintProperty(`db-building-${b.id}`, "fill-extrusion-opacity", ok ? 1 : 0.15);
    if (map.getLayer(`db-perimeter-${b.id}`))
      map.setPaintProperty(`db-perimeter-${b.id}`, "line-opacity", ok ? 0.95 : 0.15);
  });
  const top = scored.find(s => s.r.pass);
  if (top) D.META.winner = top.o.bldg;
  applyDbPalette();
}

function buildFilterPanel() {
  if (!hasScoringWeights() || document.getElementById("fl-panel")) return;
  const p = document.createElement("div");
  p.id = "fl-panel";
  p.innerHTML = `
    <h4>CLIENT BRIEF — LIVE</h4>
    <div class="fl-row"><label>Max carpet <b id="fl-carpet-v">${activeF.maxCarpet.toLocaleString()} sqft</b></label>
      <input type="range" id="fl-carpet" min="1200" max="6000" step="100" value="${activeF.maxCarpet}"></div>
    <div class="fl-row"><label>Floors allowed</label>
      <div class="fl-chips">${[0,1,2,3].map(k =>
        `<span class="fl-chip${activeF.floors[k] ? " on" : ""}" data-fk="${k}">${FLOOR_LABELS[k]}</span>`).join("")}</div></div>
    <div class="fl-row"><label>Max metro walk <b id="fl-aqua-v">${activeF.maxAqua} km</b></label>
      <input type="range" id="fl-aqua" min="0.2" max="2.5" step="0.1" value="${activeF.maxAqua}"></div>
    <div class="fl-row"><label class="fl-check"><input type="checkbox" id="fl-furn"> Furnished only</label></div>`;
  document.body.appendChild(p);

  p.querySelector("#fl-carpet").addEventListener("input", e => {
    activeF.maxCarpet = +e.target.value;
    p.querySelector("#fl-carpet-v").textContent = activeF.maxCarpet.toLocaleString() + " sqft";
    applyFilters();
  });
  p.querySelector("#fl-aqua").addEventListener("input", e => {
    activeF.maxAqua = +e.target.value;
    p.querySelector("#fl-aqua-v").textContent = activeF.maxAqua + " km";
    applyFilters();
  });
  p.querySelector("#fl-furn").addEventListener("change", e => { activeF.furnishedOnly = e.target.checked; applyFilters(); });
  p.querySelectorAll(".fl-chip").forEach(ch => ch.addEventListener("click", () => {
    const k = ch.dataset.fk;
    activeF.floors[k] = !activeF.floors[k];
    ch.classList.toggle("on", activeF.floors[k]);
    applyFilters();
  }));
}

/* ============================================================
   MOVE 4 — LIFE (instanced traffic on the REAL road network)
   roads_bkc.js = 25 real BKC centrelines extracted from osm2.xml.
   ~240 instanced cars, class-weighted speeds, left-hand traffic,
   headlight glow after real sundown (keyed to Move 1's sun).
   ============================================================ */
let trafficOn = true;
let trafficAPI = null;

/* Roads for props + traffic. BKC clients ship a hand-tuned centreline file;
   every other client derives real centrelines from Mapbox's vector tiles so
   the environment (trees, lamps, cars) lives where the map actually is —
   fixes the barren look for Flipkart (Andheri), where BKC_ROADS is 5 km off. */
let _clientRoads = null;
function deriveRoadsFromTiles() {
  try {
    if (!map.getSource("bkc-streets")) return [];
    const feats = map.querySourceFeatures("bkc-streets", { sourceLayer: "road" });
    const clsOf = c => (["motorway", "trunk", "primary"].includes(c) ? 2
      : ["secondary", "tertiary", "street", "road", "primary_link"].includes(c) ? 1 : 0);
    const roads = [], seen = new Set();
    for (const f of feats) {
      const g = f.geometry; if (!g) continue;
      const cls = clsOf(f.properties && f.properties.class);
      const lines = g.type === "LineString" ? [g.coordinates]
        : g.type === "MultiLineString" ? g.coordinates : [];
      for (const pts of lines) {
        if (!pts || pts.length < 2) continue;
        const key = pts[0].join(",") + "|" + pts[pts.length - 1].join(",");
        if (seen.has(key)) continue; seen.add(key);
        roads.push({ name: (f.properties && f.properties.name) || null, cls,
          oneway: (f.properties && f.properties.oneway) === "true", pts });
      }
    }
    return roads;
  } catch (e) { return []; }
}
function resolveClientRoads() {
  const slug = window.CLIENT_SLUG || "vfs-bkc";
  if (slug === "vfs-bkc" && window.BKC_ROADS && window.BKC_ROADS.length)
    return Promise.resolve(window.BKC_ROADS);
  if (_clientRoads) return Promise.resolve(_clientRoads);
  return new Promise(resolve => {
    const grab = () => { const r = deriveRoadsFromTiles(); if (r.length) { _clientRoads = r; resolve(r); return true; } return false; };
    if (grab()) return;
    let tries = 0;
    const iv = setInterval(() => { if (grab() || ++tries > 16) { clearInterval(iv); if (!_clientRoads) resolve([]); } }, 500);
  });
}

async function initTraffic() {
  const ROADS = await resolveClientRoads();
  if (!ROADS || !ROADS.length) { document.getElementById("t-traffic")?.style.setProperty("display", "none"); return; }
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');

  const originLL = MAP_CENTER;
  const originMC = mapboxgl.MercatorCoordinate.fromLngLat(originLL, 0);
  const mScale = originMC.meterInMercatorCoordinateUnits();
  const R = 6378137, latR = originLL[1] * Math.PI / 180;
  const toXY = ll => [
    (ll[0] - originLL[0]) * (Math.PI / 180) * R * Math.cos(latR),
    (ll[1] - originLL[1]) * (Math.PI / 180) * R,
  ];

  const roads = ROADS.map(r => {
    const pts = r.pts.map(toXY);
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { cls: r.cls, oneway: r.oneway, pts, cum, len: cum[cum.length - 1] };
  }).filter(r => r.len > 40);
  if (!roads.length) return;

  const N = 240;
  const weights = roads.map(r => r.len * (r.cls + 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const pickRoad = () => {
    let x = Math.random() * totalW;
    for (let i = 0; i < roads.length; i++) { x -= weights[i]; if (x <= 0) return roads[i]; }
    return roads[roads.length - 1];
  };
  const cars = Array.from({ length: N }, () => {
    const r = pickRoad();
    return {
      r, t: Math.random() * r.len,
      dir: r.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1),
      speed: r.cls === 2 ? 8 + 6 * Math.random() : r.cls === 1 ? 6 + 5 * Math.random() : 3.5 + 3 * Math.random(),
      lane: 2.2 + 1.6 * Math.random(),
    };
  });
  const BODY_COLORS = [0xd8dade, 0x9aa3ad, 0x30343a, 0x7c8894, 0xb8b2a4, 0x5b6672, 0x8f2f2f, 0x274a72];

  const layer = {
    id: "atlas-traffic",
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      const rig = getRig(themeMode);
      this.hemi = new THREE.HemisphereLight(rig.skyColor, rig.groundColor, rig.hemiI);
      this.sun = new THREE.DirectionalLight(rig.sunColor, rig.sunI);
      this.sun.position.set(rig.sunVec[0], rig.sunVec[2], rig.sunVec[1]); // z-up scene
      this.scene.add(this.hemi, this.sun);

      const geo = new THREE.BoxGeometry(4.4, 1.9, 1.5);
      geo.translate(0, 0, 0.9);
      this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15, emissive: 0xffdf9e, emissiveIntensity: 0 });
      this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) this.mesh.setColorAt(i, c.setHex(BODY_COLORS[i % BODY_COLORS.length]));
      this.scene.add(this.mesh);

      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion();
      this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
      this._axis = new THREE.Vector3(0, 0, 1);
      this.lastT = performance.now();

      trafficAPI = {
        setNight: n => { this.mat.emissiveIntensity = n ? 0.5 : 0; },
      };
    },
    render(gl, matrix) {
      const now = performance.now();
      const dt = Math.min(0.06, (now - this.lastT) / 1000);
      this.lastT = now;
      if (!trafficOn) return;

      for (let i = 0; i < N; i++) {
        const car = cars[i];
        car.t += car.speed * dt * car.dir;
        if (car.t > car.r.len) car.t -= car.r.len;
        if (car.t < 0) car.t += car.r.len;
        const { pts, cum } = car.r;
        let s = 1;
        while (s < cum.length - 1 && cum[s] < car.t) s++;
        const segLen = cum[s] - cum[s - 1] || 1;
        const f = (car.t - cum[s - 1]) / segLen;
        let dx = pts[s][0] - pts[s - 1][0], dy = pts[s][1] - pts[s - 1][1];
        const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        if (car.dir < 0) { dx = -dx; dy = -dy; }
        // left-hand traffic: offset to the left of the heading
        const px = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f - dy * car.lane;
        const py = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f + dx * car.lane;
        this._p.set(px, py, 0);
        this._q.setFromAxisAngle(this._axis, Math.atan2(dy, dx));
        this.mesh.setMatrixAt(i, this._m4.compose(this._p, this._q, this._s));
      }
      this.mesh.instanceMatrix.needsUpdate = true;

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(originMC.x, originMC.y, originMC.z)
        .scale(new THREE.Vector3(mScale, -mScale, mScale));
      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      map.triggerRepaint();
    },
  };
  map.addLayer(layer);
  console.log(`[Atlas] Traffic engine: ${N} vehicles on ${roads.length} real OSM roads`);
}

/* ============================================================
   MOVE 5 — THE WORLD CONSTRUCTS ITSELF
   Every option building rises from its plot, staggered; the GLB grows in
   (see addGltfModel). The first 4 seconds ARE the pitch.
   ============================================================ */
const constructTargets = [];
function constructWorld() {
  const ease = t => 1 - Math.pow(1 - t, 3);
  constructTargets.forEach((c, i) => {
    const start = performance.now() + 400 + i * 140, dur = 950;
    const step = now => {
      const t = (now - start) / dur;
      if (t < 0) { requestAnimationFrame(step); return; }
      const k = ease(Math.min(1, t));
      try { map.setPaintProperty(c.layerId, "fill-extrusion-height", Math.max(0.01, c.h * k)); }
      catch (e) { return; }
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* Injected CSS for the new chrome (weather chip + filter panel) */
function injectMoveCSS() {
  const s = document.createElement("style");
  s.textContent = `
  #wx-chip{display:flex;align-items:center;gap:6px;margin-left:14px;padding:5px 11px;border-radius:20px;
    background:var(--panel);border:1px solid var(--line);font-size:11px;color:var(--mut);backdrop-filter:blur(8px)}
  #wx-chip .wx-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);
    box-shadow:0 0 8px var(--acc);animation:wxPulse 2.4s ease-in-out infinite}
  @keyframes wxPulse{0%,100%{opacity:1}50%{opacity:.35}}
  #fl-panel{display:none;position:fixed;right:56px;bottom:16px;width:252px;z-index:17;
    background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:14px 16px;
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 16px 48px rgba(0,0,0,.4)}
  #fl-panel h4{margin:0 0 12px;font-size:11px;letter-spacing:.6px;color:var(--aqua)}
  #fl-panel .fl-row{margin-bottom:12px}
  #fl-panel label{display:block;font-size:11px;color:var(--mut);margin-bottom:5px}
  #fl-panel label b{color:#fff;float:right}
  #fl-panel input[type=range]{width:100%;accent-color:var(--acc)}
  .fl-chips{display:flex;gap:6px}
  .fl-chip{flex:1;text-align:center;font-size:11px;font-weight:700;padding:5px 0;border-radius:7px;cursor:pointer;
    background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--mut);transition:.15s}
  .fl-chip.on{background:var(--acc);color:#04150c;border-color:var(--acc)}
  .fl-check{display:flex;align-items:center;gap:8px;cursor:pointer}
  .fl-check input{accent-color:var(--acc)}
  .lb-row.lb-fail{opacity:.38}
  .lb-row.lb-fail .lb-rank{background:rgba(209,73,91,.25);color:#ff9aa6}
  /* cinematic shot-switcher rail */
  #shotbar{position:fixed;left:50%;bottom:56px;transform:translateX(-50%) translateY(24px);z-index:18;
    display:flex;gap:6px;padding:6px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(0,0,0,.45);
    opacity:0;pointer-events:none;transition:opacity .35s,transform .35s cubic-bezier(.2,.8,.2,1)}
  #shotbar.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0)}
  #shotbar .shot{background:transparent;border:1px solid transparent;color:var(--mut);font:inherit;font-size:12px;
    font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;transition:.15s;white-space:nowrap}
  #shotbar .shot:hover{color:#fff;background:rgba(255,255,255,.06)}
  #shotbar .shot.on{background:var(--acc);color:#04150c;border-color:var(--acc)}`;
  document.head.appendChild(s);
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

/** Ground-truth anchor for a db building: the OSM footprint centroid when the
    name match lives far from the workbook coordinate (OSM wins in a twin),
    otherwise the workbook coordinate. matchResults fills in after
    addExtrusionLayers runs; late callers (clicks, polls) are safe. */
function buildingAnchor(b) {
  const m = matchResults[b.id];
  if (m && m.feature && m.dist > 60) return polygonCentroid(m.feature.geometry.coordinates[0]);
  return [b.lng, b.lat];
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

