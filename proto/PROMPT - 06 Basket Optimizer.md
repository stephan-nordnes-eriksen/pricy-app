# PROMPT — 06 Basket optimizer (Shoptimera answer)

Closes G10 from `Competitive Gap Analysis.html`. Given a list, compute where to buy everything for the lowest total — or from the fewest shops — with shipping counted once per shop. Match Prisjakt's Shoptimera, then beat it by handing the result to auto-buy.

**Depends on:** PROMPT 01 (numeric `shipCost` on offers) and ideally PROMPT 05 (`ListStore` as input). If 05 isn't built, run against WatchStore items only and hide the list picker.

**Read before writing:** `CLAUDE.md`, then `pricy/Results.jsx` (genOffers per product — offer `{shop, price, shipCost, stock}`; `getListing`), `pricy/PagesCore.jsx` (WatchStore), `pricy/ListsData.jsx` if present, `pricy/PagesAutobuy.jsx` (AutobuyStore, BuyNowModal — the handoff target; `window.HIDE_AUTOBUY` gate), `pricy/AppRouter.jsx`, `pricy/compare.css` (table patterns worth reusing).

## Approach
Optimization over demo data is tiny (≤10 items × 8 shops) — brute force is fine, no cleverness:
- **Cheapest total:** per item pick min(price) per shop assignment, then add each used shop's shipping ONCE (shipping charged per shop-order, not per item; free-shipping shops obviously win bundles). Because shipping couples items, do it right: start from per-item cheapest, then greedy improvement passes moving items between shops while total decreases. Deterministic, <1ms.
- **Fewest shops:** greedy set-cover — repeatedly pick the shop covering the most remaining items (tie-break on price), assign, repeat. Report both plans plus the naive baseline (everything from one shop — pick the single shop with best full-basket total) so savings have a denominator.
- Skip items with `stock === false` at a shop; if an item is nowhere in stock, park it in an "Ikke på lager nå" strip below.

## Tasks
1. **New file `Optimizer.jsx`** (logic + page; split `OptimizerData.jsx` only if it crosses ~400 lines). `optimize(items) → { cheapest: Plan, fewest: Plan, baseline: Plan }`, `Plan = { groups: [{shop, items:[{id, price}], ship, subtotal}], total, shops }`.
2. **Route `optimizer`.** Header: list picker (segmented or select: watchlist + ListStore lists) + item count. Result layout:
   - **Verdict banner** (the money shot): "Kjøp alt fra 3 butikker — kr 12 340 totalt. Du sparer kr 610 mot å handle alt hos Elkjøp." 3px ink border, `--shadow-green`, `t-price-lg` total.
   - **Strategy toggle:** `[Billigst totalt] [Færrest butikker]` (.seg) — swaps the plan below; show each strategy's total in the tab label (mono).
   - **Plan groups:** one card per shop — shop name + n items, item rows (ProdImg, name, mono price), shipping row ("Frakt kr 79" or "Fri frakt"), mono subtotal; footer per card: `Btn` "Gå til butikk" and, when `!window.HIDE_AUTOBUY`, "Auto-kjøp kurven" → opens BuyNowModal-style confirm listing the group (reuse AutobuyStore patterns; a stub order per item is fine).
   - **Comparison strip:** three mono columns — Én butikk kr X / Færrest butikker kr Y / Billigst totalt kr Z — cheapest highlighted.
3. **Entry points.** Lists detail header "Optimaliser kjøpet →" (PROMPT 05 stub) now routes here with `params.list`; Alerts Watching tab header gains the same link when ≥3 watched items. Tweaks Screen option "Basket optimizer".
4. **Wire in.** `index.html` script line (after PagesAutobuy so the handoff components exist). Router route + params (`list`).
5. **CSS** in `pages.css`: plan cards, comparison strip, verdict banner. Tables typographic, `tabular-nums` everywhere money appears.

## Verify
Route from Tweaks with watchlist ≥3 items: both strategies produce consistent math (hand-check one: sum items + one shipping per shop = card subtotals = plan total), fewest-shops never uses more shops than cheapest-total, baseline ≥ both. Toggle swaps plans without layout jump. Out-of-stock item lands in the parked strip, not a group. Auto-buy CTA hidden when the hideAutobuy tweak is on, opens confirm when off. List picker switches inputs (if 05 present). No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
