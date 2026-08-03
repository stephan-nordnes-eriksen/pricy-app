# PROMPT — 03 Deals hub with honesty badges

Closes G13 + G14 from `Competitive Gap Analysis.html`. Pricy's drop feed only covers watched products, and no player badges deal honesty per product (Prisjakt only publishes yearly "lurepris" reports; prisjakten.no has verdicts but tiny reach). Build a public "genuinely cheap today" page where every deal carries a verdict — the acquisition surface and the "honest one" brand position.

**Read before writing:** `CLAUDE.md`, then `pricy/Results.jsx` (CATALOG rows have `best`, `was`, `genHist` price history; ResultRow/ResultCard), `pricy/Primitives.jsx` (hist(), Sparkline, Delta, fmt), `pricy/HomeSections.jsx` (section patterns on SignedHome), `pricy/AppRouter.jsx` (routes, Footer usage), `pricy/AppHeader.jsx` (nav — where a "Tilbud" link fits), `pricy/PagesAlerts.jsx` (`.seg` tab pattern).

## How it works today (verified)
- Every CATALOG row has `best` (current) and `was` (reference) plus a deterministic history via `genHist`; nothing computes 30-day lows or checks whether `was` is honest.
- SignedHome has drop-style sections but they're watchlist-scoped; there is no public deals route.

## Tasks
1. **Verdict engine (new file `DealsData.jsx`, load after Results.jsx).**
   - `dealVerdict(p)` → `{ kind, label, detail }` computed from `genHist`-derived series: `low30` = min of last 30 days, `avg90`:
     - `historic-low` — best ≤ min of full series: "Laveste pris registrert".
     - `real-deal` — best ≤ low30 and (was − best)/was ≥ 8%: "Reell rabatt mot §9a-førpris".
     - `inflated` — `was` > low30 · 1.05: "Førpris høyere enn 30-dagers lavpris" (the lurepris flag).
     - `flat` — best within 3% of avg90: "Normalpris — rabatten er markedsføring".
   - Make ~15% of CATALOG land in `inflated` and a handful in `historic-low` by construction — tune thresholds against the generated data, don't fake per-id overrides unless two specific demo products are needed for the hub's hero.
   - `DEALS()` selector: top drops ranked by (was−best)/was, each with verdict attached; `CAT_INDEX()`: per category avg % change vs 30 days ago (for the index strip).
2. **`DealBadge({v, size})` component** (same file or a small `Deals.jsx`): mono uppercase tag, 1.5px ink border — `historic-low` `--green-500` bg, `real-deal` `--green-300`, `inflated` `--warn-500` with an ⚠, `flat` plain paper. Tooltip/title carries `detail`.
3. **New route `deals` (new file `PagesDeals.jsx`).**
   - Header: "Ekte tilbud i dag" + sub with counts ("312 prisfall siste døgn · 41 historiske bunnpriser · 18 luretilbud avslørt").
   - Sections: **Historiske bunnpriser** (card grid, DealBadge + Sparkline + Delta), **Største prisfall 24t** (compact rows, % drop mono), **Luretilbud-radar** (the inflated list — frame as consumer protection, show claimed førpris vs actual low30 struck through), **Prisindeks** (one-line strip per category: name + mono % + up/down color).
   - Filter chips across the top: Alle / category chips (reuse chip styles).
4. **Wire in.** `index.html` script lines (DealsData before PagesDeals). Router: route `deals`, Tweaks Screen option, Footer link "Dagens tilbud". AppHeader: nav link "Tilbud" (verify header has a nav slot; if not, add minimally).
5. **Badges elsewhere.** PDP price box: `DealBadge` next to the price + one `t-small` line ("Førpris kr {was} — reell: laveste 30 dager kr {low30}"). Results rows: badge only for `historic-low`/`inflated` (don't badge everything — signal dies). SignedHome: one new section teaser "Ekte tilbud i dag →" reusing HomeSections patterns, linking `go('deals')`.
6. **CSS** in `pages.css`. Index strip and histogram-free — keep it typographic, mono-heavy, no charts beyond existing Sparkline.

## Verify
Route `deals` from Tweaks + header + footer: all four sections populate, badges color-match verdicts, inflated rows show the struck førpris math. PDP (a discounted product): badge + førpris line consistent with its history chart. Results (Audio): only the two loud verdicts appear. Counts in the sub aren't hardcoded lies — derive from `DEALS()`. No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
