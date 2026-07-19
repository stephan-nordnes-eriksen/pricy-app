# Alert claims: push doesn't exist, "within minutes" isn't true

Marketing audit 2026-07-19. The claims:

- FAQ (proto/index.html:4943): "you get an email or push notification —
  usually within minutes".
- Landing (:3558): "ping you the moment it drops"; step 3 (:3577): "We
  alert you the second any shop drops below it."

Reality:

- **Push doesn't exist.** The settings toggle (:4598–4599) persists in
  `users.settings`, but `fireAlerts` only has an email channel
  (worker/index.js:226–245). The toggle is dead UI.
- **Email doesn't deliver in prod** — no SEND_EMAIL binding yet, alerts
  are console-logged and marked delivered (worker/index.js:241–243).
  Same known state as magic links; go-live is PLAN.md Phase 2.
- **Timing**: alerts fire only from ingest(), and ingest is the manual
  laptop crawl (prod cron is a no-op) — cadence is "whenever the crawler
  runs", not minutes.

## The decision

Web push is real work (service worker, subscription storage, VAPID,
per-device rows) — don't build it to back a FAQ sentence. Soften the
copy, mark the toggle "coming soon". Email needs no work here:
`fireAlerts` is ready and starts delivering the moment the SEND_EMAIL
binding lands.

## Plan

1. **Upstream copy pass**: FAQ answer drops "or push notification" and
   the "within minutes" promise → "you get an email as soon as our next
   price check sees it". Landing step 3 and hero sub soften the
   "second/moment it drops" phrasing to match.
2. **Upstream**: the "Push notifications" toggle in notification
   settings becomes disabled with a "Coming soon" tag (both the settings
   screen :4598 and onboarding :4895 instances).
3. **Later**: real web push is its own plan if users ask for it; restore
   the FAQ claim then. "Within minutes" becomes honest only when 4d's
   cron is live — restore it with that rollout, not before.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, alert copy overpromises. Three fixes:
> 1. About-page FAQ, "How do price alerts work?" answer: replace "you
>    get an email or push notification — usually within minutes" with
>    "you get an email as soon as our next price check sees it".
> 2. Landing page: soften "We watch the price across every shop and
>    ping you the moment it drops" and step 3's "We alert you the
>    second any shop drops below it" to promise the alert without the
>    instant-timing claim (e.g. "We watch the price and email you when
>    it drops below your target").
> 3. Notification settings (settings screen and onboarding): the "Push
>    notifications" row becomes disabled with a small "Coming soon"
>    tag; the toggle is not interactive.

## Dependencies

Email delivery: SEND_EMAIL binding (PLAN.md Phase 2). Copy fixes have
none.
