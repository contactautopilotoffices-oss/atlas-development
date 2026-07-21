/* FLIPKART ANDHERI — client config (gate, framing, registry, metro overrides) */
window.CLIENT = {
  slug: "flipkart-andheri",
  gate: { id: "FLIPDEMOACC", pass: "FLIP1234",
          sub: "Invitation-only geospatial experience for Flipkart" },
  brand: {
    title: 'ATLAS <span style="color:var(--mut);font-weight:400">by Autopilot · Andheri East Digital Twin</span>',
    sub: "Geospatial intelligence view for Flipkart · ~220 seats @ 4×2"
  },
  lb: {
    title: "Why Vedanta leads",
    why: 'Tiered by Flipkart’s three asks — <b>contiguous block for 220 seats (4×2 ≈ 55 sqft/seat)</b> · <b>≤2 metro hops from the Central Line</b> (Ghatkopar → Line 1) · <b>Line 3 = a 3rd hop = downgrade</b>. Numbers shown are real seat capacity, not scores. Ackruti has the biggest plate in the set — and still drops: commute stress compounds daily.'
  },
  winnerBtnText: "▶ Fly to Vedanta — the pragmatic winner",
  tierColors: true,   // buildings wear their verdict: green/amber/red on the map
  shortlistText: "Add to Flipkart shortlist",
  // Map framing: Marol–Chakala belt
  map: { center: [72.8710, 19.1105], zoom: 14.55, pitch: 60, bearing: -18 },
  // Engine registry: renderMode/height/color per building id (heights from PDF G+N × 3.2m)
  registry: {
    vedanta:     { renderMode:"extrusion", heightMeters:24, color:"#2fbf71", footprintName:"Vedanta" },
    avenue723:   { renderMode:"extrusion", heightMeters:52, color:"#2fbf71", footprintName:"723 Avenue" },
    corporate:   { renderMode:"extrusion", heightMeters:30, color:"#2fbf71", footprintName:"Corporate Avenue" },
    technopolis: { renderMode:"extrusion", heightMeters:24, color:"#f0a020", footprintName:"Technopolis Knowledge Park" },
    vaman:       { renderMode:"extrusion", heightMeters:27, color:"#f0a020", footprintName:"Vaman Techno Centre" },
    timessquare: { renderMode:"extrusion", heightMeters:46, color:"#f0a020", footprintName:"Times Square" },
    landmark:    { renderMode:"extrusion", heightMeters:36, color:"#f0a020", footprintName:"Landmark" },
    ackruti:     { renderMode:"extrusion", heightMeters:26, color:"#d1495b", footprintName:"Ackruti Centre Point" },
    fulcrum:     { renderMode:"extrusion", heightMeters:33, color:"#d1495b", footprintName:"Fulcrum" },
    marolnaka_stn:{ renderMode:"extrusion", heightMeters:12, color:"#14b8c4", footprintName:"Marol Naka L1" },
    weh_stn:     { renderMode:"extrusion", heightMeters:12, color:"#14b8c4" },
    chakala_stn: { renderMode:"extrusion", heightMeters:12, color:"#14b8c4" },
  },
  hint: "Click any coloured property · two-finger drag pans · horizontal two-finger swipe orbits · pinch zooms"
};

/* Metro Line 1 (primary, solid) — indicative elevated alignment Andheri → Saki Naka */
window.BKC_LINE3 = {
  path: [
    [72.8481,19.1190],[72.8515,19.1130],[72.85465,19.1072],[72.8590,19.1085],
    [72.86735,19.11091],[72.87441,19.10935],[72.87949,19.10816],[72.8870,19.1035],[72.8960,19.0950]
  ],
  stations: [
    { name:"WEH", lng:72.85465, lat:19.10720 },
    { name:"Chakala (J B Nagar)", lng:72.86735, lat:19.11091 },
    { name:"Airport Road", lng:72.87441, lat:19.10935 },
    { name:"Marol Naka ⇄ L3", lng:72.87949, lat:19.10816, interchange:true },
    { name:"Saki Naka", lng:72.8870, lat:19.1035 }
  ]
};
/* Metro Line 3 segment (dashed = the 3rd hop) — SEEPZ → MIDC → Marol Naka → T2 → Sahar Rd */
window.BKC_LINE2 = {
  path: [
    [72.8730,19.1245],[72.87593,19.11961],[72.87949,19.10816],[72.8745,19.0990],[72.86209,19.09861]
  ],
  stations: [
    { name:"MIDC (L3 · 3rd hop)", lng:72.87593, lat:19.11961 },
    { name:"Sahar Road (L3 · 3rd hop)", lng:72.86209, lat:19.09861 }
  ]
};
