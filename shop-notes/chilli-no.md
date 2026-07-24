# Chilli.no

- URL: chilli.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — clean Product/Offer JSON-LD on product pages, no contract needed
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes: Reclassified from SHOP-CANDIDATES.md's "Unknown ingest notes". Rechecked:
  - robots.txt: `Allow: /`, disallows only /search, /checkout, /orderconfirmationpage, /client-telemetry — no bot/product-page block.
  - ToS (`chilli.no/vilkår`, fetched directly): covers age/agreement/governing-law only — no scraping/crawling/bot/automated-access clause. Verdict: Silent, confirmed.
  - Spot-check product page (`.../møbler/sofaer/fløyelssofa/grande-6-seters-u-sofa-med-divan-venstre-beige-fløyel-p3104849`): one `application/ld+json` block, `@type: Product` with `offers` array (`price: 18999`, `shippingDetails`, no explicit `sku`/currency field seen in the first 400 chars but shape matches `productOffer()`'s expectations directly — same platform as Trademax, likely a shared Home Furnishing Nordic AB storefront). scrapeSource() should parse this cleanly.
  - Catalog category: **no existing worker/cats.json category fits** (Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen) — sofas/furniture need a new **"Furniture"** category + icon + worker/extra.json rows. Flagging for Phase B, not adding it here.
  - Candidate product URLs for worker/extra.json (name/brand/cat=Furniture/icon/kw), all real, unfetched two not yet JSON-LD-checked but same platform as the checked one:
    - https://www.chilli.no/m%C3%B8bler/sofaer/fl%C3%B8yelssofa/grande-6-seters-u-sofa-med-divan-venstre-beige-fl%C3%B8yel-p3104849 (checked — Grande 6-seter U-sofa, beige fløyel, kr 18999)
    - https://www.chilli.no/m%C3%B8bler/sofaer/fl%C3%B8yelssofa/copenhagen-5-seters-venstrevendt-u-formet-large-sofa-med-divan-og-sjeselong-i-fl%C3%B8yel-beige-p1697380-v3075453
    - https://www.chilli.no/m%C3%B8bler/sofaer/fl%C3%B8yelssofa/crazy-4-seters-h%C3%B8yrevendt-u-formet-large-sofa-med-divan-og-sjeselong-i-fl%C3%B8yel-bl%C3%A5-p270753-v1791489
  - Proposed ids: `chilli-grande-6-seter-u-sofa`, `chilli-copenhagen-5-seter-sofa`, `chilli-crazy-4-seter-sofa` — all cat `Furniture` (new), brand per-product (varies).
