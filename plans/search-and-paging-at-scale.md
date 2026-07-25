# Search and listing quality at 14k products

Found 2026-07-25. The catalog went 647 → 14,059 rows in one session; these
are the query-side limits that scale exposed. One of them was a live bug and
is already fixed (recorded here for context); the rest are open.

## Fixed already (2026-07-25, commit "search: stop matching the category's
## lucide icon name")

`searchIds` LIKEs the whole meta blob, and `meta.icon` holds the category's
**lucide icon name**. Searching "sofa" returned every Furniture row, "bike"
every Bikes row, "book" every Books row — the product name never entered
into it. Harmless while the 10 categories were all electronics (headphones,
smartphone, laptop); wrong once the icon set became sofa/bike/book/car/
shirt/camera/pill/gem/tent. `$.icon` is now removed from the search blob
alongside `$.specs`. Test asserts it.

## Open 1 — no diacritic folding

`searchIds` (worker/index.js:563) is a substring LIKE over lowercased meta.
Norwegian catalogs are full of æ/ø/å, and users type without them:

- `q=hundefor` → **0 hits**
- `q=hundefôr` → hits

Same for søljer/soljer, møbler/mobler, kjøkken/kjokken.

**Fix shape:** an ASCII-folded copy of the searchable text in `kw` (`kwOf`
already builds that field at promotion), and fold the query the same way.
Note this is a **migration, not a one-liner** — `kw` is written once at
promotion and 13,705 rows already have an unfolded one. Needs a backfill
pass, and auto-promoted rows are guarded against re-promotion
(`meta.auto` + hidden checks), so the backfill has to write `kw` directly
rather than re-run promotion.

## Open 2 — search is unranked, capped at 100

`LIMIT 100` with no ORDER BY: results come back in rowid order, which is
"whichever shop was crawled first". A search for a specific product can miss
it entirely if 100 other rows matched the substring earlier in the table.
There is no relevance signal at all — an exact name match ranks below a row
that merely mentions the token in its `srcCat`.

**Fix shape:** rank before truncating. Cheapest useful signal is match
position/field (name > brand > kw > srcCat) plus offer count. SQLite FTS5
is the real answer if this becomes the product's main surface.

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
