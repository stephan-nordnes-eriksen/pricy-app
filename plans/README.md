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
D. ~~search-and-paging-at-scale~~ — **done**, see
   [search-and-paging-at-scale](search-and-paging-at-scale.md), kept here as
   the record of what scale broke (diacritic folding, unranked LIMIT 100,
   the 400-row cap) and what each fix cost.
E. ~~facets-for-the-new-categories~~ — done 2026-07-25, see
   [plans-implemented](../plans-implemented/facets-for-the-new-categories.md):
   all 31 categories declare facets and derive their values from the product
   name (`worker/facetrules.js`).
F. ~~hidden-rows-readable-by-id~~ — **done 2026-07-26**, moved to
   [plans-implemented](../plans-implemented/hidden-rows-readable-by-id.md):
   `hidden:1` now means not served on any read path, ops opts back in with
   the `INGEST_TOKEN` bearer.

G. ~~api-latency-round-trips~~ — **done 2026-07-26**, five fixes, all still
   in [api-latency-round-trips](api-latency-round-trips.md) as the record. A
   category page went **954 → 275 ms**, a PDP fetch 318 → 122, a search
   416 → 139. What remains is
   [read-path-whats-left](read-path-whats-left.md) — leftovers plus the four
   invariants those fixes introduced, each of which fails silently. Read that
   before touching the query layer.

H. ~~category-misclassification~~ — **done 2026-07-26**, record kept in
   [category-misclassification](category-misclassification.md) (diagnosis,
   prior-art survey, and what shipped). The shop's breadcrumb is kept whole and
   read leaf→root, `cat` re-classifies on every crawl instead of freezing at
   first promotion, and `deriveFacets` reads `srcCat`. 216 products change
   category, 206 gain one, facet `type` coverage +1,222 rows. The floor audit
   finished differently than planned: 11 floors dropped + Gamezone corrected,
   36 remain at 61–100% agreement — measured mostly *correct* (specialist
   shops that publish no category), floor share 44.5% → 42%. **Still open:**
   the Gamezone refile (~580 rows, held on the CPU ceiling — see
   [read-path-whats-left](read-path-whats-left.md) §0) and vocabulary growth
   via `tools/score-cats.mjs --labels`. The 2026-07-31 GPC-departments layer
   changed none of this — it navigates over `cat=`, it doesn't classify (note
   at the end of the plan file).

Not backlog items, but read them before any performance change:
- [api-latency-round-trips](api-latency-round-trips.md) — what each of the
  five actually turned out to be (none matched the standing estimate), and
  the measurement method that found them: warm curl medians, `wrangler dev
  --remote` for a real-D1 A/B without deploying, and D1's own
  `sql_duration_ms`/`rows_read` to split server-side SQL from the rest.
- [api-read-path-performance](api-read-path-performance.md) — where
  `/api/products`' CPU goes (measured in process) and the optimisations
  already priced and rejected. Its rankings are **hypotheses to measure, not
  conclusions**: it sees neither round trips nor D1-side SQL cost, and it
  ranked all five of G's fixes wrong.

**Excluded by decision** (planned elsewhere or parked):
- BankID login (parked, PLAN.md 4b) — fake button stays working.
- Buy-now / auto-buy execution (AUTOBUY-PLAN.md, FULFILLMENT-PLAN.md).
  What the auto-buy *copy* claims meanwhile was in scope and is done:
  [autobuy-copy-honesty](../plans-implemented/autobuy-copy-honesty.md).
- Email Service go-live itself (PLAN.md Phase 2 — paid-plan decision).
  Plans below that need email *delivery* mark it as a dependency.
- Real price sources / seeded demo offers — PLAN.md 4d (Adtraction
  rollout). The freshness *claims* made meanwhile were in scope and are done:
  [marketing-copy-honesty](../plans-implemented/marketing-copy-honesty.md).
  Catalog scale itself is no longer "in flight": the 2026-07-25 crawl
  landed it, and what it exposed is items A–G above. The price-refresh half
  of the hourly cron specifically is now
  [ingest-crawl-robustness](ingest-crawl-robustness.md) Open 4 — it needs
  sharding or Queues, not just a populated `SOURCES`.
- TODO.md's "convert a watch to auto-buy" — auto-buy scope, track it
  with AUTOBUY-PLAN work.

**Implemented** (moved to [../plans-implemented/](../plans-implemented/)):
honest-metrics, account-privacy, dead-ui-cleanup, price-drop-alerts,
activity-feed, recently-viewed, real-magic-link-login,
report-product-error, facets-for-the-new-categories,
hidden-rows-readable-by-id, gpc-departments, OPEN-CATALOG-PLAN,
FILTERS-PLAN, marketing-copy-honesty, price-verified-timestamps,
autobuy-copy-honesty — each file keeps its remaining upstream/delivery
follow-ups.

## Suggested order (honesty/feature backlog, 2026-07-18/19 audits)

The A–G catalog-scale items above are a separate track — they're data and
API work, these are copy and feature work. A and B outrank everything in
either list.

1. ~~marketing-copy-honesty~~ — **done**, moved to
   [plans-implemented](../plans-implemented/marketing-copy-honesty.md).
2. ~~price-verified-timestamps~~ — **done**, moved to
   [plans-implemented](../plans-implemented/price-verified-timestamps.md).
3. [alert-notification-claims](alert-notification-claims.md) — push
   doesn't exist, "within minutes" isn't true; copy pass + dead toggle.
   Still open 2026-07-31.
4. ~~autobuy-copy-honesty~~ — **done**, moved to
   [plans-implemented](../plans-implemented/autobuy-copy-honesty.md).
5. [profile-email-change](profile-email-change.md) — Phase 1 (honest
   read-only field) done; Phase 2 (real change) needs email delivery.
6. [pricy-plus](pricy-plus.md) — decision-heavy (billing). All Plus
   *copy* honesty synced 2026-07-19; what's left is the mechanics
   (server-side plan state, waitlist-vs-preview, billing). Do last.
7. [list-sharing-backend](list-sharing-backend.md) — added 2026-08-02
   with the custom-lists sync; **backend + boot wiring shipped same
   day** (share tokens, member surface, server-side bought-marks, gift
   privacy enforced in meBody). Open: the upstream sync — ShareModal
   still shows its demo link, no member screen. Paste-ready prompt in
   the plan file.

Of the copy passes, only item 3's upstream prompt is still unpasted —
1, 2 and 4 shipped.

## Upstream feature prompts (2026-08-03)

The prototype project holds eight numbered PROMPT files (competitive-gap
work, fetched to `proto/PROMPT - 0*.md`) that will each land as an
upstream UI sync. One backend plan per prompt, written before any of
them is built upstream. Rough order of backend readiness:

- [lists-v2](lists-v2.md) (05) — **already shipped**; pointer to
  [list-sharing-backend](list-sharing-backend.md).
- [shipping-totals](shipping-totals.md) (01) — **backend shipped
  2026-08-03** (numerics, `sort=total`, `freeship`/`maxeta`,
  `watches.inclShip`, basis-aware alerts). Open: curating the
  `worker/shipping.json` registry (offer-level coverage measured at
  0.3%, so the registry IS the data) and the upstream sync — field
  contract at the top of the plan file. Foundation for 06 and part
  of 07.
- [push-and-barcode-scanner](push-and-barcode-scanner.md) (04) —
  scanner lookup is one `ean=` endpoint, do with the sync; push stays
  behind [alert-notification-claims](alert-notification-claims.md)'s
  decision and item B.
- [price-guarantee-refunds](price-guarantee-refunds.md) (07) —
  `purchases` table exists; needs a curated per-shop guarantee
  registry and decoupling purchases from the HIDE_AUTOBUY switch.
  Plus-gating deferred with [pricy-plus](pricy-plus.md).
- [reviews-layer](reviews-layer.md) (02) — UGC product reviews
  **shipped 2026-08-04**; fake shop ratings must NOT ship (honesty
  precedent) — shop profiles start objective-stats-only, still open.
- [folkedommen-reviews](folkedommen-reviews.md) (02, resynced
  2026-08-05) — upstream replaced stars with a qualitative verdict
  (three claims + plus/minus traits + paid range). Supersedes 02's
  write/read half: new columns, delete + `?mine=1`, `meta.udom`
  replacing `urating`/`ureviews`, `dom=` filter/sort. Blocked on two
  upstream fixes (paste-ready prompt in the plan) — one of them is a
  crash in the filter rail.
- [deals-hub](deals-hub.md) (03) — verdict engine over `price_points`;
  hard-coupled to item C (`was` capture) and honest only once B makes
  crawls regular.
- [basket-optimizer](basket-optimizer.md) (06) — no backend beyond
  01's shipping registry; pointless until A (cross-shop matching)
  moves.
- [browser-extension](browser-extension.md) (08) — concept exploration,
  no backend; file records what a real one would need.
