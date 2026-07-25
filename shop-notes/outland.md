# Outland

- URL: outland.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — despite the "headless Next.js" flag, product pages DO ship server-rendered Product JSON-LD with a usable AggregateOffer. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate-network signal in original sweep).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.outland.no/sitemap/products.xml`); 400 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: robots.txt open (only blocks account/cart/search/checkout paths, explicitly Allows AhrefsBot/AhrefsSiteAudit/SiteAuditBot — friendly to crawlers). No scraping/automation clause found on https://www.outland.no/betaling-og-kjopsbetingelser. Spot-checked https://www.outland.no/p/codenames (476 KB page, both `ld+json` AND `__NEXT_DATA__` present, confirming it's Next.js but still SSRs the ld+json): `"offers":{"@type":"AggregateOffer","itemCondition":"...NewCondition","offerCount":1,"priceCurrency":"NOK","highPrice":229,"lowPrice":229}` — no `.price` field, but scrapeSource()'s `parsePrice(offer?.price ?? offer?.lowPrice ?? spec?.price)` already falls back to `lowPrice`, so this works unmodified. Also carries `sku` (EAN, e.g. 8594156310318), `category":"Brettspill"`, `image`.
  Category mapping: sells comics/manga/board games/merch — none of worker/cats.json fit cleanly; board games could stretch into existing "Toys", but comics/manga would need a new "Hobby"/"Media" category.
  Candidate product URLs for worker/extra.json (cat: "Toys" for board games, pending a broader hobby category for the rest):
  - https://www.outland.no/p/codenames (Codenames, EAN 8594156310318) — spot-checked above
  - https://www.outland.no/p/hitster-the-music-card-game (HITSTER)
  - https://www.outland.no/p/partners (Partners)
