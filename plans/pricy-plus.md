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
2. **Upstream honesty pass** — PlanSection: replace "renews Aug 1"
   billing fiction with "Plus is coming soon"; Upgrade → "Join the
   waitlist" calling `window.joinWaitlist()` (persist a flag in
   settings); locked feature cards get "coming soon" labels.
3. **Plus features** — each is its own future plan when/if built (AI
   digest, forecasts, Ask pricy — all need real modeling/LLM work).
   Don't scope them here; the waitlist numbers decide.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, Pricy Plus currently pretends to be a live
> subscription. Make it honest: in PlanSection, replace the "kr 49/mo ·
> renews Aug 1" billing details with "Pricy Plus — coming soon"; the
> Upgrade button becomes "Join the waitlist" (calls
> `window.joinWaitlist()` if present, then shows "You're on the list");
> Cancel disappears for free users. Plus-locked cards (AI digest,
> forecasts, Ask pricy) keep their lock but say "Coming with Pricy
> Plus". Keep the paywall modal design for later.

## Dependencies

None to ship option 1. Real billing later: Vipps merchant onboarding
(weeks of KYC — same prerequisite AUTOBUY-PLAN AB-2 documented).
