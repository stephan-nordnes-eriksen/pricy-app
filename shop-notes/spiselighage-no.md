# Spiselighage.no

- URL: spiselighage.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — WooCommerce
  Product/Offer JSON-LD confirmed live, robots.txt only blocks WP admin/
  logs (default WooCommerce boilerplate), ToS silent on scraping.
- Alternatives: none found
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Recheck performed (SHOP-CANDIDATES.md had this as "No signal
  found" ingest / Silent verdict):
  - robots.txt: standard WooCommerce defaults (`Disallow: /wp-admin/`,
    `/wp-content/uploads/wc-logs/`, add-to-cart query strings) — product
    pages themselves are open. Sitemap listed.
  - ToS (WebFetch `/kjopsbetingelser/`): standard Norwegian consumer-
    purchase terms (Angrerettloven, forbrukerkjøpsloven etc.), no scraping/
    automation language.
  - First guessed product URL 404'd; pulled real ones from
    `/sitemap-1.xml`. Spot-checked
    `https://spiselighage.no/product/epsom-salt-1-kg/`: 1x
    `"@type":"Product"`, 1x `"@type":"Offer"`, `"priceCurrency":"NOK"` —
    clean schema.org.
  - Category mapping: small one-person (Dennis Asbjørnsen) seed/kitchen-
    garden shop — seeds, soil amendments, growing accessories. Doesn't fit
    any current worker/cats.json category; would need a new "Garden"
    category + worker/extra.json rows. Low SKU count/traffic shop, so low
    priority even if a Garden category gets built for bigger fish (Rusta).
  - Candidate product URLs for worker/extra.json (brand "Spiselighage",
    cat: new "Garden"):
    1. `https://spiselighage.no/product/epsom-salt-1-kg/` — "Epsom salt 1
       kg" (plant fertilizer additive)
    2. `https://spiselighage.no/product/honsegjodsel-500-gram/` —
       "Hønsegjødsel 500 gram"
    3. `https://spiselighage.no/product/vermiculite-2l/` — "Vermiculite 2L"
    4. `https://spiselighage.no/product/perlite-2l/` — "Perlite 2L"
