# Pricy Plus — subscription & Plus features are fully fake

## Current state

- The user's plan comes from `window.PLAN`, a frozen designer tweak
  (`T.plan`, boot.jsx:226–228) — not per-user server state. No billing
  table, nothing in `users.settings`.
- `PlanSection` (proto/index.html:4582–4620): "kr 49/mo · renews Aug 1"
  hardcoded; Upgrade opens a paywall modal with no payment; Cancel just
  calls `window.setPlan('free')` client-side.
- Plus-gated features have no backend at all: AI deal digest
  (:3614–3619), price forecast (a hardcoded prediction string, :4344),
  "Ask pricy", locked cards (:4348).
- **Marketing honesty: mostly fixed upstream** (synced 2026-07-19).
  The prototype now shows "Coming soon" tags (`SoonTag`) on every
  Plus-locked card, the paywall modal says "kr 49 / month (planned) ·
  subject to change" with a "Preview Plus features" button (trial offer
  gone), PlanSection shows "Pricy Plus (preview)" with no renewal date,
  and the About FAQ presents Plus as "our upcoming subscription —
  coming soon". Note the designer chose **preview** wording, not the
  waitlist this plan proposed — no `window.joinWaitlist()` exists, and
  "Preview Plus features" still flips the client-side plan tweak.
- **Leftover claims fixed upstream too** (synced 2026-07-19, second
  pass): the fake "Free plan caps at 10" cap and "24 months of
  history" are gone from PLUS_FEATURES, and onboarding step 4's Plus
  card says "coming soon" with the SoonTag instead of the dead 14-day
  trial. The Plus *copy* is now honest everywhere; what remains fake
  is the mechanics (plan state, preview flip, no billing) below.

## The decision (make it first)

Plus is three commitments in a trench coat: (a) per-user plan state,
(b) real billing, (c) the features themselves. (b) means payments —
deliberately deferred product-wide (PLAN.md "Not planned here:
payments"), and Vipps merchant onboarding was explicitly shelved by
FULFILLMENT-PLAN F6. So the honest near-term options:

1. **Label it "coming soon"** — paywall stays, Upgrade button becomes a
   waitlist/interest ping. Zero billing work, honest, measures demand.
   ← recommended.
2. Free-during-beta: persist `plan` per user, let anyone flip to Plus
   free. More motion, no more honesty than option 1.

Full billing (Vipps Recurring — fits subscriptions exactly, needs
merchant onboarding + extra KYC per AUTOBUY-PLAN research) only makes
sense once a Plus feature is worth paying for.

## Plan (option 1)

1. **Persist plan server-side anyway** — `plan` field in the
   `users.settings` blob (default `free`), exposed via `meBody`;
   boot.jsx sets `window.PLAN` from it instead of the tweak default.
   One honest source of truth, ready for any option above.
2. **Upstream honesty pass** — done 2026-07-19 (both passes, see
   current state). Open question folded into step 1: keep preview
   wording or switch to the waitlist (waitlist measures demand;
   preview measures nothing — leaning waitlist when step 1 lands).
3. **Plus features** — each is its own future plan when/if built (AI
   digest, forecasts, Ask pricy — all need real modeling/LLM work).
   Don't scope them here; the waitlist numbers decide.

## Upstream (Claude Design) prompt — paste-ready

> When the waitlist is wanted: PlusModal's "Preview Plus features"
> button becomes "Join the waitlist" (calls `window.joinWaitlist()` if
> present, then shows "You're on the list").

## Dependencies

None to ship option 1. Real billing later: Vipps merchant onboarding
(weeks of KYC — same prerequisite AUTOBUY-PLAN AB-2 documented).
