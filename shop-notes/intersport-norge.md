# Intersport Norge

- URL: intersport.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via existing `scrapeSource()` — clean
  schema.org Product/Offer JSON-LD confirmed on a real product page, no
  approval or new code needed.
- Alternatives: none found (no affiliate-network signal for Intersport NO).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.intersport.no/sitemap.xml`); 356 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: Rechecked live (curl, sandbox disabled).
  `robots.txt`: `Allow: /` for all, only blocks `/profile/`, `/signup/`,
  `/signin/` — product/category paths open. ToS
  (`intersport.no/kjopshjelp/salgsbetingelser`, WebFetch) has no
  scraping/bot/automated-access clause — standard Norwegian consumer
  e-commerce terms only. Confirms SHOP-CANDIDATES.md's Silent verdict.
  JSON-LD spot-check: fetched a real product page
  (`https://www.intersport.no/adidas-f50-messi-league-turf-fotballsko-gruskunstgress-ivoryseblbuiceblu-unisex-ih1903`)
  — clean `{"@type":"Product", "brand":{"name":"ADIDAS"}, "offers":
  {"@type":"Offer","price":1199,"priceCurrency":"NOK","availability":
  "https://schema.org/InStock", url}}`, exactly the shape
  `productOffer()`/`scrapeSource()` expects. Images served from
  `media.sportholding.no` (seller entity: Intersport - Sport Holding AS
  per ToS) — Sport1 (same list) runs on the **identical** platform/CDN,
  see shop-notes/sport-1.md. G-Sport/G-Max (also this list) 302-redirects
  entirely into intersport.no — not a separate scrape target, see
  shop-notes/g-sport-g-max.md.
  Sells sports equipment/clothing — no fit in current worker/cats.json
  (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys,
  E-readers, Kitchen); flag a new "Sports"/"Outdoor" category for Phase B.
  Candidate worker/extra.json rows (real product pages, football boots —
  category "Sports", icon tbd, id e.g. `adidas-f50-messi-league-turf`):
  - https://www.intersport.no/adidas-f50-messi-league-turf-fotballsko-gruskunstgress-ivoryseblbuiceblu-unisex-ih1903
  - https://www.intersport.no/adidas-f50-hyperfast-elite-artificial-ground-fotballsko-kunstgress-solturcblackgoldmt-unisex-ki9129
  - https://www.intersport.no/nike-phantom-6-high-elite-ag-pro-blackblack-unisex-hq2329
  - https://www.intersport.no/puma-future-9-pro-mg-icy-blue-blue-jewel-unisex-108900
