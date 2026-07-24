# Klokker.no

- URL: klokker.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — RECLASSIFIED from SHOP-CANDIDATES.md's
  "Only Organization JSON-LD found" / Silent (that pass apparently only
  checked the homepage). Live recheck on an actual product page found
  full Product + Offer JSON-LD with gtin, brand, and a real NOK price.
  robots.txt is explicit Shopify boilerplate that welcomes crawling
  (`Allow: /`, `agents.md` invites agentic access) and ToS
  (`/policies/terms-of-service`) has no scraping/bot mention. No contract
  or approval needed — cheapest option, and the strongest-signal one of
  the recheck batch.
- Alternatives: none needed — this is now a confirmed-good scrape target
- Status: not started
- Notes:
  - **Category mapping**: watches (large Casio range) — needs the new
    **"Jewelry"** category (shared with Mestergull/David-Andersen/Pandora/
    Bjørklund/Gullfunn) — not added this round. (Could also be filed under
    a future "Watches" sub-split, but Jewelry is the natural first bucket
    given the other shops in this batch.)
  - **Candidate product URLs** (real, from
    `https://klokker.no/sitemap_products_1.xml`):
    - https://klokker.no/products/wave-ring-small-r-58 (byBiehl ring)
    - https://klokker.no/products/gant-h-prestige-10atm-stl-m-rem-solv-index-o-42mm
      (Gant watch)
    - https://klokker.no/products/maestro-herre-automatic-bla-40mm
    - https://klokker.no/products/raymond-weil-freelancer-automatique-gents-blue-ind-1
  - **JSON-LD spot-check** (wave-ring URL, 200 OK): full flat
    `"@type":"Product"` node — `brand`, `category`, `gtin`, `sku`, and
    `offers`: `{"@type":"Offer","availability":"http://schema.org/InStock",
    "price":"419.40","priceCurrency":"NOK", …}`. Exactly the shape
    scrapeSource() expects.
