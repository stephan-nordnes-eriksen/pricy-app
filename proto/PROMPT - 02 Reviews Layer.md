# PROMPT — 02 Reviews layer: shop ratings + product reviews

Closes G4 + G5 from `Competitive Gap Analysis.html`. Pricy shows star ratings and review counts with nowhere to read or write a review, and ranks offers purely on price with no shop-trust signal. Ship shop ratings first (no cold-start problem), then product reviews.

**Read before writing:** `CLAUDE.md`, then `pricy/Primitives.jsx` (SHOPS — flat array of 8 names, line ~210; trustLine, Icon, Btn), `pricy/Results.jsx` (genOffers offer shape; `Stars` component — already exported, reuse it; ProductPage layout ~line 936+; offer row markup), `pricy/PagesCore.jsx` (Toast, export pattern), `pricy/AppRouter.jsx` (route wiring + Tweaks Screen select), `pricy/index.html` (script order — new files load after Primitives, before Results).

## How it works today (verified)
- SHOPS is `['Elkjøp','Power','Komplett','NetOnNet','Clas Ohlson','Proshop','CDON','Dustin']` — names only, no metadata.
- Products carry `rating` + `reviews` counts (`_META`/`_NEW` rows) rendered by `Stars`, but no review content exists anywhere.

## Tasks
1. **New file `ReviewsData.jsx`** (load after Primitives, before Results):
   - `SHOP_META`: per shop `{ rating (3.9–4.7), count, delivery (4.x), service (4.x), returns (4.x), since: '2014', physical: bool }`. One deliberately weak shop (CDON ~3.6) so the trust signal visibly matters.
   - `PRODUCT_REVIEWS`: seeded reviews for the canonical Audio set + xm5/iphone/ps5 (~4–6 each): `{ id, prodId, author, rating, date, title, body, helpful, verified: bool }`. Norwegian names, terse realistic bodies (no lorem). Other products fall back to an empty state.
   - `ReviewStore`: `{ list(prodId), add(review), vote(id) }` with the same `emit/sub` pattern as WatchStore. Export all to `window`.
2. **New file `Reviews.jsx`** (load after ReviewsData):
   - `ShopChip({shop})` — inline `★ 4.5` mono chip for offer rows; `ShopPopover` on click: rating breakdown bars (delivery/service/returns), count, "Se butikkprofil →".
   - `ReviewSection({p})` for the PDP: summary block (big mono average, 5→1 histogram bars, verified share) + review cards (author, `Stars`, date via relTime-style label, body, helpful-count button) + "Skriv omtale" `Btn` → modal (rating picker of 5 square buttons, title, body, submit → `ReviewStore.add`, Toast "Takk! Omtalen er publisert."). Empty state: "Ingen omtaler ennå — kjøpt denne? Vær førstemann."
   - `ShopPage({go, shop})` — profile route: header (name, rating, since, physical), breakdown, and "Beste priser hos {shop} nå": their offers across CATALOG (reuse ResultRow-like compact rows; filter products where an offer matches the shop).
3. **Wire in.** `index.html`: two script lines in the order above (thin loader — one line each, nothing inline). `AppRouter.jsx`: route `shop` → `<ShopPage shop={params.shop} />`; add "Shop profile" to the Tweaks Screen select (value `shop`, params `{shop:'Elkjøp'}`).
4. **Offer rows (Results.jsx).** Each PDP offer row gains `ShopChip` next to the shop name (click → popover, popover's profile link → `go('shop',{shop})`). Below-3.8 shops get a subtle `--warn-500` underline on the chip.
5. **PDP.** Mount `ReviewSection` below the specs block. The existing `Stars`/review-count header link scrolls to it (plain anchor within page — no scrollIntoView; use `window.scrollTo` with `getBoundingClientRect`).
6. **CSS** in `pages.css`: histogram bars (CSS only — widths from inline style %), popover (2px ink border, `--shadow`), review cards. Follow the brutalist kit: square corners, hard shadows, mono labels.

## Verify
PDP (xm5): review summary renders, histogram sums to count, write-modal adds a review live, helpful votes tick. Offer rows: chips render for all 8 shops, popover opens/closes, CDON shows the warn treatment. Shop route via popover and via Tweaks select. Empty state on a product without seeds (lego). No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
