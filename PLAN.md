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

## Phase 2 — Deploy to Cloudflare (on hold — working locally, no remote)

1. `npm run deploy` (wrangler prompts to log in first time) →
   `pricy.<subdomain>.workers.dev`.
2. Connect repo to Workers Builds (build command `npm run build`, deploy
   command `npx wrangler deploy`) → push-to-deploy.
3. Attach pricy.no in the dashboard when ready.

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

### 4b — Real auth + persisted watchlist

- First Worker code: `worker/` module alongside the static assets
  (`wrangler.jsonc` gains `main` + a D1 binding).
- Email magic-link login (Cloudflare Email Service), HttpOnly session
  cookie, `/api/me`. `boot.jsx`'s `readSession/writeSession` swap
  localStorage for `/api/me` — the gating logic above them doesn't change.
- D1: `users`, `sessions`, `watches`. The prototype's `USER` / `WATCHED`
  constants hydrate per-user the same way CATALOG does in 4a.
- BankID stays a fake button (real BankID is a signed-vendor contract, not
  a phase).

### 4c — Real prices

- Ingestion writes to D1 (`products`, `offers`, `price_points`); the
  catalog endpoint goes dynamic (Worker route replaces the static JSON —
  same URL, same shape, nothing downstream moves).
- Scheduled Worker (cron) refreshes offers. Source of prices (feeds vs
  scraping vs partner APIs) is its own decision — do not start 4c until
  that's made; 4a/4b don't depend on it.

Order matters: 4a proves the hydration seam cheaply, 4b builds the first
real backend on a proven seam, 4c is blocked on a business decision.

Not planned here: payments, SSR/SEO — separate decisions once real data
is live.
