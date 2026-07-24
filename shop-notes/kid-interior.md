# Kid Interiør

- URL: kid.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — clean Product/Offer JSON-LD on product pages, no contract needed
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes: Reclassified from SHOP-CANDIDATES.md's "Unknown ingest notes". Rechecked:
  - robots.txt: minimal, only `Sitemap:` directive — fully open, no bot block.
  - ToS (`kid.no/info/kjoepsvilkaar`, fetched directly): standard purchase/returns/payment/dispute terms only — no scraping/crawling/bot/automated-access clause. Verdict: Silent, confirmed.
  - Spot-check product page (`.../gardiner/ferdigsydde-gardiner/adele-melange-gardin-beige`): one `application/ld+json` block, `@type: Product` with `gtin`, `sku`, and an `offers` array (`@type: Offer`, `price: "174.95"`, `priceCurrency: "NOK"`, `availability: InStock`, plus a `priceSpecification` with a higher list price `349.90` — looks like a sale-price/list-price pair). Cleanly parseable by `productOffer()`; has EAN via `gtin` too, useful for the open-catalog EAN routing.
  - Catalog category: curtains/home-textiles don't cleanly fit any current worker/cats.json category. "Home" is closest in spirit but currently scoped to home electronics/small appliances (lamp icon) elsewhere in the catalog — flag for Phase B whether to reuse "Home" or add a new "Textiles"/"Interior" category; not deciding here.
  - Candidate product URLs for worker/extra.json, real, second/third not yet JSON-LD-checked but same platform as the checked one:
    - https://www.kid.no/gardiner/ferdigsydde-gardiner/adele-melange-gardin-beige (checked — Adele melange gardin, beige, kr 174.95, gtin 2202501220354)
    - https://www.kid.no/gardiner/ferdigsydde-gardiner/mali-velour-gardin-beige
    - https://www.kid.no/gardiner/ferdigsydde-gardiner/bitte-gardin-hvit
  - Proposed ids: `kid-adele-melange-gardin`, `kid-mali-velour-gardin`, `kid-bitte-gardin` — cat TBD (Home or new Textiles category, per above).
