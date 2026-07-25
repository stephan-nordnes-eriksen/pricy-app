# Shark Gaming

- URL: sharkgaming.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: scrapeSource() — clean schema.org Product/Offer JSON-LD on
  real product pages, no approval needed, cheapest option available.
- Alternatives: SHOP-CANDIDATES.md notes "Possible DK Adtraction" but that's
  unconfirmed for the .no storefront and unnecessary — JSON-LD already works.
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://sharkgaming.no/sitemap_no.xml`); 125 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - Real check performed (ingest notes were "Possible DK Adtraction" /
    Ambiguous verdict, worth a look): WebSearch found no reachable
    vilkår/ToS text mentioning bots/scraping/crawlers for sharkgaming.no
    (only SMS terms, purchase terms re: returns/warranty/payment, privacy
    policy — none address automated access). curl (sandbox disabled) on
    /robots.txt: Magento-default `Disallow: /catalog/` (the internal
    controller path, not the friendly product URLs actually served —
    confirmed below), plus explicit blocks only for `Amazonbot` and
    `AmazonProductDiscovery`. No generic scraper/AI-bot block. Reclassifying
    Ambiguous → Silent-equivalent, safe for Phase 1.
  - Category fit: **Computers** (full desktop gaming PCs, closer to the
    existing laptop/tablet entries than the console/controller-focused
    "Gaming" cat) — a judgment call, could also go in "Gaming"; flag for
    Phase B to decide.
  - Candidate real product URLs (found via WebSearch site:sharkgaming.no):
    - https://sharkgaming.no/shark-gaming-esport-edition
    - https://sharkgaming.no/gaming-stasjonaere/great-white-shark
  - JSON-LD spot-check (curl, sandbox disabled) on the Esport Edition URL:
    multiple `application/ld+json` blocks — `WebSite`, `ComputerStore`,
    `BreadcrumbList`, and a full `Product` block with `name`, `description`,
    `image`, `productID`/`sku`, `brand.name: "SharkGaming"`, and
    `offers: { @type: Offer, price: 22699, priceCurrency: NOK,
    availability: http://schema.org/InStock, url, shippingDetails,
    itemCondition: NewCondition }`. scrapeSource()'s `productOffer()` picks
    the first offer-bearing node — works cleanly. Confirmed JSON-LD, not
    Inconclusive.
