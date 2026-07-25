# Ark

- URL: ark.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirms clean Product JSON-LD with a full Offer (price, priceCurrency NOK, availability, shippingDetails). Cheapest option, no approval needed.
- Alternatives: none found (no affiliate-network signal in original sweep).
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Checked robots.txt (open, only disallows account/search/checkout paths — no bot blocks), no scraping/automation clause found on https://www.ark.no/informasjon/kjopsvilkar (only returns/payment/e-book terms). Spot-checked https://www.ark.no/produkt/boker/skjonnlitteratur/gul-bok-9788205538214 — page ships 8 ld+json blocks; the Product/Book one has `"offers":{"@type":"Offer","price":362.69,"priceCurrency":"NOK","availability":"https://schema.org/InStock","shippingDetails":{...}}` — exactly the shape productOffer() expects. Also carries `sku`/`gtin13`/`isbn` (all the EAN), `author`, `publisher`.
  Category mapping: none of worker/cats.json (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) fit — Ark sells books, games, toys, office supplies. A new "Books" category (worker/cats.json + worker/extra.json rows) is needed before any Ark row can promote/render; board-game-type SKUs could arguably use existing "Toys" but books cannot.
  Candidate product URLs for worker/extra.json (books head rows, cat: "Books" once it exists):
  - https://www.ark.no/produkt/boker/skjonnlitteratur/gul-bok-9788205538214 (Gul bok, Zeshan Shakar, Gyldendal) — spot-checked above, isbn/gtin13 9788205538214
  - https://www.ark.no/produkt/boker/barneboker/det-er-en-bok-9788203253157 (Det er en bok!, children's picture book)
  - https://www.ark.no/produkt/boker/barneboker/oh-9788282382410 (Oh! — Hervé Tullet, sound book)
  - https://www.ark.no/produkt/boker/barneboker/marihonas-bok-om-biller-og-edderkopper-9788241917523 (children's nature book)
