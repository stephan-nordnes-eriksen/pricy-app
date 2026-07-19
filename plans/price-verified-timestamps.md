# "Every price shows when it was last verified" — make it true

Marketing audit 2026-07-19. FAQ claim (proto/index.html:4941), echoed by
the About metric sub "every price timestamped" (:5011). The API already
ships `updated_at` on every offer (worker/index.js:255,258) — no UI
component renders it. The only freshness shown is the aggregate "Prices
updated X ago" (footer :1620, About metric :5011). Cheapest fix in the
audit: rendering the field is smaller than rewording the claim.

## Done looks like

Each offer row (PDP offer table, compare view) shows "checked X min ago"
from `o.updated_at`. The FAQ claim stands as written.

## Plan

1. **Upstream (Claude Design)**: offer rows render
   `relTime(o.updated_at)` when the field is present — muted mono text,
   e.g. "checked 14 min ago". Omit entirely when absent: seeded demo
   offers have no `updated_at` (seedIfEmpty inserts without it,
   worker/index.js:160), so only crawled rows carry a stamp — which is
   honest.
2. **Worker**: nothing — the field is already in `/api/catalog.json`.
3. **Test**: jsdom check that an offer with `updated_at` shows the stamp
   and one without shows nothing.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, offer rows (the product page's offer table and
> anywhere else a per-shop price appears with shipping/stock) should show
> when that price was last checked: if the offer object has an
> `updated_at` timestamp (ms epoch), render `relTime(o.updated_at)` as
> quiet muted mono text, e.g. "checked 14 min ago", after the
> shipping/stock line. If `updated_at` is missing, render nothing — no
> placeholder. Keep it visually minor; it's a trust detail, not a
> feature.

## Dependencies

None. Stamps only appear on rows the crawler has touched — coverage
grows with PLAN.md 4d rollout.
