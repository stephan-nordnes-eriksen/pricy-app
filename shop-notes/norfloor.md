# Norfloor

- URL: norfloor.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() as it exists today cannot ingest this shop
- Alternatives: none found (no affiliate-network signal)
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - robots.txt (curled, sandbox disabled): `Allow: /` plus narrow `Disallow` on ajax/admin action endpoints only. Product/category paths are wide open — no block.
  - ToS (WebFetch'd `https://www.norfloor.no/salgsbetingelser-1`): standard consumer-purchase boilerplate, no scraping/automation language.
  - **Real finding that changes the tier**: spot-checked `https://www.norfloor.no/stonedesign-chalk-mosaic-5x5-matt` (curl, sandbox disabled) — the page has **zero `<script type="application/ld+json">` blocks**. Price/product data is marked up with schema.org **microdata** instead (`itemtype="https://schema.org/Product"`, `itemtype="http://schema.org/AggregateOffer"`, `itemprop="price"` etc, confirmed via grep on `itemtype=`). `worker/sources.js`'s `productOffer()` only scans `application/ld+json` script tags — it would find nothing on this shop as written.
  - So this is Silent on ToS/robots (would otherwise be a clean phase1-scrape) but blocked on a **technical** gap: scrapeSource() needs a microdata parser (or a JSON-LD fallback path) before Norfloor is ingestable. Flagging as needs-recheck/needs-code rather than phase1-scrape so Phase B doesn't wire it expecting the existing parser to work.
  - No category-mapping or candidate-URL research done since the shop isn't buildable with the current scraper; revisit if/when microdata support is added to sources.js.
