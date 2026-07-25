# Stefan Papir

- URL: stefanpapir.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — RECLASSIFIED from SHOP-CANDIDATES.md's
  "Unknown" ingest note (verdict was already Silent). Live recheck:
  robots.txt is Shopify boilerplate open (`Allow: /`, agentic-access
  friendly), ToS (`/policies/terms-of-service`) has no scraping/bot
  mention, and a real product page shows full Product+Offer JSON-LD with a
  real NOK price. No contract or approval needed — cheapest option.
- Alternatives: none found
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - **Category mapping**: paper goods, office/desk tools — fits none of
    worker/cats.json's current categories. Needs a new **"Office"**
    category + worker/extra.json rows — not added this round.
  - **Candidate product URLs** (real, from
    `https://www.stefanpapir.no/sitemap_products_1.xml`):
    - https://www.stefanpapir.no/products/brevklype-15mm (letter clip)
    - https://www.stefanpapir.no/products/magnetklype-55mm (magnetic clip)
    - https://www.stefanpapir.no/products/brevklyper-25-mm-12-stykk
    - https://www.stefanpapir.no/products/brevklyper-32-mm-8-stykk
  - **JSON-LD spot-check** (brevklype-15mm URL, 200 OK): flat
    `"@type":"Product"` with `sku`, `brand`, and `offers` array:
    `{"@type":"Offer","sku":"1000488","gtin13":7072076102172,
    "availability":"http://schema.org/InStock","price":95.0,
    "priceCurrency":"NOK", …}`. Clean match for scrapeSource().
