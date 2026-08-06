# Basket optimizer (upstream PROMPT 06)

**Status 2026-08-06: built upstream and synced.** `Optimizer.jsx` ships
(route `optimizer`, `/optimizer?list=` mirrored in boot; entry points on
Alerts ≥3 watches and Lists detail). Backend landed with the sync:

- `catMeta` serves the shipping registry as `meta.shipping` (raw
  `{flat, freeOver}` per shop); boot exposes it as `window.SHIPPING`.
- boot replaces the demo `SHOPS` array in place with the served
  `meta.shopStats` keys once live — `optimize()`'s set-cover and baseline
  passes iterate `SHOPS`, and with the 8 demo names an item offered only
  by a real shop silently fell out of the fewest-shops plan (whose lower
  total then replaced cheapest via the guard). Pinned in ui.test.js.

Remaining upstream gap: `optimize()` prices group shipping as
`max(o.shipCost)` — per-offer shipCost is computed at the single item's
price, so a basket that crosses a shop's `freeOver` still shows flat
shipping (only ever overcharges, never under). Paste-ready fix:

## UPSTREAM PROMPT — threshold-aware group shipping

> In `pricy/Optimizer.jsx`: group shipping is currently
> `Math.max(...offers' shipCost)`. The host serves per-shop rules at
> `window.SHIPPING` (`{shop: {flat, freeOver?}}`). Add
> `const shipFor = (shop, sum, fallback) => { const r =
> window.SHIPPING && window.SHIPPING[shop]; return r ? (r.freeOver &&
> sum >= r.freeOver ? 0 : r.flat) : fallback; }` and use it in BOTH
> `optToPlan` (group ship from the group's item sum) and `totalOf`
> (per-shop item sums first, then ship per shop) — they must agree or
> the greedy pass optimizes a different total than the cards show. Keep
> the current max-shipCost value as the `fallback` for shops the
> registry doesn't know. Demo data has no `window.SHIPPING`, so the
> preview behaves exactly as today.

Original plan below for context.

Backend plan for `proto/PROMPT - 06 Basket Optimizer.md` (fetched
2026-08-03, since built upstream). Upstream computes "buy everything
cheapest / from fewest shops, shipping counted once per shop" over a
list. The optimization itself needs **no backend**: a list is ≤ 50
items, offers ride the existing `ids=` hydrate, and brute
force + greedy passes over ≤ 50 × n-shops is sub-millisecond client
work — exactly as the prompt says. The backend's job is making the
inputs true.

## What actually blocks it (both already tracked)

1. **Cross-shop coverage — plan A.** Only 94 of 14,059 products have
   more than one shop's price (cross-shop-product-matching.md). An
   optimizer over single-shop products degenerates to "buy each thing
   at its only shop" — mathematically fine, product-wise embarrassing.
   The feature is not worth syncing until A moves.
2. **Shop-level shipping rules — the PROMPT 01 registry.** Basket math
   needs more than per-offer `shipCost`: shipping is charged once per
   shop-order and Norwegian shops waive it over a threshold ("fri
   frakt over 500 kr"), which flips optimal assignments. The
   `worker/shipping.json` registry from shipping-totals.md must carry
   `{flat, freeOver}` per shop and be served once via `catMeta`
   (`meta.shipping`) so the client optimizer can apply
   threshold-aware totals. That's the whole backend delta for this
   feature.

## Non-blocking notes

- Auto-buy handoff is behind the `HIDE_AUTOBUY` kill switch (currently
  hidden) — the optimizer's "Auto-kjøp kurven" CTA stays gated for
  free via the existing `window.HIDE_AUTOBUY` check upstream already
  plans.
- Out-of-stock handling uses the served `stock` flag — already flows.
- No new endpoint, table, or cron. If lists grow past client-comfort
  someday, revisit; not before.

## Order

After shipping-totals.md (needs its registry) and after A shows real
multi-shop overlap. Until then: skip — the upstream prototype can be
built and demoed against demo data without us.
