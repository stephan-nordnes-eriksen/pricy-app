# Price-guarantee refund helper (upstream PROMPT 07)

Backend plan for `proto/PROMPT - 07 Price-Guarantee Refunds.md` (fetched
2026-08-03, not yet built upstream). Upstream will add a
`PurchaseStore` ("I bought this" per PDP offer), a per-shop guarantee
window, an "Etter kjøpet" Alerts tab with claimable-diff computation, a
claim-text modal, and Plus gating.

## Current state (verified)

- `purchases (id, user_id, product_id, shop, price, created_at)`
  already exists (index.js:22) — written only by MCP `buy_now`, and
  `/api/me` **omits purchases under the HIDE_AUTOBUY kill switch**
  (CLAUDE.md), which is on.
- The guarantee is per-shop against that shop's CURRENT price — the
  live `offers` row gives that directly. `price_points` has no shop
  dimension, so historic per-shop evidence doesn't exist; evidence =
  "you told us you paid X on date D; that shop lists Y today", which is
  what a claim needs anyway.
- Alerts infra (email channel, `fireAlerts`, activity feed) exists.

## Plan

1. **Decouple purchases from the kill switch.** A user-declared "jeg
   kjøpte denne" is not the buy flow; serve `purchases` in `meBody`
   regardless of HIDE_AUTOBUY (the switch keeps gating `POST /api/buy`
   and MCP buy_now). Guarded ALTERs: `purchases ADD COLUMN paid_at
   INTEGER` (user-editable purchase date, default created_at) and
   `claimed_at INTEGER`.
2. **Guarantee registry.** Per-shop `{days}` in the same
   `worker/shipping.json`-style registry (or a `guarantee` key on it —
   one shop registry, not three). **Curate from real shop terms; no
   entry = no guarantee = the disabled state.** Do not invent windows:
   a wrong "30 dager igjen" sends a user into a claim the shop will
   refuse.
3. **Endpoints.** `POST /api/purchases` `{product_id, shop, paid,
   paid_at?}` (session; shop must exist in offers for the product),
   `DELETE /api/purchases/:id`, `POST /api/purchases/:id/claim` (sets
   claimed_at). Status (`watching/claimable/expired/claimed`) and
   `diff`/`daysLeft` are derived at read in `meBody` — no status
   column to drift.
4. **Cron hook.** In the existing hourly `scheduled` pass: purchases
   inside their window joined to current same-shop offers; when
   `offer.price < paid`, insert an `alerts` row (new kind field or
   `target = paid`) so the existing email channel + activity feed carry
   "kr N å hente hos {shop}". No new delivery machinery.
5. **Auto-buy seeding** (executed orders → purchase rows) — already
   how MCP buy_now writes; nothing to do beyond step 1's visibility.
6. **Plus gating: defer.** Server-side plan state doesn't exist
   (pricy-plus.md — `window.PLAN` is a frozen tweak). Ship free for
   everyone; when pricy-plus lands its plan column, gate then. The
   upstream LockedCard flow keys off the tweak and needs no backend.
7. **Tests.** Create/claim/derived-status math, window expiry, cron
   fires alert on same-shop drop only (a cheaper OTHER shop is
   context, not a claim), GDPR export/delete cover purchases.

## Dependencies / order

Needs shop-terms curation (step 2) before it's honest — start with the
big chains that actually advertise prisgaranti (Elkjøp, Power).
Usefulness scales with crawl freshness (B) like everything
alert-shaped, but same-shop stale prices fail safe (no false
claimable). Buildable now; do after shipping-totals.md since they share
the shop registry.
