# Mobildeksel.no

- URL: mobildeksel.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: undecided — this is NOT a ToS/robots blocker (both are clean), it's a data-format mismatch: the product pages use schema.org **microdata** (`itemtype="http://schema.org/Product"`, `itemprop="price"`), not JSON-LD. `scrapeSource()`'s `productOffer()` only parses `<script type="application/ld+json">` blocks — it would find zero offers here as written.
- Alternatives: adding a microdata fallback parser to worker/sources.js (real code work, not just config — out of scope this round) OR skipping this shop.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes:
  - Checked robots.txt live (sandbox disabled): blocks only `AhrefsBot`/`SemrushBot`/`MJ12bot`/`dotbot`; `Googlebot` and `*` are allowed with only admin/checkout/account paths disallowed. No product-path or general-scraper block → scrape verdict is effectively **Silent**, better than SHOP-CANDIDATES.md's "Unknown (ToS not found)".
  - Found and WebFetched the real ToS page (`https://mobildeksel.no/side/kjopsbetingelser`, linked from the footer as `href="/side/kjopsbetingelser"` — SHOP-CANDIDATES.md's pass apparently missed this link): no mention of scraping/automated access/bots/crawlers.
  - Spot-checked a real product page (`https://mobildeksel.no/produkt/iphone/iphone-16/lommebok-deksel-for-iphone-16-butterfly`) via curl (782 KB HTML): **zero** `application/ld+json` blocks, but confirmed `itemtype="http://schema.org/Product"` and `itemprop="price"` microdata attributes present — the product/price data exists, just in the wrong markup format for the existing parser.
  - Category fit: sells phone/tablet cases and accessories — same "not a device, doesn't map to Phones cleanly" issue as Teknikkdeler.no. Would need a new cats.json category (e.g. "Accessories") if ever wired.
  - Candidate product URLs found (real, via WebSearch, none fabricated):
    - `https://mobildeksel.no/produkt/iphone/iphone-16/lommebok-deksel-for-iphone-16-butterfly`
    - `https://mobildeksel.no/produkt/iphone/iphone-16-pro/herdet-glass-skjermbeskytter-iphone-16-pro`
    - `https://mobildeksel.no/produkt/iphone/iphone-16-pro-max/caseme-2-i-1-lommebok-deksel-iphone-16-pro-max-rod`
