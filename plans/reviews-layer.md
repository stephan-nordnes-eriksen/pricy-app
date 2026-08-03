# Reviews layer: shop ratings + product reviews (upstream PROMPT 02)

Backend plan for `proto/PROMPT - 02 Reviews Layer.md` (fetched
2026-08-03, not yet built upstream). Upstream will add `SHOP_META` (per-
shop ratings), `PRODUCT_REVIEWS` + `ReviewStore` (UGC reviews with
helpful votes), shop profile pages, and rating chips on offer rows.

## The honesty problem (decide first)

Upstream seeds shop ratings (delivery/service/returns, "CDON ~3.6") as
demo data. **We have no source for real shop ratings** — 55 shops, no
Trustpilot API (paid), and scraping review sites is off-limits like
Prisjakt. This repo's precedent (honest-metrics, marketing-copy-honesty)
says fake trust signals don't ship. So:

- **Shop profiles v1 = objective data only**: products carried, offers,
  price-freshness (`MAX(updated_at)`), physical/web — all derivable from
  `offers` today. No stars until users can rate shops themselves.
- **Shop ratings v2 = UGC**, same table as product reviews with a shop
  target — needs volume before an average is meaningful; render "n
  vurderinger" not a naked 3.6 until n is honest.
- Product reviews are UGC from day one — no cold-start lie, just empty
  states.

## Plan

1. **Tables.**
   - `reviews (id INTEGER PRIMARY KEY, user_id, product_id TEXT, shop TEXT, rating INTEGER, title TEXT, body TEXT, created_at, hidden INTEGER DEFAULT 0)`
     — `product_id` XOR `shop` covers both kinds; one review per
     (user, target) enforced by UNIQUE index; `hidden` is the moderation
     switch (admin PATCH, same bearer as product triage).
   - `review_votes (review_id, user_id, PRIMARY KEY(review_id, user_id))`
     — helpful votes, count at read.
2. **Endpoints.** `GET /api/reviews?ids=a,b` (batch, for PDP hydrate —
   author name joined from `users`, first-name only), `POST
   /api/reviews` `{product_id|shop, rating, title, body}` (session
   required; length caps; upsert = edit your own), `POST
   /api/reviews/:id/vote`. `verified` only when a `purchases` row
   matches (user, product) — rare today, fine.
3. **Aggregates.** Today `rating`/`reviews` counts come from seed meta
   (demo numbers on seed rows, absent on the 13k auto rows). Real
   reviews recompute the product's `rating`/`reviews` from the table at
   write time into `meta` (same meta-merge as admin PATCH) so list
   queries stay one read. Demo seed ratings: leave until real ones exist
   for a product, then real wins — or strip them in the same pass
   (decide; stripping is more honest, costs empty stars everywhere).
4. **Shop meta.** `catMeta` serves `meta.shops` `{shop: {products,
   offers, updated}}` from one GROUP BY over offers (cache it in the
   catMeta cron slot if it prices badly). Boot exposes it for
   `ShopPage`.
5. **GDPR.** Export includes reviews + votes; account delete removes
   them (extend the existing delete path).
6. **Boot wiring.** `window.onReviews(prodId)` fetch hook +
   `ReviewStore.add/vote` → POSTs, same bridge pattern as
   `onSharedList`. Upstream must read SHOP_META-shaped data from a
   served object — needs a marked prompt section when built (its demo
   ratings can stay as preview fallback).
7. **Tests.** Post/edit/one-per-user, vote toggle, aggregate lands in
   meta, GDPR delete, moderation hide drops it from GET.

## Dependencies / order

None hard. Spam/abuse moderation is manual (admin bearer) — fine at
current traffic; revisit if reviews actually arrive. Ship product
reviews first; shop profiles are a follow-up off `meta.shops`.
