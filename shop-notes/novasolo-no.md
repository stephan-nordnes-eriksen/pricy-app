# NovaSolo

- URL: novasolo.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — no standard scrape path found
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Reclassified check from SHOP-CANDIDATES.md's "Unknown" ingest notes / Ambiguous verdict.
  - robots.txt: mostly open (`Allow: /`, blocks admin/order-doc paths + has a `Crawl-delay: 5`), no bot/product block.
  - ToS: could not find a dedicated vilkår/terms page (search results point elsewhere — novasolo.com/novasol.us are different companies); fetched the FAQ page instead, no scraping/crawling/bot clause found there. Genuine ToS text still unverified.
  - **Spot-check product page** (`novasolo.no/products/aluna-sofabord-firkantet-tett-lys-natur-90x90x45`, real URL harvested from a category page): **zero `application/ld+json` blocks, no schema.org `itemprop` markup at all.** Site runs on the old `mystore.no` platform — no structured Product/Offer data for `scrapeSource()`'s generic `productOffer()` parser to find. A scrape here would need bespoke HTML-scraping (price/name via CSS-selector-style regex against mystore.no's markup), which is real new code, not "prepare only" — doesn't cleanly fit the phase1 "existing scraper already works" bar.
  - Recommend Phase B either skips NovaSolo or treats it as a custom-parser candidate (separate scope from `scrapeSource()`), not a plain phase1 add. Flagging as needs-recheck rather than phase1 for that reason.
  - Category mapping: furniture/interior — same "Furniture" category gap as Chilli/Trademax, moot until a scrape path exists.
