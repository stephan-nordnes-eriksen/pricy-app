# PROMPT — 01 Shipping-inclusive totals + stock & delivery filters

Closes G11 + G12 from `Competitive Gap Analysis.html`. Until totals include frakt, Pricy's "best price" claim is falsifiable — a 1,990 kr offer with 149 kr shipping can rank above a 2,040 kr offer with free shipping. Add true totals everywhere prices are ranked, plus availability/delivery filters.

**Read before writing:** `CLAUDE.md`, then `pricy/Results.jsx` (genOffers ~lines 10–25 — offers already carry `ship` ('Free shipping' | 'kr 79 shipping'), `stock` (bool | undefined=unknown), `eta` ('In stock' | '2–4 days'), `updated_at`, `url`; PDP offers table inside `ProductPage` ~line 936+; FiltersBody/FilterBar; sort menu), `pricy/PagesCore.jsx` (WatchStore items `{id, target, paused, hit}`, `setTarget`), `pricy/PagesAlerts.jsx` (watch rows), `pricy/Primitives.jsx` (fmt, StockBadge), `pricy/pages.css` / `app.css`.

## How it works today (verified)
- `genOffers` synthesizes per-shop offers sorted by item price; `offers[0].price = p.best`. Shipping is a display string only — never parsed, never summed, never sorted on.
- Results rows/cards show `p.best` (item price). Watch targets compare against `p.best` (`WatchStore.add/setTarget`).
- Stock exists as a badge; there are no availability or delivery filters anywhere.

## Tasks
1. **Results.jsx — numeric shipping.** In `genOffers`, keep the `ship` label but add `shipCost` (0 | 79 — vary: make 1–2 shops per product 149) and `total: price + shipCost`. Derive `p.bestTotal = min(total)` and `p.bestTotalShop` when CATALOG offers are built, so rows can use it without regenerating.
2. **PDP offers table.** Add a "Totalt" column (mono, `fmt(total)`); item price stays but dims (`--ink-600`) when a totals-sort is active. Toolbar toggle above the table: `Sortér: [Pris] [Totalpris]` (segmented control, matches `.seg` in PagesAlerts). Under totals-sort the cheapest-total row gets the green best-price treatment instead of offers[0]. If the cheapest-by-total differs from cheapest-by-item, show a one-line callout: "Billigst totalt: {shop} — kr {total} inkl. frakt" (border 2px ink, `--green-100` bg).
3. **Results rows.** Under the best price, add a `t-small` subline: "kr {bestTotal} inkl. frakt hos {shop}" — only when `bestTotal > best` (free-shipping best needs no line). Keep the row grid stable in both densities.
4. **Universal filters.** In FiltersBody (and the topbar variant — test BOTH `filterLayout` tweak values), add an "Availability" group above spec facets, always rendered regardless of cat: `In stock now` (stock === true), `Free shipping` (some offer shipCost === 0), `Delivery ≤ 2 days` (parse eta: 'In stock' or leading number ≤ 2). Filter predicate runs against the product's offers. Chips + counts must behave like existing facet options. These are NOT in FACETS (AppData) — they're hardcoded universal defs so they never collide with spec keys.
5. **Watch targets incl. shipping.** WatchStore items gain `inclShip: false`. `hit` computation compares target against `inclShip ? bestTotal : best` (update `add`, `setTarget`, and the hit-recompute paths). PDP watch box and PagesAlerts row get a small square Toggle (already in PagesCore) labeled "Inkluder frakt". Alerts row subline shows which basis is active.
6. **Sort menu.** Add "Totalpris" to the results sort options (uses bestTotal).
7. **CSS** in `pages.css`: totals column, callout, toggle row. No new JS where CSS suffices (dimming, highlight = class toggles).

## Verify
Open `pricy/index.html` → results (Audio): rows show "inkl. frakt" sublines only where shipping > 0; Availability filters narrow correctly in BOTH filter layouts and chips clear. PDP (xm5): totals column sums right, segmented sort flips the green row, callout appears only when cheapest differs. Watch with "Inkluder frakt" on → Alerts row reflects totals basis; hit state updates when toggling. No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
