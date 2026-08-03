# "Biggest drops" can only ever show the 64 seed products

Found 2026-07-25, during the crawl that took the catalog from 647 to 14,059
products. Not a regression — a pre-existing dependency that only became
visible at scale.

## Current state

`topDropIds` (worker/index.js:583) ranks by `1 - MIN(offer.price) /
meta.was`, and its WHERE clause requires `json_extract(p.meta, '$.was') > 0`.

`meta.was` is a seed-file field. Auto-promotion (worker/index.js, the
`promoted[...]` assignment) never sets it, and neither does discovery. Counted
against the live catalog dump:

- auto-promoted rows: **13,705** — with a `was` baseline: **0**
- seed rows with `was`: **64**

So both surfaces that call it are stuck on those 64 rows:

- Home's "Biggest drops" sidecard — `ensureRoute('home')` fetches
  `{sort:'drop', limit:3}` (boot.jsx:319).
- Browse's per-category drop cards — `{sort:'drop', perCat:1, limit:4}`
  (boot.jsx:328).

Still true after the GPC-departments swap (2026-07-31): Browse's tiles are
GS1 GPC departments now, but the drop cards and the `top=drop` fetch ride
`cat=` unchanged (a dept is a navigation alias over cats — see
plans-implemented/gpc-departments.md), and `ensureRoute` even leans on the
drops slice to resolve cold deep-links. Fixing the baseline here needs no
GPC awareness.

Live check: `sort=drop&perCat=1&limit=4` returns 13 cards total, across a
catalog with 31 categories. **24 of 31 categories can never show a drop
card** — every category this session added is one of them.

## Why it matters

Browse is the main discovery surface and its cards are the only thing on it
besides category counts. A user opening Beauty (898 products) or Furniture
(1,327) sees an empty section, which reads as "this category is broken"
rather than "we have no price history here yet".

## What "done" looks like

Every category with priced history can produce drop cards, and a product's
"was" reflects real observed history rather than a hand-authored seed field.

## Plan

1. Derive the baseline from `price_points` instead of `meta.was` — the table
   already has one row per product per day (`INSERT … ON CONFLICT(product_id,
   day) DO UPDATE SET price = MIN(...)`). A 30-day max, or the price at the
   window's start, is the honest "was".
2. Keep `meta.was` as an override where a seed row sets it, so the curated
   demo products don't change behaviour.
3. Guard the ranking: a product needs at least 2 distinct days of history
   before it can claim a drop, or day-one rows all read as 0% and rank
   randomly.
4. Watch the cost — `topDropIds` does a full head scan per call. Its ~2k-heads
   comment was measured pessimistic by ~7× (22–34 ms at 14k on prod D1,
   [read-path-whats-left](read-path-whats-left.md) §3), so the scan itself is
   fine — but joining `price_points` changes the query, and the Worker CPU
   ceiling (§0 of the same file) is live. Measure the new shape before
   shipping; a stored drop column is the fallback, not the default.

## Note

This is also why the catalog looks "flat" — with one crawl there is exactly
one price point per product, so no product has a drop yet regardless. The
ranking work above only pays off once the crawl runs on a schedule
(see [ingest-crawl-robustness](ingest-crawl-robustness.md)).
