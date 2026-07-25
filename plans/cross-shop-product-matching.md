# Only 94 of 14,059 products have more than one shop's price

Found 2026-07-25. This is the one that matters most: a price-comparison site
where 99.3% of products have a single offer is a catalog, not a comparison.

## Current state

Identity works two ways (worker/sources.js):

- **EAN** — `ean-<digits>`, routed through the D1 `eans` table. Two shops
  sending the same barcode merge for free. This works well.
- **Brand + name slug** — `slugId()` (worker/sources.js:171), added this
  session so the ~half of Norwegian shops that publish no `gtin` produce
  products at all. It merges only when two shops write a product's name
  *identically*.

Measured on the live catalog: **94 products with >1 offer, out of 14,059.**

Two separate causes, worth separating before fixing:

1. **Sampling.** Each shop was crawled at `limit: 400` strided across its
   sitemap, not exhaustively. Two shops both stocking a product are unlikely
   to have both landed in their respective 400-page samples. This inflates
   the problem and is cheap to reduce — raise `limit` and re-run.
2. **Matching.** Where both shops *were* sampled, slug matching is brittle.
   Real examples from the crawl: "Bergans of Norway" vs "Bergans" as brand;
   "Sony WH-1000XM5 trådløs hodetelefon" vs "Sony WH-1000XM5 støyreduserende
   hodetelefoner over-ear". Same product, different slug, no merge.

## Also: slug identity is fragile

`slugId` keys on text the shop controls. A shop editing a product title
strands the old row (which keeps its stale offer) and creates a new one.
The existing escape hatch is `POST /api/admin/alias`, which re-homes an
EAN — it does not re-home a `p-*` id onto another `p-*` id.

## What "done" looks like

A meaningful share of products show two or more shops, and a product that
two shops both stock reliably lands on one row.

## Plan

1. **Raise coverage first, then re-measure.** Cause 1 is confounding cause 2.
   Re-run with a much higher `limit` (or no limit for small shops) and
   recount before writing any matching code — the answer may be "it was
   mostly sampling".
2. **Prefer more EANs over better fuzzy matching.** `gtin` is the only
   reliable cross-shop key we get. Before building a matcher, check whether
   shops expose barcodes anywhere else on the page (microdata, a spec table,
   an embedded JSON blob) that `productOffer` currently ignores. Cheapest
   real win.
3. **Then** consider a matching pass over `p-*` rows: normalise brand
   aliases, strip marketing suffixes, compare on brand + model token
   (the alphanumeric SKU-ish token, e.g. `WH-1000XM5`, is far more
   discriminating than the prose around it). `tools/group.mjs` already
   exists to cluster discovered rows and print human-confirmed grouping
   curls — extend that rather than auto-merging. **Never auto-merge on a
   fuzzy score**: merging two different products shows a wrong price, which
   is the worst failure this site has.
4. Extend `POST /api/admin/alias` to re-home `p-*` → `p-*` so a confirmed
   match (and a shop rename) can be fixed without a deploy.

## Note

Watch the accessory trap while matching: "Sony WH-1000XM5" and "Sony
WH-1000XM5 etui" are one token apart and must not merge. `JUNK_RE` catches
some of these at promotion, but a matcher needs its own guard.
