# Byggmax

- URL: byggmax.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check found genuine Product/Offer JSON-LD (price + NOK currency) on actual product pages, and robots.txt only blocks checkout/search/admin paths, not products. Cheaper than chasing the unconfirmed affiliate network.
- Alternatives: SHOP-CANDIDATES.md says "Confirmed affiliate (network unconfirmed)" — WebSearch only turned up VigLink/affi.io listings (aggregator directories, not primary network confirmation), couldn't pin down a real network (Awin/Adtraction/Partner-ads/Tradedoubler). Worth another pass in Phase B if scrape ever needs a fallback, but not needed now since scrape works.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Real recheck as instructed (verdict was "Unknown, ToS not found").
  - `curl https://www.byggmax.no/robots.txt` → standard Magento disallow list (`/catalog/`, `/catalogsearch/`, `/checkout/`, `/customer/`, etc.) — none of it blocks product detail pages, which live at the domain root (e.g. `/karmskrue-7x70-mm-p24067`).
  - First attempt (`/fixboard`, `/trelast-og-byggevarer`) turned out to be category/landing pages with only Organization/BreadcrumbList/WebSite JSON-LD, no Product. Pulled real product URLs from their own sitemap (`byggmax.no/pub/media/Sitemap_nb_no_product.xml`, pattern `<name>-p<digits>`) instead.
  - Spot-checked `https://www.byggmax.no/karmskrue-7x70-mm-p24067`: JSON-LD has `"@type":"Product"`, `"price":"5.95"`, `"priceCurrency":"NOK"`, plus AggregateRating — a clean match for scrapeSource()'s parser.
  - Fetched their terms page (`byggmax.no/kjøpsvilkår`) — no scrape/crawl/bot/automat clause found.
  - Verdict: reclassify "Unknown" → **Silent**, tier phase1-scrape.
  - Category mapping: building materials/hardware/tools — doesn't fit any existing worker/cats.json category (Home is closest but not a real match). Flagging a new "Hardware" or "DIY" category + worker/extra.json rows as needed, not adding it.
  - Candidate product URLs (real, from sitemap, JSON-LD confirmed on the first):
    - `https://www.byggmax.no/karmskrue-7x70-mm-p24067` (screws) — proposed `product_id: byggmax-karmskrue-7x70`, `cat: Hardware(new)`
    - `https://www.byggmax.no/hardgipsskrue-tre-stal-fzb-4-2x29-mm-p24311`
    - `https://www.byggmax.no/sandpapir-p28632`
