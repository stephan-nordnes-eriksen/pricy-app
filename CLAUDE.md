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
  List queries (`node=`, all heads) serve one `PAGE_MAX` (400) page ranked by
  offer count, `&limit=&offset=` for the rest; `meta.bricks`/`meta.uncat` /
  `meta.products` are the totals. Upstream Results reveals 60 rows at a time.
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
  total disagree. Boot's `window.onQuery({brick|dept|cat, sort, dir, filters, page})` is
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
  **Anonymous `/api/products` GETs are edge-cached** (2026-08-11): served
  through `caches.default` with `s-maxage=300` (Worker responses are never
  edge-cached implicitly), so repeat queries answer from the colo in ~60 ms
  and a change can look stale for ≤5 min — cache-bust with `cb=` when
  verifying. Ops bearer requests bypass the cache both ways. Filterless
  `listIds` results are also memoised per (query, catalog version) in-isolate
  (same WeakMap pattern as `catMeta`), and the SQL fast path's `total` is
  catMeta's own histogram number, not a COUNT(*) scan. `tools/latency.mjs`
  (manual, `npm run latency`) probes prod and graphs the trend.
  `/api/catalog.json` remains a full dump for ops/tools only — the SPA must
  never call it, and it is **bearer-gated on `INGEST_TOKEN`** (7.2 MB per
  hit at 14k rows); `tools/` send the token. Upstream is synced (2026-07-21): SignedHome "Biggest drops" ranks
  `window.CATALOG`, and SearchSuggest refreshes via boot's
  `window.onSuggestData(q, refresh)` hook; browse prefetches
  `top=drop&perCat=1&limit=4` (perCat buckets by brick).
- **Categorization is strict GS1 GPC** (2026-08-07, branch gpc-strict,
  plans/gpc-strict.md): a product's category IS its 8-digit GPC brick code
  (`meta.brick`, HEAD rows only — children inherit via the family walk),
  written ONLY by the resolver pipeline (gtin → brick) or an admin pin
  (`PATCH {brick}` sets `man: 1`; `{brick: null}` clears + re-queues).
  **No name/breadcrumb/shop-floor guessing exists anywhere** — the regex
  classifier, CATMAP and cats.json/depts.json are gone. No brick = the
  visible, honest **"Ukategorisert"** bucket (searchable, PDP, prices; a
  real browse dept; served as `node=uncat`). The pipeline: every GTIN
  entering the system (ingest rows, eans.json bootstrap, admin alias)
  enqueues in the D1 `gpc` table (gtin/brick/status/source/checked_at —
  these five columns are the VbG LICENSING boundary, never store more);
  `resolveGpcQueue` (hourly cron + bearer `POST /api/admin/gpc?n=`) drains
  through `worker/gpc-resolver.js` — a STUB answering from
  `worker/gpc-fixture.json` (+ env.GPC_FIXTURE) until Verified-by-GS1
  credentials exist (GS1 Norway GRP API, batch POST, gpcCategoryCode;
  swap the module body + VBG_* secrets, nothing else) — validates answers
  against the shipped taxonomy, and stamps heads (`meta.man` blocks;
  ingest also stamps already-resolved gtins so late-created rows are never
  stranded). Promotion: any non-junk NAMED row goes live at once
  (`JUNK_RE` fees/gift-cards is the only content gate; man pin,
  demote-sticks, seeded hands-off, variant skip unchanged). GTIN capture:
  scrape/discover/adtraction rows all carry `ean`; ingest teaches known
  `p-*` rows their GTIN (eans row + meta.ean) so re-crawls raise
  resolvability. `srcCat` is still captured (facet derivation + ops
  diagnostics) but MUST never influence categorization.
- **Taxonomy + display**: `worker/gpc.json` is the condensed official GPC
  publication (tools/gpc-build.mjs, edition 2026-05: 45 segs / 162 fams /
  938 classes / 5,318 bricks, ~347 KiB, checked in like a lockfile;
  `--refresh` pulls the ref.gs1.org zip — a curated code going inactive on
  an upgrade fails build.js). `worker/gpcno.json` is the Norwegian overlay:
  `names` (display name/icon/syn per code, any level — uncurated codes
  fall back to English GPC titles), `depts` (browse tiles; a tile's `b` is
  one or more GPC codes, comma-joined, any level), `facetKeys` (GPC code →
  facet RULESET id, resolution walks brick→class→family→segment).
  Validate with `node tools/gpc-check.mjs`. Display derives at read time
  (`shapeRows`): `cat` = the SEGMENT display name (row badges, client cat
  pools, CATEGORIES and compare all key on it), `icon` = nearest curated
  ancestor's, `path` = the Segment › Family › Class trail, plus `brick`.
  `catMeta` serves `bricks` (histogram) / `uncat` / `tree` (stocked
  4-level hierarchy, JS rollup — GPC codes are NOT prefix-hierarchical) /
  `depts` (tiles with live histogram counts — no cron, seed_meta row 4 is
  dead) / `facetKeys`. Queries: `node=<code[,code…]>|uncat` — bricks bind
  the `idx_products_brick` expression index (EXPLAIN-guarded; same
  identical-spelling rule as the old cat index), higher-level codes expand
  to stocked bricks chunked under the D1 param cap. Boot (`hydrateCatalog`)
  rebuilds DEPTS/brickBy/ALL_BRICKS/BRICK_UNDER from `meta.tree`, overrides
  `window.brickProducts`/`deptProducts` with brick-truth pools, appends the
  synthetic Ukategorisert dept ('uncat' pseudo-brick), maps display cats
  back to segment codes (CAT_NODE), bridges `BRICK_CAT` = facetKeys (so
  upstream's `FACETS[brickToCat(b)]` and the rebound `specKindOf` resolve),
  and derives PDP breadcrumbs from the product's own brick vs the covering
  tiles. New dept/tile/name = a gpcno.json edit, no upstream change.
  Ops: `tools/gpc-coverage.mjs` (coverage %, per-shop GTIN capture,
  uncurated-brick worklist), `tools/gpc-pin.mjs` (print-only brick-pin
  curls for gtin-less rows). One-shot migration: seed_meta row 5 ('gpc1')
  strips the regex-era cat/icon/kw/man + dead demo bricks from every row.
- **Facet filters** (2026-07-22, FILTERS-PLAN.md; re-keyed by gpc-strict):
  `worker/facets.json` is the facet registry — its keys are facet RULESET
  ids (the old cat names live on as ids only); a product's ruleset comes
  from its brick via gpcno.json `facetKeys` (`facetKeyOf`, most specific
  wins). Served as `meta.facets` + `meta.facetKeys` by `catMeta`; admin
  PATCH accepts a `facets` object per product. Upstream Results renders a
  generic group per `window.FACETS[brickToCat(brick)]` def (boot bridges
  `BRICK_CAT` = facetKeys); fcounts serve only when a node maps to a
  single ruleset, else the rail is brand/price/avail (uncat always).
  **Facet VALUES are derived from the product name + srcCat**
  (`worker/facetrules.js` regex tables → `{type, color, material, size,
  volume, weight, audience, …}`), merged UNDER `meta.facets` in
  `shapeRows` — explicit enrichment always wins; derived, not stored, so
  a rule fix reaches every row on the next deploy. `deriveFacets(row,
  key)` takes the ruleset key explicitly (row.cat default keeps tests
  working). build.js fails if a rule derives a key facets.json doesn't
  declare, or a facetKeys value names no ruleset. Tune rules against a
  real crawl, never a sample — replay `/api/catalog.json` (bearer-gated)
  through `deriveFacets` and read the misses.
  Per-product `specs` ride the same
  meta-merge PATCH (bulk: `node tools/apply-specs.mjs specs.json`) — boot
  feeds `r.specs` into the prototype's SPECS, so the PDP Specifications
  section renders for any product whose RULESET has a SPEC_KINDS schema
  (proto/Specs.jsx; boot rebinds `specKindOf` through the brick →
  facetKeys bridge since the schema keys are the old cat names); keys must
  match that schema — OR ship the self-describing `{ groups: [{ label,
  rows: [[label, value], …] }] }` form, which renders for ANY node,
  schema or not.
  `node tools/fetch-specs.mjs` emits that form from Icecat Open
  (Norwegian datasheets by EAN, free tier) for every visible head that
  has no specs yet — curated prototype sheets keep their variant-bound
  rows — then `node tools/apply-specs.mjs specs.json` lands them. Full
  sheets ride `ids=` detail fetches only (list queries are lean, and
  `searchIds` matches over `json_remove(meta,'$.specs')` so sheet text
  can't pollute search).
- **Adding products needs no upstream edit**: `worker/extra.json` holds
  hand-written head rows (`id/name/brand/kw`; category fields are stripped
  at bake — the resolver/fixture categorizes) that build.js merges into
  seed.json — seeding,
  discover.mjs and crawl.mjs pick them up with no other wiring. They ship
  with NO demo offers; add EAN(s) to `worker/eans.json` + page URLs to
  `tools/crawl-urls.json`, deploy (seed must land before ingest accepts
  the id), then `node tools/crawl.mjs` prices them. Offer-less/rating-less
  rows render as "No offers yet" / "No reviews yet" (upstream, synced
  2026-07-21).
- **Product discovery is automatic** (2026-07-21; gpc-strict makes it
  LIVE at once): any source row with an EAN we don't know becomes a
  `products` row on the spot — derived id `ean-<digits>` (same EAN from
  two shops dedupes for free), visible in Ukategorisert unless `JUNK_RE`
  keeps it hidden, collecting offers + price history from day one.
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
  product strands the old row — re-home it with `POST /api/admin/alias`. **Open catalog (2026-07-22, OPEN-CATALOG-PLAN.md; promotion
  rewritten by gpc-strict 2026-08-07):** EAN→product routing lives in the
  D1 `eans` table (bootstrapped from `worker/eans.json`, `OR IGNORE` —
  runtime rows win); any non-junk NAMED row **goes live at ingest** into
  Ukategorisert (`meta.auto: 1`) — only `JUNK_RE` (fees/gift cards) and
  human demotions stay hidden. Categorization arrives separately from the
  resolver (see the gpc-strict block above). **Accessories are typed, not blocked**
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
  hid). Measure any term change against the live catalog
  (replay `/api/catalog.json` through `deriveFacets`), never a sample.
  **Category resolution is the resolver alone** (gpc-strict): CATMAP,
  CAT_RULES, classify, the shop floors, tools/score-cats.mjs and the
  155-case label suite are all gone. `srcCat` (the shop breadcrumb, JSON-LD
  or microdata via `breadcrumbCat`, product-name crumbs dropped) is still
  captured on every row — `deriveFacets` reads `name` AND `srcCat` (the
  arXiv 1812.05774 ablation; facet VALUES are display data, not
  categorization) and ops read it in triage — but it can never place a
  product. `meta.man` — set automatically when an admin PATCH sets `brick`
  — pins a row against the resolver forever; demoted rows never
  re-promote.
  manual triage is deploy-free via the admin API (bearer = INGEST_TOKEN):
  `PATCH /api/admin/products/:id` (meta merge; `brick` pins a GPC brick,
  `hidden: null` promotes, `hidden: 1` demotes — demoted auto rows never
  re-promote) and
  `POST /api/admin/alias` `{ean, product_id[, meta]}` (maps the EAN and
  migrates the orphan `ean-*` row's offers/history/watches to the target;
  with `meta` it creates the target, e.g. a new `head~combo` variant child).
  Runbook: **ENRICHMENT.md**; `tools/enrich.mjs` prints ready-to-run curls,
  `tools/gpc-pin.mjs` prints brick-pin curls from a curated `{id: brick}`
  file, and `tools/group.mjs` clusters discovered rows into variant
  families and prints grouping curls (print-only, human-confirmed).
- real price sources (4d) live in `worker/sources.js`: per-shop config in
  the `SOURCES` JSON var (wrangler.jsonc) — `adtraction` (per-brand XML
  feeds, URLs in the `ADTRACTION_FEEDS` secret, rows emitted as `ean-*`
  ids that ingest routes through the D1 `eans` table), `scrape` (first-party
  JSON-LD off the shop's own product pages) and `feed` (2026-08-15,
  zero-integration onboarding — plans/shop-partnership-ideas.md #3b,
  runbook ONBOARDING.md: the Google Shopping RSS/Atom feed every Norwegian
  platform exports, `{type: "feed", url}`; gtin-keyed with the discovery
  slugId fallback, g:sale_price honored inside its effective window, NOK
  required on every price — g:shipping's nested g:price never wins because
  gFields is first-write, unlike xmlFields). Merchant outreach rides
  `emails/` (HTML mail-merge templates, hand-synced from the prototype
  project ROOT — outside `pricy/`, so the sync hook doesn't cover them;
  logo PNG copied by build.js to `/static/email/`): `GET
  /api/admin/outreach[?shop=]` (bearer) serves `{shop, products, watchers,
  slug}` per shop for the placeholders, and `GET /butikk/<slug>`
  (run_worker_first) 302s onto `/shop?shop=` so the emailed CTA works as
  soon as upstream's ShopPage renders. The onboarding CTA lands on
  `/bli-med?domene=` — upstream's MerchantJoin screen (2026-08-16, boot
  routes it public, no footer/tray like the harness): submissions POST
  `/api/merchant/join` ({domain, method: crawl|feed|adtraction, feed?,
  email}, validated + 200/day cap) into the D1 `merchant_joins` table,
  read back via bearer `GET /api/admin/joins`, acted on by hand
  (ONBOARDING.md). Boot's `window.onMerchantJoin` resolves true or an
  error string (AuthCard's onAuthed contract); upstream's "Sett i gang"
  awaits it (synced 2026-08-16) — wired end to end. **Never scrape competing
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

- **Web Push is live** (2026-08-05): `worker/push.js` hand-rolls VAPID +
  RFC 8291 aes128gcm on WebCrypto (test-vector-pinned in api.test.js).
  Keys: `VAPID_PUBLIC_KEY` var (served at `GET /api/push/key`) +
  `VAPID_PRIVATE_KEY` secret (JWK; local copies gitignored in `tools/`).
  `POST /api/push/subscribe` (session) upserts into `push_subs`;
  `POST /api/admin/push` `{title, body?, url?, email?}` (bearer, ≤40
  devices/call) sends and prunes 404/410 endpoints — manual trigger:
  `node tools/push.mjs "Title" ["Body"] [/url] [email]`. sw.js shows the
  notification and click-focuses the app; boot's `setupPush` re-subscribes
  silently when permission is granted, else shows a one-tap chip (iOS only
  exposes push inside the installed home-screen app, and only ≥16.4).
  **Price-drop alerts push too** (2026-08-05): fireAlerts sends to the
  user's devices when settings `push === true` (upstream NotifSection
  toggle, default off — the boot chip flips it on after a successful
  subscribe; the silent re-subscribe never does, so a settings opt-out
  sticks). A delivered push marks the alert delivered_at even with the
  email channel off. Push-only extras ride the same loop for every active
  watch (no alerts-feed row — the table requires a target): back in stock
  (prev.best null → an in-stock offer now) and, for target-less watches,
  a new all-time low. Shared gift lists push too: a first join notifies
  the owner, a new bought-mark notifies the OTHER members — never the
  owner (spoiler by timing) and never the buyer. All sends go through
  `pushToUser` (settings gate at the caller, dead endpoints pruned).
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
  **Buy-now cross-sell ("What about these?", 2026-08-14)**: upstream
  `Addons.jsx` renders add-on suggestions inside BuyNowModal via
  `window.addonSuggestApi(p, shop)`; boot points it at `GET /api/addons
  ?id=&shop=` (session required, 404 under HIDE_AUTOBUY like the rest of
  the buy surface). Default mode: top-3 biggest-drop% rows with an
  in-stock offer at that shop (drop by the shop's own price vs `was`).
  Partner mode: the `ADDON_SOURCES` var (`{shop: {url, cid?}}`, absent =
  none, same pattern as SOURCES) — the shop's endpoint is POSTed
  `{ean, customer_id?}` (customer_id only with `cid: true` = a per-shop
  SHA-256 of the user id, never the email; 4 s timeout) and answers
  ≤10 EANs (`{eans: […]}` or a bare array, eanKey-normalized on our
  side), resolved through the D1 `eans` table (unrouted EANs try the
  discovered `ean-*` id), served same-shop in-stock only, partner order
  kept; a failed or unusable answer falls back to the drops mode. The
  upstream `buyNowApi` contract grew to `(p, best, added)` — boot POSTs
  one `/api/buy` per add-on (main purchase stands if an add-on fails).
  Partner rows ride with a `label` (`cfg.label` or "recommended by
  {shop}") which boot returns as upstream's `{items, label}` form
  (synced 2026-08-14); the drops mode serves none, keeping upstream's
  default "biggest drops at {shop}" header.

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
- Custom lists persist for real (2026-08-02): `PUT /api/lists` is a
  whole-array replace of the `users.lists` JSON blob (same seam as
  `PUT /api/autobuy`; ≤50 lists, ≤32 KB), served back as `lists` in
  `meBody`. boot.jsx wraps `ListStore.emit` to persist every mutation,
  hydrates `ListStore.lists` in `hydrateMe` (list item ids join the
  `hydrateSession` ids batch), and routes `/lists?id=`. The "Overvåket"
  system list is computed client-side off watches, never stored.
  **Sharing backend is live** (2026-08-02, plans/list-sharing-backend.md):
  `POST /api/lists/:id/share` mints a token (reissue = replace, so boot
  caches the url in the list's `shared.url`); `GET/POST /api/l/:token`
  is the member surface (session required — first GET joins you,
  POST toggles a bought-mark: members their own, the owner anyone's).
  Members and bought-marks live in `list_shares`/`list_members`/
  `list_bought`, NOT the blob, and the owner's payload (meBody's
  `listsBody`) strips `by` names — the gift privacy promise is enforced
  server-side. boot routes `/l/<token>` and exposes
  `window.onSharedList`/`onSharedBought` for the upstream member
  screen, which does NOT exist yet — ShareModal still shows its demo
  link until the plan file's upstream prompt is pasted.
- Product reviews persist for real (2026-08-05,
  plans/folkedommen-reviews.md — **Folkedommen**: no numeric ratings
  anywhere, a review is three `y|n|u` claims (worth/durable/described)
  plus optional traits, shop, what you paid, title and body; the claims
  are the only required field): `GET /api/reviews?ids=` (batch, session
  required, author = first name + last initial, `mine`/`voted` joined per
  user) and `?mine=1` (your reviews across all products, for the account
  tab — deliberately NOT in `meBody`, which rides every cold load),
  `POST /api/reviews` (create-or-edit-your-own via partial unique index;
  `verified` = a purchases row matches; an edit keeps `created_at` and
  stamps `updated_at`, which is where `edited` comes from),
  `DELETE /api/reviews/:id` (own only, 404 otherwise), `POST
  /api/reviews/:id/vote` (toggle), and `PATCH /api/admin/reviews/:id`
  `{hidden: 0|1}` (bearer moderation; edits never clear hidden).
  **`paid` is served only when the reviewer showed it or to the author** —
  a hidden amount still counts toward the aggregate range but is never a
  number attached to a name (same promise as the gift-list `by` stripping).
  The write-time aggregate lands in `meta.urating`/`ureviews`' replacement
  `meta.udom` `{n, c: {claim: [y,n,u]}, t: [[trait, count, 1|0], …], p:
  [lo, hi, count]}` — NOT `meta.rating`, which seed re-upserts json_patch
  back to the demo number on every deploy — and `shapeRows` serves it as
  `dom` (+ `reviews: udom.n`). **This is load-bearing**: upstream's
  `reviewStats` only holds the rows of the PDP you are on, so every result
  row, card, Compare cell, the `dom` filter and the Folkedommen sort read
  `p.dom` — without it they all read "Ingen omtaler ennå". `p.rating` is
  never served at all (it is the demo synth's input). `udom.p` needs ≥3
  reporters and both ends rounded to 10 kr, because upstream renders
  `lo === hi` as one amount. `domScore`/`domTier` in worker/index.js mirror
  upstream's `.85/.6/.4` cuts for `sort=rating` and `dom=` — same
  drift rule as `failGroups`/`sortRows` vs Results' own predicate; a row
  with no reviews has no tier and is excluded. GDPR export/delete cover
  reviews + votes and recompute affected aggregates. boot: PDP route
  prefetches its head's reviews and the account route `?mine=1` (plus the
  products it references, so `prodOf` resolves), wraps
  `ReviewStore.add/update/remove/vote` (numeric ids = server rows), and
  empties the demo `PRODUCT_REVIEWS`/`SHOP_META` when live — fake trust
  signals don't ship. `catMeta` serves `meta.shopStats` `{shop: {offers, updated}}`
  (boot exposes `window.SHOP_STATS`); the `/shop` route is mirrored but
  renders its not-found state until upstream's ShopPage/ShopChip read the
  served objective stats instead of SHOP_META demo ratings (v1 = no stars,
  see the plan's honesty section; SHOP_META's invented *quotes* are no
  more measured than its old stars were). Shop-rating UGC is v2 — the
  reviews table's `shop` column is the reserved TARGET (`buy_shop` is the
  reviewer's own free-text "where I bought it"), no endpoint accepts it yet.
  Both formerly-pending upstream fixes landed (verified 2026-08-12):
  Results.jsx uses `pDom` and `_calcStats` reads the served `p.dom` —
  the full suite is green.
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
