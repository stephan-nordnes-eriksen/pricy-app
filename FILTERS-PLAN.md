# FILTERS-PLAN — per-category facet filters (planned 2026-07-22)

Goal: category-specific filters on Results — TV filters by screen size /
panel / refresh rate, Audio by ANC / fit, etc. — without hardcoding filter
UI per category, and growable without upstream edits (same philosophy as
the dynamic categories registry, `worker/cats.json`).

## Current state (verified)

- Filtering is **fully client-side** over `searchCatalog({query, cat})`
  (proto/Results.jsx:328-360). A `cat=` slice serves ALL heads in the cat
  (no paging yet — worker/index.js:877 comment), so client-side filtering
  is complete and stays instant. **Keep it client-side.** Revisit only
  when cat slices get paging.
- The only spec-ish filter today is a hardcoded `nc` boolean
  (Results.jsx:248,307,357) shown for EVERY category — it dies in this
  work, replaced by a data-driven Audio facet.
- Brand/price/rating/sale/instock filters are generic — untouched.
- `shapeRows` (worker/index.js:391) spreads the whole product meta into
  API rows (`id, ...m`), and boot's `hydrateCatalog` Object.assigns rows
  into CATALOG. So a `meta.facets` object on a product **already rides
  end-to-end with zero worker/boot changes**.
- Specs already ride rows as display strings (`p.specs` → `SPECS[p.id]`,
  boot.jsx:558): `{ size: '55″', refresh: '144 Hz', panel: 'QD-OLED',
  anc: true, ... }`. Facet keys will REUSE spec keys.

## Design

Two data pieces, one generic UI:

1. **Facet registry** — `worker/facets.json` (new, hand-written, like
   cats.json): per-cat ordered facet definitions.

   ```json
   {
     "TV":     [ { "key": "size",    "label": "Screen size",  "type": "options", "unit": "″" },
                 { "key": "panel",   "label": "Panel",        "type": "options" },
                 { "key": "refresh", "label": "Refresh rate", "type": "options", "unit": "Hz" } ],
     "Audio":  [ { "key": "anc", "label": "Noise cancelling", "type": "bool" },
                 { "key": "fit", "label": "Fit",              "type": "options" } ],
     "Phones": [ { "key": "refresh", "label": "Refresh rate", "type": "options", "unit": "Hz" } ]
   }
   ```

   Types: `options` (multi-select checkboxes with counts, OR within the
   facet, AND across facets — exactly like Brand), `bool` (a "Show only"
   check), `range` (min/max numeric inputs like Price — skip in v1 unless
   a facet needs it; options with numeric sort covers size/refresh).
   Option lists are NOT enumerated in the registry — they derive from the
   values present in the result set, like brands do. Growing filters =
   editing this file (+ data), deploy. No upstream edit.

2. **Facet values** — per-product, from two sources, first wins:
   - `p.facets` (`meta.facets` in D1, e.g. `{ "size": 55, "panel":
     "OLED", "refresh": 120 }`) — set by enrichment for real products.
   - fallback `SPECS[p.id]` — the existing spec display strings, so every
     spec'd product filters with NO new data. Normalization (one rule,
     lives upstream in the facet UI): a value whose `parseFloat` hits at
     the string start becomes that number, else trimmed string, bools as
     is. `'55″'` → 55, `'144 Hz'` → 144, `'QD-OLED'` stays. So an
     enriched `55` and a spec `'55″'` group to the same option; display
     is `value + (unit ? ' ' + unit : '')`; options sort numeric-first.

3. **Generic UI (upstream)** — FiltersBody + FilterBar render a group per
   `FACETS[cat]` entry between Brand and Price; chips, clear-all and the
   reset-on-nav effect include facet state. Facet filters only render
   when `cat` is set (a free-text query spans cats — no cat facets).

## Phase A — upstream (Claude Design prototype), then re-sync

Paste-ready prompt — give this to the prototype project:

---8<--- PROMPT FOR CLAUDE DESIGN (prototype project) ---8<---

Add data-driven per-category facet filters to the Results screen.

1. In AppData.jsx define and export (via the existing Object.assign
   window block):

   const FACETS = {
     TV:     [ { key: 'size',    label: 'Screen size',  type: 'options', unit: '″' },
               { key: 'panel',   label: 'Panel',        type: 'options' },
               { key: 'refresh', label: 'Refresh rate', type: 'options', unit: 'Hz' } ],
     Audio:  [ { key: 'anc', label: 'Noise cancelling', type: 'bool' },
               { key: 'fit', label: 'Fit',              type: 'options' } ],
     Phones: [ { key: 'refresh', label: 'Refresh rate', type: 'options', unit: 'Hz' } ],
   };

   Always read it as `window.FACETS` at render time (the production boot
   layer replaces its contents from the server, same pattern as
   CATALOG/CATEGORIES).

2. Facet value of product p for key k:
   `const fval = (p, k) => norm((p.facets || {})[k] ?? (SPECS[p.id] || {})[k])`
   where norm(v) = v == null ? undefined : typeof v === 'boolean' ? v :
   isFinite(parseFloat(v)) ? parseFloat(v) : String(v).trim().
   Display an option value as `String(v) + (def.unit ? ' ' + def.unit : '')`.

3. In Results: extend filter state with `facets: {}` (key → array of
   selected option values, or true for bool). Only when the results are a
   category (`cat` set), for each def in (window.FACETS[cat] || []):
   - type 'options': a filters__grp titled def.label listing the distinct
     fval values present in baseResults (numbers sorted ascending, then
     strings alphabetically), each a Check with the count of matching
     products, multi-select like Brand (OR within, AND across facets).
     Products with no value for the key are only excluded when the facet
     has a selection. Hide the group entirely when fewer than 2 distinct
     values exist.
   - type 'bool': a Check under "Show only" (keep sale/instock there).
   Mirror the same groups as Dropdowns/pills in the FilterBar (topbar
   layout).
4. Wire facet selections into the list filter, the active-filter chips
   (label `${def.label}: ${display}`), the "Clear filters" button, and
   the reset-on-nav effect.
5. REMOVE the hardcoded "Noise cancelling" filter (f.nc — the check in
   FiltersBody, the pill in FilterBar, its chip and its list predicate):
   the Audio `anc` bool facet replaces it, and it must no longer appear
   for non-Audio categories.
6. Keep everything else (Brand/Price/Rating/On sale/In stock, sorts,
   views) exactly as is.

---8<--- END PROMPT ---8<---

Then run the sync ritual (get_file pulls → `npm test` → commit).

## Phase B — repo wiring (small, after the sync lands)

- `worker/facets.json` — the registry above (initial content: TV, Audio,
  Phones; grow freely).
- `worker/index.js` — `import FACETS from './facets.json'`; `catMeta`
  returns `facets: FACETS` next to `icons` (worker/index.js:499). Admin
  PATCH allowlist (worker/index.js:~950): accept `facets` as an object,
  same clause as `variants`.
- `boot.jsx` — in `hydrateCatalog` next to the CATEGORIES merge: replace
  `window.FACETS` contents in place with `CATALOG.meta.facets` when
  served (delete own keys, assign — served registry wins; the baked
  upstream FACETS is demo-only).
- `build.js` — nothing. Facet fallback reads SPECS, which already ride.
- Tests:
  - api.test.js: meta carries `facets` with the TV defs; PATCH
    `{facets: {size: 55}}` merges into meta and rides
    `/api/products?ids=` rows.
  - ui.test.js: boot a `?cat=TV` slice where seed specs give ≥2 sizes;
    assert the "Screen size" group renders with parsed options ('55 ″'
    style labels), clicking one filters the rows, and the group is
    absent for a cat with no facet defs. Assert the NC pill is gone
    outside Audio.

## Phase C — data (ongoing, deploy-free)

- Real/discovered products get facets via the existing admin API:
  `PATCH /api/admin/products/:id {"facets": {"size": 65, "panel":
  "OLED", "refresh": 120}}` (bearer = INGEST_TOKEN). Add a facet-curl
  printer to `tools/enrich.mjs` and a short section to ENRICHMENT.md.
- Later (separate task, only when manual enrichment hurts): extract
  facet values at ingest from source names/JSON-LD ('65"' in a TV name →
  size: 65), same spirit as auto-promotion.

## Phase D — per-category coverage (researched 2026-07-23)

Current `worker/facets.json` only covers TV/Audio/Phones(refresh). Went
category by category (product counts as of today, `worker/extra.json` +
prototype demo rows) to decide what's worth adding.

**RESOLVED 2026-07-23:** the variant-aware `fval` landed upstream (synced;
returns the axis option ids as an array when no facet/spec value exists,
Results counts/matches arrays as "any option"). `storage` is live in
facets.json for Phones and Computers. Gaming storage stays OFF: its values
parse badly (`'1 TB SSD'` spec string and `'1tb'` axis id both parseFloat
to 1 → a wrong "1 GB" option); needs TB-aware normalization upstream if
ever wanted. Original analysis kept below.

**Blocker found: facets are scalar, storage is per-variant.** `fval`
(AppData.jsx) returns ONE value per product; a phone/tablet/laptop's
storage lives in `p.variants.axes` (multiple options, e.g. S26 = 256GB
*or* 512GB), not a flat spec. Faking a single value (pick the base tier)
would silently exclude products from a "512 GB" filter that legitimately
sell a 512GB config. This blocks storage on Phones (the requested
example), Computers, and Gaming (console storage) alike — one fix
unblocks all three, so it's worth doing once rather than faking per-cat.
Proposed fix (upstream, small): let `fval` return an array when the key
matches a variant axis id, and teach the two consumers (facetBase
counting, the filter predicate) to treat an array as "any option
matches" instead of exact-equals. Paste-ready prompt below when ready to
do this.

Recommendations:

- **TV** (2 products) — already covers size/panel/refresh. Leave as is.
- **Audio** (5 products) — anc/fit already there, but the category mixes
  earbuds/headphones with a smart speaker (Google Home), which has
  neither. Add `type: options` (Headphones / Earbuds / Speaker) so the
  irrelevant groups don't show for speaker rows (they already won't
  match, but a type filter lets shoppers separate the two kinds).
- **Phones** (10 products) — add `storage` (blocked, see above), `size`
  (screen size — already a SPECS key, parses fine via facetNorm), `g5`
  (bool). refresh stays.
- **Computers** (3 products) — mixes laptops (MacBook Air) and tablets
  (iPad, Tab S10). Add `type: options` (Laptop / Tablet) first — without
  it a "Screen size" or "Storage" filter mixes two very different
  products. `storage` blocked (same variant gap); `ram` is not
  variant-selectable in this catalog so it's safe as a scalar facet
  today.
- **Gaming** (5 products) — mixes consoles (PS5, Xbox, Switch) with
  controllers (Joy-Con, Pro Controller). Add `type: options` (Console /
  Handheld / Controller) first. `disc` (bool) is meaningful for consoles
  only — fine, `fval` returns `undefined` for controllers and the facet
  UI already skips products with no value. `storage` blocked.
- **Home** (2 products, growing) — mixes vacuums (Dyson/Roborock demo)
  and smart lighting (Hue). Add `type: options` (Vacuum / Lighting)
  first, then `mop` (bool, vacuum-only) and `protocol` (options,
  lighting-only — Zigbee/Bluetooth/Wi-Fi).
- **Toys** (2 products), **E-readers** (2 products) — too few products
  for a filter to do anything (`FGroup` already hides itself under 2
  distinct values). Defer. Candidates once the catalog grows: Toys →
  `pieces` (options, LEGO piece count), `age`; E-readers → `storage`,
  `ip` (waterproofing, bool).
- **Kitchen** (3 products) — no `SPEC_KINDS` schema at all, and the 3
  products (coffee maker, air fryer, microwave) share no attributes — a
  `type` facet here is just re-showing the category as three 1-item
  groups, not filtering. Skip; revisit only if Kitchen grows enough
  sub-categories to actually cluster (e.g. 3+ coffee makers).
- **Projectors** — zero products in the catalog. Nothing to do until
  products exist.

---8<--- PROMPT FOR CLAUDE DESIGN (prototype project) — variant-aware facets ---8<---

In AppData.jsx, `fval(p, k)` currently returns a single scalar (explicit
`p.facets[k]`, else `SPECS[p.id][k]`, normalized). Extend it: if neither
source has a value AND `p` has `p.variants.axes` with an axis whose `id
=== k`, return that axis's option ids mapped to numbers where they parse
(e.g. `['128','256','512']` → `[128,256,512]`), else the string ids
array. Keep the existing scalar behavior when a real facets/spec value is
present (variants are the last fallback, not an override).

In Results.jsx, the two places that read `fval` for an 'options' facet
need to handle an array result as "this product has ALL these values,
not one": `facetBase` counting should increment every value in the array
(not just the first) when building `vals`/`counts`, and the filter
predicate should change `!sel.includes(v)` to `Array.isArray(v) ?
!v.some(x => sel.includes(x)) : !sel.includes(v)`. Everything else
(bool facets, display, chips) is unchanged since only 'options'-type
facets hit this path.

---8<--- END PROMPT ---8<---

## Non-goals (deliberate)

- Server-side facet filtering / facet params on `/api/products` — cat
  slices are complete; revisit with paging.
- Filter state in the URL — filters reset on nav today; unchanged.
- MCP facet params on search_products — add when an AI client needs it.
- `range`-type UI — options with numeric sort covers v1.
