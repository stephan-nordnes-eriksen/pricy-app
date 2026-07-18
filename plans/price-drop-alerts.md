# Price-drop alerts actually fire

The core promise — "the moment any shop goes below your target, you get
an email or push" (proto/index.html:4882) — has no implementation.

## Current state

- Watches with targets persist (`watches` table, `PUT /api/watches`).
- Notification prefs persist (`users.settings` blob via `PUT
  /api/settings`: email/push/weekly/hits/lows/digest/threshold —
  NotifSection, proto/index.html:4523–4577) but **no server code ever
  reads them**.
- Prices arrive via `ingest()` (worker/index.js, fed by `POST
  /api/ingest` and the cron) — but nothing compares a new best price
  against any watch target. Nothing is ever sent or recorded.
- The watch `hit` flags users see come from the prototype's seed data,
  not from real hits.
- Onboarding step 4's notification toggles (proto/index.html:4831,4835)
  are local state only — `boot.jsx:280` mounts `<Onboarding>` with no
  save prop, so the choice is silently dropped.

## Done looks like

After every ingest, watches whose target is newly crossed produce a
recorded alert, the watch shows as hit, and the user gets an email (when
the Email Service binding is live; console-log until then, same pattern
as magic links).

## Plan

1. **Alert check hook in `ingest()`** — the single choke point both the
   cron and `/api/ingest` route through. After upserting offers, for
   each affected product compute the new best in-stock price, then scan
   watches on that product: fire when `best <= target`, respecting the
   user's settings (`threshold` minimum-drop %, `lows` toggle, paused
   watches). **Build this hook once — AUTOBUY-PLAN AB-1's trigger
   engine hangs on the exact same spot.** Share the per-product
   best-price computation between the two consumers.
2. **`alerts` table** — `id, user_id, product_id, shop, price,
   prev_price, target, created_at, delivered_at`. Idempotency: a watch
   fires once per crossing — don't refire while price stays below
   target; re-arm when it rises back above.
3. **Delivery** — email via `env.SEND_EMAIL` when bound, console-log
   otherwise (reuse the magic-link email path). Push: out of scope
   until a web-push subscription exists — the `push` pref stays stored,
   note it in the UI copy if it reads as live. Weekly digest (`weekly`,
   `digest` timing): separate cron pass over undelivered alerts; can
   ship after instant email.
4. **Hydrate real hit state** — boot.jsx sets each watch's `hit` from
   the server (has an undelivered/recent alert) instead of seed data;
   `MetricStrip` "Active alerts" (proto/index.html:2555) then becomes
   real for free.
5. **Onboarding fix** — pass an `onSave` into `<Onboarding>` in
   boot.jsx that PUTs the notif prefs on finish (merge into
   `saveSettings`). May need a tiny upstream change if `finish()`
   doesn't expose the prefs — check first.
6. **Tests** — worker test: ingest a price below a target → alert row,
   respects threshold/paused/re-arm; UI test: hydrated hit flag.

## Dependencies

- Email Service binding (PLAN.md Phase 2) for real delivery; everything
  else is buildable now.
- Coordinate with AUTOBUY-PLAN AB-1 — same hook, build once.
