# Rudo.no

- URL: rudo.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape (scrapeSource(), no code changes needed) — real check confirms clean, ready-to-use JSON-LD. robots.txt (checked live) is `Allow: /` with only admin/order-document paths disallowed — Silent, matches SHOP-CANDIDATES.md. Fetched the `/pages/conditions` sales-terms page and grepped for scrap/crawl/robot/automat — no hits, no automation ban. Fetched a real product page (products/graco-travelite-reisetrille-black-grey) and confirmed a full `application/ld+json` block: `Product`, `Offer`, `Brand`, `Organization`, `BreadcrumbList`, `QuantitativeValue`, `UnitPriceSpecification` — exactly the shape `productOffer()` in worker/sources.js already parses. This shop is ready to build in Phase B with zero parser changes.
- Alternatives: none needed — scrape is clean and confirmed.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Strollers & car seats — no existing pricy.no category fits (worker/cats.json has no baby-gear category); would need a new one if onboarded. Candidate product URLs (all real, WebFetch-confirmed): rudo.no/products/graco-travelite-reisetrille-black-grey, /products/emmaljunga-2025sento-lux-kombi-ergo--polar-white, /products/nuna-mixx-next-kombivogn--arra-flex-og-base-360-curv--cosmoplitan2, /products/joie-litetrax-pro--helarstrille--toffee.
