/* ============================================================================
   BKC DIGITAL TWIN — DATA LAYER
   Source of truth: VFS_BKC_Options_Ranked.xlsx (Autopilot Offices, 15 Jul 2026)
   + BKC Connectivity Snapshot (same workbook) + Mumbai Metro public data.

   HONESTY NOTE (per Fable-5 guide): geometry is geographically APPROXIMATE,
   not a survey-exact replica. Positions are stylised to read clearly in 3D.
   All commercial figures below are copied verbatim from the ranked workbook.
   Swap the OPTIONS array when the live availability list changes.
   ============================================================================ */

// Scoring weights from the workbook (row 2 of "Ranked Options").
const WEIGHTS = { floor: 0.35, area: 0.30, connectivity: 0.20, possession: 0.15 };

// Fit colours (workbook legend: green / amber / rust)
const FIT_COLORS = {
  "MEETS BRIEF": "#2fbf71",
  "PARTIAL":     "#f0a020",
  "MISSES BRIEF":"#d1495b"
};

/* ---------------------------------------------------------------------------
   OPTIONS — the 13 ranked VFS options. `bldg` links units to a 3D building.
   x,z = plan position in metres (x = east, z = south). Multiple units share a
   building (e.g. The Capital has 3 stacked 1st-floor units).
--------------------------------------------------------------------------- */
const OPTIONS = [
  { rank:1, bldg:"capital", unit:"The Capital — 1st Flr (2,025 cpt)", floor:"1st", furn:"Furnished (as-is)",
    carpet:2025, charge:3035, eff:0.667, rent:"₹400/sqft chg + CAM actuals", parking:"2 (addl. cost TBD)",
    poss:"Immediate", aqua:1.6, score:9.2, fit:"MEETS BRIEF",
    note:"Only building with multiple units that meet BOTH floor and area asks." },
  { rank:2, bldg:"capital", unit:"The Capital — 1st Flr (1,453 cpt)", floor:"1st", furn:"Furnished (as-is)",
    carpet:1453, charge:2180, eff:0.667, rent:"₹370/sqft chg + CAM actuals", parking:"1 (addl. cost TBD)",
    poss:"Immediate", aqua:1.6, score:9.2, fit:"MEETS BRIEF",
    note:"Smallest unit — confirm VFS headcount + waiting-area need fits 1,453 sqft." },
  { rank:3, bldg:"capital", unit:"The Capital — 1st Flr (1,660 cpt)", floor:"1st", furn:"Warm-shell",
    carpet:1660, charge:2536, eff:0.655, rent:"Post inspection (unquoted)", parking:"Post inspection",
    poss:"Immediate", aqua:1.6, score:9.2, fit:"MEETS BRIEF",
    note:"Rent unquoted — cannot be pitched until landlord quotes; keep as backup." },
  { rank:4, bldg:"naman", unit:"Naman Centre — 1st Flr", floor:"1st", furn:"Furnished (as-is)",
    carpet:3100, charge:4900, eff:0.633, rent:"₹347/sqft chg (CAM incl.)", parking:"5 incl. in rent",
    poss:"Immediate", aqua:1.4, score:8.68, fit:"PARTIAL",
    note:"True office carpet 2,559 sqft; 550 sqft terrace loaded into 3,100. If client accepts terrace loading, effective area nearly fits." },
  { rank:5, bldg:"parinee", unit:"Parinee Crescenzo — Ground (carved 3,125 cpt)", floor:"Ground", furn:"Warm-shell",
    carpet:3125, charge:4688, eff:0.667, rent:"₹450/sqft chg + CAM actuals", parking:"1:100 on carpet",
    poss:"Immediate", aqua:1.5, score:8.65, fit:"PARTIAL",
    note:"ONLY ground-floor option. Min carve 3,125 cpt = 25% over cap — needs client waiver. Best walk-in visibility." },
  { rank:6, bldg:"adani", unit:"Adani Inspire — 1st Flr", floor:"1st", furn:"Furnished (as-is)",
    carpet:3190, charge:5264, eff:0.606, rent:"₹390/sqft chg + CAM actuals", parking:"1:1200 cpt, ₹15k/car addl.",
    poss:"Immediate", aqua:1.3, score:8.56, fit:"PARTIAL",
    note:"28% over area cap; furnished but oversized for the 2,500 sqft mandate." },
  { rank:7, bldg:"vaibhav", unit:"Vaibhav Chambers — 5th Flr", floor:"5th", furn:"Furnished (24 WS + cabins)",
    carpet:2346, charge:3636, eff:0.645, rent:"₹300/sqft chg (CAM incl.)", parking:"2 car parks",
    poss:"Immediate", aqua:0.1, score:7.55, fit:"PARTIAL",
    note:"Area fits and it is 0.1 km from BKC Aqua station — but 5th floor defeats the walk-in requirement." },
  { rank:8, bldg:"adani", unit:"Adani Inspire — 2nd Flr", floor:"2nd", furn:"Bare-shell",
    carpet:3543, charge:5847, eff:0.606, rent:"₹390/sqft chg + CAM actuals", parking:"1:1200 cpt",
    poss:"Immediate", aqua:1.3, score:6.74, fit:"MISSES BRIEF",
    note:"Fails floor and area asks; bare-shell adds fit-out time before walk-ins can start." },
  { rank:9, bldg:"laxmi", unit:"Laxmi Towers — 2nd Flr", floor:"2nd", furn:"Bare-shell",
    carpet:3750, charge:5000, eff:0.75, rent:"₹280/sqft chg + CAM actuals", parking:"1:1250 on chg",
    poss:"Immediate", aqua:1.8, score:6.3, fit:"MISSES BRIEF",
    note:"Cheapest headline rent but bare-shell + 50% over area cap; 75% efficiency." },
  { rank:10, bldg:"vibgyor", unit:"Vibgyor Tower — 5th Flr", floor:"5th", furn:"Furnished (15 WS + cabins)",
    carpet:3497, charge:5828, eff:0.60, rent:"₹350/sqft chg + CAM ₹25", parking:"—",
    poss:"Immediate", aqua:1.5, score:5.75, fit:"MISSES BRIEF",
    note:"40% over area cap and 5th floor; 60% efficiency is the worst of the set." },
  { rank:11, bldg:"onebkc", unit:"One BKC — 14th Flr", floor:"14th", furn:"Furnished (data partly redacted)",
    carpet:2206, charge:3309, eff:0.667, rent:"₹475/sqft chg + CAM actuals", parking:"—",
    poss:"Aug 2026", aqua:1.3, score:5.65, fit:"PARTIAL",
    note:"Area fits, but a 14th-floor unit with Aug-2026 possession contradicts nearly every requirement; also the costliest." },
  { rank:12, bldg:"adani", unit:"Adani Inspire — 3rd Flr", floor:"3rd", furn:"Bare-shell",
    carpet:5503, charge:9081, eff:0.606, rent:"₹390/sqft chg + CAM actuals", parking:"1:1200 cpt",
    poss:"Immediate", aqua:1.3, score:4.65, fit:"MISSES BRIEF",
    note:"120% over area cap — do not pitch for this mandate." },
  { rank:13, bldg:"pittie", unit:"Pittie Chambers — 3rd Flr", floor:"3rd", furn:"Furnished",
    carpet:4529, charge:4529, eff:1.0, rent:"₹375/sqft chg (CAM incl.)", parking:"4 car parks",
    poss:"Immediate", aqua:4.0, score:4.22, fit:"MISSES BRIEF",
    note:"4 km from BKC Aqua station — effectively outside the BKC core; 100% efficiency is the one positive." }
];

/* ---------------------------------------------------------------------------
   BUILDINGS — 3D placement + per-building connectivity (from Connectivity sheet).
   isOption:true buildings are selectable "properties". Others are context/landmarks.
   type drives the mesh builder in app.js.
--------------------------------------------------------------------------- */
const BUILDINGS = [
  // ---- VFS option buildings (G-Block core + fringe) ----
  { id:"capital", name:"The Capital", block:"G Block", isOption:true, type:"oval",
    x:-40, z:40, w:80, d:52, h:96, floors:19, color:0x9fd8b8,
    bandra:3.4, busStops:"Bharat Diamond Bourse / ICICI Bank BKC",
    busRoutes:"303, 310, A-310, 187, A-22, S-102, C-505 + BKC AC shuttles",
    tenants:"Grade-A tower by James Law Cybertecture; curved green-glass 'intelligent building'.",
    posh:["Bandra West / Bandstand","BKC G-Block financial core","Diamond Bourse"],
    grade:"A+", gradeNote:"Iconic curved-glass landmark; among BKC's most photographed addresses." },

  { id:"naman", name:"Naman Centre", block:"G Block", isOption:true, type:"tower",
    x:-150, z:-30, w:52, d:52, h:86, floors:18, color:0xbfc9d6,
    bandra:3.3, busStops:"Naman Center BKC / Bank of India BKC (named stop at door)",
    busRoutes:"187 + BKC AC shuttle routes",
    tenants:"Corporate tower, named BEST stop at the door.",
    posh:["Bandra West","G-Block core"],
    grade:"A", gradeNote:"Established Grade-A corporate address, well-run building management." },

  { id:"parinee", name:"Parinee Crescenzo", block:"G Block", isOption:true, type:"slab",
    x:60, z:-120, w:46, d:58, h:158, floors:21, color:0xa9c4d8,
    bandra:3.3, busStops:"Crescenzo / MCA Complex BKC (named stop at door)",
    busRoutes:"187 + BKC AC shuttle routes via MCA–Trident loop",
    tenants:"Tall G-Block tower overlooking the MCA ground; best ground-floor frontage.",
    posh:["MCA Recreation Ground","G-Block core","Bandra West"],
    grade:"A+", gradeNote:"Newest tall-tower stock in G-Block; premium ground-floor retail frontage." },

  { id:"adani", name:"Adani Inspire", block:"G Block", isOption:true, type:"tower",
    x:210, z:-70, w:58, d:58, h:118, floors:20, color:0xcdd3da,
    bandra:3.3, busStops:"MCA Complex / Bank of Baroda BKC",
    busRoutes:"187 + BKC AC shuttles",
    tenants:"Large-floor-plate tower (formerly Inspire BKC).",
    posh:["MCA Ground","G-Block core"],
    grade:"A+", gradeNote:"Large efficient floor plates under Adani stewardship; institutional-grade specs." },

  { id:"laxmi", name:"Laxmi Towers", block:"G Block", isOption:true, type:"twin",
    x:-190, z:120, w:60, d:40, h:74, floors:14, color:0xc7ccd2,
    bandra:3.4, busStops:"Laxmi Tower BKC (named stop at door)",
    busRoutes:"187, BKC-9/10/11/14 AC routes via Diamond Market",
    tenants:"Twin-block office address near Diamond Market.",
    posh:["Diamond Market","G-Block"],
    grade:"B+", gradeNote:"Older G-Block stock; bare-shell floors need fit-out investment." },

  { id:"onebkc", name:"One BKC", block:"G Block", isOption:true, type:"tower",
    x:150, z:60, w:56, d:56, h:132, floors:20, color:0x8fb4d9,
    bandra:3.2, busStops:"Diamond Market / ICICI Bank BKC",
    busRoutes:"303, 310, A-310, 187, A-22, S-102",
    tenants:"Premium blue-glass Grade-A tower; marquee BKC tenants.",
    posh:["ICICI Bank BKC","Diamond Market","Bandra West"],
    grade:"A+", gradeNote:"Marquee blue-glass tower with top-tier anchor tenants; highest quoted rent in the set." },

  { id:"vaibhav", name:"Vaibhav Chambers", block:"E Block", isOption:true, type:"tower",
    x:330, z:-210, w:48, d:48, h:60, floors:10, color:0xd0d6dc,
    bandra:2.4, busStops:"MMRDA / Family Court BKC",
    busRoutes:"303, A-310, C-505, C-54, 310",
    tenants:"Closest to the Aqua Line — 0.1 km / ~2 min walk to BKC station.",
    posh:["Aqua Line BKC station","MMRDA","Family Court"],
    grade:"A", gradeNote:"Solid Grade-A E-Block stock; unbeatable metro-door proximity." },

  { id:"vibgyor", name:"Vibgyor Tower", block:"C Block", isOption:true, type:"tower",
    x:-150, z:270, w:50, d:50, h:80, floors:16, color:0xd6c9b6,
    bandra:3.6, busStops:"Hotel Trident BKC / Bharat Diamond Bourse",
    busRoutes:"187 + BKC AC shuttles",
    tenants:"Office tower beside the Trident hotel cluster.",
    posh:["Trident BKC","Sofitel BKC"],
    grade:"A", gradeNote:"Good Grade-A specs, but lowest space-efficiency (60%) of the whole set." },

  { id:"pittie", name:"Pittie Chambers", block:"Outside BKC core (~4 km)", isOption:true, type:"tower",
    x:640, z:420, w:44, d:44, h:56, floors:9, color:0xb9a48c,
    bandra:5.7, busStops:"Outside BKC stop cluster — verify locally",
    busRoutes:"N/A — outside BKC core",
    tenants:"Fort/CSMT-side address, ~4 km from BKC Aqua — outside the core the client asked for.",
    posh:["Outside BKC core"],
    grade:"B", gradeNote:"Older Fort-area commercial stock; 100% efficiency but well outside the BKC micro-market." },

  // ---- Context landmarks (not selectable options) ----
  { id:"jio", name:"Jio World Convention Centre", block:"G Block", type:"convention",
    x:70, z:210, w:150, d:110, h:44, color:0xe8e2d6 },
  { id:"jiocentre", name:"Jio World Centre", block:"G Block", type:"tower",
    x:180, z:250, w:60, d:60, h:150, color:0xbfc6cf },
  { id:"nse", name:"NSE — Exchange Plaza", block:"G Block", type:"block",
    x:-70, z:-180, w:70, d:60, h:58, color:0xc4cad1 },
  { id:"sebi", name:"SEBI Bhavan", block:"G Block", type:"block",
    x:100, z:-210, w:56, d:56, h:52, color:0xccd2d8 },
  { id:"icici", name:"ICICI Bank BKC", block:"G Block", type:"block",
    x:-230, z:-70, w:60, d:52, h:70, color:0xd08a6a },
  { id:"bob", name:"Bank of Baroda", block:"G Block", type:"block",
    x:270, z:70, w:54, d:48, h:62, color:0xd0a86a },
  { id:"consulate", name:"U.S. Consulate General", block:"G Block", type:"secure",
    x:-270, z:180, w:90, d:70, h:22, color:0xd8d2c4 },
  { id:"diamond", name:"Bharat Diamond Bourse", block:"E Block", type:"complex",
    x:360, z:220, w:150, d:120, h:40, color:0xd6cec0 },
  { id:"trident", name:"Trident BKC", block:"C Block", type:"hotel",
    x:-120, z:290, w:50, d:44, h:96, color:0xcbb79a },
  { id:"sofitel", name:"Sofitel Mumbai BKC", block:"C Block", type:"hotel",
    x:-40, z:330, w:48, d:44, h:88, color:0xc9b090 },
  { id:"school", name:"Dhirubhai Ambani Intl School", block:"C Block", type:"block",
    x:-310, z:-180, w:80, d:60, h:26, color:0xd6d0c2 },
  { id:"mca", name:"MCA / Family Court", block:"E Block", type:"block",
    x:290, z:-270, w:70, d:60, h:24, color:0xbcd4b0 },
  { id:"mmrda", name:"MMRDA Office", block:"E Block", type:"block",
    x:400, z:-160, w:56, d:50, h:48, color:0xccd2d8 }
];

/* ---------------------------------------------------------------------------
   METRO LINES — track polylines (x,z) + stations. Tracks drawn ELEVATED for
   visual clarity (per brief). NOTE: the real Aqua Line BKC station is
   UNDERGROUND; this is flagged in the metro card so the pitch stays honest.
--------------------------------------------------------------------------- */
const METRO = {
  aqua: {
    name:"Aqua Line — Metro Line 3",
    color:0x14b8c4, status:"OPERATIONAL",
    statusNote:"Fully open Cuffe Parade–Aarey JVLR. BKC station (underground, E-Block, near NSE) opened Oct 2024; full line Oct 2025. Peak frequency ~7 min. This is the connectivity headline.",
    path:[[430,-560],[400,-440],[375,-320],[360,-230],[330,-90],[300,60],[270,230],[250,420]],
    stations:[ {name:"BKC (Aqua) — Line 3", x:360, z:-230, interchange:true} ]
  },
  yellow: {
    name:"Yellow Line — Metro Line 2B",
    color:0xf2c200, status:"UPCOMING (not open at BKC)",
    statusNote:"Only Diamond Garden–Mandale (Chembur side) opened Apr 2026. BKC-area stations — ITO BKC (interchange with Line 3), IL&FS BKC, MTNL BKC — are still under construction; full line expected 2026–27. Pitch as UPCOMING, not current.",
    path:[[560,-520],[545,-360],[520,-230],[505,-80],[520,90],[555,260],[600,430]],
    stations:[
      {name:"ITO BKC (interchange)", x:520, z:-230, interchange:true},
      {name:"IL&FS BKC", x:512, z:-60},
      {name:"MTNL BKC", x:530, z:110}
    ]
  }
};

/* ---------------------------------------------------------------------------
   NEIGHBOURHOOD CONTEXT — posh / famous areas around BKC, shown as edge labels.
--------------------------------------------------------------------------- */
const NEIGHBORHOODS = [
  { name:"Bandra West · Bandstand · Carter Road", x:-540, z:-520, tag:"Sea-facing celeb belt" },
  { name:"Bandra–Worli Sea Link", x:-640, z:120, tag:"Iconic 8-lane cable bridge" },
  { name:"Worli · Lower Parel", x:-520, z:600, tag:"Finance / hi-street" },
  { name:"Santacruz · Kalina", x:180, z:-680, tag:"Airport & university" },
  { name:"Kurla (CR / Harbour rail)", x:720, z:200, tag:"Suburban rail terminus" }
];

// River (Mithi) approximate west-edge polyline
const RIVER_PATH = [[-470,-560],[-440,-320],[-420,-80],[-440,160],[-470,420],[-460,620]];

const META = {
  client:"VFS Global",
  business:"Walk-in visa application centre — high daily footfall",
  brief:"Ground / 1st floor · ≤ 2,500 sqft carpet · street-level walk-in visibility · Metro Aqua Line proximity",
  prepared:"Autopilot Offices · 15 July 2026",
  winner:"capital"
};

// expose
window.BKC = { WEIGHTS, FIT_COLORS, OPTIONS, BUILDINGS, METRO, NEIGHBORHOODS, RIVER_PATH, META };
