# Pandora Norge

- URL: pandora.co.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — SHOP-CANDIDATES.md flags "Confirmed
  Product JSON-LD"; scrape verdict was "Unknown (ToS not found)" — live
  recheck confirms the product catalog is fully reachable (200 OK, no
  challenge), so treating as Unknown-but-not-blocked per the tiering rule.
  No contract, no approval needed.
- Alternatives: none found
- Status: not started
- Notes:
  - **Category mapping**: charms/rings/bracelets — needs the new
    **"Jewelry"** category (shared with Mestergull/David-Andersen/
    Bjørklund/Gullfunn/Klokker.no) — not added this round.
  - **Candidate product URLs** (real, from
    `https://www.pandora.co.no/wp-sitemap-posts-product-1.xml`):
    - https://www.pandora.co.no/p/pandora-me-sparkling-star-bracelet-set-pdr001/
    - https://www.pandora.co.no/p/pandora-moments-heart-clasp-snake-chain-bracelet-590719/
    - https://www.pandora.co.no/p/pandora-me-rainbow-heart-bracelet-set-pdr0011/
    - https://www.pandora.co.no/p/pandora-me-small-link-chain-bracelet-599662c00/
  - **JSON-LD spot-check** (sparkling-star URL, 200 OK): `@graph` with
    `BreadcrumbList` + `"@type":"Product"`, `offers` array:
    `{"@type":"Offer","price":"587.50","priceCurrency":"NOK",
    "valueAddedTaxIncluded":"false","availability":
    "http://schema.org/InStock", …}`. Matches scrapeSource()'s expected
    shape directly. Didn't find or check a ToS page in this pass — worth a
    look before Phase B commits, though robots/live-fetch gave no red
    flags.
