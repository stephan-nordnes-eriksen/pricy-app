# 24 of 31 categories render an empty filter column

**Implemented 2026-07-25.** All 31 categories declare facets
(`worker/facets.json`, 2–7 each) and every one of them renders a non-empty
filter column on a real prod slice — verified by replaying the 14,118-row
`/api/catalog.json` dump through the rules.

Deviation from the plan below: values are derived from the product **name**
in `worker/facetrules.js` and applied in `shapeRows`, not from `srcCat` at
promotion. Two reasons — `srcCat` is only stored on rows that were hidden at
some point (auto-promotion drops it into meta on the way past, and curated
rows never had one), and deriving at read means a rule fix reaches all 14k
rows on the next deploy instead of needing a 14k-row backfill. `type` is one
key among many: the name also carries colour, material, size/volume/weight,
audience, and a dozen category-specific attributes. Explicit `meta.facets`
still wins, so the enrichment path is unchanged.

Found 2026-07-25, after cats.json went from 10 categories to 31.

## Current state

`worker/facets.json` is the per-category facet registry, served as
`meta.facets` by `catMeta` and rendered by upstream Results as one filter
group per `window.FACETS[cat]` def (CLAUDE.md, FILTERS-PLAN.md).

It defines facets for **7** categories: TV, Audio, Phones, Computers,
Kitchen, Gaming, Home.

It defines none for the other 24:

> Projectors, Toys, E-readers, Appliances, Furniture, Lighting, Garden,
> Tools, Auto, Bikes, Sport, Outdoor, Fashion, Shoes, Watches, Jewelry,
> Beauty, Health, Pets, Baby, Books, Office, Hobby, Photo

Those 24 hold the overwhelming majority of the new catalog — Toys 1,387,
Fashion 1,382, Furniture 1,327, Outdoor 1,280, Beauty 898. So the categories
with the most products are exactly the ones with no way to narrow them, and
with no paging (see [search-and-paging-at-scale](search-and-paging-at-scale.md))
filtering is the only way to reach past the first 400.

## What "done" looks like

Every category with meaningful product volume has at least one useful facet,
populated from data we actually hold.

## Plan

1. Start with `type` (the sub-category facet) — SUBCATS-PLAN.md already
   established that `facets.type` is repo-owned data derived from the
   product's sub-category, needs no enrich curls, and `catMeta` already
   aggregates it into `meta.types` for the Browse chips. The scraped
   `srcCat` we now store on every discovered row is a ready-made source
   for it: e.g. Skoringen sends "Dame / Sandaler & Sommersko", Chilli
   sends "Møbler > Sofaer > Hjørnesofaer".
2. Derive `type` from `srcCat` at promotion for the new categories, rather
   than hand-authoring thousands of values. The mapping is the same shape
   as `CAT_RULES` and can live next to it.
3. Only then consider category-specific facets (size for Shoes/Fashion,
   material for Furniture, volume for Beauty) — those need per-product data
   we mostly do not scrape today, so they are an enrichment project, not a
   registry edit.

## Note

Check what upstream Results does with an empty `FACETS[cat]` before
investing — if it renders a bare heading or an empty column, that is a
prototype fix (and therefore a Claude Design pass), not a data problem.
Confirm visually on e.g. /results?cat=Toys first.
