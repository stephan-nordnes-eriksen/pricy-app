# Report incorrect product/price

**Implemented 2026-07-19.** Upstream modal synced (Results.jsx +
pages.css), `POST /api/report` + `reports` table live, boot.jsx bridge,
worker + jsdom tests, deployed. Triage is the wrangler d1 CLI (step 3);
no follow-ups.

TODO.md item: "Some kind of button to press if a product or price is
incorrect. Design only for now." Nothing exists yet, in design or code.

## Done looks like

A low-friction "Report a problem" affordance on the product page; the
report lands somewhere we actually see it.

## Plan

1. **Upstream design first** (per the TODO): small "Report a problem"
   link near the offers table → modal with reason chips (wrong price /
   out of stock / wrong product / other + free text), submits via
   `window.reportProblem(productId, shop, reason, text)` when present,
   demo toast otherwise.
2. **Worker**: `POST /api/report` (session-gated) → new `reports` table
   (`id, user_id, product_id, shop, reason, text, created_at`).
   Rate-limit lazily: cap N reports/user/day in the handler.
3. **Reading them**: no admin UI. `wrangler d1 execute pricy-app
   --command "select * from reports order by created_at desc limit 20"`
   is the admin UI. ponytail: build a real triage view only when report
   volume makes the CLI annoying.
4. boot.jsx exposes the bridge; worker test for the endpoint.

## Upstream (Claude Design) prompt — paste-ready

> Add a "Report a problem" affordance to the pricy prototype's product
> page, near the offers table: a quiet text link opening a small modal
> with reason options (Wrong price / Out of stock / Wrong product info /
> Other) and an optional free-text field. On submit, call
> `window.reportProblem(productId, shop, reason, text)` if it exists
> (await it, show errors), else toast "Thanks — we'll look into it."
> Keep it visually minor — this is a trust affordance, not a feature.
