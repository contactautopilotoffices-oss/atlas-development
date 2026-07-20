/* ============================================================================
   FLIPKART ANDHERI EAST — DATA LAYER
   Source of truth: "Tech - Flipkart options" inventory PDF (Autopilot / Worksquare).
   All carpet areas, floors, condition, possession & station distances are
   verbatim from that PDF. Seats = carpet ÷ 55 sqft (4×2 workstation layout,
   incl. meeting/cafe/circulation) for a ~220-seat requirement (~12,100 sqft).

   TIERS (no numeric scoring — categorical, per client's ask):
     BEST FIT        = contiguous/single block ≥220 seats AND ≤2 hops from
                       Central Line (Ghatkopar → Metro L1)
     WORKABLE        = 2 hops but single-plate-only or <220 seats as offered
     NOT RECOMMENDED = Line 3 station = 3rd hop (commute stress compounds) or
                       fails both filters

   HONESTY NOTES:
   - "Marol Metro Station" for Vaman/Vedanta is ambiguous in the PDF between
     Marol Naka (L1) and the Aqua stop — treated as Marol Naka L1; VERIFY.
   - 723 Avenue & Fulcrum footprints are generated boxes (not in OSM yet).
   - Hop counts assume Central Line → Ghatkopar interchange → Metro Line 1.
   ============================================================================ */

const WEIGHTS = { contiguity: 0.4, connectivity: 0.4, readiness: 0.2 }; // qualitative, not scored

const FIT_COLORS = {
  "BEST FIT":        "#2fbf71",
  "WORKABLE":        "#f0a020",
  "NOT RECOMMENDED": "#d1495b"
};

/* score = SEATS at 4×2 density (real capacity, not an index).
   bar   = seat capacity vs the 220-seat requirement, capped at 100. */
const REQ_SEATS = 220;
function seatBar(s){ return Math.min(100, Math.round(s / (REQ_SEATS*1.25) * 100)); }

const OPTIONS = [
  { rank:1, bldg:"vedanta", unit:"Vedanta — 3rd + 4th Flr (contiguous)", floor:"3rd+4th", furn:"Furnished",
    carpet:12980, charge:20768, eff:0.62, parking:"6 + 5",
    poss:"Immediate", aqua:0.19, score:236, scoreLabel:"236 seats", bar:seatBar(236), fit:"BEST FIT", hops:2,
    note:"Two CONTIGUOUS furnished floors = 236 seats at 4×2, move-in ready, 190 m from the metro. The pragmatic winner. (Verify: PDF says 'Marol Metro' — assumed Marol Naka L1.)" },
  { rank:2, bldg:"avenue723", unit:"723 Avenue — 12th + 13th Flr (contiguous)", floor:"12th+13th", furn:"Bare-shell",
    carpet:14500, charge:14500, eff:1.0, parking:"1:1000 chargeable",
    poss:"OC expected Jun 2026", aqua:0.70, score:263, scoreLabel:"263 seats", bar:seatBar(263), fit:"BEST FIT", hops:2,
    note:"Brand-new tower, top-2 contiguous floors, most headroom (263 seats). Bare-shell = fit-out lead time after OC. Footprint approximate (building too new for OSM)." },
  { rank:3, bldg:"corporate", unit:"Corporate Avenue — 3rd + 4th Flr (contiguous)", floor:"3rd+4th", furn:"Warm-shell",
    carpet:12414, charge:12414, eff:1.0, parking:"5",
    poss:"Aug & Oct 2026 (staggered)", aqua:0.85, score:225, scoreLabel:"225 seats", bar:seatBar(225), fit:"BEST FIT", hops:2,
    note:"Contiguous pair on Chakala (L1, 2 hops). Staggered possession = phased occupancy; 225 seats is a fit with slim headroom." },
  { rank:4, bldg:"technopolis", unit:"Technopolis Knowledge Park — 2nd Flr", floor:"2nd", furn:"T.B.D",
    carpet:12600, charge:21000, eff:0.60, parking:"T.B.D",
    poss:"T.B.D", aqua:0.90, score:229, scoreLabel:"229 seats", bar:seatBar(229), fit:"WORKABLE", hops:2,
    note:"Whole team on ONE plate (229 seats) — upgrade candidate to Best Fit once condition & possession are verified. Both are T.B.D in the proposal." },
  { rank:5, bldg:"vaman", unit:"Vaman Techno Centre — 3rd Flr", floor:"3rd", furn:"Bare-shell",
    carpet:12314, charge:19700, eff:0.63, parking:"7",
    poss:"Immediate", aqua:0.50, score:223, scoreLabel:"223 seats", bar:seatBar(223), fit:"WORKABLE", hops:2,
    note:"Single plate fits 223 seats — just 1.5% headroom over the 220 ask, zero expansion room. Immediate but bare-shell." },
  { rank:6, bldg:"timessquare", unit:"Times Square — 8th Flr (4 units)", floor:"8th", furn:"Semi-furnished",
    carpet:10025, charge:10025, eff:1.0, parking:"—",
    poss:"Aug 2026 (negotiable)", aqua:0.40, score:182, scoreLabel:"182 seats", bar:seatBar(182), fit:"WORKABLE", hops:2,
    note:"Four combined units total 10,025 sqft = 182 seats — 38 short of the ask. Marquee address, good metro walk; undersized as offered." },
  { rank:7, bldg:"landmark", unit:"Landmark — 4th Flr", floor:"4th", furn:"Bare-shell",
    carpet:10000, charge:10000, eff:1.0, parking:"10",
    poss:"Jul 2026", aqua:0.048, score:181, scoreLabel:"181 seats", bar:seatBar(181), fit:"WORKABLE", hops:2,
    note:"48 m from WEH station — best door-to-metro in the set. But 181 seats ≈ 40 short; works only if headcount phases down." },
  { rank:8, bldg:"ackruti", unit:"Ackruti Centre Point — 5th Flr", floor:"5th", furn:"Old furnished",
    carpet:21000, charge:35000, eff:0.60, parking:"T.B.D",
    poss:"After 3 months", aqua:0.35, score:381, scoreLabel:"381 seats", bar:100, fit:"NOT RECOMMENDED", hops:3,
    note:"Biggest single plate in the set (381 seats, whole org on one floor) — but MIDC is Line 3: Central Line riders need a 3rd hop, daily, both ways. Commute stress compounds over a lease; rejected on the client's own rule. Revisit only if the 2-hop cap flexes." },
  { rank:9, bldg:"fulcrum", unit:"Fulcrum — 1st Flr", floor:"1st", furn:"Old furnished",
    carpet:11700, charge:18000, eff:0.65, parking:"7",
    poss:"Immediate", aqua:0.90, score:212, scoreLabel:"212 seats", bar:seatBar(212), fit:"NOT RECOMMENDED", hops:3,
    note:"Fails both filters: 212 seats (8 short) AND Sahar Road is Line 3 = 3 hops. Airport-hotel belt address doesn't offset the daily commute." }
];

/* ---------------------------------------------------------------------------
   BUILDINGS — geocoded + footprint-snapped coordinates (see geo.js).
   stnLng/stnLat/stnName = each building's own nearest station for the
   walking-route overlay. hops = interchanges from the Central Line.
--------------------------------------------------------------------------- */
const GEO_ORIGIN = { lat: 19.111, lon: 72.869 };
function lngToMercX(lon){ return lon/360 + 0.5; }
function latToMercY(lat){ return 0.5 - Math.log(Math.tan(Math.PI/4 + (lat*Math.PI)/360))/(2*Math.PI); }
const _omx = lngToMercX(GEO_ORIGIN.lon), _omy = latToMercY(GEO_ORIGIN.lat);
const MER_SCALE = 1/(40075016.68*Math.cos(GEO_ORIGIN.lat*Math.PI/180));
function geoToMeters(lat, lon){
  return { lat, lng: lon, x:(lngToMercX(lon)-_omx)/MER_SCALE, z:(latToMercY(lat)-_omy)/MER_SCALE };
}

const ST = {
  weh:      { lng:72.85465, lat:19.10720, name:"WEH (Line 1)" },
  chakala:  { lng:72.86735, lat:19.11091, name:"Chakala J B Nagar (Line 1)" },
  airport:  { lng:72.87441, lat:19.10935, name:"Airport Road (Line 1)" },
  marolnaka:{ lng:72.87949, lat:19.10816, name:"Marol Naka (Line 1 · L3 interchange)" },
  midc:     { lng:72.87593, lat:19.11961, name:"MIDC (Line 3 — 3rd hop)" },
  sahar:    { lng:72.86209, lat:19.09861, name:"Sahar Road (Line 3 — 3rd hop)" },
};
function stn(s){ return { stnLng:s.lng, stnLat:s.lat, stnName:s.name }; }

const BUILDINGS = [
  { id:"vedanta", name:"Vedanta", block:"Marol", isOption:true, type:"tower",
    ...geoToMeters(19.10945, 72.88010), ...stn(ST.marolnaka), w:46, d:40, h:24, floors:7, color:0x2fbf71, aqua:0.19,
    bandra:2, busStops:"Marol Naka", busRoutes:"Central Line → Ghatkopar → L1 to Marol Naka (2 hops)",
    tenants:"Furnished G+6 on Andheri–Kurla Rd; two contiguous floors on offer, immediate possession.",
    posh:["Marol Naka food street","Andheri–Kurla Rd frontage"],
    grade:"A", gradeNote:"Move-in-ready contiguous block 190 m from the station — the pragmatic winner." },
  { id:"avenue723", name:"723 Avenue", block:"Marol Naka", isOption:true, type:"tower",
    ...geoToMeters(19.10730, 72.88320), ...stn(ST.marolnaka), w:34, d:26, h:52, floors:16, color:0x2fbf71, aqua:0.70,
    bandra:2, busStops:"Marol Naka", busRoutes:"Central Line → Ghatkopar → L1 to Marol Naka (2 hops)",
    tenants:"New G+15 tower, OC expected Jun 2026; top-2 contiguous floors on offer.",
    posh:["Marol Naka","Town Centre retail"],
    grade:"A+", gradeNote:"Newest stock in the set with the most seat headroom; bare-shell fit-out to plan." },
  { id:"corporate", name:"Corporate Avenue", block:"Chakala", isOption:true, type:"slab",
    ...geoToMeters(19.11406, 72.86315), ...stn(ST.chakala), w:50, d:34, h:30, floors:9, color:0x2fbf71, aqua:0.85,
    bandra:2, busStops:"Chakala J B Nagar", busRoutes:"Central Line → Ghatkopar → L1 to Chakala (2 hops)",
    tenants:"Warm-shell contiguous pair (3rd+4th), staggered Aug/Oct 2026 possession.",
    posh:["Chakala junction plazas","WEH access"],
    grade:"A", gradeNote:"Contiguous pair on Line 1 with phased-occupancy option." },
  { id:"technopolis", name:"Technopolis Knowledge Park", block:"Mahakali Caves Rd", isOption:true, type:"slab",
    ...geoToMeters(19.11940, 72.86840), ...stn(ST.chakala), w:54, d:30, h:24, floors:7, color:0xf0a020, aqua:0.90,
    bandra:2, busStops:"Chakala J B Nagar", busRoutes:"Central Line → Ghatkopar → L1 to Chakala (2 hops)",
    tenants:"12,600 sqft single plate — whole team on one floor; condition & possession T.B.D.",
    posh:["Mahakali Caves Rd cafés","MIDC office belt"],
    grade:"A", gradeNote:"One-plate-for-everyone candidate — verify condition and possession to promote." },
  { id:"vaman", name:"Vaman Techno Centre", block:"Marol Makwana Rd", isOption:true, type:"block",
    ...geoToMeters(19.10693, 72.87954), ...stn(ST.marolnaka), w:40, d:30, h:27, floors:8, color:0xf0a020, aqua:0.50,
    bandra:2, busStops:"Marol Naka", busRoutes:"Central Line → Ghatkopar → L1 (2 hops)",
    tenants:"Single 12,314 sqft plate, immediate, bare-shell.",
    posh:["Marol Makwana Rd","Marol Naka food street"],
    grade:"B+", gradeNote:"Fits the ask with almost zero headroom — no expansion runway." },
  { id:"timessquare", name:"Times Square", block:"Andheri–Kurla Rd", isOption:true, type:"slab",
    ...geoToMeters(19.10990, 72.87840), ...stn(ST.marolnaka), w:60, d:36, h:46, floors:14, color:0xf0a020, aqua:0.40,
    bandra:2, busStops:"Marol Naka", busRoutes:"Central Line → Ghatkopar → L1 (2 hops)",
    tenants:"Marquee glass frontage; 8th-floor combination of four units totals 10,025 sqft.",
    posh:["Andheri–Kurla Rd corporate strip"],
    grade:"A", gradeNote:"Strong address, undersized for 220 as offered (182 seats)." },
  { id:"landmark", name:"Landmark", block:"WEH", isOption:true, type:"block",
    ...geoToMeters(19.10758, 72.85504), ...stn(ST.weh), w:44, d:30, h:36, floors:11, color:0xf0a020, aqua:0.048,
    bandra:2, busStops:"WEH station (48 m)", busRoutes:"Central Line → Ghatkopar → L1 to WEH (2 hops)",
    tenants:"G+10 beside the WEH station — best door-to-metro walk in the set (48 m).",
    posh:["WEH junction","Highway frontage"],
    grade:"B+", gradeNote:"Unbeatable station proximity; 181 seats caps it below the ask." },
  { id:"ackruti", name:"Ackruti Centre Point", block:"MIDC", isOption:true, type:"slab",
    ...geoToMeters(19.11730, 72.87095), ...stn(ST.midc), w:36, d:28, h:26, floors:8, color:0xd1495b, aqua:0.35,
    bandra:3, busStops:"MIDC (Line 3)", busRoutes:"Central Line → Ghatkopar → L1 → Marol Naka → L3 to MIDC (3 HOPS)",
    tenants:"21,000 sqft single plate — largest in the set; old-furnished, ~3 months.",
    posh:["MIDC Central Rd","SEEPZ belt"],
    grade:"A", gradeNote:"Biggest floor plate in the set — rejected on the 3-hop commute rule, not on space." },
  { id:"fulcrum", name:"Fulcrum", block:"Sahar Rd", isOption:true, type:"block",
    ...geoToMeters(19.10310, 72.86560), ...stn(ST.sahar), w:40, d:30, h:33, floors:10, color:0xd1495b, aqua:0.90,
    bandra:3, busStops:"Sahar Road (Line 3)", busRoutes:"Central Line → Ghatkopar → L1 → Marol Naka → L3 (3 HOPS)",
    tenants:"Airport-hotel belt address next to the Hyatt cluster; 11,700 sqft, immediate.",
    posh:["Sahar hotel belt (JW, Hyatt)","T2 approach"],
    grade:"B+", gradeNote:"Undersized AND a 3-hop commute — fails both client filters." },

  // ---- Context landmarks (not selectable) ----
  { id:"marolnaka_stn", name:"Marol Naka Station (L1 × L3)", block:"Marol", type:"slab",
    ...geoToMeters(19.10816, 72.87949), w:60, d:20, h:12, floors:2, color:0x14b8c4 },
  { id:"weh_stn", name:"WEH Station (L1)", block:"WEH", type:"slab",
    ...geoToMeters(19.10720, 72.85465), w:60, d:20, h:12, floors:2, color:0x14b8c4 },
  { id:"chakala_stn", name:"Chakala Station (L1)", block:"Chakala", type:"slab",
    ...geoToMeters(19.11091, 72.86735), w:60, d:20, h:12, floors:2, color:0x14b8c4 },
];

/* ---------------------------------------------------------------------------
   METRO — Line 1 (the 2-hop lifeline) + Line 3 segment (the 3rd hop).
   Alignments are indicative for visualization; stations are placed accurately.
--------------------------------------------------------------------------- */
const METRO = {
  aqua: {
    name:"Metro Line 1 — Versova–Ghatkopar (Blue)",
    color:0x14b8c4, status:"OPERATIONAL — the 2-hop lifeline",
    statusNote:"Central Line employees ride to Ghatkopar, interchange once to Line 1, and reach every green/amber option. That's the 2-hop budget: Central→Ghatkopar (hop 1), L1 to the office station (hop 2).",
    path:[[ -1500,-300 ]],
    stations:[ {name:"Marol Naka — L1 × L3 interchange", x:1100, z:320, interchange:true} ]
  },
  yellow: {
    name:"Metro Line 3 — Aqua (SEEPZ–MIDC–Sahar segment)",
    color:0xf2c200, status:"OPERATIONAL — but a 3rd hop for Central Line riders",
    statusNote:"MIDC (Ackruti) and Sahar Road (Fulcrum) sit on Line 3. Reaching them from the Central Line means a second interchange at Marol Naka — hop 3. Daily, both ways: this is the commute-stress line.",
    path:[[600,-900]],
    stations:[ {name:"MIDC (L3)", x:730, z:-940}, {name:"Sahar Road (L3)", x:-720, z:1370} ]
  }
};

/* Food circles, plazas & hubs — the "what clicks" layer */
const NEIGHBORHOODS = [
  { name:"Marol Naka food street", ...geoToMeters(19.1073,72.8810), tag:"Khau gali · lunch crowd" },
  { name:"Sahar hotel belt — JW · Hyatt", ...geoToMeters(19.0995,72.8655), tag:"Client dinners · airport 10 min" },
  { name:"MIDC / SEEPZ office belt", ...geoToMeters(19.1215,72.8735), tag:"Tech & IT cluster" },
  { name:"Chakala junction plazas", ...geoToMeters(19.1105,72.8620), tag:"Retail & quick-service" },
  { name:"Mahakali Caves Rd cafés", ...geoToMeters(19.1250,72.8640), tag:"Cafés & casual dining" }
];

const RIVER_PATH = [];

const META = {
  client:"Flipkart",
  business:"Tech office — ~220 seats on 4×2 workstations (~55 sqft/seat → ~12,100 sqft)",
  brief:"Contiguous or single-plate block for 220 · ≤2 metro hops from the Central Line (via Ghatkopar → Line 1) · Line 3 = 3rd hop = downgrade · amenities: metro walk, food circles, plazas",
  prepared:"Autopilot Offices · Andheri East inventory (Worksquare proposal)",
  winner:"vedanta"
};

window.BKC = { WEIGHTS, FIT_COLORS, OPTIONS, BUILDINGS, METRO, NEIGHBORHOODS, RIVER_PATH, META };
