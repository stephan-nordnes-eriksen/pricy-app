# Bergans

- URL: bergans.com/no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean Product/
  Offer JSON-LD confirmed, robots.txt fully permissive, ToS has a generic
  copyright takedown clause but no automation/scraping ban. No approval
  needed, code already exists.
- Alternatives: none found — brand-direct site, no affiliate signal.
- Status: not started
- Notes: Recheck performed — robots.txt: `Allow: /` for `*`, only
  `/api`, `/my-pages`, `/checkout`, `/preview`, `/search` per-locale
  disallowed (no named bot blocks), and product sitemaps are listed
  directly (`sitemap_products.xml`). ToS (bergans.com/no/salgsbetingelser)
  mentions only a copyright-infringement takedown policy (§16) — no
  automated-access/scraping/bot clause; matches SHOP-CANDIDATES.md's
  "Ambiguous" call but nothing that rules out scraping specifically.
  JSON-LD spot check on
  https://www.bergans.com/no/dame/jakker/dunjakker/rros-down-hybrid-w-jacket-aluminium-solid-dark-grey
  shows a clean `Product` node with `sku`, `gtin`, `brand`, and `Offer`
  (priceCurrency NOK, price, availability, MerchantReturnPolicy) —
  `productOffer()` should parse it directly, gtin is a bonus (real EAN
  for the `eans.json`/discovery path later). Sells outdoor/hiking
  clothing & gear — maps to NO existing worker/cats.json category; needs
  the same new "Sports"/"Outdoor" category flagged for other shops in this
  batch, not added this round. Candidate rows:
  - `bergans-roros-down-hybrid-w` — Røros Down Hybrid W Jacket (gtin
    7031582131397) —
    https://www.bergans.com/no/dame/jakker/dunjakker/rros-down-hybrid-w-jacket-aluminium-solid-dark-grey
    (currently OutOfStock in the JSON-LD — fine for a seed row, price
    will just freeze until back in stock)
  - Women's/men's/kids jacket category pages (`/no/dame/jakker`,
    `/no/herre/jakker`, `/no/barn/jakker`) are listing-only in
    WebFetch's markdown view — need a live browse or sitemap pull to
    surface 2-3 more concrete product URLs before Phase B.
