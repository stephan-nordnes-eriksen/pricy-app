# Read-path performance: where the time goes, and what to fix first

Standing reference, not a backlog item. It exists so the next performance
change starts from a measurement instead of an instinct, and so nobody
re-litigates a trade already priced.

> **Read [api-latency-round-trips](api-latency-round-trips.md) first if you
> care about how long a page takes.** Everything below is measured IN PROCESS
> over node:sqlite, where a query costs microseconds — it prices CPU, and it is
> blind to D1 round trips. Timed against live prod, a category page was ~950 ms,
> and the term that dominated it (`rowsFor`'s 36 sequential queries) shows up
> here as 4 ms. Both files are true; they answer different questions. Use this
> one for "which algorithm", that one for "why is it slow".
>
> Both of that file's items shipped 2026-07-26 — a category page is now 330 ms.
> §1 below is done; §2 and §3 stand.

Written 2026-07-25, at 14,059 heads / 14,156 offers / 50 shops / 31
categories, right after `/api/products` learned server-side sort and filters
([search-and-paging-at-scale](search-and-paging-at-scale.md) Done 5).

## The baseline

Prod's own catalog dump replayed into local sqlite, driven through
`worker.fetch` in process (recipe at the bottom). Local sqlite is faster than
D1 over the wire, so treat these as **relative weights, not SLAs** — the
ratios are what matter.

| request | time | payload |
|---|---|---|
| `ids=lego` (PDP) | 44 ms | 11 KB |
| `q=hodetelefoner` (search) | 97 ms | 17 KB |
| `top=drop&perCat=1&limit=4` (browse) | 49 ms | 33 KB |
| `cat=Toys&sort=best&dir=asc` (a category page) | 64 ms | 181 KB |
| `cat=Toys` page 2 | 66 ms | 174 KB |
| no params (all heads) | 67 ms | 198 KB |
| `sort=best` (all heads) | 145 ms | 170 KB |
| `catalog.json` (ops dump, bearer-gated) | 208 ms | 6.1 MB |

**Every row in that table paid ~40 ms of `catMeta` before it did its own
work** — the single most important number *for CPU*. On prod, `catMeta` was 5
round trips (~100 ms) and `rowsFor` 36 (~600 ms); see the round-trips file.
Both are **fixed as of 2026-07-26** — the table above is the pre-fix baseline,
kept because it is still the right *relative* weighting of everything that
remains. Subtract `catMeta` from every row of it.

## The ceilings, in the order they should be fixed

### 1. `catMeta` runs five full-table aggregates on every response — FIXED 2026-07-26

*(Was first by CPU, second by wall-clock behind `rowsFor`. Caching it fixed
both — see [api-latency-round-trips](api-latency-round-trips.md) for the
shipped shape and the two traps it nearly hid. Kept here because the reasoning
below is why it was worth doing, and §3's numbers still quote it.)*

`worker/index.js`, called by both `/api/products` and `/api/catalog.json`.
Counts heads, counts distinct shops, maxes `updated_at`, groups heads by
category, groups stored `facets.type` by category — all unindexed scans over
the whole `products`/`offers` tables, on **every** response including a PDP
`ids=` fetch that touches no category at all.

Measured share of the request: ~36 ms of 64 at 14k rows, 47 ms of 62, and
125 ms of 236 once one category held 50k rows. Roughly **half of every
response, at every size measured.**

Why it was first: it was the biggest single term, it was paid by requests that
got nothing from it, and it was the *easiest* to fix — the numbers only change
on ingest/seed.

Careful, and this shaped the fix: `meta.cats` is what the UI's counts and
category presence read, so stale values show up as wrong product counts on
Browse. Invalidation is tied to a version counter every write bumps, not a
TTL — and the counter lives in D1, because a memo invalidated only in the
isolate that wrote would still serve wrong counts from every other isolate.
A miss is still 5 round trips (`db.batch()` would make it 1, and needs the
test shim taught to return per-statement rows).

### 2. `searchIds` folds the whole meta blob per row per token

97 ms for one query — the second most expensive live request. The diacritic
fold is a `replace()` chain over `json_remove(meta, '$.specs', '$.icon')`,
evaluated per row per token, and it cannot use an index by construction
(see the comment above `FOLD`).

The fix is the one already named there: SQLite **FTS5** over a folded column,
which also closes search's other open item (`LIMIT 100`, no paging — the only
surface that still can't reach past its cap). Do both in one pass; they are
the same migration. Do it when search becomes a main surface, not before.

### 3. `listIds` shapes the whole category in JS

Deliberate: facet values are derived per row (`worker/facetrules.js`), so SQL
cannot see what the rail filters on — `facets.type` is stored on 0 rows and
derived on 7,099 of 14,059. Full reasoning in
[search-and-paging-at-scale](search-and-paging-at-scale.md) Done 5.

It scales linearly. It was a minority of the request; with §1 fixed it is now
the largest CPU term — but the `catMeta` column below is ~0 on a warm isolate,
so read these rows as "request minus catMeta":

| rows in one category | request | catMeta | SQL scan | added by the JS shape | heap |
|---|---|---|---|---|---|
| 1,400 *(largest today)* | 62 ms | 47 | 14 | ~1 ms | <1 MB |
| 10,000 | 80 ms | 57 | 18 | ~5 ms | 4 MB |
| 20,000 | 116 ms | 71 | 23 | ~22 ms | 9 MB |
| 50,000 | 236 ms | 125 | 47 | ~64 ms | 22 MB |

**Trigger to revisit: a single category past ~20k heads** — and even then,
fix `catMeta` first and re-measure, because it is the larger half of that
116 ms. Retained heap is ~440 B/row against a 128 MB isolate, so memory is
not the failure mode until ~100k rows in one category.

The all-heads branch *with* a sort parses all 14k rows (145 ms). One link
reaches it — Browse's "All products". If that ever becomes a real entry
point, it is the first thing to move to SQL, because it is also the case
where facets don't exist (no `cat`, so no rail) and SQL loses nothing.

### 4. `rowsFor` chunking — cheap here, dominant on prod

4 ms in process, ~600 ms live: 400 ids is 9 chunks × 4 query families = 36
sequential D1 round trips. Nothing about it is visible to this harness. Owned
by [api-latency-round-trips](api-latency-round-trips.md).

### 5. The 400-row page is ~180 KB

Not CPU, but it is the biggest thing the browser waits for, and every
sort or filter change fetches a fresh one. Cheapest lever if it matters:
drop `history` from list rows the way `specs` already is (`rowsFor`'s
`expand: false` branch) and let the PDP fetch it — sparklines are the only
list consumer.

### 6. `catalog.json` is 6.1 MB and builds the whole catalog per hit

Already bearer-gated (Done 4). Tools want it whole. Leave it alone unless a
tool starts polling it; then page it *and* keep the gate.

## Priced and rejected — don't re-derive these

- **Universal sorts in SQL `ORDER BY`** (`MIN(o.price)`, `json_extract(rating)`,
  …). Measured free at today's size (13 → 15 ms for the id list) and saves 27%
  of the request even at 50k rows in a category. Rejected anyway: it covers
  only the non-derived half of the sort fields, so it buys a **second**
  implementation of semantics that must stay identical to `Results.jsx`'s
  comparator, and it still cannot filter or count facets. Revisit only for the
  all-heads branch (§3), where no facets exist.
- **Storing derived facet values on the row** (plan option (a)). Wants a
  backfill of every promoted row plus a re-derive pass on every rule change —
  precisely the cost the derived design was chosen to avoid. If it ever
  happens, version the stored blob (`meta.fv` + a rules version) so a stale
  row re-derives lazily on its next ingest instead of needing a migration.
- **A lean row in `listIds`** (drop the parsed `m`, keep the six fields the
  predicate and comparator read). 440 → 280 B/row. Real, but 22 MB against
  128 MB is not a problem worth five lines of indirection.
- **Facet counts narrowed by the other active filters.** A second histogram
  per request. The client never did it either; `meta.fcounts` counts the whole
  category on purpose.

## Rules that produced these numbers

0. **Time prod with curl before ranking a LATENCY fix.** This harness prices
   CPU and cannot see round trips; a `%{time_starttransfer}` median over 4
   cache-busted requests takes a minute. Ranking `catMeta` above `rowsFor`
   from local numbers alone was exactly this mistake.
1. **Measure against the real catalog, never a sample or the seed.** Both
   category-classifier tunings that went wrong were tuned on samples. Pull
   `/api/catalog.json` with the bearer and replay it.
2. **Quote a change as a share of the request it lands in**, not in isolation.
   "+7 ms" sounds bad until you know the request was already 57 ms, half of it
   in a helper neither option touches.
3. **Grow the axis you're worried about** rather than extrapolating one point.
   The category-size table above only became convincing after a synthetic
   category was grown to 50k rows from real ones.
4. **Time the route, not the query.** A fast helper inside a slow handler is
   not a fast page.

## The harness

Kept here rather than in `tools/` — it needs the prod dump, runs in seconds,
and has nothing to rot against. The D1 shim is the same one `test/api.test.js`
uses (node:sqlite, same SQL engine family).

```sh
curl -sS -H "authorization: Bearer $(cat tools/.ingest-token)" \
  https://pricy.no/api/catalog.json -o catalog.json          # 6 MB, ~2 s
```

```js
// profile.mjs — node profile.mjs   (needs node 22+ for node:sqlite)
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker/index.js';

const db = new DatabaseSync(':memory:');
const stmt = (sql, args) => ({
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => { db.prepare(sql).run(...args); return { success: true }; },
});
const DB = {
  exec: async (s) => db.exec(s),
  prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }),
  batch: async (ss) => { db.exec('BEGIN'); try { for (const s of ss) await s.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
};
const env = { DB, INGEST_TOKEN: 'x' };
const call = (p, h) => worker.fetch(new Request('http://pricy.test' + p, { headers: h || {} }), env);
await call('/api/products?cat=Audio'); // creates the schema + seeds

// replay prod on top of the seed
const d = JSON.parse(readFileSync('catalog.json', 'utf8'));
const ins = db.prepare('INSERT OR REPLACE INTO products (id, meta) VALUES (?, ?)');
const insO = db.prepare('INSERT OR REPLACE INTO offers VALUES (?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
for (const p of d.products) {
  // the dump is shaped: strip the derived fields back off to get stored meta.
  // `facets` MUST go — most of it is derived at read time, and leaving it in
  // makes SQL look able to see facet values when it cannot.
  const { id, img, best, drop, shops, stock, offers, history, facets, ...m } = p;
  ins.run(id, JSON.stringify(m));
  for (const o of offers || []) insO.run(id, o.shop, Math.round(o.price), '', o.stock ? 1 : 0, '', '', o.updated_at ?? 0);
}
db.exec('COMMIT');

const row = async (path, n = 6, h) => {
  await call(path, h);
  const t = process.hrtime.bigint();
  let r; for (let i = 0; i < n; i++) r = await call(path, h);
  const body = await r.text();
  console.log(path.padEnd(46), (Number(process.hrtime.bigint() - t) / 1e6 / n).toFixed(0) + ' ms',
    (body.length / 1024).toFixed(0) + ' KB');
};
await row('/api/products?ids=lego');
await row('/api/products?cat=Toys&sort=best&dir=asc');
await row('/api/products?q=hodetelefoner');
```

To grow one axis (category size), insert copies of real rows under a new
`cat` before timing — real meta means real parse and real derive cost:

```js
for (let i = 0; i < 50000; i++) {
  const { id, offers, history, facets, best, drop, shops, stock, img, ...m } = src[i % src.length];
  ins.run(`mega-${i}`, JSON.stringify({ ...m, cat: 'Mega' }));
  insO.run(`mega-${i}`, 'Power', 100 + (i * 7) % 9000, '', 1, '', '', 1);
}
```

To split a request into its parts, comment out `catMeta` in the route and
re-run, or time a request that skips the work you're isolating (`ids=` touches
no category, so it prices `catMeta` + a small `rowsFor` on its own).
