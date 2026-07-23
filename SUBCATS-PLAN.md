# SUBCATS-PLAN — sub-categories (planned 2026-07-23)

**RESOLVED 2026-07-23** — with one deviation from Phase B: no hand curls.
Facet data lives in the repo and rides the seed (json_patch re-upsert lands
it in prod on deploy, runtime enrichment still survives): extra.json rows
carry their own `"facets": {"type": …}`, and prototype-owned demo rows are
stamped by build.js's `DEMO_TYPE` map (also drowns out the demo spec
strings — 'Home console' etc. — that would otherwise leak into the Type
filter as a second vocabulary). Kitchen got its registry line; **Toys was
skipped** (both rows are building sets → 1 distinct value → the group never
renders; add the line when the catalog diversifies). Canonical `type`
vocabulary is documented in ENRICHMENT.md — discovered (`ean-*`) rows still
get theirs via the admin PATCH there. Phase C (Browse sub-chips) remains
optional/not done; note that its `go('results', {cat, facets})` seeding
must ALSO be mirrored in boot.jsx's router (production discards
AppRouter), e.g. by stashing `history.state.rfilters` before setScreen.

Goal: let a category like Gaming split into Consoles / Handhelds /
Controllers, without building a second navigation system.

## Verdict: we already have the mechanism

Sub-categories are just another **facet** (FILTERS-PLAN.md). `worker/facets.json`
already defines a `type` options facet — the sub-category filter — for
**Audio, Computers, Gaming, Home**. Clicking a category on Browse today
already lands on Results, which already renders a "Type" filter group the
moment ≥2 distinct values exist for that facet. No new table, endpoint, or
upstream UI is required to get filtering-by-subcategory working.

What's actually missing is narrower:

1. **Kitchen and Toys have no facets.json entry at all** — need a `type`
   facet added.
2. **No data.** Gaming/Home's `type` facet is wired to the `SPECS[id].type`
   spec string for a couple of demo products only; Audio/Computers' `type`
   facet has zero values anywhere. An empty-valued facet renders nothing
   (Results hides groups with <2 distinct values) — so today only Gaming
   shows a working Type filter, and only for the 2 seeded consoles.
3. **Not browsable from the Browse page** — sub-categories only appear
   once you're already inside a category's Results filters, not as their
   own tile/chip on `BrowsePage`. Optional, see Phase C.

## The list

Grounded in product kinds already present (or clearly imminent) in each
category — not invented from a generic taxonomy. Categories with only one
product kind so far are skipped (YAGNI; revisit when they diversify).

| Category | Sub-categories (`type` facet values) |
|---|---|
| **Gaming** | Consoles · Handhelds · Controllers & accessories · Games |
| **Audio** | Headphones · Earbuds · Speakers · Soundbars |
| **Computers** | Laptops · Tablets · Desktops · Monitors · Peripherals |
| **Home** | Vacuums & floor care · Smart lighting · Small appliances · Security & climate |
| **Kitchen** | Coffee & espresso · Air fryers · Microwaves & ovens · Small appliances |
| **Toys** | Building sets · Figures & dolls · Outdoor & games |

Skipped for now (single product kind in catalog, no facet needed yet):
TV, Projectors, Phones, E-readers.

## Phase A — registry (repo-only, no upstream edit)

Add a `type` facet to the two missing categories in `worker/facets.json`,
same shape as the existing four:

```json
"Kitchen": [ { "key": "type", "label": "Type", "type": "options" } ],
"Toys":    [ { "key": "type", "label": "Type", "type": "options" } ]
```

## Phase B — data (ongoing, deploy-free)

Set `meta.facets.type` per product to one of the list values above, via
the existing admin PATCH (`facets` already merges into meta —
worker/index.js:976):

```
curl -X PATCH https://pricy.no/api/admin/products/switch2 \
  -H "authorization: Bearer $INGEST_TOKEN" -H 'content-type: application/json' \
  -d '{"facets": {"type": "Handhelds"}}'
```

`tools/apply-specs.mjs` PATCHes `{specs: ...}` from a JSON map — same
pattern, just the wrong key today. Cheapest option: hand curls for the
~20 products that need it now (one-time backfill); only generalize
apply-specs.mjs to a `--key facets` flag if this becomes a recurring
bulk job.

## Phase C — optional: Browse-page sub-tiles (upstream, prototype-owned)

Not required for the filter to work (Results already renders it once
Phase A/B land). Only do this if browsing *into* a subcategory before
picking a category matters for UX. Paste-ready prompt if so:

---8<--- PROMPT FOR CLAUDE DESIGN (prototype project) ---8<---

On the Browse categories page (`PagesBrowse.jsx`), under each category
tile that has a `window.FACETS[cat]` entry with `key === 'type'`, render
up to 4 small sub-chips (one per distinct value of that facet present in
`window.CATALOG`, most-populous first), each linking to
`go('results', { cat, facets: { type: [value] } })`. Results already
accepts filter state restored from `history.state.rfilters`
(Results.jsx) — extend `go`'s results-route init so a `facets` param in
the nav payload seeds `f.facets` on mount, same as `cat`/`query` do
today. Categories without a `type` facet (or fewer than 2 values) show no
chips — unchanged tile. Keep chip labels to the facet's raw option value
(already short strings like "Consoles").

---8<--- END PROMPT ---8<---

Then run the sync ritual (get_file pulls → `npm test` → commit).
