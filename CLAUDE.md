# pricy.no

Price comparison site for Norway, deployed to Cloudflare Workers.
Two Claude Design projects feed this repo:

- **Prototype (the product):** `7fa9cba6-ae13-4aa3-9ae4-f76a18ff1573`,
  dir `pricy/` → synced to `proto/`. `pricy/index.html` is a thin loader:
  babel `<script src="X.jsx">` refs + `<link>`ed css, one split file per
  component, all next to it (every file is under the 256 KiB get_file cap).
- **Design system (tokens/kit):** `ee80f3e5-c405-4e58-9c44-689deea0f932`
  → synced to repo root (`colors_and_type.css`, `ui_kits/`, `preview/`,
  `assets/`, `_ds_*`). Reference only; the app is built from the prototype.

## How it works

`node build.js` turns `proto/` into `dist/` (what deploys):
- every `.jsx` the loader references EXCEPT the last (`AppRouter.jsx`) is
  compiled with esbuild into `dist/app.js`, byte-faithful to the prototype;
  the `<link>`ed css files are copied from `proto/` into `dist/`
- `AppRouter.jsx` is the designer's preview-router harness — replaced by
  `boot.jsx`: real session flag (localStorage `pricy_session`), URL routing
  over the prototype's `go(name, params)`, auth gating (logged out →
  landing/login/about only; **search requires login**), layouts frozen to
  the prototype's TWEAK_DEFAULTS. Anything the prototype's `AppRouter.jsx`
  renders around the screens must be mirrored here by hand (it's discarded
  with the harness) — currently: the shared `<Footer>` under every
  signed-in screen.
- CDN dev React/Babel/lucide are swapped for vendored production UMDs
  (`vendor/`)
- **Installable as a home-screen app** (PWA, 2026-07-26): `pwa/` is copied to
  the dist ROOT — `manifest.json` (`display: standalone`), `icon-512.png`
  (rasterised from `assets/logo-mark.svg`; iOS won't take an SVG
  `apple-touch-icon`) and `sw.js`, which must be served from `/` to claim `/`
  as its scope. build.js injects the `<link rel="manifest">` /
  `apple-touch-icon` / `apple-mobile-web-app-*` / `theme-color` tags, since
  the prototype's `<head>` is sync-owned. The service worker exists because
  Chrome/Android won't offer "Install app" without one that has a non-empty
  fetch handler; it is network-first and skips `/api/*` (sessions, personal
  data) and `/img/*` — so a deploy always wins while online and the cache is
  only the offline fallback. boot.jsx registers it in one line. Upstream
  renders the in-app bar (`InstallPrompt` in Chrome.jsx, inside AppHeader):
  real `beforeinstallprompt` button on Android, static Share → Add to Home
  Screen instructions on iOS (which never fires that event), nothing
  elsewhere; dismissal persists in `pricy_install_dismissed`. The
  `installPreview` tweak is preview-only — boot.jsx deliberately does NOT
  mirror it, so prod is always `auto`. Outbound shop links are real
  `<a target="_blank">` anchors now (Btn takes `href`), not `window.open`:
  installed there is no back button, so a same-tab navigation to a shop
  strands the user outside the app.
- the prototype's enriched CATALOG is extracted to `worker/seed.json`
  (gitignored). D1 `products`/`offers`/`price_points`, seeded from that
  file on first use, offers refreshed by the hourly cron `scheduled`
  handler. The catalog is **query-based** (no eager full load): the SPA
  fetches `GET /api/products?ids=|q=|cat=|top=drop` slices which boot's
  `hydrateCatalog` MERGES into the prototype's CATALOG array (a lazy
  session cache; `ensureRoute` prefetches each route's slice before
  setScreen, `hydrateSession` batch-fetches every id the login references,
  header suggestions ride a debounced `q=` fetch). Worker helpers:
  `rowsFor`/`searchIds`/`topDropIds`/`catMeta` in `worker/index.js`.
  `searchIds` is a substring LIKE over the meta blob minus `$.specs` and
  `$.icon` (both are non-text: the icon is a lucide NAME, so leaving it in
  made every Furniture row match "sofa"), LIMIT 100, ranked
  word-start-in-name > in-name > brand > blob, and diacritic-folded on both
  sides of the LIKE (in the query, not a stored column — no migration).
  List queries (`cat=`, all heads) serve one `PAGE_MAX` (400) page ranked by
  offer count, `&limit=&offset=` for the rest; `meta.cats[cat]` /
  `meta.products` is the total. Upstream Results reveals 60 rows at a time.
  **The whole query is server-side** (2026-07-25): `&sort=<SORT_FIELDS id
  |facet:key>&dir=&brand=a,b&min=&max=&rating=&sale=1&instock=1&facets=<json>
  &name=<free text>`
  — sorting/filtering only the loaded page meant "cheapest first" on Toys was
  the cheapest of 400 of 1,387 rows (kr 19 vs kr 2). `listIds` shapes the
  WHOLE category in JS (facet values are derived, SQL can't see them: `type`
  is stored on 0 rows and derived on 7,099) and cuts the page from that, so
  `meta.total` (matching rows) and `meta.fcounts` (the category's facet
  histogram as `{key: [[value, count], …]}` — pairs, not a JSON object, or
  numeric axes stringify — ≤ 908 bytes) ride along — the two numbers a partial cache can't
  produce. Costs 60 → 64 ms on a category (catMeta alone is 36 ms of it);
  all heads WITH a sort parses 14k rows at 144 ms, which only Browse's "All
  products" link hits. `failGroups`/`sortRows`/`fval` mirror Results' own
  predicate and comparator — if they drift, the screen's count and the served
  total disagree. Boot's `window.onQuery({cat, sort, dir, filters, page})` is
  the one hook (upstream synced 2026-07-25, `onLoadMore` is gone): Results
  calls it debounced on every query change and for "Load more", and reads
  `total`/`fcounts` off the resolved value — they must NOT be read off
  `CATALOG.meta`, which the next `ids=`/`q=` fetch replaces wholesale. The
  `name=` is the rail's refine-within-results box (2026-07-26, `filters.q`
  upstream): every whitespace token must be a substring of the product NAME,
  diacritic-folded on both sides — it is NOT `q=`, which is the header's blob
  search. Same reason as the rest: refining client-side would only ever see
  the page. The FOLD list is duplicated in `refineToks`/`refineMatch`
  upstream and MUST stay identical: the screen re-filters its own cache with
  those, so a server that folds while the client doesn't serves rows Results
  then drops — a non-zero count over an empty list.
  `meta.fcounts` is **cross-filtered** (2026-07-27): a row counts toward group
  `k` when `failGroups` says it misses nothing but `k`, so picking a brand
  re-counts every other group while `k` keeps its own "what if I picked this
  too" numbers — "Over-ear 3" next to a brand carrying none was the bug. Values
  are still emitted at 0 rather than pruned: the rail derives its option list
  from these keys and hides a group under 2 values, so pruning would make
  groups (and an active selection) vanish as you filter. Results still falls
  back to counting its own rows while a refine is active (0.09 ms over a
  400-row page — measured, not a concern), so those counts are page-local and
  NOT cross-filtered — deliberate, since boot holds short refines and the
  served counts would be a keystroke stale. Boot HOLDS refines shorter
  than 3 chars for 400 ms past upstream's own 250 ms debounce and resolves the
  superseded call `null`: "e" on Toys matches 1,309 of 1,387 rows and the page
  it merges is pure cost. A deliberate 1-char refine still runs, 650 ms later.
  SCREEN owns the page number; never offset by rows on screen, a slice can
  hold rows from an `ids=`/`top=drop` fetch. `ensureRoute` prefetches the
  screen's own default sort (`sort=best&dir=asc`) so the mount call is a
  FETCHED hit rather than a second 400-row fetch.
  `/api/catalog.json` remains a full dump for ops/tools only — the SPA must
  never call it, and it is **bearer-gated on `INGEST_TOKEN`** (7.2 MB per
  hit at 14k rows); `tools/` send the token. Upstream is synced (2026-07-21): category counts and
  presence read `CATALOG.meta.cats`, SignedHome "Biggest drops" ranks
  `window.CATALOG`, and SearchSuggest refreshes via boot's
  `window.onSuggestData(q, refresh)` hook; browse prefetches
  `top=drop&perCat=1&limit=4`.
- **Categories are dynamic** (2026-07-22): `worker/cats.json` is the
  registry (`{cat: default icon}`, must be a superset of the prototype's
  CATEGORIES — build.js enforces both directions). It gates CATMAP
  promotion and admin PATCH cat, and `catMeta` serves it as `meta.icons`;
  boot's `hydrateCatalog` appends server cats the prototype doesn't know
  into `CATEGORIES`/`CAT_ICONS` in place, so browse/header/suggest/
  onboarding all render them. New category = one line in cats.json + rows
  that use it. No upstream edit. 31 cats as of 2026-07-25 (the original 10
  were all electronics-ish, so a sport/pet/jewellery shop had nothing to
  promote into).
- **GPC departments** (2026-07-31, plans/gpc-departments.md): upstream's
  browse/rail/suggest navigate a GS1 GPC layer (`GpcData.jsx`: DEPTS,
  bricks, `go('results', {brick|dept, label?, count?})`). Our layer is
  `worker/depts.json` — a NAVIGATION alias over `cat=`, not a stored
  dimension: each dept is a list of rules `{b, name, icon, cat, syn, path,
  facets?}` where `b` is a REAL GS1 GPC brick code (2026-07-31, validated
  against the published EN schema by `node tools/gpc-check.mjs`, which
  caches the 32 MB publication at the gitignored `tools/.gpc-en.json`;
  `99…`-prefixed codes are deliberately synthetic — GPC 2020 has no brick
  for Earbuds/Soundbars/Projectors), `cat` the backing server cat, `syn`
  Norwegian suggest synonyms and `path` the display-only
  `Segment › Family › Class` trail. Served as `meta.depts` by
  `catMeta`; boot's `hydrateCatalog` rebuilds
  DEPTS/brickBy/ALL_BRICKS/BRICK_CAT/BRICK_DEPT in place from it, joining
  whole-cat counts from `meta.cats`, and EMPTIES `PRODMAP`/`CLS_CAT` — the
  demo ids are served ids, and a stale PRODMAP direct match would pin a
  brick page to the handful of demo rows instead of the whole backing cat.
  **Sliced rules** (2026-07-31): a rule with `facets` (e.g. Headphones =
  Audio sliced by `{type: ["Headphones"]}`) is a sub-category finer than a
  cat. The pin is NOT a query dialect: boot's `gpcParams` injects it into
  the nav's `history.state.params.facets` (the same seam Browse sub-chips
  use — nav(), popstate and the deep-link boot path all seed it), Results
  mounts with it as a real checked filter selection, so it filters the
  client pool, renders in the rail, and rides `onQuery` server-side as
  ordinary `facets=`. Clearing the checkbox on a slice page is therefore
  just widening the filter — allowed, self-inflicted, recoverable. Sliced
  counts can't come from `meta.cats` (derived facets are invisible to
  SQL): `refreshDeptCounts` (hourly cron) computes each slice's total via
  `listIds` — the exact served-page predicate — into `seed_meta` row 4,
  `catMeta` merges it as `n` onto sliced rules only, and boot passes it
  through (whole-cat rules stay bare so they can never disagree with
  `meta.cats`; a fresh deploy shows 0 on sub-tiles for ≤1 h until the
  first cron). build.js enforces: valid `cat`, unique brick codes/dept
  ids, b/name/icon present, **every cats.json cat reachable from a
  whole-cat rule** (the no-orphan guard), sliced facet keys declared in
  facets.json for that cat, and **a sliced rule's cat whole-covered in the
  SAME dept** — upstream's `deptProducts` falls back to whole cats, so a
  cross-dept slice would silently claim its entire backing cat for the
  dept page. Slice `type` values must match `worker/facetrules.js`
  vocabulary EXACTLY (measured on the live catalog, not guessed — replay
  like tools/score-cats.mjs). New dept/sub-category = a depts.json edit,
  no upstream change. `/search` URLs carry
  `dept=`/`brick=`/`label=`/`count=` (boot parseUrl/toUrl; `cat=` links
  keep working); `ensureRoute` prefetches a brick's backing cat WITH its
  pin (so the mount `onQuery` is a FETCHED hit) — for a dept, its 2
  biggest backing cats — resolving the mapping off the cheap drops slice
  on a cold deep-link. Still parked: EAN→brick classification as a stored
  dimension — the EAN→GPC mapping lives in GS1 Verified (member API, no
  credentials), and while every brick ≡ cat(+facets) it would change
  nothing user-visible.
  **Brick/dept pages are server-queried** (2026-07-31, upstream re-sync):
  Results passes `{brick, dept, label}` through `onQuery`, and boot's
  `scopeCat` translates the scope to its backing `cat=` via the registry —
  brick pages (and single-cat depts) get the full server-side
  sort/filter/total/fcounts pipeline; brick/dept never leak onto the query
  string. The swap also empties the demo `BRICK_FACETS` (a demo per-brick
  def would shadow the served `FACETS[cat]` defs the fcounts keys speak —
  and a sliced page's pin must live in a def the rail renders, which is
  also why a served per-brick def registry stays unbuilt). Remaining
  degradation: a multi-cat "All <dept>" page resolves `null` (upstream's
  host-can't-serve contract) and stays client-side over its prefetched 2
  biggest cats — serving it needs a cat-set query the worker doesn't
  have.
  Demo-row vocabulary: build.js's `DEMO_TYPE` stamp now WINS over upstream
  facets (`{...p.facets, type}`) — the 2026-07-31 sync gave demo rows their
  own `type` strings ('Home console', 'Stick vacuum') that must not sit
  beside facetrules' curated values in the rail.
- **Facet filters** (2026-07-22, FILTERS-PLAN.md): `worker/facets.json`
  is the per-cat facet registry, served as `meta.facets` by `catMeta`;
  admin PATCH accepts a `facets` object per product. Upstream Results
  renders a generic group per `window.FACETS[cat]` def (option counts
  derive from values present, spec strings are the fallback via `fval`,
  the old hardcoded NC filter is gone); boot's `hydrateCatalog` swaps the
  served registry in wholesale. New filter = a facets.json entry (+ data
  via enrich curls). No upstream edit. **All 31 cats declare facets and
  most of their VALUES are derived from the product name** (2026-07-25,
  `worker/facetrules.js`: per-cat regex tables → `{type, color, material,
  size, volume, weight, audience, …}`), merged UNDER `meta.facets` in
  `shapeRows` — explicit enrichment always wins. Derived, not stored, so a
  rule fix reaches all 14k rows on the next deploy with no backfill; the
  cost is that `catMeta`'s `meta.types` SQL aggregate (Browse type chips)
  only counts stored values, and Browse falls back to counting the
  hydrated slice. build.js fails if a rule derives a key facets.json
  doesn't declare. Tune rules against a real crawl, never a sample —
  replay `/api/catalog.json` (bearer-gated) through `deriveFacets` and read
  the misses (`tools/score-cats.mjs` does exactly that for `classify` — copy it
  for facets rather than hand-rolling a replay again).
  Per-product `specs` ride the same
  meta-merge PATCH (bulk: `node tools/apply-specs.mjs specs.json`) — boot
  feeds `r.specs` into the prototype's SPECS, so the PDP Specifications
  section renders for any product whose cat has a SPEC_KINDS schema
  (proto/Specs.jsx); keys must match that schema — OR ship the
  self-describing `{ groups: [{ label, rows: [[label, value], …] }] }`
  form, which renders for ANY category, schema or not.
  `node tools/fetch-specs.mjs` emits that form from Icecat Open
  (Norwegian datasheets by EAN, free tier) for every visible head that
  has no specs yet — curated prototype sheets keep their variant-bound
  rows — then `node tools/apply-specs.mjs specs.json` lands them. Full
  sheets ride `ids=` detail fetches only (list queries are lean, and
  `searchIds` matches over `json_remove(meta,'$.specs')` so sheet text
  can't pollute search).
- **Adding products needs no upstream edit**: `worker/extra.json` holds
  hand-written head rows (`id/name/brand/cat/icon/kw`; cat must be in
  `worker/cats.json`) that build.js merges into seed.json — seeding,
  discover.mjs and crawl.mjs pick them up with no other wiring. They ship
  with NO demo offers; add EAN(s) to `worker/eans.json` + page URLs to
  `tools/crawl-urls.json`, deploy (seed must land before ingest accepts
  the id), then `node tools/crawl.mjs` prices them. Offer-less/rating-less
  rows render as "No offers yet" / "No reviews yet" (upstream, synced
  2026-07-21).
- **Product discovery is automatic** (2026-07-21): any source row with an
  EAN we don't know becomes a `products` row on the spot — derived id
  `ean-<digits>` (same EAN from two shops dedupes for free), `meta.hidden: 1`,
  excluded from every user-facing query (search/cat/all-heads/catMeta/
  catalog.json) but collecting offers + price history from day one.
  **`hidden` means not served, not merely unlisted** (2026-07-26): the
  exclusion lives in `rowsFor` itself, so `ids=` — the PDP's own fetch —
  drops them too, and `?hidden=1` (the ops backlog listing) is bearer-gated
  like `catalog.json`. Ops opts back in with the `INGEST_TOKEN` bearer on
  either. Before this, a demoted row kept a working product page and the
  whole backlog was enumerable by guessing `ean-<barcode>` ids.
  Adtraction feeds emit such rows for every unmatched EAN; discover.mjs
  writes unknown-EAN pages as `ean-*` entries into crawl-urls.json;
  scrapeSource carries JSON-LD name/brand/category so crawl pushes create
  too. **No EAN? still a product** (2026-07-25): most Shopify/small-Woo
  shops publish no `gtin` at all, so `discoverSource` falls back to
  `slugId(brand, name)` → a `p-<slug>` id. It still merges offers across
  shops that name a product identically; where it doesn't, we get a real
  single-shop product instead of nothing. Trade-off: a shop renaming a
  product strands the old row — re-home it with `POST /api/admin/alias`. **Open catalog (2026-07-22, OPEN-CATALOG-PLAN.md):** EAN→product
  routing lives in the D1 `eans` table (bootstrapped from `worker/eans.json`,
  `OR IGNORE` — runtime rows win); hidden rows **auto-promote** at ingest
  when a source supplies a name + a category resolving to a
  `worker/cats.json` cat — `meta.auto: 1`, fee/gift-card names blocked
  (`JUNK_RE` — fees only since 2026-08-01), still-unresolved stays hidden
  (that IS the junk filter). **Accessories are typed, not blocked**
  (2026-08-01): facetrules' shared ACC pass runs ahead of every cat's
  `type` rules — a row the shop files under tilbehør/reservedeler/spare
  parts (name or breadcrumb LEAF only; parents are mixed menus, and a
  conjunction — "med/og/& tilbehør", "m/lader" — means *included*, not
  *is*) types as `Accessories`, so it drops out of the host product's
  brick-slice listings while staying served and filterable. Always-
  accessory nouns (deksel, skjermbeskytter…) ride the same strong tier;
  ambiguous nouns (case, cable, veske, lader…) are a FALLBACK consulted
  only when the cat's own rules stay silent, so the per-cat vocabulary
  shields "the noun IS the product" ("Case of…" Magic cards, "Long
  Sleeve" shirts, the comic "Cable" — all real rows the old blocklist
  hid). Measure any term change with the same replay discipline as
  CAT_RULES.
  **Category resolution, in order (widened 2026-07-25 — this is what makes a
  NEW shop go live with no config):** the `CATMAP` var (wrangler.jsonc,
  per-shop `{raw srcCat → our cat}`) → `CAT_RULES` in worker/index.js, one
  shared Norwegian retail vocabulary matched on the shop's own category label
  → `CATMAP[shop]["*"]`, a reserved key giving a
  single-category shop a floor. Only set `"*"` where the WHOLE shop is one
  category; a general retailer must stay unmapped so the rules decide per
  product — and that is **measurable**, so measure it: `node
  tools/score-cats.mjs` replays the live `/api/catalog.json` through the working
  tree's own `classify`/`CATMAP` and prints the label/unreadable/no-label split,
  every row that would change category on the next crawl, how much of each
  category came from a shop floor rather than the product, and per-shop floor
  agreement (of a shop's rows whose OWN label we can read, how many land on the
  floor's category anyway). **Run it before and after every CAT_RULES or floor
  edit** — never on a sample, that has been wrong three times. Low floor
  agreement usually means the VOCABULARY is broken, not that the shop is
  general: three apparent general retailers were really `\bpapir`/`\bpenn`/
  `maling` misreading art shops. 36 floors as of 2026-07-26, all at 61–100%;
  eight shops under 50% lost theirs. Dropping a floor costs no live product
  (ingest never un-promotes) — it only sends that shop's future
  unreadable-label rows to the hidden backlog.
  Growing the vocabulary beats adding CATMAP entries: rules help every shop,
  a CATMAP entry helps one.
  **`srcCat` is a PATH, and the category is NOT frozen** (2026-07-26,
  plans/category-misclassification.md): `breadcrumbCat` keeps the shop's whole
  breadcrumb (`"Leker > Figurer > TV- og filmkarakterer"`), and `classify`
  splits it and walks **leaf → root**, taking the first crumb that resolves —
  leaf-first because `Dame / Sko / Komfortsko` is Shoes, parents only speak
  when the leaf is silent. `CAT_WEAK` crumbs (`Dame`, `Herre`, `Home`,
  `Produkter`, `Nyankomne`…) are skipped entirely: they sit mid-path where
  leaf-first reaches them before the department. `CAT_SKIP` tests the **leaf**,
  not the whole path (a mid-path `Tilbehør` is only the menu the shop files it
  under; testing the whole string lost 38 beanies under `KLÆR > Tilbehør > Luer
  og pannebånd`) — accessory names promote too and get `type: Accessories`
  from facetrules' ACC pass.
  `breadcrumbCat` reads the breadcrumb as JSON-LD **or schema.org microdata**
  (Japan Photo publishes only the latter — 638 rows arrived with no category at
  all), and a crumb equal to the product NAME is dropped wherever it sits in the
  path, not just at the leaf (Bergans' whole breadcrumb is `"Ally Map Pocket >
  Black"`, and `pocket` in the Books vocabulary read it as a book).
  Ingest **re-classifies live `auto` rows on every crawl**, so a vocabulary fix
  reaches the whole catalog one crawl later instead of new rows only (keeping
  the leaf and freezing `cat` is how TV came to hold 106 products of which 2
  were televisions). `meta.man` — set automatically when an admin PATCH sets
  `cat` — pins a row against the rules forever; demoted rows still never
  re-promote; and re-classification only ever CHANGES a category, never
  un-promotes, so a label that stops resolving can't yank a live PDP.
  `deriveFacets` reads `name` **and** `srcCat` (the ablation in arXiv
  1812.05774 found name+breadcrumb the best feature set; measured here it lifts
  rows with a derived `type` 7,099 → 8,321).
  The 63-label regression check in test/api.test.js is the guard on all of it —
  one real shop label per failure mode and per word added. Extend it, never
  weaken it, when touching CAT_RULES.
  manual triage is deploy-free via the admin API (bearer = INGEST_TOKEN):
  `PATCH /api/admin/products/:id` (meta merge, `hidden: null` promotes,
  `hidden: 1` demotes — demoted auto rows never re-promote) and
  `POST /api/admin/alias` `{ean, product_id[, meta]}` (maps the EAN and
  migrates the orphan `ean-*` row's offers/history/watches to the target;
  with `meta` it creates the target, e.g. a new `head~combo` variant child).
  Runbook: **ENRICHMENT.md**; `tools/enrich.mjs` prints ready-to-run curls,
  `tools/group.mjs` clusters discovered rows into variant families and
  prints grouping curls (print-only, human-confirmed).
- real price sources (4d) live in `worker/sources.js`: per-shop config in
  the `SOURCES` JSON var (wrangler.jsonc) — `adtraction` (per-brand XML
  feeds, URLs in the `ADTRACTION_FEEDS` secret, rows emitted as `ean-*`
  ids that ingest routes through the D1 `eans` table) and `scrape` (first-party
  JSON-LD off the shop's own product pages). **Never scrape competing
  comparison services (Prisjakt etc.).** A shop with no/failing source
  freezes at its last stored price; empty `SOURCES` (current prod state)
  makes the cron a no-op. The interim price writer is manual:
  `node tools/crawl.mjs [--dry] [--shop X] [--limit N] [--out f.json]
  [--no-images]`
  scrapes first-party pages listed in `tools/crawl-urls.json` and POSTs to
  `/api/ingest`. Shops crawl concurrently (`CRAWL_CONC`, default 8; pages
  within one shop stay sequential-with-a-pause — per-host rate is the
  politeness that matters). A shop entry is either a curated
  `{product_id: url}` map or a `"$discover": { sitemap, pathFilter?,
  sitemapFilter?, limit?, ua?, delayMs? }` block that walks the shop's own
  sitemap for its whole catalog (`limit` strides across the sitemap rather
  than taking the head). **A full-catalog crawl is opt-in per shop**
  (2026-07-27): `SAMPLE_LIMIT` (400 pages) applies unless the shop's
  `$discover` carries `approved: "<who cleared it, when>"`, so a shop we have
  no scraping agreement with is only ever *sampled* during development — and
  a newly added entry whose author never set `limit` is sampled too, rather
  than silently crawled in full. An explicit `limit` still wins either way,
  so `--limit 2` works on any shop. No shop is approved as of 2026-07-27;
  the cost is that a sampled shop's other products keep a frozen price and no
  image (8,937 of them), and the only upgrade path is real approval.
  Every run POSTs 500 rows at a time WITH images and
  then drains the image queue to empty; `--no-images` skips both (price-only
  refresh). 50 shops wired as of 2026-07-25, 47 of them sitemap-discovered.
  (`npm run test:crawlers` live-checks one page per shop,
  on demand only) (bearer =
  `INGEST_TOKEN` secret; token also in untracked `tools/.ingest-token`).
  `eans.json` arrays hold confirmed variants only — extend them as real
  feeds reveal missed colors/SKUs. Rollout checklist: PLAN.md 4d.
  **Product images are queued at ingest, fetched by a drain** (2026-07-26):
  source rows may carry `image` (JSON-LD `Product.image` / Adtraction
  `imageurl`); ingest's `queueImages` only WRITES the URL to the D1 `images`
  table, where `fetched_at` is the state — `0` queued, `>0` stored, `-1`
  failed. `drainImages` (hourly cron, and `POST /api/admin/images?n=` bearer-
  gated, ≤40 per call, 8 concurrent, queued before previously-failed)
  downloads to the R2 bucket `pricy-images` (binding `IMAGES`, key
  `products/<id>`) and serves at `GET /img/<id>` (etag + max-age, in
  `run_worker_first`). `catalogBody`/`rowsFor` advertise `img: "/img/<id>"`
  only for `fetched_at > 0` — a queued row has no bytes to serve.
  Downloading inline is what capped an ingest POST at 40 rows (~50
  subrequests on the free plan), so full-catalog shops were crawled
  `--no-images` and got none at all: 593 of 22,120 products had an image on
  2026-07-26, every `$discover` shop at exactly 0%. Re-fetch only when the
  source URL changes (shop CDNs version image URLs, so same URL = same
  bytes). The drain STREAMS `res.body` into R2 — buffering 40 arrayBuffers
  is per-byte isolate CPU and 503'd (`exceededCpu`) mid-backfill.
  `scrapeRow` resolves the image against the page URL and accepts http(s)
  only: schema.org says `Product.image` is absolute, but Obs/Obs Bygg/
  Trademax/Chilli/Kid Interiør/Zooservice all publish a bare path (3,814
  products that queued an URL the drain could only fail on), and the drain
  fetches this third-party value server-side. `og:image` is the fallback
  when the JSON-LD has no usable one — Ringo's `Product.image` is a Yoast
  `{"@id": "…#primaryimage"}` graph ref, not a URL. **The UI does render
  `img`** (corrected 2026-07-27 — this said it didn't): upstream's `ProdImg`
  primitive (Primitives.jsx) takes a product and renders `<img src={p.img}>`,
  falling back to the lucide `Icon` when there is none, and the PDP gallery's
  `productViews` (Gallery.jsx) reads `p.imgs` then `p.img` the same way.
  Nothing filters `img` out of a hydrated row, so it just works. Two call
  sites still render `Icon` directly instead of `ProdImg` —
  `HomeSections.jsx`'s `WatchRow` and `SignedHome.jsx`'s alert feed card.

- MCP experiment: `POST /mcp` on the same Worker is a hand-rolled
  Streamable-HTTP MCP server (no SDK). Tools: login/signup (binds the
  `Mcp-Session-Id` header to the shared `sessions` table), search_products,
  get_product, buy_now (records an order in the `purchases` table — MVP,
  payment assumed handled), watch_product/unwatch_product/list_watches
  (same `watches` rows the web sees), list_purchases. Signup (web and MCP
  alike) on an existing account verifies the password and refuses to touch
  passwordless (magic-link) accounts — no hijack either way.
  claude.ai forces OAuth+DCR on custom connectors, so
  the Worker also serves a minimal OAuth stack (`/.well-known/oauth-*`,
  `/register`, `/authorize` login page, `/token`, PKCE S256): the access
  token is a plain pricy session token, redirect_uris are allowlisted to
  known AI-client callbacks (`redirectAllowed`) — extend per new client. No
  refresh tokens; sessions last 30 days, then the client reconnects. These
  paths are in `run_worker_first` (wrangler.jsonc) or the SPA fallback
  swallows them.

- **Auto-buy/buy-now is behind a global kill switch** (2026-07-23): the
  prototype's `TWEAK_DEFAULTS.hideAutobuy` (currently `true` = hidden),
  frozen by boot.jsx like the layouts, must match the `HIDE_AUTOBUY` var in
  wrangler.jsonc — build.js fails on disagreement. Hidden means: no UI
  surface (header zap, PDP Buy now + Auto-buy box, /autobuy route,
  onboarding step, login hint — all gated upstream on `window.HIDE_AUTOBUY`),
  MCP drops buy_now/list_purchases (list, calls, descriptions,
  instructions), `POST /api/buy` + `PUT /api/autobuy` 404, and `/api/me`
  omits autobuy/purchases (the GDPR export stays complete). Flip = change
  the tweak default upstream, re-sync, flip the wrangler var, deploy.

## Rules

- `proto/index.html` and the repo-root design files are **sync-owned —
  never hand-edit**. Behavior fixes go upstream in Claude Design, then
  re-sync. Hand-written code is only: `boot.jsx`, `build.js`, `worker/`,
  `test/`, configs. (The prototype project is a `PROJECT_TYPE_PROJECT`, not
  a design-system project, so DesignSync can't push to it from here; the
  get_file pull-only ritual is the only sync path.)
- Account settings persist for real (name, notification prefs, marketing
  toggle): `PATCH /api/account` (`{name}`) and `PUT /api/settings`
  (whole-object replace per save, merged client-side in `boot.jsx`'s
  `saveSettings`) — same shape as `PUT /api/watches`. `users.settings` is a
  JSON blob column; marketing emails aren't actually sent, only the
  preference persists.
- Changing password is real too: `POST /api/account/password`
  (`{currentPassword, newPassword}`) verifies the current password (skipped
  for passwordless magic-link/BankID accounts, which just set one) and
  re-hashes with the same PBKDF2 scheme as signup. `meBody`'s user object
  now carries `hasPassword` so the UI knows whether to ask for the current
  password or offer "Set password" instead.
- `npm test` builds then runs the jsdom UI suite + Worker API tests
  (worker/index.js driven in-process, D1 emulated over node:sqlite). Run
  after every sync and boot.jsx/worker change.

## "sync design changes" ritual

1. DesignSync get_file `pricy/index.html` from the prototype project,
   then every `.jsx`/`.css` it references (plus `pricy/assets/*`) —
   batch those follow-up get_file calls in ONE message so they run in
   parallel (the hook is per-call and parallel-safe). A
   PostToolUse hook (`tools/designsync-save.mjs` via
   `.claude/settings.json`) writes each fetched `pricy/*` file to
   `proto/` byte-faithfully and replaces the tool result with a short
   receipt (`updatedToolOutput`) so file contents never enter context —
   do NOT re-emit contents by hand, just `git diff` after each fetch. (DesignSync only exists in the main
   session — subagents can't pull.) If a pulled file arrives with
   `truncated: true`, stop and split it further upstream — never splice.
2. `npm test`. If the prototype's App gained/renamed screens (see the
   view switch in `AppRouter.jsx`), mirror that in `boot.jsx`.
3. Commit (sync and boot/test adjustments separately), push to `origin
   main` (github.com/stephan-nordnes-eriksen/pricy-app), then
   `npm run deploy` (live: https://pricy.no — Worker `pricy`, D1
   `pricy-app`; the account's other `pricy` D1 belonged to the old
   pricy.no project — never bind it). Deploys are still manual —
   Workers Builds push-to-deploy not set up.

Known upstream gaps (fix in Claude Design, then extend tests):
- Product variants are LIVE end to end (4e, 2026-07-20): variant combo =
  child `products` row (`iphone~256-blue`) — build.js emits the 40
  non-default combos via the prototype's own `variantListing`, the
  seed_meta hash marker re-upserts meta on every new seed (offers/
  price_points untouched), boot's `hydrateCatalog` keeps children out of
  CATALOG and hangs them on `head.listings[combo]`, MCP search hides
  them / `get_product` lists them. Axis option ids must never contain
  `-` (combo-key separator). Re-homing an EAN to a child id is a
  deploy-free `POST /api/admin/alias` call now (2026-07-22) —
  `tools/group.mjs` proposes them; `crawl-urls.json` keys still re-home
  by hand as Adtraction feeds confirm SKUs.
- AuthCard's `onAuthed(email, {signup})` contract is real now (email
  passed out, awaitable verdict, server errors shown in the form), and
  password login/signup/change are real (PBKDF2-hashed, verified
  server-side). Magic-link login is real too: the AuthCard shows a
  waiting screen, boot.jsx's driver effect POSTs `/api/auth/request` for
  the shown address (re-POST on Resend) and polls `/api/me` every 3s
  (~10 min) until the emailed link is clicked in another tab — same-browser
  pickup via the shared cookie jar. Deliberately NOT cross-device: a
  pollable claim token would let whoever requested a link steal the session
  of whoever clicked it; a link clicked on another device just logs that
  device in. **Magic-link email only actually sends once the SEND_EMAIL
  binding is live (paid plan, see PLAN.md Phase 2) — until then prod
  console-logs the link and the waiting screen spins to its ~10 min cap
  (deployed in this state 2026-07-19, user's call).** BankID is still a fake button that logs into a
  shared demo account (`demo@pricy.no`) and lands home — the only
  passwordless `POST /api/auth/signup` the server still accepts (any other
  email must send a password, verified against existing accounts). Real
  BankID is parked until mostly everything else is done (see PLAN.md) —
  keep the fake button working, spend no other effort on it.

`npm run test:e2e` (Playwright visual parity vs the prototype) must run
with the Bash sandbox disabled — Chromium can't bootstrap its mach port
inside it.
