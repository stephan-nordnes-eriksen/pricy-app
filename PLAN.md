# Pricy.no — prototype → production plan

Goal: ship the Claude Design prototype as a real site on Cloudflare, while
the design keeps evolving in claude.ai/design and syncs back into this repo.

## Architecture

The interactive prototype (Claude Design project `7fa9cba6-…`, file
`pricy/index.html`) IS the app: a single self-contained HTML file with all
CSS and all screen JSX inline. It syncs to `proto/index.html` verbatim, and
`build.js` productionizes it into `dist/`:

- prototype babel blocks → esbuild → `dist/app.js` (byte-faithful), except
  the final block (designer tweaks-panel harness), which is replaced by
  `boot.jsx` — session flag, URL routing, auth gating, frozen layout defaults
- CDN dev React/Babel → vendored production React 18 UMD (`vendor/`)
- deployed as Cloudflare Workers static assets with SPA fallback

Logged-out spec (from the prototype): only landing / login / about exist;
there is no search until you log in. Login is faked client-side
(localStorage flag) until Phase 4 brings a real backend.

The design-system project (`ee80f3e5-…`) still syncs to the repo root as
the token/kit reference, but nothing is built from it.

## Phase 1 — Scaffold ✅   Phase 1b — Prototype adoption ✅

`npm run build` → dist/; `npm test` = build + 11 jsdom UI tests booting
dist/index.html's real script pipeline (gating, login, BankID→onboarding,
search suggest, product nav, logout, icons).

## Phase 2 — Deploy to Cloudflare ✅ (manual deploys; pricy.no attached)

Live at https://pricy.no — Worker `pricy`, D1 `pricy-app`, hourly cron.
Deploy with `npm run deploy`. Domain cut over 2026-07-15: pricy.no +
www.pricy.no are custom domains on `pricy` (www 301s to apex in the
worker); the old SvelteKit site's attachment was deleted, and the
workers.dev URL is disabled (routes present, no `workers_dev`).

- **The account's `pricy` D1 is NOT ours** — it belonged to the old
  pricy.no SvelteKit project (now dark), even though `d1 list` misreports
  it as 0 tables. Never bind it.
- Workers Builds push-to-deploy: repo got a remote 2026-07-15
  (github.com/stephan-nordnes-eriksen/pricy-app, `origin`/`main`) — can be
  set up whenever manual `npm run deploy` gets old.
- Email Service: worker code + tests done 2026-07-15 — sends via
  `env.SEND_EMAIL` (from login@pricy.no) when bound, console-logs the link
  when not. Binding stays commented out in wrangler.jsonc: Email Sending
  needs the Workers **paid** plan (decided to wait). To go live: upgrade,
  onboard pricy.no in the dashboard (Email Service → Email Sending, adds
  SPF/DKIM/DMARC), uncomment the binding, deploy. Login meanwhile works
  via the demo bridges.

## Phase 3 — The design-sync loop (ongoing ritual)

See CLAUDE.md. One file to pull (`pricy/index.html`), then
`npm test`, push. Mirror new screens in `boot.jsx` when the prototype's
App grows one.

## Phase 4 — Real data & auth  ← the current milestone

Make the shell real without breaking the design-sync loop: the prototype
stays the UI source of truth; everything real lives behind seams the sync
never touches (`boot.jsx`, a new `worker/`, `build.js`).

**The data seam (what makes this tricky):** the prototype defines
`const CATALOG` at module scope and computes derived indexes (`CAT_OF`,
`CAT_COUNTS`, offers, history) immediately at load. Screens close over the
module constants, not `window.CATALOG`. So hydration must either land
before the catalog block executes, or mutate the exported arrays in place
*and* rebuild the derived indexes. Settle this in 4a before anything else —
it's the one place a wrong choice forces upstream prototype changes.

### 4a — Catalog served, not baked (no backend yet) ✅

Hydration approach settled: build.js bundles the prototype blocks and
boot.jsx into one esbuild scope, so boot.jsx mutates `CATALOG` in place
(keeping the array identity `window.CATALOG` shares) and rebuilds `CAT_OF`
— the only load-time derived index — before first render. Baked catalog
remains the no-fetch/failed-fetch fallback.

- `build.js` gains a step: execute the compiled catalog block in Node and
  dump the enriched `CATALOG` to `dist/api/catalog.json` (a static asset —
  no Worker code needed yet).
- `boot.jsx` fetches it and hydrates through the seam above; jsdom test
  asserts the rendered catalog came from the fetch, not the baked constants.
- Site behaves identically; data is now a document with a URL, which is the
  contract 4c fills with real prices later.

### 4b — Real auth + persisted watchlist ✅ (email send deferred to deploy)

Shipped: `worker/index.js` (magic-link request/verify, HttpOnly session
cookie, `/api/me`, whole-list `PUT /api/watches`) on D1, schema
bootstrapped in the Worker until a real deployment justifies migrations.
boot.jsx hydrates USER / WATCHED / WatchStore.items from `/api/me` pre-render
and persists every WatchStore.emit. The magic-link email itself is only
console-logged — wire the Email Service binding (see wrangler.jsonc) at
deploy. Upstream UI gaps recorded in CLAUDE.md (AuthCard email/theatre,
WATCH_HITS/TOTAL_SAVED const primitives).

- First Worker code: `worker/` module alongside the static assets
  (`wrangler.jsonc` gains `main` + a D1 binding).
- Email magic-link login (Cloudflare Email Service), HttpOnly session
  cookie, `/api/me`. `boot.jsx`'s `readSession/writeSession` swap
  localStorage for `/api/me` — the gating logic above them doesn't change.
- D1: `users`, `sessions`, `watches`. The prototype's `USER` / `WATCHED`
  constants hydrate per-user the same way CATALOG does in 4a.
- BankID stays a fake button (real BankID is a signed-vendor contract, not
  a phase). **Decided 2026-07: all BankID work is parked until mostly
  everything else is done** — don't spend sync/boot/worker effort on it
  beyond keeping the fake button working.

### 4c — Real prices ✅ (synthetic source until a real feed is signed)

Shipped: D1 `products`/`offers`/`price_points`, seeded from the
build-generated `worker/seed.json` (the same extracted CATALOG that used to
be a static file). `GET /api/catalog.json` is a Worker route now — same URL,
same shape, boot.jsx untouched; `best`/`drop`/`shops`/`stock`/`history` are
derived from offers and price_points on read. Hourly cron
(`worker.scheduled`) refreshes offers through `ingest()`.

**Price-source decision (2026-07-14): synthetic feed first.** The one fake
piece is `syntheticFeed()` in `worker/index.js` — it jiggles current offer
prices. Swapping in a real source (affiliate feeds were the runner-up)
means replacing that single function; nothing else in the pipeline moves.

### 4d — Real price ingestion (multi-source)  ← current

Code shipped: `worker/sources.js` — a source registry keyed by shop in the
`SOURCES` JSON var (wrangler.jsonc), every source emitting `ingest()`-shaped
rows. Two source types:

- **`adtraction`** — per-brand XML product feeds (Adtraction is the dominant
  Nordic network; Elkjøp, Komplett, NetOnNet, Dustin, Clas Ohlson, CDON
  confirmed on it, Power/Proshop unverified). Stream-parsed, rows matched to
  the catalog by EAN via `worker/eans.json`, tracking deep link →
  `offers.url`. Feed URLs (they embed the channel token) live in the
  `ADTRACTION_FEEDS` secret `{shop: url}`.
- **`scrape`** — first-party schema.org JSON-LD off the shop's own product
  pages (`urls: {productId: page}` in the shop's SOURCES entry), honest
  User-Agent, robots.txt checked by hand when configuring a shop. **Never
  scrape competing comparison services (Prisjakt/Prisguiden etc.).**

Semantics: a shop with no source (or a failing one) **freezes** at its last
stored price — ingest only upserts rows it receives; failures are logged,
never abort other shops. Empty `SOURCES` falls back to `syntheticFeed()`
(today's prod state); delete the synthetic path once the first real source
is stable in prod. `offers` gained `url` + `updated_at`; the catalog API now
carries `url` per offer (UI adoption of deep links is an upstream Claude
Design change, recorded in CLAUDE.md).

**Interim decision (2026-07-15): manual crawl from the local laptop
first**, better sources (Adtraction etc.) rolled out later. The Worker-side
source registry above stays as-is — it's the "later".

Outstanding tasks (in rough order):

1. **Laptop ingestion path ✅ (2026-07-15).** `POST /api/ingest`
   (bearer-gated on the `INGEST_TOKEN` secret, 503 while unset, validates
   rows and rejects unknown product ids) feeds the same `ingest()` as the
   cron. `tools/crawl.mjs [--dry]` scrapes the first-party pages in
   `tools/crawl-urls.json` (shop → product id → URL; starts empty — fill
   it in) and pushes; token from `$INGEST_TOKEN` or untracked
   `tools/.ingest-token`. The synthetic jiggle is deleted — empty
   `SOURCES` makes the cron a no-op, so pushed prices are never
   overwritten. To crawl: fill `crawl-urls.json`, check robots.txt for
   each shop, `node tools/crawl.mjs --dry`, then without `--dry`.
   Since shipped on top (2026-07-15): `tools/discover.mjs` (sitemap →
   slug shortlist → JSON-LD EAN confirm → `--write` into
   `crawl-urls.json`), crawl flags `--shop/--limit/--out`, and
   `npm run test:crawlers` (on-demand live check, one page per shop —
   never part of `npm test`). First real rows are live in prod:
   Power beats-pro + xbox. Coverage plan below.
2. **Adtraction rollout (the better solution, later):** account created
   2026-07-19, approvals pending — runbook in `ADTRACTION-COOKBOOK.md`.
   Publisher signup
   (site: pricy.no), apply to the 8 brands (Power/Proshop coverage
   unverified — check the brand directory; fall back to
   Awin/Partner-ads/Tradedoubler); `wrangler secret put ADTRACTION_FEEDS`;
   flip shops into `vars.SOURCES`; verify the first real feed's field names
   against the candidates in `worker/sources.js`
   (ean/price/instock/trackingurl variants).
3. **Worker-side scrape config** for shops without any network: product-page
   URLs + robots.txt check, `{"type": "scrape", "urls": {…}}`.
4. **Extend `worker/eans.json`** variant arrays as real feeds reveal missed
   colors/regional SKUs (Hue kit SKUs are the fuzziest).
5. **Upstream UI (Claude Design):** "go to shop" button from `offers[].url`;
   maybe a "last updated" hint from `offers.updated_at` (not exposed in the
   API yet).
6. **Kelkoo Group** (contract-based shopping API) — future single-feed
   option; fits the same source seam if ever signed.

#### Coverage rollout — ingest more products (2026-07-15)

State: 24 products × 8 shops = 192 offer cells; 2 are real (Power), the
rest still serve seeded demo prices and stay frozen until a real row
arrives. Goal: every product shows ≥2 shops with real prices and deep
links, or a note here on why not (shop blocks us / doesn't stock it).

Per-shop ritual (repeat for each scrapeable shop):

1. **Bot posture:** `curl -A "<UA in worker/sources.js>" <origin>/robots.txt`.
   429/403 → shop is feed-only; park it for Adtraction (task 2), no UA
   games. Elkjøp confirmed blocked 2026-07-15.
2. **Discover:** `node tools/discover.mjs <Shop> <origin>` (no `--write`).
   Triage the output: "confirmed by EAN" is done; "new product ean-…" is
   auto-discovery — if it's genuinely a variant of the catalog product
   (color/regional SKU) append the EAN to `worker/eans.json` (13-digit,
   zero-padded) instead, else leave it and the crawl will create it as a
   hidden product (enrich later via `node tools/enrich.mjs`). Re-run with
   `--write` when triage is done; "no JSON-LD EAN" candidates ignore.
3. **Hand-fill the misses:** the slug heuristic is English-token based and
   misses Norwegian slugs/marketing paths — paste product-page URLs
   straight into `tools/crawl-urls.json` for whatever discovery didn't
   find. Tune the 0.5 token threshold in `discover.mjs` only if
   hand-adding gets old.
4. **Validate:** `npm run test:crawlers`, then
   `node tools/crawl.mjs --dry --shop <Shop>`.
5. **Ship:** `node tools/crawl.mjs`, spot-check
   `https://pricy.no/api/catalog.json`.

Shop order, easiest first:

- **Power** — 11 products (2026-07-16): sitemap grep + page-EAN verify;
  their flat `/services/sitemap.xml` (38.5k URLs) is missing whole
  categories (no PS5/S24/Hue/MacBook/TV product pages) — revisit, or wait
  for Adtraction. lgc3/bravia/tv models look delisted.
- **Komplett, Proshop, NetOnNet** — scrape-blocked (403 / connection
  reset on robots.txt with our UA, 2026-07-16); park for Adtraction.
- **Clas Ohlson** — 7 products (2026-07-16). Their JSON-LD has price/stock
  but **no GTIN**, so identity is hand-confirmed by page title; use
  `/no/p/<id>` URLs — `/se/` pages serve the same shape in SEK (guarded:
  scrapeSource now rejects non-NOK). No PS5-disc/Hue-kit match (Digital
  Edition only / kit variants too ambiguous without EAN).
- **CDON** — 2 products EAN-confirmed (lego, sonos-ace); marketplace
  noise (ear-pads, cases) is real but the EAN gate filters it.
- **Elkjøp** — scrape-blocked; waits for the Adtraction feed.

Coverage 2026-07-16: 20 real cells / 14 products. Ten products still have
zero real offers (tv, ps5, steamdeck, s24, pixel8, lgc3, bravia, roborock,
hue, mba) — all in the blocked/delisted buckets above, so they wait for
Adtraction. Seeded demo prices still undercut real ones on 10/14 covered
products, so the "Best" row (and its Visit button) stays a dead seed row
until either the demo offers are purged or real feeds cover those shops —
product decision pending.

Cadence: re-run `node tools/crawl.mjs` manually every day or two so
`price_points` history accrues. Graduation: once a shop's URL set is
stable and robots-ok, move it into `vars.SOURCES` as
`{"type":"scrape","urls":{…}}` (task 3) — the hourly Worker cron takes
over and the laptop drops out for that shop. Adtraction (task 2) replaces
scraping per shop as feeds get approved.

### 4e — Product variants for real (planned 2026-07-20; SHIPPED 2026-07-20
— steps 1–3 + 5 live, step 4 is data-only and waits on Adtraction feeds,
step 6 stays deferred)

Upstream shipped variants (2026-07-20 sync): `Variants.jsx` defines
`VARIANT_DEFS` (per-product axes: storage/colour, per-option price
deltas), `Results.jsx` attaches them as `p.variants`, and the PDP's
`VariantPicker` swaps in a *derived* listing — `variantListing()`
synthesizes offers/history per combo via a hash. Six products have
variants: iphone (3×5), s24 (3×4), pixel8 (2×3), xm5 (3), mba (2×4),
steamdeck (2) — 46 combos, 40 non-default. In prod the feature is
dormant: D1 was seeded before variants existed, so API rows carry no
`variants` and the picker never renders. Making it real:

**Model decision — variant combo = product row.** Every non-default
combo becomes its own `products` row, id `<head>~<combo>` (combo = axis
option ids in axis order, e.g. `iphone~256-blue`; `~` survives URLs and
is unused in current ids). The head row doubles as the default combo
(matches the prototype: default sel = base listing). Child meta carries
`family: '<head>'` and a display name with the vlabel baked in
("iPhone 15 · 256 GB · Blue"). Everything that keys on product_id —
offers, price_points, watches, alerts, autobuy, purchases, `/api/ingest`,
MCP buy/watch — works on children with **zero schema or query changes**;
that's the whole point of this shape. The alternative (a `variant`
column on offers/price_points + every consumer) touches every table and
was rejected.

Steps, in order:

1. **Seed evolution (prereq, standalone win).** `seedIfEmpty` only fires
   on an empty DB, so prod meta is frozen at first deploy — it has the
   old names ("iPhone 15 128GB") and will never learn `variants`. Add a
   `seed_meta` marker (one row, hash of seed.json): when it changes,
   upsert `meta` for every seed row (`ON CONFLICT(id) DO UPDATE SET
   meta = excluded.meta`) — meta is display-only, offers/price_points
   are never touched, so this is always safe. Rows dropped upstream are
   left in place (purchases/watches reference them). Worker test: seed,
   mutate a name in the seed, re-seed → meta updated, offers untouched.
2. **Child rows in the seed.** build.js already executes the prototype
   blocks; the extracted CATALOG rows now carry `p.variants`. Extend the
   extraction: for each product with variants, emit the 40 child rows by
   calling the prototype's own `variantListing()` in the same vm context
   — demo offers/history per combo stay byte-consistent with what the
   preview shows today, and real ingest overwrites them per child
   exactly like heads. Head meta keeps `variants` (axes/labels/swatches)
   for the picker; child meta gets `family` + `vlabel`, no `variants`.
   Seeding + step 1's upsert delivers all of it to prod.
3. **Frontend seam (boot.jsx) + upstream contract.** *(Upstream half
   shipped 2026-07-20: `variantListing`/`variantBest` prefer
   `p.listings[combo]`, PDP watch/buy key on `v.id`, and
   `resolveVariantId('<head>~<combo>')` backs the PDP, WatchStore.prod
   and AutobuyStore.prod — child ids resolve everywhere. Note: axis
   option ids must never contain `-`, the combo-key separator. Remaining
   here: the boot.jsx side below.)* `hydrateCatalog`
   splits rows on `meta.family`: children don't enter CATALOG/CAT_OF
   (search, results, browse stay head-only — VariantHint already covers
   the "comes in variants" signal); instead each head gets
   `p.listings = { combo: childRow }`. Upstream (Claude Design, prompt
   below): `variantListing(p, sel)` returns `p.listings[comboKey]` when
   present and only falls back to the synth path (preview keeps working
   unchanged); watch/autobuy/buy-now on the PDP use `v.id` so a watch on
   a non-default combo stores the child id — watchlist/alerts then show
   the vlabel-baked name for free. jsdom tests: picker renders from
   hydrated listings, selecting a combo swaps the offer table to the
   child's rows, watch on a selected combo persists the child id.
4. **Ingest goes variant-aware (data, not code).** `worker/eans.json`
   keys and `tools/crawl-urls.json` product keys may now be child ids —
   no shape change, `/api/ingest` already validates ids against
   `products`. The existing per-product EAN arrays are collapsed
   variants by definition; re-home each EAN to its child id as
   confirmed (Adtraction feeds carry per-SKU EANs — this is mostly
   waiting on task 2 of 4d). Until re-homed, an EAN keeps feeding the
   head row — today's behavior, no regression.
5. **MCP.** `search_products` filters out children (`meta.family`);
   `get_product` on a head appends its children (id, vlabel, best) so a
   client can `get_product`/`buy_now`/`watch_product` a concrete combo —
   which already work, children being ordinary rows. Tool description
   nudge, ~10 lines.
6. **Deferred (note, don't build):** deep-linking a PDP to a selected
   combo (`/product/iphone~256-blue` resolving head + preselect), picker
   options greyed by real stock, discover.mjs vlabel-aware slug
   matching. All additive later; nothing above blocks on them.

Risks: step 2 must keep `variantListing`'s determinism (same hash → same
demo prices as the deployed preview — assert one known combo's price in
the build test); step 3's upstream edit is the only sync-owned surface —
everything else is boot/worker/build/tools, inside the seam.

Order matters: 4a proves the hydration seam cheaply, 4b builds the first
real backend on a proven seam, 4c fills the pipeline, 4d swaps in real
sources shop-by-shop behind the same `ingest()`.

Not planned here: payments, SSR/SEO — separate decisions once real data
is live. Real BankID is parked until mostly everything else is done
(see 4b); the fake button just keeps working.

### 4f — Edge rate limiting, anti-scraping, DoS (planned 2026-07-21, not started)

Decided against a `ratelimit` Worker binding (tried, reverted 2026-07-21) —
user prefers Cloudflare dashboard/zone products over code, since they run
at the edge (before the Worker even invokes, cheaper) and don't need a
deploy to tune. Everything below is dashboard-only, done by hand in
dash.cloudflare.com against the `pricy.no` zone; nothing here touches the
repo. Needs the zone's current plan checked first (Free vs Pro+ gates the
challenge actions and Super Bot Fight Mode).

1. **WAF → Rate limiting rules** — one rule covering both the auth
   endpoints (`/api/auth/request`, `/api/auth/login`, `/api/auth/signup` —
   brute force / email-bombing) and the catalog/search surface
   (`/api/catalog.json`, `/mcp` — scraping). Match path, per-IP threshold,
   action Block (Free) or Managed Challenge (Pro+). Start high (log-only
   first, per Cloudflare's own guidance) to learn real traffic shape
   before tightening — the SPA may re-fetch `/api/catalog.json` per nav,
   so a too-low threshold could throttle real users.
2. **Security → Bots → Bot Fight Mode** — free, one toggle, challenges
   obvious scraper bots account-wide. If the zone is Pro+, use Super Bot
   Fight Mode instead for bot-score tuning and static-resource protection.
3. **Caching → Cache Rules** — cache `/api/catalog.json` at the edge
   (Edge TTL ~5 min; catalog only actually changes hourly via the cron).
   Turns scraping into cache hits instead of D1-backed origin requests —
   mitigates load/cost even before any blocking kicks in, zero risk to
   real users.
4. DDoS protection is already on (automatic, all plans, zero config) —
   nothing to do there, just confirming it's not a gap.

Order: do 3 first (free win, no behavior change for anyone), then 2
(free, low risk), then 1 last since it's the one that can accidentally
block real traffic — needs the log-only warm-up period.
