# David-Andersen

- URL: david-andersen.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — SHOP-CANDIDATES.md flags "Confirmed
  Product JSON-LD", verdict Silent (blocks only named AI/LLM crawlers, not
  general scraping — pricy.no's UA isn't one of the named bots). No
  contract, no approval needed. Cheapest option.
- Alternatives: none found
- Status: not started
- Notes:
  - **Category mapping**: fine jewelry — needs the new **"Jewelry"**
    category (shared with Mestergull/Pandora/Bjørklund/Gullfunn/
    Klokker.no) — not added this round.
  - The site's sitemap.xml only lists top-level category/CMS pages
    (`/nettbutikk/`, `/smykker/…`), not individual products — product URLs
    only surface inside a rendered category page's link markup with a
    `?productId=` query param, e.g.
    `/smykker/armband/gullarmband` → per-item hrefs like
    `/armband-5-stjerner-gult-gull/?productId=17053`.
  - **Candidate product URLs** (real, scraped off the gullarmbånd category
    page):
    - https://david-andersen.no/armband-5-stjerner-gult-gull/?productId=17053
      (5-star gold bracelet)
    - https://david-andersen.no/armband-cordell-33-mm-gult-gull/?productId=17GU33-ARM-xx
    - https://david-andersen.no/armband-glory-tennis/?productId=194262A5094
    - https://david-andersen.no/armband-kongekjede-18-mm-gult-gull/?productId=16GU18185
  - **JSON-LD spot-check** (17053 URL, 200 OK): `"@type":"Product"` present
    with `sku`, `productID`, `category`; `offers` is an
    `AggregateOffer` — `{"@type":"AggregateOffer","lowPrice":"4995.0",
    "highPrice":"4995.0","priceCurrency":"NOK","availability":
    "https://schema.org/InStock","offerCount":"1", …}`. scrapeSource()
    already handles this shape (`offer?.lowPrice` fallback in
    worker/sources.js).
