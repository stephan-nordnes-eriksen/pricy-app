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
- the prototype's enriched CATALOG is extracted to `worker/seed.json`
  (gitignored). D1 `products`/`offers`/`price_points`, seeded from that
  file on first use, offers refreshed by the hourly cron `scheduled`
  handler. The catalog is **query-based** (no eager full load): the SPA
  fetches `GET /api/products?ids=|q=|cat=|sort=drop` slices which boot's
  `hydrateCatalog` MERGES into the prototype's CATALOG array (a lazy
  session cache; `ensureRoute` prefetches each route's slice before
  setScreen, `hydrateSession` batch-fetches every id the login references,
  header suggestions ride a debounced `q=` fetch). Worker helpers:
  `rowsFor`/`searchIds`/`topDropIds`/`catMeta` in `worker/index.js`.
  `/api/catalog.json` remains as a full dump for ops/tools only — the SPA
  must never call it. Upstream is synced (2026-07-21): category counts and
  presence read `CATALOG.meta.cats`, SignedHome "Biggest drops" ranks
  `window.CATALOG`, and SearchSuggest refreshes via boot's
  `window.onSuggestData(q, refresh)` hook; browse prefetches
  `sort=drop&perCat=1&limit=4`.
- **Adding products needs no upstream edit**: `worker/extra.json` holds
  hand-written head rows (`id/name/brand/cat/icon/kw`; cat must be in the
  prototype's CATEGORIES) that build.js merges into seed.json — seeding,
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
  Adtraction feeds emit such rows for every unmatched EAN; discover.mjs
  writes unknown-EAN pages as `ean-*` entries into crawl-urls.json;
  scrapeSource carries JSON-LD name/brand so crawl pushes create too.
  Enrichment is manual: `node tools/enrich.mjs` lists hidden rows
  (`GET /api/products?hidden=1`) as paste-ready extra.json skeletons —
  fill cat/icon/kw, KEEP THE SAME id, deploy; the seed upsert rewrites
  meta without `hidden` and the product goes live with its collected
  offers. A hidden row that's really a variant of an existing product:
  add its EAN to eans.json and skip the extra row instead.
- real price sources (4d) live in `worker/sources.js`: per-shop config in
  the `SOURCES` JSON var (wrangler.jsonc) — `adtraction` (per-brand XML
  feeds, URLs in the `ADTRACTION_FEEDS` secret, rows matched to products
  by EAN via hand-written `worker/eans.json`) and `scrape` (first-party
  JSON-LD off the shop's own product pages). **Never scrape competing
  comparison services (Prisjakt etc.).** A shop with no/failing source
  freezes at its last stored price; empty `SOURCES` (current prod state)
  makes the cron a no-op. The interim price writer is manual:
  `node tools/crawl.mjs [--dry] [--shop X] [--limit N] [--out f.json]`
  scrapes first-party pages listed in `tools/crawl-urls.json` and POSTs to
  `/api/ingest` (`npm run test:crawlers` live-checks one page per shop,
  on demand only) (bearer =
  `INGEST_TOKEN` secret; token also in untracked `tools/.ingest-token`).
  `eans.json` arrays hold confirmed variants only — extend them as real
  feeds reveal missed colors/SKUs. Rollout checklist: PLAN.md 4d.
  Product images: source rows may carry `image` (JSON-LD `Product.image` /
  Adtraction `imageurl`); ingest's `syncImages` downloads to the R2 bucket
  `pricy-images` (binding `IMAGES`, key `products/<id>`) only when the
  source URL is new or changed (D1 `images` table pins the last URL),
  serves at `GET /img/<id>` (etag + max-age, in `run_worker_first`), and
  `catalogBody` advertises `img: "/img/<id>"` when stored. The UI doesn't
  render `img` yet — that's an upstream prototype change.

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
  `-` (combo-key separator). Still data-only pending: re-homing
  `eans.json`/`crawl-urls.json` keys to child ids as Adtraction feeds
  confirm SKUs (PLAN.md 4e step 4).
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
