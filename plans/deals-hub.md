# Deals hub with honesty badges (upstream PROMPT 03)

Backend plan for `proto/PROMPT - 03 Deals Hub & Honesty Badges.md`
(fetched 2026-08-03, not yet built upstream). Upstream will add a
`dealVerdict(p)` engine (historic-low / real-deal / inflated / flat off
30-day-low, 90-day-avg and the §9a førpris rule), a public `deals` route
with counts, and badges on PDP/results. Its engine runs on `genHist`
fake data; ours must run on `price_points`.

## Current state (verified)

- `price_points (product_id, day, price)` is the real history — market
  min per day (index.js:21,562). Depth: since each product's first
  crawl (July 2026); sampled shops freeze between crawls
  (ingest-crawl-robustness.md), so "last 30 days" is sparse for most
  rows.
- `was` (the claimed førpris) exists on 64 seed rows only —
  drop-cards-are-seed-only.md, item C. The `inflated` verdict (claimed
  førpris > 30-day low) is impossible without a claimed førpris.
- No verdict computation, no deals endpoint. `topDropIds` ranks on
  `meta.was` (same 64-row ceiling).

## Plan

1. **Capture `was` at ingest** (this is plan C's fix — do it there,
   this plan consumes it): source rows carry a strikethrough/ordinary
   price where the shop publishes one (Adtraction `ordinaryprice`;
   JSON-LD rarely). Store as `meta.was` with a seen-at date. Without it
   a row can still verdict `historic-low`/`flat` — `inflated` and
   `real-deal` need the claim.
2. **Verdict cron.** Catalog-wide low30/avg90/all-time-min is a scan —
   too hot for request time on the free-plan CPU ceiling. Hourly cron
   (the `refreshDeptCounts` slot/pattern): one SQL aggregate over
   price_points GROUP BY product_id, verdicts computed in JS, results
   into a `seed_meta`-style blob or `meta.deal` per changed row.
   **Guard: a row whose history is one crawl deep is ALWAYS `flat`** —
   a single price point is trivially its own historic low, and 13k rows
   wearing "Laveste pris registrert" on day one is the exact lurepris
   sin the page accuses shops of. Require ≥ N distinct days (start
   N=14) before any loud verdict.
3. **Serve.** `rowsFor`/`shapeRows` include `deal: {kind, low30}` when
   present (badges on PDP/results ride existing hydration).
   `top=deals` branch beside `topDropIds` for the hub's ranked
   sections; `catMeta` gains the per-cat 30-day index strip numbers
   from the same cron output. Counts in the hub header come from the
   cron blob — never hardcoded.
4. **Boot.** `ensureRoute('deals')` prefetches the slice; hub is
   public? Upstream frames it as an acquisition surface, but boot gates
   all non-landing routes behind login — deciding to open `/deals`
   logged-out is a product decision, flag it when syncing.
5. **Tests.** Verdict table against a synthetic history (each kind +
   the thin-history guard), was-capture ingest case, deals endpoint
   shape.

## Dependencies / order

- **C (drop-cards-are-seed-only)** is step 1 — same root cause, do as
  one piece of work.
- **B (ingest-crawl-robustness)** gates honesty: a "genuinely cheap
  today" page over week-old frozen prices is itself a luretilbud. Ship
  the engine after crawls are at least regular; until then the guard in
  step 2 keeps loud verdicts rare rather than wrong.
- §9a legal framing ("dokumentert av Pricy") — keep claims to what
  price_points actually witnessed: market min on days we crawled.
