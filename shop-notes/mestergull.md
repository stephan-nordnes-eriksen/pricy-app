# Mestergull

- URL: mestergull.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — SHOP-CANDIDATES.md flags "Confirmed
  Product JSON-LD", verdict Silent. No contract, no approval needed —
  scrapeSource() already exists. Cheapest option.
- Alternatives: none found
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://mestergull.no/sitemap.xml`); 352 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - **Category mapping**: jewelry/diamonds/watches/bunad silver — fits
    none of worker/cats.json's current categories. Needs a new
    **"Jewelry"** category + worker/extra.json rows (shared with
    David-Andersen/Pandora/Bjørklund/Gullfunn/Klokker.no below) — not
    added this round.
  - **Candidate product URLs** (real, from
    `https://mestergull.no/product-sitemap.xml`):
    - https://mestergull.no/produkt/ring/yrh-ring-dia-008-ct-hsi-ferskvannsperle/
      (gold ring, diamond + freshwater pearl)
    - https://mestergull.no/produkt/gavekort/gavekort/ (gift card — probably
      skip, not a physical product to price-compare)
  - Only 2 non-generic product URLs turned up in the sitemap's first page;
    Phase B should pull more via `/product-sitemap.xml`'s later pages.
  - **JSON-LD spot-check** (ring URL, 200 OK): confirmed `@graph` with
    `BreadcrumbList` + `"@type":"Product"`, and further in the same node an
    `offers` array: `{"@type":"Offer","price":"19145.00","priceCurrency":
    "NOK","availability":"http://schema.org/InStock", …}`. Matches
    scrapeSource()'s expected shape exactly (offer.price, direct).
