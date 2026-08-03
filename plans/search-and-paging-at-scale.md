# Search and listing quality at 14k products

Found 2026-07-25. The catalog went 647 → 14,059 rows in one session; these
are the query-side limits that scale exposed. All are now fixed (Done 5 was
found by fixing Done 3) — kept as the record of what scale broke and what each
fix cost.

## Fixed already (2026-07-25, commit "search: stop matching the category's
## lucide icon name")

`searchIds` LIKEs the whole meta blob, and `meta.icon` holds the category's
**lucide icon name**. Searching "sofa" returned every Furniture row, "bike"
every Bikes row, "book" every Books row — the product name never entered
into it. Harmless while the 10 categories were all electronics (headphones,
smartphone, laptop); wrong once the icon set became sofa/bike/book/car/
shirt/camera/pill/gem/tent. `$.icon` is now removed from the search blob
alongside `$.specs`. Test asserts it.

## Done 1 — no diacritic folding (2026-07-25, commit 59f8703)

`searchIds` (worker/index.js:563) is a substring LIKE over lowercased meta.
Norwegian catalogs are full of æ/ø/å, and users type without them:

- `q=hundefor` → **0 hits**
- `q=hundefôr` → hits

Same for søljer/soljer, møbler/mobler, kjøkken/kjokken.

**Fixed, and NOT the way this said:** folding happens in the QUERY — the same
`replace()` chain (`foldSql`/`foldJs`) on both sides of the LIKE — so there is
no stored column and no backfill, and hidden plus future rows are covered for
free. Costs a full-blob fold per row per token (15 → 55 ms over 14k rows).
Original fix shape, for the record: an ASCII-folded copy of the text in `kw` (`kwOf`
already builds that field at promotion), and fold the query the same way.
Note this is a **migration, not a one-liner** — `kw` is written once at
promotion and 13,705 rows already have an unfolded one. Needs a backfill
pass, and auto-promoted rows are guarded against re-promotion
(`meta.auto` + hidden checks), so the backfill has to write `kw` directly
rather than re-run promotion.

## Done 2 — search is unranked, capped at 100 (2026-07-25, commit 59f8703)

`LIMIT 100` with no ORDER BY: results come back in rowid order, which is
"whichever shop was crawled first". A search for a specific product can miss
it entirely if 100 other rows matched the substring earlier in the table.
There is no relevance signal at all — an exact name match ranks below a row
that merely mentions the token in its `srcCat`.

**Fixed:** `ORDER BY` scores word-start-in-name (4) > substring-in-name (2) >
brand (1) > mentioned anywhere in the blob (0), ties keep rowid so curated rows
stay first. Measured: q=ring 75 → 96 of 100 rows in Jewelry, q=kjokken 20 → 95
in Kitchen. **Still LIMIT 100 with no paging** — search is the one surface that
can't reach past its cap. SQLite FTS5 is the real answer if search becomes the
product's main surface.

## Done 3 — list queries capped at 400, no paging (2026-07-25)

`PAGE_MAX = 400` (worker/index.js:514) applies to `cat=` and the all-heads
branch. It was added this session precisely because these were unbounded and
the SPA renders one card per row. But Toys now has 1,387 products and
Fashion 1,382, so **~70% of a large category is unreachable** — sorted by
rowid, so what you get is "the shops we crawled first", not the best or
cheapest.

**Fixed (server side):** `listIds` (worker/index.js) replaces both raw
queries. Ranked by **offer count DESC, rowid** — the rows several shops carry
lead, offer-less rows sink, ties keep curated seed rows first — and paged
with `&limit=&offset=` (limit clamped to `PAGE_MAX`). Totals to page against
already ride every response (`meta.cats[cat]`, `meta.products`). Cost on a
synthetic 14k-row copy: 1.3 → 8 ms per category query, 11 ms for all heads;
the sort can no longer stop early at LIMIT, which is the whole bill.

**Upstream shipped it too** (synced 2026-07-25): Results reveals 60 rows at a
time, its "Load more" calls `window.onLoadMore({cat, offset})` once the local
list is exhausted, `searchCatalog`'s memo takes a bump token so rows merged
into CATALOG in place become visible, and the count reads "400 of 1 387
products". boot.jsx answers with `fetchProducts({cat, offset: page * 400})`,
counting pages per category — offsetting by the rows on screen would step past
rows in the server ranking, since a cat slice can already hold rows from an
`ids=`/`sort=drop` fetch. Verified on prod: the 7th click fetches
`?cat=Toys&limit=400&offset=400` and the count goes to 800 of 1 387.

The same pass reworked sorting (unprompted, kept): a grouped field menu with
per-field direction toggles, spec axes derived from the category's FACETS
defs, and the active field's value badged on each row.

## Done 4 — /api/catalog.json is now 7.2 MB (2026-07-25)

worker/index.js:990. Its own comment already called this:

> ponytail: cap it when the catalog outgrows one response

It has. The SPA never calls it (ops/tools only, per CLAUDE.md), so nothing is
broken today, but it is an unauthenticated route that builds and serialises
every row on each request.

**Fixed:** gated behind `INGEST_TOKEN` (same `ingestAuth` as ingest/admin) —
paging it alone wouldn't have helped, an unauthenticated caller can loop
pages. Kept whole because the tools want the whole thing:
`tools/group.mjs` and `tools/fetch-specs.mjs` now send the bearer they
already read from `tools/.ingest-token` (`enrich.mjs` only ever used
`?hidden=1`, which is untouched). Ops one-liners need
`-H "authorization: Bearer $(cat tools/.ingest-token)"` from now on.

## Done 5 — sort and filters were client-side, over hydrated rows (2026-07-25)

Paging fixed WHICH 400 rows you could reach; it did not fix what "first page"
meant. Results sorts and filters in the browser over whatever CATALOG holds,
so on Toys (1,387 products, 400 loaded) "Price: cheapest first" meant cheapest
of the loaded 400 — **kr 19, against kr 2 in the category** — "Brand: LEGO"
searched 400 rows for LEGO, and the rail's facet counts counted the slice.

**Fixed:** the whole query travels. `/api/products` takes
`sort=<SORT_FIELDS id | facet:key>&dir=`, `brand=a,b`, `min`/`max`, `rating`,
`sale=1`, `instock=1`, `facets=<json>`, and answers with `meta.total` +
`meta.fcounts`.

Which of the plan's (a)/(b)/(c) — **(b), measured, not guessed.** Facet values
are derived per row (`worker/facetrules.js`), and on the real 14k catalog
`facets.type` is **stored on 0 rows and derived on 7,099**, so SQL sees 0% of
what the rail filters on: (c)'s "split it" would have left the rail lying and
still needed a second code path. (a) wanted a backfill plus a re-derive pass on
every rule change — the exact cost the derived design was chosen to avoid.

(b) is cheap because the bill was already paid elsewhere. Replayed prod's
14,059 heads into local sqlite and timed the route itself:

| request | before | after |
|---|---|---|
| `cat=Toys` (default page) | 60 ms | 64 ms |
| `cat=Toys&sort=best&dir=asc` | 60 ms | 65 ms |
| `cat=Fashion&sort=name` | 56 ms | 68 ms |
| all heads, no params (SQL fast path) | 64 ms | 66 ms |
| all heads **with a sort** (14k rows parsed) | 64 ms | 144 ms |

`catMeta` alone is 36 ms of every one of those and `rowsFor` 4 ms — the
whole-category shape is ~7 ms of a 64 ms request. The id-list SQL sorts
(`ORDER BY MIN(o.price)`, `json_extract(rating)`, …) measured free too,
13 → 15 ms, but they only ever cover the non-derived half, so they buy a
second implementation of the same semantics and no facet honesty. Not taken;
noted in `listIds` as the upgrade path if "All products" with a sort ever
matters.

**Does it hold when a category has many thousands of products?** Measured, not
assumed — one synthetic category grown from real rows, whole request timed:

| rows in the category | request | catMeta | SQL scan | added by (b) | heap |
|---|---|---|---|---|---|
| 1,400 (today's largest) | 62 ms | 47 | 14 | ~1 ms | <1 MB |
| 10,000 | 80 ms | 57 | 18 | ~5 ms | 4 MB |
| 20,000 | 116 ms | 71 | 23 | ~22 ms | 9 MB |
| 50,000 | 236 ms | 125 | 47 | ~64 ms | 22 MB |

Linear, and never the dominant term. At 50k rows — 36x the biggest category we
have — moving the sorts to SQL takes the request 236 → ~172 ms (−27%) and buys
a second implementation that still cannot filter or count derived facets. The
real wall is **catMeta**: five full-table aggregates on EVERY response (a PDP
`ids=` fetch pays them too), ~53% of the request at every size measured, and
cacheable — it only changes on ingest. Fix that before touching this. Memory is
not the failure mode: ~440 B retained per row, 22 MB at 50k, against a 128 MB
isolate.

Two things fell out for free, both impossible from a partial cache:
`meta.total` (rows matching the query — the count line can stop saying
"400 of 1 387" once a filter is on) and `meta.fcounts` (the category's facet
histogram, ≤ 908 bytes for the worst category, so the rail can offer every
value in the CATEGORY instead of every value in the page).

Ordering is deliberately NOT a contract: `hydrateCatalog` merges slices into
one session cache, so a served order is lost the moment a second slice lands.
The client keeps sorting locally and the server's only job is putting the
RIGHT rows in the cache — cheaper, and it makes the response order free to
ignore. `matches`/`sortRows`/`fval` in worker/index.js therefore mirror
Results' own predicate and comparator line for line, quirks included; if they
drift, `list.length` and `meta.total` disagree on screen.

**Upstream shipped it too** (synced 2026-07-25): `window.onLoadMore` is now
`window.onQuery({cat, sort, dir, filters, page})`, called on a 250 ms debounce
whenever the query changes (mount included — boot's route prefetch asks for the
same slice, so the mount call is a cache hit) and again for "Load more". The
screen owns the page number, resets it with the query, and reads `total` /
`fcounts` off the resolved value: the count line stops saying "400 of 1 387"
once a filter is on, "Load more" disappears at the real end of a filtered set,
and the rail lists every value in the CATEGORY rather than every value in the
page. A `q=` search never calls it — the client already holds all ≤100 rows.

## What this plan did not close

- **Search still truncates at 100** with no `offset` (Done 2). The list
  branches page; search doesn't — and `sort=`/filters do nothing on a `q=`
  query, where the client already holds the whole (≤ 100 row) result set.
- ~~**`/api/products?hidden=1` is still unauthenticated**~~ — gated 2026-07-26,
  same as the dump in Done 4, along with the `ids=` read of hidden rows it
  shared a root cause with: [hidden-rows-readable-by-id](../plans-implemented/hidden-rows-readable-by-id.md).
- ~~**Facet counts are pre-filter**~~ — **closed 2026-07-27**: `meta.fcounts`
  is cross-filtered now (a row counts toward group `k` when it misses nothing
  but `k`), computed in the same shaping pass, not a second histogram. Values
  still emit at 0 rather than pruning, so the rail's groups can't vanish under
  an active selection. See CLAUDE.md.
