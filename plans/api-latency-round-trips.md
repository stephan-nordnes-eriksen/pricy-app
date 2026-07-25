# A category page costs ~950 ms on prod, and it is round trips, not work

Found 2026-07-25, measuring the freshly deployed server-side sort/filter
against live pricy.no. Nothing here is caused by that change — `cat=Toys` with
no sort measures the same. It was always this slow; nobody had timed prod.

## Current state

Median of 4 cache-busted requests from a laptop, against live:

| request | total | TTFB | payload |
|---|---|---|---|
| `/robots.txt` (network floor) | 55 ms | 54 ms | 2 KB |
| `/api/me` 401 (schema + session lookup) | 45 ms | 45 ms | 0 KB |
| `/api/products?ids=lego` | 318 ms | 315 ms | 12 KB |
| `/api/products?cat=Toys&limit=1` | 404 ms | 402 ms | 9 KB |
| **`/api/products?cat=Toys&limit=400`** | **954 ms** | 931 ms | 245 KB |
| `/api/products?cat=Audio&limit=1` (425 heads) | 327 ms | 325 ms | 9 KB |
| `/api/products?q=hodetelefoner` | 416 ms | 413 ms | 21 KB |

TTFB ≈ total, so the 245 KB transfer is ~23 ms of it. The time is spent before
the first byte, server-side.

**It is not CPU.** The same handlers profiled in-process against the same
14,059 rows come out at 44–67 ms
([api-read-path-performance](api-read-path-performance.md)). The gap is D1
round trips, which local sqlite has none of.

### The measurement that names the culprit

Same category, same scan, only the page size varies:

| rows requested | chunks of 45 | median |
|---|---|---|
| 1 | 1 | 407 ms |
| 45 | 1 | 379 ms |
| 90 | 2 | 429 ms |
| 180 | 4 | 570 ms |
| 400 | 9 | 874 ms |

Flat in rows, **linear in chunks: ~58 ms each**. `rowsFor` (worker/index.js)
calls `chunked()` four times — products, offers, price_points, images — and
`chunked` awaits its chunks in a `for` loop, one after the other. 400 ids is
9 chunks × 4 families = **36 sequential D1 queries**, and they are what the
user waits for.

The whole page fits one model: **prod ms ≈ sequential D1 round trips × ~20 ms.**

| stage | round trips | ~cost |
|---|---|---|
| Worker + network floor | — | 50 ms |
| `seedCatalog` marker check | 1 | 20 ms |
| `catMeta` | 5 | 100 ms |
| `listIds` (one scan, real CPU) | 1 | 85 ms |
| **`rowsFor` for 400 ids** | **36** | **~600 ms** |
| 245 KB transfer | — | 23 ms |
| | | **≈ 880 ms** (observed 954) |

## What "done" looks like

A category page under ~300 ms, by cutting sequential round trips — no schema
change, no new table.

1. **`rowsFor`: 36 round trips → ~4.** Two independent wins, both small:
   - `chunked()` awaits chunks in sequence. The chunks are independent —
     `Promise.all` over them.
   - The four families are awaited one after another (`offs`, then `pts`, then
     `withImg`). They are independent too.
   D1's `batch()` sends many statements in one round trip and the codebase
   already uses it in seven places, so it is the safer shape than raw
   concurrency. **Check first:** whether D1 counts these as subrequests —
   `syncImages` already trips a subrequest budget on the ingest path (CLAUDE.md
   caps that POST at 40 rows), so the same ceiling may apply here. Measure
   against a 400-id page, not a 5-id one.
   - Test-harness note: `test/api.test.js`'s D1 shim implements `batch()` as
     "call `.run()` on each statement" — it returns no rows. Batching SELECTs
     means teaching the shim to return per-statement results, or the API suite
     will pass while prod returns empty pages.
2. **`catMeta`: 5 round trips → 0 on the common path.** Already the standing
   recommendation in
   [api-read-path-performance](api-read-path-performance.md) §1, for a
   different reason (CPU). It is worth ~100 ms of latency on top. Cache it in
   the isolate, invalidated on ingest — `meta.cats` drives visible product
   counts, so do not just guess a TTL.
3. **Re-measure prod after each**, not locally. The whole point of this file is
   that the local harness ranked these two in the wrong order: in-process it
   said `catMeta` was half the request and `rowsFor` was 4 ms; on prod
   `rowsFor` is six times `catMeta`.

Not in scope: `listIds`' 85 ms scan (real CPU, already priced), the 245 KB
payload (23 ms), and search's 416 ms (one scan, one round trip — that one IS
CPU, and FTS5 is its answer).

## Why it stayed hidden

Every previous measurement in this repo ran the Worker in-process over
node:sqlite, where a query costs microseconds and round-trip count is free.
That harness is still right for CPU questions and still the fastest way to
answer them — it just cannot see this class of bug at all.

**Rule going forward: time prod with curl before ranking a latency fix.**
A `%{time_starttransfer}` median over 4 cache-busted requests takes a minute
and would have caught this the day `rowsFor` was written.
