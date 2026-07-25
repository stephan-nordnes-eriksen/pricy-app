# What's left on the read path after the 2026-07-26 latency work

The five fixes in [api-latency-round-trips](api-latency-round-trips.md) took a
category page from 954 → 275 ms, a PDP fetch 318 → 122, a search 416 → 139.
This file is the leftovers.

**Nothing here is urgent.** It exists so the next person doesn't re-derive what
was already measured, and doesn't trip the invariants those fixes introduced.
The one item worth acting on soon is §4's unauthenticated `hidden=1` listing,
and it isn't a performance problem at all.

## 1. Invariants the fixes introduced — read before touching the query layer

Not backlog items. Each one fails **silently**, which is why they are written
down rather than left to be rediscovered.

**a. A new write path to `products`/`offers` must call `bumpVer`.**
`catMeta` is memoised per database, keyed on the counter in `seed_meta` row 2.
Four sites bump it: `seedCatalog` (worker/index.js:251), the end of ingest
(:432), admin PATCH (:1422), admin alias (:1464). A fifth writer that forgets
leaves **every isolate** serving stale product counts on Browse until something
else happens to write. The test `served meta stays live across ingest, admin
PATCH and alias` covers those three routes — it cannot cover a route nobody has
written yet.

**b. `idx_products_cat` works only while the query spells the expression
identically.** SQLite matches an expression index on exact text, so
`listIds`' WHERE (worker/index.js:823) and the index (:45) are coupled. Guarded
by the test `the cat= listing has an index to use, and uses it`, which asserts
`EXPLAIN QUERY PLAN` names the index — it fails both if the index is dropped
and if either side's expression drifts.

**c. `search_index` is trigger-maintained, and the triggers are installed by
`seedCatalog` (worker/index.js:210) before seeding.** Every route that writes
products calls `seedCatalog` first — verified for ingest, the cron `scheduled`
handler, admin PATCH, admin alias and `/api/products`. A write path that skips
it would insert rows the triggers never see, and those products would simply
never appear in search.

**d. The D1 test shim returns per-statement rows from `batch()`
(test/api.test.js:34).** Reverting it to "call `.run()` on each statement" lets
any batched SELECT pass the whole suite and serve empty results in prod. It is
guarded only in the sense that 34 tests currently fail if you revert it — there
is no test *about* the shim.

## 2. Open, measured, not urgent

| item | measured | trigger to act |
|---|---|---|
| `listIds` JS shaping | largest single remaining term in a 275 ms page | one category past ~20k heads (largest today: Toys, 1,387) |
| 245 KB response body | ~23 ms transfer, plus client parse | if the browser-side page ever gets profiled |
| `catMeta` cold miss | 5 full-table aggregates, now in 1 round trip | if cold isolates show up in a prod measurement |
| `search_index` storage | ~2.8 MB of a 10 MB database, one trigger write per products write | re-check at 10× the catalog |

`listIds`' shaping is guarded by a trade already priced and rejected — its
facet values are derived per row, so SQL cannot see what the rail filters on.
Do not re-derive it: [api-read-path-performance](api-read-path-performance.md)
§3 and its "Priced and rejected" section have the numbers and the reasoning.

The payload lever is known and cheap if it is ever wanted: drop `history` from
list rows the way `specs` already is, in `rowsFor`'s `expand: false` branch, and
let the PDP fetch it — sparklines are the only consumer.

## 3. Checked and NOT a problem — do not act on the stale comment

`topDropIds` (worker/index.js:876) carries
`ponytail: full head scan per call, fine to ~2k heads; store a drop column when
it isn't`. We are at 14,059 heads, so that note reads as overdue.

Measured on prod D1 (2026-07-26): **22–34 ms, 15,157 rows read.** The threshold
in the comment is pessimistic by roughly 7×, and `top=drop&perCat=1&limit=4`
serves in 134 ms end to end. Leave it alone; revisit only if it appears in a
prod measurement. The comment itself is worth a one-line correction next time
that file is open.

## 4. Owned elsewhere — link, don't duplicate

- **`/api/products?hidden=1` is unauthenticated.** Owned by
  [search-and-paging-at-scale](search-and-paging-at-scale.md) § "What this plan
  did not close". **Re-verified on prod 2026-07-26: still 200, still serving
  the ops listing of hidden/discovered rows.** This is an exposure rather than
  a latency nit, and it is the highest-value item in any of these files —
  same class as the `catalog.json` dump that got bearer-gated in that plan's
  Done 4.
- **Search paging** — still `LIMIT 100` with no `offset`, the one surface that
  cannot reach past its cap. Same owner. **FTS5 is the candidate here**, and
  this is the *only* remaining reason to want it:
  [api-latency-round-trips](api-latency-round-trips.md) §5 records why FTS5 was
  the wrong tool for the latency problem (it attacks a 15 ms scan and costs the
  tuned ranking plus infix matching) while remaining the right tool for paging.
- **Facet counts are pre-filter** — `fcounts` counts the whole category, not
  what the other active filters leave. Same owner.
- **`catalog.json` is 6.1 MB per hit** —
  [api-read-path-performance](api-read-path-performance.md) §6. Bearer-gated
  already; leave it whole unless a tool starts polling it.

## How to measure any of this

The method, not the numbers, is what transferred — all five fixes turned out to
be something other than the standing estimate. Three tools, in order of cost:

1. **`curl` medians against prod, warm.** Cache-bust, and warm the isolate pool
   first — a thin post-deploy sample bounced between 115 and 470 ms and read as
   a regression. Treat anything under ~30 ms as noise unless A/B/A'd.
2. **`wrangler dev --remote`** — real edge, real D1, real round trips, without
   deploying. Gives a before/after on one environment. Both near-miss bugs in
   this work surfaced here, not in tests.
3. **D1's own `sql_duration_ms` and `rows_read`** (via `wrangler d1 execute
   --json`, or `result.meta` in the Worker) — the only way to split server-side
   SQL from everything else. Adding one layer at a time to a query is what
   found that search's cost was the fold and not the scan.

The in-process suite still cannot see any of this. It prices CPU, and it ranked
every one of these five wrong.
