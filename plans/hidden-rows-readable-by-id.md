# Hidden products stay fully readable at their PDP URL

**DONE 2026-07-26.** Intent decided: `hidden` means *not served*, not
"unlisted". Both premises were re-measured on prod first and both still held
(`?hidden=1` → 200 with the 200-row backlog; `ids=<demoted id>` → the row in
full plus 4 padded neighbours). The fix went into `rowsFor` rather than the
`ids=` branch — every read path routes through it, so MCP `get_product` was
leaking the same rows and would have stayed broken. Ops opts back in with the
`INGEST_TOKEN` bearer on `ids=` *and* on the `?hidden=1` listing, which was
unauthenticated (that was §4 of [read-path-whats-left](read-path-whats-left.md),
tracked as the highest-value open item). `tools/enrich.mjs` and
`tools/group.mjs` now send the token; ENRICHMENT.md's verify step shows it.
The demotion test asserts all three directions and fails without the fix.

Found 2026-07-25. A deliberate design decision that stopped holding once
auto-discovery started creating (and admin triage started demoting) rows at
scale.

## Current state

`visible()` (worker/index.js:519) excludes `meta.hidden = 1` from search,
`cat=`, all-heads, `catMeta` and `catalog.json`. The `ids=` branch
(worker/index.js:1015) deliberately does not apply it — the comment above
`visible()` says so explicitly:

> direct id fetches (rowsFor) still work so ops/enrichment can inspect them

That was reasonable when hidden meant "an ops backlog nobody has a URL for".
It isn't now. Live check against the fee row demoted during this session:

```
GET /api/products?ids=p-ovrigt-ovrigt-handteringsavgift
→ 5 rows: the hidden product itself (hidden=1, full name/cat/offers)
          + 4 same-category neighbours the expand added
```

Two consequences:

- **Demotion doesn't demote.** `PATCH /api/admin/products/:id {hidden:1}` is
  the documented way to kill a bad auto-promoted row (ENRICHMENT.md), but the
  product keeps a working product page — boot's `product` route fetches
  exactly `{ids: params.id}` (boot.jsx:321). The row only disappears from
  listings.
- **The undiscovered backlog is enumerable.** Every unpromoted `ean-*` /
  `p-*` row is readable by anyone who can guess or derive the id, and `ean-*`
  ids are derived from the barcode, so they are guessable by construction.

Neither is a data-breach — it's public catalog data, not user data — but
"hidden" currently means "unlisted", and the admin API's contract implies
more than that.

## What "done" looks like

`hidden: 1` means not served to a normal caller on any route. Ops can still
inspect hidden rows, through a path that is authenticated.

## Plan

1. Apply `visible()` to the `ids=` branch for unauthenticated/normal callers.
2. Keep ops access by honouring the existing `hidden=1` listing parameter
   (worker/index.js, the enrichment branch) and/or accepting the
   `INGEST_TOKEN` bearer on `ids=` to opt back into hidden rows — the admin
   surface already gates on `ingestAuth`.
3. Check `rowsFor`'s expand step while there: it pads with same-category
   neighbours via a query that *does* filter on `visible()`, so the padding
   is fine; only the explicitly-requested ids leak.
4. Test: demote a row, assert `ids=` no longer returns it, assert the
   token'd call still does. The existing promotion test already demotes a
   row and only asserts it vanishes from search — extend that one.

## Note

Decide the intent first. If "hidden" is only ever meant to mean "unlisted",
then the fix is to say so in ENRICHMENT.md and leave the code alone — but
then demotion is not a usable moderation tool for a bad product page, and
something else has to be.
