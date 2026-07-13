# Pricy.no — prototype → production plan

Goal: ship the Claude Design prototype as a real site on Cloudflare, while the
design keeps evolving in claude.ai/design and syncs back into this repo.

## Architecture (Option A — zero-build static shell)

No bundler, no build step. The design sync ships `_ds_bundle.js`, a
pre-compiled version of the kit JSX that puts every component and the mock
data on `window`. The app consumes it directly:

```
index.html        ← loads synced CSS, vendored React/Lucide, _ds_bundle.js, app.js
app.js            ← URL router + stub screens not yet designed in Claude Design
vendor/           ← React 18 + Lucide UMD builds (vendored, no CDN)
wrangler.jsonc    ← Workers static assets, SPA fallback
.assetsignore     ← keeps repo-internal files out of the deployment
render-check.js   ← `npm test` — renders every route, fails if the bundle contract breaks
```

Synced design files stay exactly where the sync puts them (repo root:
`colors_and_type.css`, `components.css`, `preview/`, `ui_kits/`, `assets/`,
`_ds_*`). **Never hand-edit these** — they are overwritten on every sync.

Key detail: the compiled bundle calls React hooks bare, so `index.html` runs
`Object.assign(window, React)` before loading it.

Fallback if the bundle format ever changes: the raw `.jsx` sources are also
synced — compile them ourselves with one esbuild command and load in order.

## Phase 1 — Scaffold ✅ (done)

Routes: `/` (Home from the kit), `/search?q=`, `/product/:id`, `/deals`.
The three non-home screens are stubs in `app.js` built from kit.css's
existing styles; each gets replaced when its design lands in Claude Design
and exports a component. Mock data (`PRODUCTS`, `SHOPS`) ships as-is —
real data is Phase 4, deliberately.

Verified: `npm test` renders every route; headless Chrome confirmed
browser rendering via `wrangler dev`.

## Phase 2 — Deploy to Cloudflare

1. `npm run deploy` (wrangler will prompt to log in first time) →
   live on `pricy.<subdomain>.workers.dev`.
2. Connect the GitHub repo to Workers Builds in the Cloudflare dashboard →
   every push to `main` auto-deploys. (No CI YAML to maintain.)
3. Attach the custom domain (pricy.no) in the dashboard when ready.

Done when: push to main → live site updates.

## Phase 3 — The design-sync loop (ongoing ritual)

The direction is one-way: **Claude Design → repo → deploy**. See CLAUDE.md
for the exact ritual. Because the app runs the design bundle directly,
there is normally **nothing to propagate** — sync, `npm test`, push.
Only a brand-new screen needs work: one route entry in `app.js` (and
deleting the stub it replaces).

## Phase 4 — Real data (deferred until wanted)

The mock `PRODUCTS`/`SHOPS`/`hist()` in the kit ship first. When real data
exists:

- Add a Worker script (`main` in wrangler.jsonc) with API routes
  (`/api/products`, `/api/products/:id`); D1 for products/offers/history.
- Have `app.js` fetch and pass data down instead of reading `window.PRODUCTS`.
- This is also the natural moment to graduate to a bundler (Vite/esbuild)
  if the app has grown real logic — decide then, not now.

Not planned here: scraping/ingestion pipeline, accounts/alerts, SSR/SEO.
Each is a separate decision when the mock-data site is live and the design
has settled.
