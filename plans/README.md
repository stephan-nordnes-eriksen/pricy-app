# plans/ — incomplete-feature backlog

Two audits feed this folder: the full-product audit of what's mocked,
hardcoded, or dead (2026-07-18) and the marketing-claims audit
(2026-07-19: what the about/landing copy says vs what the product
does). One plan file per issue; each states current state (with
file:line evidence), what "done" looks like, and the steps. Work
through them in the order below unless something changes.

**Excluded by decision** (planned elsewhere or parked):
- BankID login (parked, PLAN.md 4b) — fake button stays working.
- Buy-now / auto-buy execution (AUTOBUY-PLAN.md, FULFILLMENT-PLAN.md).
  What the auto-buy *copy* claims meanwhile is in scope:
  [autobuy-copy-honesty](autobuy-copy-honesty.md).
- Email Service go-live itself (PLAN.md Phase 2 — paid-plan decision).
  Plans below that need email *delivery* mark it as a dependency.
- Catalog scale / real price sources / seeded demo offers / the no-op
  hourly cron — that's PLAN.md 4d (Adtraction rollout, crawl coverage),
  already in flight. The freshness *claims* made meanwhile are in scope:
  [marketing-copy-honesty](marketing-copy-honesty.md).
- TODO.md's "convert a watch to auto-buy" — auto-buy scope, track it
  with AUTOBUY-PLAN work.

**Implemented** (moved to [../plans-implemented/](../plans-implemented/)):
honest-metrics, account-privacy, dead-ui-cleanup, price-drop-alerts,
activity-feed, recently-viewed, real-magic-link-login — each file keeps
its remaining upstream/delivery follow-ups.

## Suggested order

1. [marketing-copy-honesty](marketing-copy-honesty.md) — three false
   copy claims (re-check cadence, referral fees, "drops today"); one
   upstream pass, no code.
2. [price-verified-timestamps](price-verified-timestamps.md) — the
   "every price shows when it was last verified" claim; data already in
   the API, just render it. Makes the claim true instead of softer.
3. [alert-notification-claims](alert-notification-claims.md) — push
   doesn't exist, "within minutes" isn't true; copy pass + dead toggle.
4. [autobuy-copy-honesty](autobuy-copy-honesty.md) — fullmakt doc's
   fabricated org.nr/identity and the "purchases for you" present
   tense; worst honesty offender, copy-only fix.
5. [report-product-error](report-product-error.md) — TODO.md item.
6. [profile-email-change](profile-email-change.md) — small; real change
   needs email.
7. [pricy-plus](pricy-plus.md) — decision-heavy (billing). All Plus
   *copy* honesty synced 2026-07-19; what's left is the mechanics
   (server-side plan state, waitlist-vs-preview, billing). Do last.

The upstream prompts in 1–4 (and pricy-plus's) can be pasted into
Claude Design as one combined copy-honesty pass if syncing once is
preferred.
