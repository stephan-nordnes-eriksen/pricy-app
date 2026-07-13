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

## Phase 2 — Deploy to Cloudflare  ← next

1. `npm run deploy` (wrangler prompts to log in first time) →
   `pricy.<subdomain>.workers.dev`.
2. Connect repo to Workers Builds (build command `npm run build`, deploy
   command `npx wrangler deploy`) → push-to-deploy.
3. Attach pricy.no in the dashboard when ready.

## Phase 3 — The design-sync loop (ongoing ritual)

See CLAUDE.md. One file to pull (`pricy/index.html`), then
`npm test`, push. Mirror new screens in `boot.jsx` when the prototype's
App grows one.

## Phase 4 — Real data & auth (deferred until wanted)

- Worker script + D1 for products/offers/history; swap the prototype's
  window.CATALOG mock for `/api/…` fetches at the boot layer.
- Real auth replaces the localStorage session flag (same boot.jsx seam).

Not planned here: scraping/ingestion, payments, SSR/SEO — separate
decisions once the mock-data site is live.
