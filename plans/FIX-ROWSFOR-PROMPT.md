# Paste-ready prompt — fix `rowsFor`'s round trips (backlog item G)

Copy the block below into a **fresh** Claude Code session in this repo. It is
its own prompt rather than an `<ITEM>` in
[IMPLEMENT-PROMPT.md](IMPLEMENT-PROMPT.md) because nothing in that one applies:
no crawl, no promotion, no data migration. This is one function, a test-harness
gap, and a measurement that can only be taken against prod.

---

```
Fix backlog item G: /api/products spends ~600 ms of a ~950 ms category page
inside rowsFor, issuing 36 sequential D1 queries for one 400-row page.

Read first, in this order:
1. plans/api-latency-round-trips.md — the measurement, the model, and what
   "done" means. It is 2026-07-25 data against live pricy.no.
2. CLAUDE.md — how this repo works. The rule that matters here: hand-written
   code is only boot.jsx, build.js, worker/, test/ and configs. proto/ and the
   repo-root design files are sync-owned; you will not need to touch them.
3. worker/index.js:512 (`chunked`) and :530 (`rowsFor`) — the code itself.

THE PROBLEM, precisely

`chunked()` (worker/index.js:512) awaits its chunks in a for loop, one after
the next. `rowsFor` then calls it four times in sequence — products (:533),
offers (:550), price_points (:551), images (:552) — and each family re-chunks
the same id list. 400 ids at 45 per chunk is 9 chunks x 4 families = 36
sequential D1 round trips. On the expand path (`ids=`) there is a fifth
sequential loop: the same-category neighbour top-up at :539 runs one query per
category, in series.

Measured on prod, 4 cache-busted runs, median: cost is flat in ROWS and linear
in CHUNKS — 1 id 407 ms, 45 ids 379 ms, 90 ids 429 ms, 180 ids 570 ms, 400 ids
874 ms. About 58 ms per extra chunk. The model that fits the whole page is
"prod ms = sequential D1 round trips x ~20 ms".

WHAT I WANT

Fewer sequential round trips for the same rows, same shape, same order. The
work is already independent — chunks do not depend on each other and neither
do the four families. D1's batch() sends many statements in one round trip and
this repo already uses it in seven places (worker/index.js:207, 319, 354, 384,
1330, 1460, 1523), so it is the shape to reach for before raw concurrency.

Target: a 400-row category page under ~300 ms. Tell me the before and after,
measured against prod the same way (below), not locally.

THE TRAP THAT WILL BITE YOU — read this twice

test/api.test.js's D1 shim (line ~28) implements batch() as "call .run() on
each statement". It returns NOTHING. If you convert rowsFor's SELECTs to
batch() without fixing the shim, the entire API suite still passes and prod
serves empty product pages. Fix the shim to return per-statement results the
way real D1 does, and prove the shim change is real: make it return results,
then deliberately break the new rowsFor code and confirm a test FAILS.

Other constraints that are not negotiable:
- D1 caps bound parameters at 100 per statement. The shim enforces this
  deliberately (it throws above 100) because a category outgrowing the cap
  1101'd in prod on 2026-07-23. Chunk size 45 exists because the EXPAND query
  at :534 binds the id list TWICE (`id IN (...) OR family IN (...)`) = 90
  params. The lean queries bind it once, so they could chunk at ~90 and halve
  their chunk count — that is a legitimate second win, but measure it, do not
  assume it, and never raise a chunk size past the cap.
- Order must survive. `chunked`'s comment states per-product result order
  survives concatenation, the non-expand branch re-sorts prods into the
  caller's id order at :536 (that order IS the ranking for sort= and
  top=drop), and offers must stay price-ordered per product so shapeRows can
  take po[0] as `best`. Promise.all preserves index order; a naive
  race-and-append does not.
- Check whether concurrent D1 calls count against a subrequest budget before
  you fan out wide. This codebase has already hit one: syncImages on the
  ingest path is why that POST chunks at 40 rows (CLAUDE.md). If there is a
  ceiling, batch() sidesteps it better than Promise.all does.
- Do not change the response shape. The row shape is asserted all over
  test/api.test.js and consumed by boot.jsx's hydrateCatalog.

HOW TO MEASURE (the local harness cannot see this bug at all)

Local in-process timing over node:sqlite ranks rowsFor at 4 ms because a query
costs microseconds there — that is exactly how this stayed hidden. Time prod:

  curl -sS -o /dev/null -w "%{time_total} %{time_starttransfer}\n" \
    "https://pricy.no/api/products?cat=Toys&limit=400&cb=$RANDOM"

Median of 4+, always with a cache-busting param (pricy.no API GETs are
edge-cached), always with the Bash sandbox DISABLED — the sandbox has no
network and will fail misleadingly. Take the baseline before you change
anything, and re-run the 1/45/90/180/400 ladder afterwards: if the fix worked,
the line goes flat instead of climbing ~58 ms per chunk.

plans/api-read-path-performance.md is the companion doc — CPU rather than
latency, with a reusable in-process harness at the bottom. Use it for "which
algorithm", not for "why is it slow".

WORKING AGREEMENT

- npm test must pass. Add a test for what you change; verify it FAILS with the
  fix reverted. A test that passes either way is worse than none.
- If the premise is wrong — batch() does not reduce round trips, or the
  ceiling is somewhere else — stop and tell me rather than implementing it
  anyway. The measurement above is one laptop against one edge location.
- Commit in logical chunks with real messages: what was slow, why the fix is
  shaped that way, the measured delta. Push to origin main.
- Deploys are manual and unsandboxed (npm run deploy). Do not deploy without
  telling me first, and verify afterwards with a cache-busted curl.
- When it lands, update the numbers in plans/api-latency-round-trips.md,
  plans/api-read-path-performance.md (§4 and its ordering) and the comment
  above listIds in worker/index.js — all three quote the ~950 ms figure.

Start by taking the prod baseline and showing me the ladder. Do not write code
until we agree the 58-ms-per-chunk shape still reproduces.
```

---

If it comes back saying `batch()` does not help — plausible, D1 may serialise
batched statements server-side — the fallback is `Promise.all` over chunks
with a small concurrency cap, and the interesting question becomes whether the
four families can be one query per chunk instead of four (a UNION ALL over
`offers`/`price_points`/`images` with a discriminator column, unpacked in JS).
Worth 4 round trips instead of 36. Do not let it get built before batch() has
been tried and measured.
