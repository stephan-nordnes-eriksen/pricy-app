# Importpris.no

- URL: importpris.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape (reclassified — SHOP-CANDIDATES.md had this at "Unknown ingest / Unknown scrape verdict (ToS not found)")
- Chosen method: scrapeSource() — real check found clean Product/Offer JSON-LD in NOK, clean robots.txt, and a ToS page with no scraping/bot restriction. No approval needed, no code changes required.
- Alternatives: none found (no affiliate-network signal).
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes:
  - Checked robots.txt live (sandbox disabled): standard `Disallow` list is admin/checkout/invoice/packing-slip paths only (`/kontrollpanel`, `/search`, `/pdfinvoice.php`, etc.) — no product/category block, no named scraper-bot block. `Crawl-delay: 5` for `*`.
  - WebFetched `/pages/conditions` (Salgsbetingelser): no mention of scraping/automated access/bots/crawlers found (page is mostly standard Norwegian consumer-purchase-law boilerplate).
  - Spot-checked a real product page (`https://www.importpris.no/products/tradlos-powerbank-6000-mah-led-micro-usb`) via curl: one `application/ld+json` block, `@graph` → `WebPage.mainEntity` is a `Product` with a nested `Offer` — `priceCurrency: NOK`, `price: "310.00"`, `availability: InStock`, `brand: {name: "BIBU"}`, plus a `ListPrice`/`SalePrice` `priceSpecification` pair. Standard enough for `productOffer()`'s parser (note: price is a string `"310.00"`, not a bare number — `parsePrice()` already handles decimal strings fine).
  - Category fit: this is a **general import/discount retailer** (ATV/kids' vehicles, e-bikes, building hardware, garden — see its own nav categories), not primarily electronics despite the SHOP-CANDIDATES.md description ("Mobile accessories, gadgets"). Its mobile/electronics slice (powerbanks, Bluetooth speakers, car-roof monitors) doesn't map cleanly onto any single worker/cats.json category either — closest is Audio/Home but it's a stretch for most of the catalog. **Flag for Phase B**: only worth onboarding for a narrow slice of SKUs (powerbanks etc. that fit Audio/Home loosely), not as a general-electronics source.
  - Candidate product URLs found (real, via WebSearch):
    - `https://www.importpris.no/products/tradlos-powerbank-6000-mah-led-micro-usb` (powerbank — no clean existing category fit)
    - `https://www.importpris.no/products/bluetooth-hoyttaler-med-power-bank-insportline-torchy` (Bluetooth speaker — could map to Audio)
    - `https://www.importpris.no/products/power-bank-insportline-powerten-10000-mah`
    - `https://www.importpris.no/products/takmonitor-til-bil-med-hd-skjerm-17` (car monitor — no clean category fit)
  - No proposed product_id mapping to an existing catalog row — none of these match a current worker/seed.json or worker/extra.json product.
