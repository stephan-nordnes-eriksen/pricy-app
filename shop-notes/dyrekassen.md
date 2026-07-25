# Dyrekassen.no

- URL: dyrekassen.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: first-party scrape of individual product pages via
  `scrapeSource()`/`productOffer()` as-is — clean schema.org JSON-LD
  (`ProductGroup` + `Offer` + `Brand` + `BreadcrumbList`) confirmed by
  direct curl on two separate real product pages, open robots.txt, no
  automation restriction in ToS, and no affiliate-network signal to fall
  back on instead. This is the least-manual option and needs no code
  changes to the existing scraper, only URL entries.
- Alternatives: none found — no Adtraction/Awin/Partner-ads/Tradedoubler
  signal in the pages checked (matches pass 1's "Unknown").
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.dyrekassen.no/sitemap.xml`); 128 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - robots.txt: only blocks `proximic` entirely and, for `*`, blocks
    `/kasse$` (checkout), `/kasse/takk$`, `/mine-sider$` (account), `/sok$`
    (search) — product and category paths are wide open. Has a real
    `sitemap_product_nb_NO_*.xml` set (this shop maintains a proper product
    sitemap, unlike Musti/VetZoo's broken or non-existent ones).
  - ToS checked: `/kjopsvilkar` (kjøpsvilkår) — covers payment, delivery/
    shipping, returns/exchange, personal data; no automation/bot/crawler/
    scraper/robots language found anywhere. Silent.
  - Technical check: pulled 2 real product pages from
    `sitemap_product_nb_NO_0.xml` directly via curl, both 200 OK with
    `application/ld+json` present and matching shape (verified by grepping
    `@type`, `price`, `priceCurrency`, `gtin13` directly out of the raw
    response body):
    - https://www.dyrekassen.no/s1-pro-pelspleiesett-for-kjaledyr — Offer
      price "2399", priceCurrency "NOK", availability InStock,
      gtin13 "6975532170429"
    - https://www.dyrekassen.no/granary-feeder-3-liter-hvit — same shape,
      gtin13 "619988626630"
    Both use `@type: ProductGroup` (not plain `Product`) as the owning
    node alongside a separate `Offer` node, but `productOffer()` walks
    `[n?.offers]` off any node in the parsed JSON-LD graph regardless of
    that node's `@type`, so this parses unchanged with no code edit needed.
  - 2 more candidate URLs from the same sitemap, not individually
    spot-checked but same site/platform (high confidence of the same
    shape): https://www.dyrekassen.no/f1-harfoner-for-hund,
    https://www.dyrekassen.no/cam-kjaledyrkamera-med-lyd
  - Proposed product_id scheme: `<brand>-<slug>` from the product name —
    on this site the URL slug itself is already a clean descriptive title
    (e.g. `s1-pro-pelspleiesett-for-kjaledyr`), so reusing it directly as
    the id works; no shop prefix, consistent with cross-shop EAN dedup.
  - Category-fit: worker/cats.json currently has Audio/Phones/TV/
    Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen — none cover
    pet supplies. A new "Pets" category would be required regardless of
    tier if Dyrekassen is ever onboarded.
