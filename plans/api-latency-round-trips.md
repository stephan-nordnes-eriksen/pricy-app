# A category page cost ~950 ms on prod, and it was round trips, not work

Found 2026-07-25, measuring the freshly deployed server-side sort/filter
against live pricy.no. Nothing here was caused by that change — `cat=Toys` with
no sort measured the same. It had always been this slow; nobody had timed prod.

**All five fixes shipped 2026-07-26.** A category page is now **275 ms** (was
954), a PDP fetch **122 ms** (was 318), a search **139 ms** (was 416). Kept as
a record of the method, because the method is the transferable part: the local
harness ranked these fixes in the wrong order every time, and only curl against
prod caught it.

Every one of the five turned out to be something other than what the standing
estimate said it was. That is the finding, more than any individual number.

## Where it landed

One warm pass against live, from a laptop, all cache-busted, medians of 13:

| request | before | after | |
|---|---|---|---|
| `/robots.txt` (network floor) | 55 ms | 46 ms | — |
| `/api/me` 401 (schema + session lookup) | 45 ms | 34 ms | — |
| `/api/products?ids=lego` | 318 ms | **122 ms** | −62% |
| `/api/products?cat=Toys&limit=1` | 404 ms | **149 ms** | −63% |
| **`/api/products?cat=Toys&limit=400`** | **954 ms** | **275 ms** | **−71%** |
| `/api/products?cat=Audio&limit=1` (425 heads) | 327 ms | **132 ms** | −60% |
| `/api/products?q=hodetelefoner` | 416 ms | **139 ms** | −67% |
| `/api/products?q=sofa+seng` (2 tokens) | ~347 ms | **178 ms** | −49% |
| `/api/products?top=drop&perCat=1&limit=4` | — | **134 ms** | — |

Everything except the 400-row category page now sits within ~100 ms of the
46 ms network floor. What is left in the big one is `rowsFor`'s remaining
chunk waits and 245 KB of response body.

**Read these as ±30 ms, not to the millisecond.** The 400-row page spans
222–334 ms across 21 warm samples (p25 255, p75 302, plus two >470 ms
outliers), and consecutive blocks of 11 disagreed by 50 ms. Anything smaller
than that spread needs an A/B/A on one host, not two numbers from this table —
which is exactly how the rejected byte-trim below looked like a 60 ms win.

**Measure warm.** The first samples after a deploy read 777 ms with every
isolate cold; it settled once warm, and a later round needed ~80 warming
requests before the medians stopped bouncing between hit (~115 ms) and miss
(~470 ms). A post-deploy measurement without a warmup will misreport a cache
as a regression.

## What was wrong

### The measurement that named the culprit

Same category, same scan, only the page size varied — flat in rows, **linear in
chunks at ~58 ms each**:

| rows requested | chunks of 45 | before | after |
|---|---|---|---|
| 1 | 1 | 407 ms | 147 ms |
| 45 | 1 | 379 ms | 158 ms |
| 90 | 2 | 429 ms | 166 ms |
| 180 | 4 | 570 ms | 198 ms |
| 400 | 9 | 874 ms | 258 ms |

`rowsFor` (worker/index.js) calls `chunked()` four times — products, offers,
price_points, images — and `chunked` awaited its chunks in a `for` loop, one
after the other. 400 ids is 9 chunks × 4 families = **36 sequential D1
queries**, and they were what the user waited for.

The residual slope (~14 ms/chunk, down from 58) is D1 partly serialising
concurrent queries, plus the growing response payload. It is no longer the
dominant term.

**It was never CPU.** The same handlers profiled in-process against the same
14,059 rows came out at 44–67 ms
([api-read-path-performance](api-read-path-performance.md)). The gap was D1
round trips, which local sqlite has none of.

The whole page fit one model: **prod ms ≈ sequential D1 round trips × ~20 ms.**

| stage | round trips (before) | ~cost | after |
|---|---|---|---|
| Worker + network floor | — | 50 ms | 46 ms |
| `seedCatalog` marker check | 1 | 20 ms | 1 (now carries the catalog version too) |
| `catMeta` | 5 | 100 ms | **0 on a warm isolate** |
| `listIds` (one scan, real CPU) | 1 | 85 ms | 1, indexed — SQL 12–16 ms |
| **`rowsFor` for 400 ids** | **36** | **~600 ms** | **~4 waits** |
| 245 KB transfer | — | 23 ms | unchanged |
| | | **≈ 880 ms** (observed 954) | **observed 275** |

The `listIds` row is where the model was wrong in kind, not just degree: it was
booked as CPU on the strength of an in-process profile, and ~25 ms of it was an
unindexed scan that no local harness would ever flag.

## What shipped

### 1. `rowsFor`: 36 sequential round trips → ~4 waits — DONE 2026-07-26

`Promise.all` over `chunked()`'s chunks, and over the three offer/point/image
families, which were awaited one after another for no reason. `cat=Toys&limit=400`
990 → 553 ms on `wrangler dev --remote`; 954 → 483 ms on prod.

**Not `batch()`, deliberately.** The risk this file flagged for `batch()` was
the subrequest budget, and `Promise.all` leaves the query *count* identical to
before — it only stops awaiting them in turn — so the budget is untouched. It
also sidesteps the shim trap entirely: the tests still exercise `.all()`, which
`test/api.test.js`'s D1 shim implements correctly, so a broken fix cannot pass.
`batch()` would cut 36 → 4 *actual* round trips, but needs the shim taught to
return per-statement results first. The existing suite already drives the
multi-chunk path 60 times with full ordered-output assertions, and `Promise.all`
preserves chunk order (a product's offers never straddle a chunk), so the
served bytes are identical — verified, 250886 B on both sides.

### 2. `catMeta`: 5 round trips → 0 on the common path — DONE 2026-07-26

Memoised per database, keyed on a version counter in `seed_meta` row 2 that
every write to products/offers bumps (ingest, admin PATCH, admin alias,
seeding). `seedCatalog` reads that row in the marker SELECT it already runs, so
**a cache hit costs zero extra round trips**. Worth more than the ~100 ms
predicted here, because it also removes five full-table scans of CPU
([api-read-path-performance](api-read-path-performance.md) §1's separate case
for the same fix).

The version lives in D1, not in the isolate, which is the point: a cache
invalidated only where the write happened would still serve wrong Browse counts
from every *other* isolate. That is the failure "do not just guess a TTL" was
guarding against.

Two traps worth remembering, both nearly shipped:

- **It was almost a silent no-op.** `seedCatalog` returns early when the seed
  hash is unchanged, so on prod the version row would never have been written,
  `ver` would have been `''` forever, and the cache would never have engaged.
  A db with no version row now falls back to the seed hash until the first
  write replaces it with a counter (a counter can never collide with a sha).
  Caught on `wrangler dev --remote` before deploying, not by any test.
- **The suite passed with invalidation deleted entirely.** That is exactly the
  failure mode — a cache serving yesterday's counts forever, nothing red. The
  test added with the fix warms the cache first (a *cold* cache cannot go
  stale, so warming is the whole point — the first draft missed the ingest
  bump for precisely this reason), then walks all three write paths and asserts
  the *served* meta moved. Verified to fail with each bump removed individually.

### 3. `catMeta` miss: 5 round trips → 1 `db.batch()` — DONE 2026-07-26

The scans still cost what they cost; what goes away is four waits. Measured on
`wrangler dev --remote` with the cache force-disabled so every request missed
(cleaner than forcing a miss by writing to prod, and it isolates the miss path
exactly), medians of 15:

| request | 5 sequential | 1 batch | |
|---|---|---|---|
| `ids=lego` | 275 ms | 222 ms | −53 ms |
| `cat=Toys&limit=400` | 479 ms | 453 ms | −26 ms |

Less than the ~80 ms four round trips "should" cost, so a D1 query on an
already-open session is cheaper than the 20 ms the model above assumes. Real
but modest — worth it mainly because a cold isolate is a real user's first
page, and because teaching the shim is a one-time cost that any future batched
SELECT now inherits.

**The shim fix is the load-bearing part.** `test/api.test.js`'s D1 shim
implemented `batch()` as "call `.run()` on each statement", which returns no
rows — a batched SELECT would have passed the whole suite and served empty
pages in prod. It now returns one `{results, success}` per statement, like real
D1. Verified by reverting just the shim: 34 tests fail. (node:sqlite's `all()`
returns `[]` for DML, so one path covers reads and writes.)

### 4. `listIds`: an expression index on the category — DONE 2026-07-26

The in-process profile priced `listIds` at 85 ms of JS and both files treated
it as CPU that only a rejected redesign could fix. D1's own
`sql_duration_ms` says otherwise: the query was **35–44 ms and read 19,274
rows to serve a 1,387-row category**, because `cat=` filters on
`json_extract(meta,'$.cat')` — not a column, so every category listing scanned
all 14k products.

`CREATE INDEX idx_products_cat ON products(json_extract(meta,'$.cat'))`, in
`SCHEMA`. `EXPLAIN QUERY PLAN` goes from `SCAN p` to
`SEARCH p USING INDEX idx_products_cat`:

| | rows read | SQL | 
|---|---|---|
| Toys (1,387 heads) | 19,274 → 6,968 | 35–44 → **12–16 ms** |
| Audio (425 heads) | — → 2,158 | → **5 ms** |

The query now scales with the *category*, not the catalog. End to end on prod:
`cat=Toys&limit=400` 313 → **275 ms**, `cat=Toys&limit=1` 185 → **149 ms**,
`cat=Audio&limit=1` 160 → **132 ms**.

Not one of the trades
[api-read-path-performance](api-read-path-performance.md) rejected — those were
about moving the JS *shaping* into SQL. This leaves the shaping exactly where
it is and only fixes how its input rows are found.

**Measured and rejected: trimming the meta blob.** `listIds` pulls whole meta
rows and needs almost all of it (`deriveFacets` reads `{name, cat}`, `fval`
falls back to `$.specs` and `$.variants`, `sortRows`/`matches` read
`was/rating/reviews/name/brand`), but *not* `kw`/`icon`/`srcCat` — **48% of the
bytes** on Toys (284 KB → 147 KB), 41% over all heads (3.09 → 1.82 MB).
Selecting `json_remove(p.meta, '$.kw', '$.icon', '$.srcCat')` does exactly that
and is **worth nothing**: A/B/A on `wrangler dev --remote` measured trim 319 ms,
base 379, trim again 370 — the 60 ms was session drift, not the change.
`json_remove` costs SQLite per-row CPU that cancels the smaller transfer.
Don't retry it; halving this payload is not where the time is.

### 5. Search: fold once at write time, not per row per token — DONE 2026-07-26

Both files named **FTS5** as the fix. The measurement says otherwise.
Decomposed on prod D1 over the full 14k-row scan, by adding one layer at a
time:

| query | SQL |
|---|---|
| raw `meta LIKE '%tok%'` | 15 ms |
| `+ json_remove($.specs, $.icon)` | 21 ms |
| `+ lower()` | 25 ms |
| `+ the 18 replace() folds` | **85–100 ms** |

**The scan was never the problem — it is 15 ms.** The diacritic fold was ~65 ms
of it, and it is paid per row *per token*: one token 90 ms, two tokens 190.

So the fold moved to write time. `search_index` holds the three folded values
`searchIds` matches on (blob, name, brand), maintained by AFTER
INSERT/UPDATE/DELETE triggers on `products` — triggers rather than calls at
each write site, so every writer is covered including ones nobody has written
yet. The LIKE patterns, the ranking and the `LIMIT 100` are untouched.

**Why not FTS5.** It attacks the 15 ms, so it buys ~13 ms more than this did,
and it costs: the tuned ranking (word-start-in-name > in-name > brand > blob,
itself the fix for a measured bug) rewritten onto bm25, and infix matching
lost — `LIKE '%tok%'` matches mid-word, FTS5 needs the trigram tokenizer for
that, and the header's suggest box depends on it. Revisit only if paging past
`LIMIT 100` becomes the requirement; that is FTS5's real remaining advantage,
and it is a feature question, not a latency one.

Bootstrap rides the `seed_meta` marker `seedCatalog` already reads, so it costs
no extra round trip: row 3 pins a sha of the generated SQL, and a mismatch
(fresh db, or any `FOLD`/`searchCols` edit) reinstalls the triggers and refolds
every row once, globally. A fold fix therefore still needs no hand-run
backfill — the exact property the old query-time design was chosen for.

**Verified by diffing against the old code.** Prod was still serving the previous
implementation over the same D1, so both were queried side by side: 12 queries,
including every diacritic case (`hundefor`, `oretelefoner`, `tradlos`,
`kjokken`), returned byte-identical id lists.

**The suite passed with the backfill deleted** — and on prod that means every
search returns nothing, because all 14k rows predate the triggers. The added
test inserts a product before any request, the way prod's rows did, and asserts
search finds it; a second covers the DELETE trigger. Each fails with its piece
removed.

## Still open

- `listIds`' JS shaping — the part the 85 ms estimate was really about, now
  that its SQL is 12–16 ms. Still the largest single term in a 275 ms category
  page, and still guarded by the trade
  [api-read-path-performance](api-read-path-performance.md) §3 priced and
  rejected: the facet values it computes are derived, so SQL cannot see them.
  Trigger to revisit is unchanged — one category past ~20k heads.
- The 245 KB response payload (23 ms), now a visible share of the one request
  still over 200 ms. Cheapest lever is dropping `history` from list rows the
  way `specs` already is.
- Search **paging**: still `LIMIT 100`, no offset — the only surface that
  cannot reach past its cap. This is now a feature gap, not a latency one, and
  FTS5 is the reason it is still worth considering (§5).
- `search_index` costs ~2.8 MB of duplicated folded text on a 10 MB database,
  and a trigger write on every products write. Neither has been a problem;
  both scale with the catalog, so re-check them if it grows an order of
  magnitude.

## Why it stayed hidden

Every previous measurement in this repo ran the Worker in-process over
node:sqlite, where a query costs microseconds and round-trip count is free.
That harness is still right for CPU questions and still the fastest way to
answer them — it just cannot see this class of bug at all. In-process,
`catMeta` looked like half the request and `rowsFor` like 4 ms; on prod
`rowsFor` was six times `catMeta`.

**Rule going forward: time prod with curl before ranking a latency fix.**
A `%{time_starttransfer}` median over 4 cache-busted requests takes a minute
and would have caught this the day `rowsFor` was written.

**And: `wrangler dev --remote` is the missing middle rung.** Real edge, real
D1, real round trips, without deploying — it gives a before/after delta on the
same environment (its baseline measured 990 ms against prod's 954, close
enough to rank by) and it is where both traps above surfaced.
