# pricy.no

Price comparison site for Norway, deployed to Cloudflare Workers.
Two Claude Design projects feed this repo:

- **Prototype (the product):** `7fa9cba6-ae13-4aa3-9ae4-f76a18ff1573`,
  file `pricy/index.html` → synced to `proto/index.html`. Self-contained:
  all CSS and all screen JSX inline.
- **Design system (tokens/kit):** `ee80f3e5-c405-4e58-9c44-689deea0f932`
  → synced to repo root (`colors_and_type.css`, `ui_kits/`, `preview/`,
  `assets/`, `_ds_*`). Reference only; the app is built from the prototype.

## How it works

`node build.js` turns `proto/index.html` into `dist/` (what deploys):
- every inline babel block EXCEPT the last is compiled with esbuild into
  `dist/app.js`, byte-faithful to the prototype
- the last block is the designer's tweaks-panel harness — replaced by
  `boot.jsx`: real session flag (localStorage `pricy_session`), URL routing
  over the prototype's `go(name, params)`, auth gating (logged out →
  landing/login/about only; **search requires login**), layouts frozen to
  the prototype's TWEAK_DEFAULTS
- CDN dev React/Babel/lucide are swapped for vendored production UMDs
  (`vendor/`)

## Rules

- `proto/index.html` and the repo-root design files are **sync-owned —
  never hand-edit**. Behavior fixes go upstream in Claude Design, then
  re-sync. Hand-written code is only: `boot.jsx`, `build.js`, `test/`,
  configs.
- `npm test` builds then runs the jsdom UI suite. Run after every sync
  and boot.jsx change.

## "sync design changes" ritual

1. DesignSync get_file `pricy/index.html` from the prototype project →
   write to `proto/index.html`.
2. `npm test`. If the prototype's App gained/renamed screens (see the
   view switch in its last babel block), mirror that in `boot.jsx`.
3. Commit (sync and boot/test adjustments separately), push — Workers
   Builds auto-deploys main (build command: `npm run build`, output: `dist`).

Known upstream gaps (fix in Claude Design, then extend tests):
- Signed-in AppHeader search: Enter and suggestion-pick don't navigate
  (SearchHero has the working pattern).
