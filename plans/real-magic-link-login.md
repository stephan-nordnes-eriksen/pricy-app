# Real magic-link login — drop the demo auth bridges

**Status: implemented 2026-07-19** (upstream waiting state synced; boot.jsx
driver polls `/api/me`; passwordless signup pinned to `demo@pricy.no`;
signup can no longer take over existing accounts — passworded ones verify,
magic-link ones refuse). Two deviations from the plan below:
- `POST /api/auth/login` did not die — it had already become the real
  password login (strict, verified); only its passwordless demo behavior
  was gone.
- Waiting-tab pickup is **same-browser only** (shared cookie jar), not
  cross-device: a pollable claim token would let whoever *requested* the
  link steal the session of whoever *clicked* it. A link clicked on another
  device logs that device in; the waiting tab times out after ~10 min.

**Not deployed** — still blocked on the SEND_EMAIL binding (paid plan,
PLAN.md Phase 2). Without it prod would console-log the email and the
waiting screen would spin forever.

## Current state

The real flow exists server-side: `POST /api/auth/request` +
`GET /api/auth/verify` (worker/index.js:565–600). But the UI never uses
it end-to-end: the AuthCard's "Open the link" button is a simulation
that calls `POST /api/auth/signup` with no password (boot.jsx:252–261,
bridge at worker/index.js:602–627), upserting a passwordless account —
i.e. the frontend fakes clicking the emailed link. Anyone who knows an
email address can log into that account this way — acceptable only
while this is openly a demo. CLAUDE.md already flags both bridges for
removal "when the upstream Login waits for the real emailed link."

## Done looks like

Submitting your email sends a real email; the login tab waits; clicking
the emailed link (any device) completes login; the waiting tab picks up
the session. The signup bridge survives **only** for the fake-BankID
button (excluded scope — it depends on the bridge to log into
demo@pricy.no).

## Plan

1. **Verify lands a session** — `GET /api/auth/verify` already sets the
   cookie in the clicked tab; make it land on `/` logged in (check
   current redirect behavior).
2. **Waiting tab picks it up** — after `POST /api/auth/request`, the
   AuthCard shows "Check your email" and boot.jsx polls `/api/me`
   every few seconds (cap ~10 min); on 200, proceed as logged in.
   ponytail: polling, not BroadcastChannel/SSE — cross-device needs
   polling anyway.
3. **Upstream** — Login's magic-link tab drops the "Open the link"
   simulation for a real waiting state (prompt below).
4. **Restrict the bridges** — `POST /api/auth/login` (strict demo
   bridge) dies; `POST /api/auth/signup` stays but only for the BankID
   path (boot.jsx is the only caller — gate it to the BankID flow, and
   server-side pin it to `demo@pricy.no` so it can't upsert arbitrary
   accounts anymore).
5. **Tests** — request→verify→poll flow in worker tests; UI test for
   the waiting state; bridge test now expects arbitrary-email signup to
   be rejected.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype's AuthCard, the magic-link flow currently
> shows an "Open the link" button that simulates clicking the emailed
> link. Replace it with a real waiting state: after submit, show "We
> sent a link to {email} — this page will continue automatically once
> you click it", with a subtle spinner and a "Resend" link (30s
> cooldown). The host page signals completion via the existing
> `onAuthed` contract; keep the fake-BankID button untouched.

## Dependencies

**Blocked on the Email Service binding** (PLAN.md Phase 2, paid-plan
decision — excluded scope). Until then the bridges are what makes login
work at all; build nothing here before that decision.
