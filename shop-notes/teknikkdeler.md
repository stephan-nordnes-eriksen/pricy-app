# Teknikkdeler.no

- URL: teknikkdeler.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed clean, standard Product/Offer JSON-LD in NOK, no ToS or robots.txt restriction found. No approval needed, no code changes to worker/sources.js required.
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md).
- Status: not started
- Notes:
  - Checked robots.txt live (sandbox disabled): only `MJ12bot` gets a `Crawl-Delay: 3`, everything else open; sitemap listed. No product/category path blocks.
  - WebFetched `/kjopsvilkar` (ToS): no mention of scraping/automated access/bots/crawlers.
  - Spot-checked a real product page (`https://www.teknikkdeler.no/produkt/iphone-13-lcd-skjerm-incell-aaa`) via curl: exactly one `application/ld+json` block, `@type: Product` with a nested `Offer` — `priceCurrency: NOK`, `price: 309`, `availability: InStock`, `brand: {name: "Apple spare parts"}`, `category: null` (scrapeSource()'s `breadcrumbCat` fallback would need to find a BreadcrumbList on this page — not verified, but the price/offer path alone is enough to ingest).
  - Category fit: this shop sells phone/tablet **repair parts** (LCD screens, batteries, screen protectors) — not a clean fit for any existing worker/cats.json category (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen). These are components, not devices; adding them under "Phones" would be misleading (they'd list next to actual iPhones). **Flag for Phase B**: either skip this shop's catalog contribution (JSON-LD scrape is still useful practice/coverage, just not extra products) or add a new cats.json category (e.g. "Parts"/"Accessories") + extra.json rows — no upstream edit needed either way.
  - Candidate product URLs found (real, via WebSearch, none fabricated):
    - `https://www.teknikkdeler.no/produkt/iphone-13-lcd-skjerm-incell-aaa`
    - `https://www.teknikkdeler.no/produkt/iphone-se-skjerm-svart`
    - `https://www.teknikkdeler.no/produkt/iphone-11-skjerm-med-lcd-display-svart-livstidsgaranti`
    - `https://www.teknikkdeler.no/produkt/iphone-xr-skjerm-med-lcd-display-svart-livstidsgaranti`
  - No proposed product_id mapping to an existing catalog row (these don't match any current phone id in worker/seed.json or worker/extra.json — they're spare parts, not the phones themselves).
