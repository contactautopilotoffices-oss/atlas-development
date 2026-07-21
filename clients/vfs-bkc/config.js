/* VFS BKC — client config (preserves original behaviour; engine defaults apply) */
window.CLIENT = {
  slug: "vfs-bkc",
  gate: { id: "VFSDEMOACC", pass: "VFS1234",
          sub: "Invitation-only geospatial experience for VFS Global" },
  brand: {
    title: 'ATLAS <span style="color:var(--mut);font-weight:400">by Autopilot · BKC Digital Twin</span>',
    sub: "Geospatial intelligence view for VFS Global · 15 Jul 2026"
  },
  lb: {
    title: "Why The Capital wins",
    why: 'Ranked by the workbook’s feasibility formula — <b>Floor 35% · Area 30% · Connectivity 20% · Possession 15%</b>. The Capital’s three 1st-floor units are the only ones that meet <b>both</b> the floor and ≤2,500 sqft asks.'
  },
  winnerBtnText: "▶ Fly to the winning property",
  map: null,      // engine defaults (BKC framing)
  registry: null, // engine built-in BKC registry
  hint: "Click any property · two-finger drag pans · horizontal two-finger swipe orbits · pinch zooms"
};
