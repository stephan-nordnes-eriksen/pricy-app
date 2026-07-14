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
- the prototype's enriched CATALOG is extracted to `worker/seed.json`
  (gitignored). `/api/catalog.json` is a Worker route (4c): D1
  `products`/`offers`/`price_points`, seeded from that file on first use,
  offers refreshed by the hourly cron `scheduled` handler.
  `syntheticFeed()` in `worker/index.js` is the swap point for a real
  price source — until one is signed, prices are synthetic jiggle.

## Rules

- `proto/index.html` and the repo-root design files are **sync-owned —
  never hand-edit**. Behavior fixes go upstream in Claude Design, then
  re-sync. Hand-written code is only: `boot.jsx`, `build.js`, `worker/`,
  `test/`, configs. (The prototype project is a `PROJECT_TYPE_PROJECT`, not
  a design-system project, so DesignSync can't push to it from here; the
  get_file pull-only ritual is the only sync path.)
  - **Standing exception (2026-07-15):** search Enter on an empty/whitespace
    query used to navigate to results for `'airpods pro'` (demo-ism). Fixed
    in `proto/index.html` in both submit handlers — `AppHeader` (signed-in)
    and `Header` (logged-out chrome): trim the query, and if empty do
    nothing. No prop changes, no `boot.jsx` change. Covered by the ui test
    "header search Enter on an empty query stays put". **Port this diff
    into the Pricy.no Claude Design prototype project** next time it's
    open, then this exception can be deleted.
  - **Standing exception (2026-07-15):** `WATCH_HITS` / `TOTAL_SAVED` demo
    consts deleted from `proto/index.html` (AppData block, incl. the window
    export). Replaced by live `WatchStore.hits()` (below-target, unpaused)
    and `WatchStore.saved()` (sum of `was - best` over watched products) in
    `AppHeader`'s alerts badge, `MetricStrip`, `LayoutDashboard`'s greeting,
    `LayoutFeed`'s metrics, and `AlertsPage`'s sub-line; each consumer
    subscribes via `useWatchStore()`. `MetricStrip`/`LayoutFeed` "Watching"
    counts moved from static `WATCHED.length` to live `items.length` while
    there. No prop changes; `boot.jsx` only lost its stale gap comment.
    Covered by the ui tests "header alerts badge counts real below-target
    watches" / "no watches: no alerts badge". **Port this diff into the
    Pricy.no Claude Design prototype project** next time it's open, then
    this exception can be deleted.
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

1. DesignSync get_file `pricy/index.html` from the prototype project →
   write to `proto/index.html`.
2. `npm test`. If the prototype's App gained/renamed screens (see the
   view switch in its last babel block), mirror that in `boot.jsx`.
3. Commit (sync and boot/test adjustments separately), then
   `npm run deploy` (live: https://pricy.stephanruler.workers.dev — Worker
   `pricy`, D1 `pricy-app`; the account's other `pricy` D1 belongs to the
   project serving pricy.no — never bind it). No git remote / Workers
   Builds yet.

Known upstream gaps (fix in Claude Design, then extend tests):
- AuthCard's `onAuthed(email, {signup})` contract is real now (email
  passed out, awaitable verdict, server errors shown in the form), and
  password login/signup/change are real (PBKDF2-hashed, verified
  server-side). BankID is still a fake button that logs into a shared demo
  account (`demo@pricy.no`) and lands home. Real BankID is parked until
  mostly everything else is done (see PLAN.md) — keep the fake button
  working, spend no other effort on it. Served by the Worker's demo
  bridges: `POST /api/auth/login` (strict, existing accounts only) and
  `POST /api/auth/signup` (upsert; also used for BankID and the
  "Open the link" magic simulation). Drop both when the upstream Login
  waits for the real emailed link.

`npm run test:e2e` (Playwright visual parity vs the prototype) must run
with the Bash sandbox disabled — Chromium can't bootstrap its mach port
inside it.
