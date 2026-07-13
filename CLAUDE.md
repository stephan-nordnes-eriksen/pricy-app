# pricy.no

Price comparison site for Norway. Design lives in claude.ai/design
(project `ee80f3e5-c405-4e58-9c44-689deea0f932`), deployed to Cloudflare
Workers as a zero-build static site. Full plan: PLAN.md.

## How it works

- `_ds_bundle.js` (synced, pre-compiled kit JSX) puts all components and
  mock data on `window`. `index.html` loads it after vendored React UMD
  plus an `Object.assign(window, React)` shim (the bundle calls hooks bare).
- `app.js` is the only hand-written runtime code: URL router mapping the
  kit's `go(route, params)` convention to real URLs, plus stub screens
  (results/product/deals) awaiting their Claude Design versions.

## Rules

- Repo-root design files (`colors_and_type.css`, `components.css`,
  `preview/`, `ui_kits/`, `assets/`, `_ds_*`) are **sync-owned — never
  hand-edit**. Design changes are made in claude.ai/design only.
- `npm test` runs `render-check.js` — renders every route via
  react-dom/server against the real bundle. Run after every sync and
  every `app.js` change.

## "sync design changes" ritual

1. Pull changed files from the Claude Design project via the DesignSync
   tool into their existing repo-root paths.
2. `npm test`. If a new screen component arrived (e.g. `Results`), wire
   its route in `app.js` and delete the stub of the same name.
3. Commit (sync and any app.js wiring separately), push — Workers Builds
   auto-deploys main.
