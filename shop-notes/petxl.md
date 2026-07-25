# PetXL.no

- URL: petxl.no (www.petxl.no)
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean
  schema.org JSON-LD confirmed on two live product pages, no affiliate
  network signal found (checked footer/homepage/product-page HTML for
  Adtraction/Awin/Partner-ads/Tradedoubler markers — none present), so
  scraping is the least-manual option available today.
- Alternatives: none found. The `offers.seller` on both sampled products
  is `"ZOO.se"` (a Swedish pet-retail chain) — PetXL may be operating on a
  shared ZOO.se storefront platform, worth a quick look if other Zoo.se-
  family shops turn up affiliate programs later, but nothing concrete to
  act on now.
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.petxl.no/sitemap.xml`); 128 priced rows ingested to pricy.no. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - robots.txt (curl'd live, `www.petxl.no/robots.txt`): disallows
    `/kasse`, `/mine-sider`, `/sok`, and blocks the `proximic` bot
    entirely — no product/category path block for `User-agent: *`. Silent.
  - ToS: `/vilkar` is a promo-membership page, not the real terms — actual
    terms live at `/kjopsbetingelser` (found via homepage footer link,
    fetched successfully). Standard Norwegian purchase-terms content
    (pricing/VAT, Qliro payment, campaigns, 30-day returns, 2-year
    warranty/reklamasjonsrett, Forbrukerrådet dispute path). No mention of
    scraping/bots/crawlers/automated access anywhere. Silent.
  - JSON-LD confirmed on two live fetches (curl, honest UA, both 200 OK):
    `https://www.petxl.no/f1-harfoner-for-hund` (price 1699 NOK) and
    `https://www.petxl.no/s1-pro-pelspleiesett-for-kjaledyr` (both
    Neakasa products). Both are `@type: ProductGroup` with `offers`
    directly on the top-level node (not nested under variants like
    Tropehagen) — `price`, `priceCurrency: "NOK"`, `gtin13`, `sku`,
    `brand.name` all present. This shape matches `productOffer()` in
    `worker/sources.js` as-is, no parser changes needed.
  - Category fit: worker/cats.json has no pet-supplies category (current
    set: Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/
    Kitchen) — a new "Pets" category is required regardless of tier.
  - Candidate product URLs (WebSearch budget was exhausted this session —
    these came from `sitemap_product_nb_NO_0.xml`, not search, so treat as
    a starting sample rather than a curated pick):
    - https://www.petxl.no/f1-harfoner-for-hund (spot-checked, 1699 NOK)
    - https://www.petxl.no/s1-pro-pelspleiesett-for-kjaledyr (spot-checked)
  - Proposed `product_id` naming: `<brand>-<product-slug>` lowercased,
    e.g. `neakasa-f1-harfoner-for-hund`, matching the existing
    `worker/extra.json` convention (brand-product slug), since PetXL's own
    URL slugs drop the brand prefix and can't be used verbatim as ids.
