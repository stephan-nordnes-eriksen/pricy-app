# Spilltinget

- URL: spilltinget.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() needs Product/Offer JSON-LD and this shop doesn't emit it on product pages.
- Alternatives: none found (no affiliate signal in SHOP-CANDIDATES.md).
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: robots.txt (`curl https://spilltinget.no/robots.txt`, sandbox disabled) is Silent — `Allow: /`, only admin/checkout/invoice paths disallowed, `Crawl-delay: 5`. But the real product page `https://www.spilltinget.no/products/kvakksalver` has only 3 `application/ld+json` blocks and none of them is `Product`/`Offer` — grepping every `"@type"` in the page yields only `ContactPoint, LocalBusiness, Organization, PostalAddress, SearchAction, WebSite`. No `itemprop="price"` or `schema.org/Product` microdata either. So `scrapeSource()`'s generic JSON-LD parser (`productOffer()` in worker/sources.js) would find nothing usable here — this is a real technical gap, not a compliance one.

  This reclassifies the shop out of phase1-scrape (SHOP-CANDIDATES.md's "Silent" verdict is about compliance, not scrapability). Leaving as needs-recheck/blocked: would need either (a) a bespoke HTML parser for this shop's price markup (out of scope for this round — scrapeSource() is generic-JSON-LD-only by design), or (b) an affiliate-network signal that hasn't surfaced yet. Category would've been "Toys"/"Gaming" (board games, TCG) if scrapable — moot until a pull method exists.
