# Familiebutikken

- URL: familiebutikken.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape — real check: robots.txt only disallows backend/PDF/invoice paths (kontrollpanel, htmlpackingslip*, pdfinvoice*, etc.), product/category pages are wide open. JSON-LD is present, with a caveat below.
- Alternatives: none found.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Couldn't find a linked ToS/vilkår page (no footer link, `/vilkaar` 404s) but robots.txt has no bot/scraper restriction of any kind. Curled a real product page (`https://www.familiebutikken.no/products/hust-and-claire-baloo-flor-body-ull-bambus-off-white`) — JSON-LD present as `@graph: [{@type: Webpage, mainEntity: {@type: Product, offers: {...}}}]`. worker/sources.js's `productOffer()` walks `doc`/`@graph` array items directly for `n.offers` — since the Product here is nested one level deeper under `mainEntity` rather than being a top-level @graph member, **this shape would NOT be picked up unmodified**; Phase B needs productOffer() to also check `n.mainEntity?.offers` when `n['@type']` is `Webpage`. Same platform/shape as DressMyKid (identical robots.txt template, image-host path pattern `mystore_no`) — worth fixing the parser once for both. Baby & kids clothing — no existing pricy.no category fits.
