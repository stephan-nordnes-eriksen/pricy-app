# Bolia

- URL: bolia.com/no (nb-no locale)
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — content is client-side rendered, plain fetch finds no product data
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md; RoyalDesign/Rum21 in the same category are on a confirmed intl. affiliate program, Bolia is not listed as such)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Reclassified check from SHOP-CANDIDATES.md's "Unknown" ingest notes / Silent verdict.
  - ToS (`bolia.com/en/this-is-us/customer-care/terms-and-conditions/`, fetched directly): no scraping/crawling/bot/automated-access clause. Verdict: Silent, confirmed.
  - robots.txt (`bolia.com/robots.txt`): open, only disallows `/jsnlog.logger`; the file's own comment says "just crawl it to explore our beautiful designs" — friendliest signal seen in this whole batch.
  - **But:** the actual blocker is technical, not policy. Checked the sofa category page (`/nb-no/sofaer/alle-sofadesign/`) and a sale-sofa listing page (`/nb-no/kampanjer-og-tilbud/sale/sofaer/`) via plain curl — both are ~175KB of shell HTML with only `Organization`/`BreadcrumbList` JSON-LD (no `ItemList`/`Product`), and no `<a href>` links to individual product pages at all. This is a client-rendered (React/Next-style) storefront: product data loads via JS/XHR after page load, which a plain `fetch()` in `scrapeSource()` (no JS execution) can't see. The `nb-no` sitemap.xml (3177 URLs) contains only category/informational/store-locator pages, no product-detail URLs either — couldn't even locate one real product page URL to spot-check further.
  - Recommend Phase B treats Bolia as blocked on a real per-product API/XHR endpoint discovery (open a product page in a real browser, inspect network calls) before any scrape attempt — not a plain phase1 add.
  - Category mapping: furniture — same "Furniture" category gap as Chilli/Trademax, moot until a data path exists.
