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
- **Still fake upstream** (fix in Claude Design): PLUS_FEATURES claims
  "Free plan caps at 10" watches — no cap is enforced anywhere; "Price
  forecasts … based on 24 months of history per shop" — no history
  exists; onboarding step 4's Plus card still says "try it free for 14
  days, anytime" — the trial the modal no longer offers.

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
2. **Upstream honesty pass** — mostly done 2026-07-19 (see current
   state). Remaining upstream: delete the "Free plan caps at 10" line
   (don't enforce a cap nobody hits just to make the sentence true),
   soften the "24 months of history" forecast claim, and fix onboarding
   step 4's leftover "try it free for 14 days". Decide whether to keep
   preview wording or switch to the waitlist (waitlist measures demand;
   preview measures nothing — leaning waitlist when step 1 lands).
3. **Plus features** — each is its own future plan when/if built (AI
   digest, forecasts, Ask pricy — all need real modeling/LLM work).
   Don't scope them here; the waitlist numbers decide.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, three leftover Pricy Plus claims still
> overpromise (the coming-soon/preview pass is already in):
> 1. In PLUS_FEATURES, the "Unlimited watchlist" row says "Free plan
>    caps at 10." — there is no cap; delete that sentence (keep the
>    row and "Watch as many products as you want.").
> 2. The "Price forecasts" row says "based on 24 months of history per
>    shop" — we have no such history; say "based on price history per
>    shop" instead.
> 3. Onboarding step 4's Pricy Plus card still says "try it free for
>    14 days, anytime" — there is no trial anymore; end with "— coming
>    soon." to match the paywall modal.
>
> Later, when the waitlist is wanted: PlusModal's "Preview Plus
> features" button becomes "Join the waitlist" (calls
> `window.joinWaitlist()` if present, then shows "You're on the list").

## Dependencies

None to ship option 1. Real billing later: Vipps merchant onboarding
(weeks of KYC — same prerequisite AUTOBUY-PLAN AB-2 documented).
