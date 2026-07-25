# plans/ — incomplete-feature backlog

Three audits feed this folder: the full-product audit of what's mocked,
hardcoded, or dead (2026-07-18), the marketing-claims audit
(2026-07-19: what the about/landing copy says vs what the product
does), and the catalog-scale findings (2026-07-25: what broke or stopped
being true when the catalog went from 647 products / 8 shops / 10
categories to 14,059 / 55 / 31 in one crawl). One plan file per issue;
each states current state (with file:line evidence), what "done" looks
like, and the steps. Work through them in the order below unless
something changes.

## Catalog-scale backlog (2026-07-25)

Found while taking the catalog to 14k products across 55 shops. Ordered by
how much each one hurts a user today. To work one of these, paste the prompt
in [IMPLEMENT-PROMPT.md](IMPLEMENT-PROMPT.md) into a fresh session — one item
per session, they each touch ingest, the query layer and live data.

A. [cross-shop-product-matching](cross-shop-product-matching.md) — only 94
   of 14,059 products have more than one shop's price. A comparison site
   that can't compare is the headline problem. Re-measure with a deeper
   crawl before building a matcher; the number is confounded by sampling.
B. [ingest-crawl-robustness](ingest-crawl-robustness.md) — the crawl is a
   manual ~40-minute laptop job that no longer fits in the Worker cron,
   drops whole shops on a 429 with no retry, and loses 499 good rows to one
   bad one. Prices going stale is the one thing this site can't be wrong
   about.
C. [drop-cards-are-seed-only](drop-cards-are-seed-only.md) — "Biggest
   drops" ranks on `meta.was`, which 13,705 of 13,705 auto-promoted rows
   don't have. 24 of 31 categories can never show a drop card.
D. [search-and-paging-at-scale](search-and-paging-at-scale.md) — no
   diacritic folding ("hundefor" finds nothing), unranked LIMIT 100, and
   ~70% of a big category unreachable behind the 400-row cap. Includes the
   `meta.icon` search bug already fixed on 2026-07-25, for context.
E. ~~facets-for-the-new-categories~~ — done 2026-07-25, see
   [plans-implemented](../plans-implemented/facets-for-the-new-categories.md):
   all 31 categories declare facets and derive their values from the product
   name (`worker/facetrules.js`).
F. [hidden-rows-readable-by-id](hidden-rows-readable-by-id.md) — `hidden:1`
   means "unlisted", not "hidden": a demoted product keeps a working PDP.
   Decide whether that's the intent, then fix the code or the docs.

**Excluded by decision** (planned elsewhere or parked):
- BankID login (parked, PLAN.md 4b) — fake button stays working.
- Buy-now / auto-buy execution (AUTOBUY-PLAN.md, FULFILLMENT-PLAN.md).
  What the auto-buy *copy* claims meanwhile is in scope:
  [autobuy-copy-honesty](autobuy-copy-honesty.md).
- Email Service go-live itself (PLAN.md Phase 2 — paid-plan decision).
  Plans below that need email *delivery* mark it as a dependency.
- Real price sources / seeded demo offers — PLAN.md 4d (Adtraction
  rollout). The freshness *claims* made meanwhile are in scope:
  [marketing-copy-honesty](marketing-copy-honesty.md).
  Catalog scale itself is no longer "in flight": the 2026-07-25 crawl
  landed it, and what it exposed is items A–F above. The no-op hourly
  cron specifically is now
  [ingest-crawl-robustness](ingest-crawl-robustness.md) Open 4 — it needs
  sharding or Queues, not just a populated `SOURCES`.
- TODO.md's "convert a watch to auto-buy" — auto-buy scope, track it
  with AUTOBUY-PLAN work.

**Implemented** (moved to [../plans-implemented/](../plans-implemented/)):
honest-metrics, account-privacy, dead-ui-cleanup, price-drop-alerts,
activity-feed, recently-viewed, real-magic-link-login,
report-product-error — each file keeps its remaining upstream/delivery
follow-ups.

## Suggested order (honesty/feature backlog, 2026-07-18/19 audits)

The A–F catalog-scale items above are a separate track — they're data and
API work, these are copy and feature work. A and B outrank everything in
either list.

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
5. [profile-email-change](profile-email-change.md) — small; real change
   needs email.
6. [pricy-plus](pricy-plus.md) — decision-heavy (billing). All Plus
   *copy* honesty synced 2026-07-19; what's left is the mechanics
   (server-side plan state, waitlist-vs-preview, billing). Do last.

The upstream prompts in 1–4 (and pricy-plus's) can be pasted into
Claude Design as one combined copy-honesty pass if syncing once is
preferred.
