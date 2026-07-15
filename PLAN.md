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

**Human steps to go live (in order):**
1. Sign up as an Adtraction publisher (site: pricy.no), apply to the 8
   brands' programs; check the brand directory for Power/Proshop, fall back
   to Awin/Partner-ads/Tradedoubler for shops not on Adtraction.
2. As approvals land: `wrangler secret put ADTRACTION_FEEDS` with
   `{"Komplett": "https://…", …}` and add
   `"Komplett": {"type": "adtraction"}` to `vars.SOURCES` in wrangler.jsonc.
3. Verify the first real feed's field names against the candidates in
   `worker/sources.js` (ean/price/instock/trackingurl variants).
4. For shops without any network: collect product-page URLs (+ robots.txt
   check), configure `{"type": "scrape", "urls": {…}}`.
5. Deploy, watch cron logs for `ingest: <shop> … rows`, spot-check prices
   against the shops.
6. Kelkoo Group (contract-based shopping API) is the future single-feed
   option — fits the same source seam if ever signed.

Order matters: 4a proves the hydration seam cheaply, 4b builds the first
real backend on a proven seam, 4c fills the pipeline, 4d swaps in real
sources shop-by-shop behind the same `ingest()`.

Not planned here: payments, SSR/SEO — separate decisions once real data
is live. Real BankID is parked until mostly everything else is done
(see 4b); the fake button just keeps working.
