# Tropehagen.no

- URL: tropehagen.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase2b-other-network
- Chosen method: Partner-ads affiliate network. A live fetch of a product
  page ships the `partner-ads-woocommerce` WordPress plugin
  (`wp-content/plugins/partner-ads-woocommerce/assets/js/public.js`, a
  `partnerAdsWooCommerce` JS object) — a real, currently-active
  Partner-ads.com integration, contradicting SHOP-CANDIDATES.md pass 1's
  "No affiliate signal found". Apply for the Partner-ads program (see
  ADTRACTION-COOKBOOK.md's flow as a template — different network, same
  idea) rather than scraping; a live feed needs no per-URL maintenance as
  the catalog changes, which beats hand-maintained scrape URLs.
- Alternatives: phase1-scrape is technically viable (clean JSON-LD, NOK
  prices, robots.txt/ToS both Silent — see Notes) but the product JSON-LD
  is shaped as `ProductGroup` with `hasVariant: [{offers: {...}}]` — the
  offer sits nested inside each variant, not on the top-level node.
  `worker/sources.js`'s `productOffer()` only checks `n.offers` on the
  @graph-level nodes themselves, so this shop's pages would silently fail
  `scrapeSource()` as-is (no offer found) without a small parser extension
  to also look at `n.hasVariant[].offers`. If Partner-ads approval is
  slow, this is the fallback, but it needs that code change first.
- Status: not started
- Notes:
  - robots.txt (curl'd live): only disallows wp-admin/cgi-bin/cart/
    checkout/comment-feed/search-query paths — no product/category block.
    Silent.
  - ToS (`https://tropehagen.no/betingelser/`, curl'd directly — WebFetch
    got a 403 on this URL, curl with the project's honest UA worked
    fine): standard Norwegian consumer purchase-terms boilerplate (price,
    delivery, returns, Forbrukerrådet). No scraping/bot/crawler/
    automation mention. Silent — matches SHOP-CANDIDATES.md's pass-2
    verdict.
  - JSON-LD present (`rank-math-schema-pro` plugin), on a live fetch of
    `/produkt/fluval-flex-led/`: `@graph` → `ProductGroup` →
    `hasVariant[].offers` → `price: "2899"`, `priceCurrency: "NOK"`,
    `availability`, plus a `gtin8`. Real EAN-ish data, just nested one
    level deeper than the parser currently expects.
  - Category fit: worker/cats.json has no pet-supplies category (current
    set: Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/
    Kitchen) — a new "Pets" category is required regardless of which tier
    this shop lands on.
  - Not phase1, so no candidate URL / product_id naming proposed here.
