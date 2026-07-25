# A category page cost ~950 ms on prod, and it was round trips, not work

Found 2026-07-25, measuring the freshly deployed server-side sort/filter
against live pricy.no. Nothing here was caused by that change — `cat=Toys` with
no sort measured the same. It had always been this slow; nobody had timed prod.

**Both fixes shipped 2026-07-26.** A category page is now **330 ms** (was 954),
a PDP fetch **128 ms** (was 318). Kept as a record of the method, because the
method is the transferable part: the local harness ranked these two fixes in
the wrong order, and only curl against prod caught it.

## Where it landed

Median of 9 cache-busted requests from a laptop, against live, **warm**:

| request | before | after | |
|---|---|---|---|
| `/robots.txt` (network floor) | 55 ms | 41 ms | — |
| `/api/me` 401 (schema + session lookup) | 45 ms | 36 ms | — |
| `/api/products?ids=lego` | 318 ms | **128 ms** | −60% |
| `/api/products?cat=Toys&limit=1` | 404 ms | **187 ms** | −54% |
| **`/api/products?cat=Toys&limit=400`** | **954 ms** | **330 ms** | **−65%** |
| `/api/products?cat=Audio&limit=1` (425 heads) | 327 ms | **160 ms** | −51% |
| `/api/products?q=hodetelefoner` | 416 ms | **206 ms** | −51% |
| `/api/products?top=drop&perCat=1&limit=4` | — | **143 ms** | — |

`ids=` and `q=` took the biggest proportional cut: they were paying for five
category aggregates they never read.

**Measure warm.** The first samples after a deploy read 777 ms with every
isolate cold; it settled to 330 ms once warm. A post-deploy measurement without
a warmup will misreport a cache as a regression.

## What was wrong

### The measurement that named the culprit

Same category, same scan, only the page size varied — flat in rows, **linear in
chunks at ~58 ms each**:

| rows requested | chunks of 45 | before | after |
|---|---|---|---|
| 1 | 1 | 407 ms | 212 ms |
| 45 | 1 | 379 ms | 178 ms |
| 90 | 2 | 429 ms | 193 ms |
| 180 | 4 | 570 ms | 252 ms |
| 400 | 9 | 874 ms | 362 ms |

`rowsFor` (worker/index.js) calls `chunked()` four times — products, offers,
price_points, images — and `chunked` awaited its chunks in a `for` loop, one
after the other. 400 ids is 9 chunks × 4 families = **36 sequential D1
queries**, and they were what the user waited for.

The residual slope (~20 ms/chunk, down from 58) is D1 partly serialising
concurrent queries. It is no longer the dominant term.

**It was never CPU.** The same handlers profiled in-process against the same
14,059 rows came out at 44–67 ms
([api-read-path-performance](api-read-path-performance.md)). The gap was D1
round trips, which local sqlite has none of.

The whole page fit one model: **prod ms ≈ sequential D1 round trips × ~20 ms.**

| stage | round trips (before) | ~cost | after |
|---|---|---|---|
| Worker + network floor | — | 50 ms | 41 ms |
| `seedCatalog` marker check | 1 | 20 ms | 1 (now carries the catalog version too) |
| `catMeta` | 5 | 100 ms | **0 on a warm isolate** |
| `listIds` (one scan, real CPU) | 1 | 85 ms | unchanged |
| **`rowsFor` for 400 ids** | **36** | **~600 ms** | **~4 waits** |
| 245 KB transfer | — | 23 ms | unchanged |
| | | **≈ 880 ms** (observed 954) | **observed 330** |

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

## Still open

- `listIds`' 85 ms scan (real CPU, already priced) and the 245 KB payload
  (23 ms) — both untouched, both now a visible share of the remaining 330 ms.
- Search's CPU: `q=` is 206 ms, one scan and one round trip. FTS5 is its
  answer ([api-read-path-performance](api-read-path-performance.md) §2).

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
