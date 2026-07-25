# Byggern

- URL: byggern.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() as it exists today cannot get a price from this shop
- Alternatives: none found (SHOP-CANDIDATES.md notes it's "part of the XL-BYGG group" — XL-BYGG is sitting behind a Vercel bot-checkpoint, see xl-bygg.md; Byggern itself is directly reachable and does NOT share that block, so it isn't riding on XL-BYGG's infra for the storefront)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes:
  - robots.txt (curled, sandbox disabled): `Allow: /` for all crawlers, nothing disallowed at all. No block.
  - ToS (WebFetch'd both `https://www.byggern.no/artikler/andre-artikler/salgsbetingelser-for-byggern-netthandel` and the search-summarized consumer terms): standard Norwegian consumer-purchase boilerplate, no scraping/automation language.
  - **Real finding that changes the tier**: spot-checked 3 different product pages (curl, sandbox disabled, python JSON-LD parse) —
    `harmoni-veggmaling-10-c-base-0-45l`, `product/53611104`, `product/42448378`. All 3 have a `Product` JSON-LD block (name/description/sku/brand/image) but **none carry an `offers` or `price` field at all**. `scrapeSource()`'s `productOffer()` requires `offer.price/lowPrice/priceSpecification` to return anything usable — on this sample it throws "no JSON-LD offer price" on every product tried.
  - This looks like a site-wide pattern for their painted/tinted-to-order goods (paint mixed to a base color, price may only appear via an in-store/JS pricing widget), not a fluke on one page — same absence across 3 unrelated products. Might differ for non-mix-to-order product lines (tools, hardware) — not tested, budget-limited.
  - Flagging as needs-recheck rather than phase1-scrape: don't wire this expecting the existing parser to work. Phase B should spot-check a non-paint product category (e.g. hand tools) before deciding if it's buildable at all, or look for a separate price API the storefront JS calls.
  - No category-mapping or candidate-URL research done given the price-extraction gap.
