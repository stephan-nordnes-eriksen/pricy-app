# Axel Bruun Sport

- URL: bruun.no
- Category: Sports, outdoor & cycling
- Tier: needs-recheck
- Chosen method: undecided — real per-SKU structured product data exists,
  but it's schema.org **microdata** (`itemtype`/`itemprop` attributes), not
  JSON-LD, so the existing `scrapeSource()`/`productOffer()` parser (which
  only reads `<script type="application/ld+json">` blocks) can't read it
  without a code change — doesn't cleanly fit the "no new code" phase1
  definition.
- Alternatives: none — no affiliate-network signal found.
- Status: not started
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off): a long
  list of Disallow paths, all account/admin/forum/campaign-page related
  (`/admin`, `/bedrift`, `/boards/...`, `/danskebank`, etc.) — nothing
  blocking product or category browsing. **ToS/privacy** at `/personvern`
  (WebFetch): no mention of automated access, scraping, bots, or crawlers.
  **JSON-LD spot-check** on `https://bruun.no/haibike-trekking-4-brun`:
  zero `application/ld+json` script blocks, but 12 hits for `schema.org` —
  turned out to be **microdata**: `itemtype="http://schema.org/Product"`
  with `itemprop="name"`, `itemprop="offers"` → nested
  `itemtype="http://schema.org/Offer"` with `itemprop="price"`,
  `itemprop="priceCurrency"`, `itemprop="sku"` all present and populated.
  Real, complete product data — just the wrong wire format for the current
  parser. This is a genuine "prepare for build" candidate but the actual
  build work is a generic microdata-itemprop fallback in
  `worker/sources.js` (would help any other nopCommerce-style shop found
  later too), not urls added to an existing shop config — flagging for
  Phase B to decide whether that's worth building before wiring this shop.
  Sells bikes/running/ski gear (nopCommerce platform, Sport 1 chain
  member) — maps to NO existing worker/cats.json category, same
  "Sports"/"Outdoor" gap as the rest of this section. Candidate product
  page: https://bruun.no/haibike-trekking-4-brun (e-bike, spot-checked
  above); category anchors for more later: https://bruun.no/elsykkel,
  https://bruun.no/ski, https://bruun.no/felleskiprodukter.
