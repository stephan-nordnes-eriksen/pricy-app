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

## Suggested order

1. [price-drop-alerts](price-drop-alerts.md) — the core promise; the
   price-check hook it builds is the same one AUTOBUY-PLAN AB-1 needs.
2. [activity-feed](activity-feed.md) — depends on 1's alerts table.
3. [honest-metrics](honest-metrics.md) — kill the fabricated numbers;
   small worker additions + one upstream copy pass.
4. [recently-viewed](recently-viewed.md) — small, client-side.
5. [account-privacy](account-privacy.md) — GDPR export + delete; real
   obligations, currently pure theatre.
6. [dead-ui-cleanup](dead-ui-cleanup.md) — dead buttons/links/dead code,
   mostly one upstream Claude Design pass.
7. [report-product-error](report-product-error.md) — TODO.md item.
8. [profile-email-change](profile-email-change.md) — small; real change
   needs email.
9. [real-magic-link-login](real-magic-link-login.md) — blocked on the
   Email Service binding; drops the demo auth bridges.
10. [pricy-plus](pricy-plus.md) — decision-heavy (billing); do last.
