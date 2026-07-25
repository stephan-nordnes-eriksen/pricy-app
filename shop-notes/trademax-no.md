# Trademax

- URL: trademax.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — clean Product/Offer JSON-LD on product pages, no contract needed
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.trademax.no/api/sitemap/nb-no/sitemapindex.xml`); 377 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: Reclassified from SHOP-CANDIDATES.md's "Unknown ingest notes". Rechecked:
  - robots.txt: `Allow: /`, disallows only /search, /checkout, /orderconfirmationpage, /client-telemetry — no bot/product-page block. Same boilerplate as Chilli.no (same corporate group, Home Furnishing Nordic AB, per ToS text).
  - ToS (`trademax.no/vilkår`, fetched directly): no scraping/crawling/bot/automated-access clause. Verdict: Silent, confirmed.
  - Spot-check product page (`.../møbler/sofaer/3-seters-sofa/elise-3-seters-sofa-beige-teddy-p1797070`): one `application/ld+json` block, `@type: Product` with `offers` array (`price: 7999`, `shippingDetails` incl. `transitTime`) — same shape as Chilli, `productOffer()` should parse cleanly.
  - Catalog category: same gap as Chilli — needs a new **"Furniture"** category (worker/cats.json) + worker/extra.json rows; nothing in the current list fits. Flag for Phase B.
  - Candidate product URLs for worker/extra.json (cat=Furniture), real, second/third not yet JSON-LD-checked but same platform as the checked one:
    - https://www.trademax.no/m%C3%B8bler/sofaer/3-seters-sofa/elise-3-seters-sofa-beige-teddy-p1797070 (checked — Elise 3-seter sofa, beige teddy, kr 7999)
    - https://www.trademax.no/m%C3%B8bler/sofaer/3-seters-sofa/havana-3-seters-lav-sofa-beige-p3115961
    - https://www.trademax.no/m%C3%B8bler/sofaer/4-seters-sofa/rossita-4-seters-dyp-stoffsofa-brun-p3067479
  - Proposed ids: `trademax-elise-3-seter-sofa`, `trademax-havana-3-seter-sofa`, `trademax-rossita-4-seter-sofa` — all cat `Furniture` (new).
