# ATLAS UI Audit — Presentation Report

**App:** ATLAS by Autopilot · BKC Digital Twin
**Date:** 2026-07-19
**Method:** Playwright drive-through of the live app at `http://localhost:8080` — passed the invite gate, exercised every toggle, collapsed/reopened the leaderboard, opened all three card states, and ran the winner fly-to. 16 screenshots + full console capture.

---

## 1. What works (don't touch these)

- **The gate** is genuinely excellent — centered, calm, one clear action. This is the design language the rest of the app should inherit.
- **The card content** is rich and decision-oriented: floor stack, "Connectivity — decision-maker view," "Around this address," dual CTAs. The *substance* is strong.
- **The "Dawn/Day" light theme with labels off** is ~3× calmer than the default. You already built the cleaner version — it's just not the default.

---

## 2. Functional bugs found while clicking through

Clicking every button surfaced real console errors, not just cosmetics:

| Severity | Bug | Evidence |
|---|---|---|
| **High** | Custom map layers **never attach**. `source "composite" not found` for `bkc-water-enhance`, `bkc-parks`, `bkc-roads-primary`, `surrounding-buildings-3d`. The Mapbox **Standard** style doesn't expose a `composite` vector source (that's a Streets-style construct). So the enhanced water/parks/roads + 3D context buildings silently fall back to generic Standard rendering. | console |
| **High** | `surrounding-buildings-3d does not exist… cannot be queried` fires on **every mouse move/click** — a broken `queryRenderedFeatures` against a layer that was never created. Perf drain + dead hover interaction on context buildings. | 10+ repeats |
| **Med** | 5 database buildings (**Naman, Adani, Vaibhav, Vibgyor, Pittie**) log *"no footprint match, using coordinate box fallback"* — they render as crude boxes. Even the **winning** building in the fly-to is a plain green cuboid. | console |
| Low | `GPU stall due to ReadPixels` — perf warning under load. | console |

> The Standard-style / `composite` mismatch is likely the root cause of the map feeling flat and generic underneath the data — the "digital twin" polish that was coded isn't actually rendering.

---

## 3. Why it feels congested and heavy — first principles

Measured layout, viewport 1440×900:

- Leaderboard = **322px**, Card = **430px** → together **752px = 52% of the screen** is opaque dark panel when both are open.
- The map — the actual product — gets squeezed into a **~450px letterbox** in the middle. In the winner fly-to, the hero building sits in that slot **behind a label**, as the *smallest* thing on screen.

Three root-cause violations:

### ① No progressive disclosure — everything is at max detail, always
First view shows, simultaneously and at equal volume: 6 top toggles + a 4-variable formula explainer + **13 leaderboard rows** (each carrying ~7 data points: rank, name, grade, meets/misses, floor, sqft, distance, bar, score) + all Mapbox POI labels + green property labels + metro labels + distance lines. A first-time viewer can't find the one thing that matters. The correct first frame is **one message** ("The Capital wins — here's why"), with the 13-row table available on demand.

### ② The panels are walls, not overlays
Both are 86–92% opaque dark slabs with hard borders. They don't float over the map — they *amputate* it. An intelligence tool should feel like glass HUD elements floating on a living world, not two terminals bookending a strip of map.

### ③ Uniform visual weight = zero hierarchy
Every row, chip, label, and button uses the same saturated fills + 1px borders. And the green accent (`--acc`) currently means **six different things**: winner rank, "meets brief," progress bars, property labels, the primary CTA, *and* the gate button. When everything is emphasized and one color means everything, nothing reads as important.

---

## 4. How to up the presentation game — ranked by impact

1. **Never open both panels at once.** Opening the card should slide the leaderboard out (or collapse it to the existing rail tab). One panel max → instantly reclaims ~35% of the map. *Biggest single win, ~1 hour.*
2. **Default to one clear first frame.** Land with the leaderboard showing **top 3 only + a "See all 13" expander**, labels OFF, Dawn theme. Let density be a *choice*, not the default.
3. **Make panels feel like glass.** Drop panel opacity to ~55–65%, lean harder on `backdrop-filter: blur`, soften borders to hairline gradients, add one soft shadow for lift. They should *hover*, not *wall*.
4. **Fix the color grammar.** Reserve green for **one** meaning (recommended/winner). Move "meets/misses brief" to a neutral+red pair, progress bars to muted tints, and let the CTA be the only other saturated green. Restores instant hierarchy.
5. **Fix the `composite` bug** so the enhanced terrain and real building footprints actually render — the difference between "flat generic map with panels on top" and the premium digital-twin that was designed.
6. **Thin the leaderboard rows.** 7 data points per row × 13 is a spreadsheet. Show name + score + one status badge per row; reveal the rest on hover/expand.

---

## The through-line

**The map is the product; the data should float over it and reveal on demand.** Right now the data boxes are the product and the map is wallpaper behind them. Invert that and the "heavy/congested" feeling disappears without cutting a single feature.
