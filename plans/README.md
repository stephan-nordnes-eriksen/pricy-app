# plans/ — incomplete-feature backlog (audit 2026-07-18)

Full-product audit of what's still mocked, hardcoded, or dead. One plan
file per feature; each states current state (with file:line evidence),
what "done" looks like, and the steps. Work through them in the order
below unless something changes.

**Excluded by decision** (planned elsewhere or parked):
- BankID login (parked, PLAN.md 4b) — fake button stays working.
- Buy-now / auto-buy execution (AUTOBUY-PLAN.md, FULFILLMENT-PLAN.md).
- Email Service go-live itself (PLAN.md Phase 2 — paid-plan decision).
  Plans below that need email *delivery* mark it as a dependency.
- Catalog scale / real price sources / seeded demo offers / the no-op
  hourly cron — that's PLAN.md 4d (Adtraction rollout, crawl coverage),
  already in flight.
- TODO.md's "convert a watch to auto-buy" — auto-buy scope, track it
  with AUTOBUY-PLAN work.

**Implemented** (moved to [../implemented-plans/](../implemented-plans/)):
price-drop-alerts, activity-feed, recently-viewed — each file keeps its
remaining upstream/delivery follow-ups.

## Suggested order

1. [honest-metrics](honest-metrics.md) — kill the fabricated numbers;
   small worker additions + one upstream copy pass.
2. [account-privacy](account-privacy.md) — GDPR export + delete; real
   obligations, currently pure theatre.
3. [dead-ui-cleanup](dead-ui-cleanup.md) — dead buttons/links/dead code,
   mostly one upstream Claude Design pass.
4. [report-product-error](report-product-error.md) — TODO.md item.
5. [profile-email-change](profile-email-change.md) — small; real change
   needs email.
6. [real-magic-link-login](real-magic-link-login.md) — blocked on the
   Email Service binding; drops the demo auth bridges.
7. [pricy-plus](pricy-plus.md) — decision-heavy (billing); do last.
