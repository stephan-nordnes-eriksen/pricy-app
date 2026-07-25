# NA-KD

- URL: na-kd.com
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: `scrapeSource()` (existing generic JSON-LD parser) — real recheck found clean, working `Product`/`Offer` JSON-LD on a live product page, and no ToS scraping prohibition. Cheaper than chasing SHOP-CANDIDATES.md's vague "Multiple networks" ingest note, since no specific network could be confirmed and scraping needs no contract.
- Alternatives: SHOP-CANDIDATES.md's Ingest notes said "Multiple networks" for affiliate programs — a real recheck did not turn up which network(s) specifically (no time spent chasing this further since the WebSearch budget for this session was exhausted mid-check); worth a look later if scrape ingestion underperforms.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes:
  - **Real recheck done** (Ingest notes were vague, scrape verdict was Ambiguous).
  - `robots.txt` (sandbox disabled): `Allow: /` for `*`, only disallows `*/checkout`, `/*zendesk`, `/*nakdwardrobe*`, `/*catwalk$`, `/*ReturnUrl*` — product/category paths open. Several per-locale sitemaps listed (`sitemap?ssw=1&batch=N&language=xx-XX`), useful for enumerating more product URLs later.
  - ToS (WebFetched `https://www.na-kd.com/en/terms-and-conditions`): no automated-access/bot/scraping clause found. Only unrelated restriction: "You may not purchase NA-KD products for any commercial and/or business purpose" (about purchase intent, not data access).
  - JSON-LD spot-check (`https://www.na-kd.com/en/products/recycled-bikini-bra-black`, from the sitemap): page carries 3 `ld+json` blocks — a `ProductGroup` (nested `hasVariant`, no top-level offers — `scrapeSource()` would skip this block), a `BreadcrumbList`, and a plain `Product` block with a real `offers` object. `productOffer()` scans blocks in order and keeps going until one has a usable offer, so it correctly falls through to the flat `Product` block — this shop works with the parser exactly as it already exists, no code change needed.
  - **New category needed**: none of `worker/cats.json`'s categories (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) fit women's fashion — would need e.g. "Clothing" added first.
  - Candidate `worker/extra.json` rows (real URLs, confirmed via the shop's own sitemap, not fabricated):
    1. `nakd-recycled-bikini-bra-black` — brand NA-KD, cat Clothing — https://www.na-kd.com/en/products/recycled-bikini-bra-black (JSON-LD spot-checked above)
    2. `nakd-tie-strap-bikini-panty-stripe` — https://www.na-kd.com/en/products/tie-strap-bikini-panty-stripe-aop-1000-100672-8113
    3. `nakd-high-cut-bikini-panty-coral` — https://www.na-kd.com/en/products/high-cut-bikini-panty-coral-1000-101075-0256
    4. `nakd-button-detailed-satin-top-champagne` — https://www.na-kd.com/en/products/button-detailed-satin-top-champagne-1017-002144-1512
