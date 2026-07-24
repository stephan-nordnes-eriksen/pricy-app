# Fagmøbler

- URL: fagmobler.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real Product/Offer JSON-LD confirmed on a live product page. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes:
  - **Real check performed.** robots.txt (`fagmobler.no/robots.txt`) only blocks `/sok` and `/artikkelsok` (site search) — product/category paths open, has a `sitemap_index.xml` with a dedicated `products/sitemap.xml`.
  - ToS (`fagmobler.no/kjopsbetingelser`): curl returned a large (900KB) page bundling app-shell i18n strings for many locales/features (Clerk-auth-style keys) alongside the real Norwegian ToS prose — grepped for scrap/crawl/robot/automat, only false-positive hits ("automatisk invitasjoner" etc. are unrelated auth-dashboard i18n strings bundled in the JS, not ToS text). No genuine scraping/crawling/bot/robots restriction found in the actual terms content. Silent, matches SHOP-CANDIDATES.md's Ambiguous-leaning-Silent read.
  - **Spot-check**: `https://fagmobler.no/rom/hagemobler/hagetilbehor/utetepper/GX22685` (an outdoor rug, found via `products/sitemap.xml`) — real, standard schema.org JSON-LD: `"@type":"Product"` with `Offer`, `Brand`, `QuantitativeValue`, `BreadcrumbList`. Canonical matches the requested URL (single product, not a category listing). Clean shape.
  - **Category gap**: furniture + garden furniture — no existing category fits; sells both indoor furniture and hagemøbler (garden furniture/accessories). Flagging need for "Furniture" (and possibly "Garden") category, not building.
  - Candidate product URL for `worker/extra.json` (Phase B): `https://fagmobler.no/rom/hagemobler/hagetilbehor/utetepper/GX26713` and `GX25772`/`GX25771` (outdoor/floor rugs, all in `products/sitemap.xml` alongside GX22685) plus a non-rug item (sofa/chair) should be pulled for variety — only rugs surfaced from the first sitemap sample this round, Phase B should browse `products/sitemap.xml` further for `hagemobler/stolgrupper` (chairs) or `rom/stue` (living room) SKUs. Proposed cat: Furniture.
