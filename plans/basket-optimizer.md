# Basket optimizer (upstream PROMPT 06)

Backend plan for `proto/PROMPT - 06 Basket Optimizer.md` (fetched
2026-08-03, not yet built upstream). Upstream computes "buy everything
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
