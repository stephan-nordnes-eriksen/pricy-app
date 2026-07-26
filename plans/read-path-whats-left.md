# What's left on the read path after the 2026-07-26 latency work

The five fixes in [api-latency-round-trips](api-latency-round-trips.md) took a
category page from 954 → 275 ms, a PDP fetch 318 → 122, a search 416 → 139.
This file is the leftovers.

~~**Nothing here is urgent.**~~ **§0 is now urgent and live** (added 2026-07-26):
`cat=` reads exceed the Worker CPU limit on about half of all requests. The rest
of the file still exists so the next person doesn't re-derive what was already
measured, and doesn't trip the invariants those fixes introduced.

## 0. URGENT (2026-07-26): `cat=` reads exceed the Worker CPU limit ~50% of the time

**This is live and user-visible.** `GET /api/products?cat=<big category>` returns
Cloudflare 503 / `error code: 1102` on about half of all requests. Measured with
unique cache-busters (these responses carry no cache headers at all, so real
users are not shielded by the edge):

| category | heads | failures / 8 |
|---|---|---|
| Projectors | 58 | 0 |
| Watches | 351 | 1 |
| Home | 1,239 | 3 |
| Furniture | 1,874 | 3 |
| Toys | 2,206 | 4 |

`ids=` fetches (the PDP path) are 12/12 fine, so `catMeta` is not the term.
(The ingest half of this ceiling is **fixed** — see "Can you parallelise around
it?" below. The `cat=` read half is still open.)
`wrangler tail --status error` gives the cause outright:

```
"outcome": "exceededCpu",  "cpuTime": 43,  "wallTime": 132
"message": "Worker exceeded CPU time limit."
```

So it is **§2's `listIds` JS shaping item, arriving early**. That item's stated
trigger — *"one category past ~20k heads"* — was calibrated on the 275 ms
latency budget and is wrong by roughly 10×, because neither this file nor
[api-read-path-performance](api-read-path-performance.md) priced the **CPU
ceiling**: pricy is on the Workers *free* plan (10 ms/invocation, evidently with
burst slack up to ~43 ms), and CLAUDE.md's own number for a category read is
64 ms. It has been over budget the whole time; catalog growth to 22,120 visible
heads is what pushed the failure rate to a coin flip. The failure rate scales
with the category's head count, exactly as the shaping cost does.

### Can you parallelise around it? Write path no, read path yes-but-don't

The CPU limit is **per invocation**, so splitting work across invocations really
does multiply the budget. Whether that helps depends on the shape of the cost,
and the two halves of this system have opposite shapes. Priced in process
against the real 22k-product catalog (`process.cpuUsage()` around
`worker.fetch`, the one thing the in-process harness is actually good at):

**Ingest — parallelising was impossible, and that was the bug.** A chunk cost
~55 ms **flat in chunk size**: 50 rows cost the same as 500, because two
full-table reads ran per chunk (`SELECT id, meta, json_extract(meta,'$.hidden')
FROM products` inside `ingest()`, plus the route's own `SELECT id FROM
products`). Smaller chunks would have multiplied the number of invocations that
each still blew the limit; concurrency would not have moved per-invocation CPU at
all. **Fixed 2026-07-26** — both reads are now `WHERE id IN (…)` over the batch's
own ids in one `db.batch()`, since every use of them was a lookup of a row in the
batch. Now **1.6 ms / 50 rows, 6.6 / 200, 13.1 / 500**: 4× cheaper and, more to
the point, *linear*, so chunking is a real lever again. Guarded by a test that
counts product rows read for a one-row batch against a padded table (497 before,
under 50 after) rather than by a timing assertion.

**Reads — you could, but the work is redundant, not big.** A Worker can fan out
to sub-requests (a service binding to itself; the free plan allows 50
subrequests), each shard shaping 1/N of the category with its own CPU budget,
parent merging ids and summing `fcounts`. It would work. It also costs N× the D1
reads, a self-binding, a fan-out protocol, and the parent still pays to merge —
all to divide by N a cost that is mostly *the same answer computed again*:

| | Toys (2,206 heads) | Home (1,239) |
|---|---|---|
| full `cat=` read | 22.2 ms | 15.9 ms |
| same, minus `deriveFacets` + `fcounts` | 9.3 ms | 6.3 ms |
| **share that is facet derivation** | **58%** | **60%** |

`fcounts` is category-wide and computed *before* filtering by design, so it is
byte-identical for every request until the catalog version changes. Caching takes
~60% of the cost to zero for essentially all requests; sharding divides 100% of
it by N and adds moving parts. Cache first, and only reach for fan-out if the
remaining 40% still does not fit.

Two fixes, and the first one is not code:

1. **Workers Paid ($5/mo) raises the default CPU limit to 30 s** and this entire
   class of failure disappears — including `/api/catalog.json`'s 503s, which are
   the same ceiling. It also unblocks `SEND_EMAIL` (magic-link email is
   console-logged in prod today). Cheapest fix available by a wide margin.
2. **Cut `listIds`' per-row work** — memoise the derived facets / `fcounts` per
   `(cat, catalog version)` the way `catMeta` already memoises per version.
   Measured above at 58–60% of a category read, and query-independent, so this is
   the whole ball game; note the memory ceiling, 31 categories of shaped rows is
   not free. Do NOT re-derive the "push facets into SQL" trade;
   [api-read-path-performance](api-read-path-performance.md) §3 already priced
   and rejected it.

Until one of those lands, **do not grow the largest categories**: the pending
Gamezone refile (591 rows, Gaming → Toys, see
[category-misclassification](category-misclassification.md)) would add 26% to
Toys, which is the worst offender. It is held for that reason, not because the
data is in doubt.

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
| `listIds` JS shaping | **NOW URGENT — see §0.** largest single remaining term in a 275 ms page | ~~one category past ~20k heads~~ — wrong by 10×, the real trigger was the CPU ceiling and it fired at 2,206 |
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

- ~~**`/api/products?hidden=1` is unauthenticated.**~~ **CLOSED 2026-07-26**
  together with the `ids=` leak it shared a root cause with — see
  [hidden-rows-readable-by-id](hidden-rows-readable-by-id.md). Bearer-gated
  now, same as the `catalog.json` dump.
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
