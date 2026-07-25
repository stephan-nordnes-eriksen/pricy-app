# Mekster.no

- URL: mekster.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — RECLASSIFIED from SHOP-CANDIDATES.md's
  "Unknown" ingest / "Unknown (ToS not found)" verdict. Live recheck:
  robots.txt (`https://www.mekster.no/robots.txt`) is Magento-default open
  (`Crawl-delay: 2`, disallows only checkout/customer/catalogsearch paths —
  no blanket block, no named-bot block). Fetched a real product page and
  confirmed full schema.org Product + Offer JSON-LD with a real NOK price
  (see spot-check below). No contract or approval needed — cheapest
  option, scrapeSource() already exists.
- Alternatives: none found (no affiliate signal in SHOP-CANDIDATES.md)
- Status: deliberately not wired 2026-07-25 — sitemap discovery works (`https://www.mekster.no/media/no_products_google_sitemap_index.xml`, 12/12 sampled pages yielded a priced JSON-LD offer), but every row it sends is filed under "Reservedeler": car spare parts. `CAT_SKIP` in worker/index.js excludes exactly that vocabulary, so a full crawl here would be ~400 pages of traffic for zero promoted products. Re-wire only if pricy.no ever wants a parts category.
- Notes:
  - **Category mapping**: Mekster sells car parts/accessories/oil/tools —
    fits none of worker/cats.json's current categories (Audio, Phones, TV,
    Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen). Needs a
    new **"Automotive"** category + worker/extra.json rows later — not
    added this round.
  - **Candidate product URLs** (real, from `https://www.mekster.no/media/
    no_products_google_sitemap_1.xml`):
    - https://www.mekster.no/saaboriginal-oljefilter-122.html (Saab
      original oil filter)
    - https://www.mekster.no/tennplugg-dubbelplatina-bosch-fr7mpp10-0-242-235-743-316.html
      (Bosch double-platinum spark plug)
    - https://www.mekster.no/tennplugg-super-plus-bosch-fgr7dqe-23-0-242-235-748-317.html
      (Bosch spark plug)
    - https://www.mekster.no/tennplugg-super-plus-bosch-fr7dpp-24-0-242-235-749-318.html
      (Bosch spark plug)
  - **JSON-LD spot-check** (oil filter URL, 200 OK): confirmed
    `"@type": "Product"` and `"@type": "Offer"` present (5 ld+json script
    tags on the page total). productOffer()'s generic parser should find
    it directly — no shape workaround needed.
