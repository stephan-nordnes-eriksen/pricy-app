# Zizzi

- URL: zizzi.no
- Category: Fashion, clothing & shoes
- Tier: excluded
- Chosen method: none — do not build.
- Alternatives: none — see Notes; also no confirmed Product JSON-LD, so scraping wasn't viable anyway.
- Status: not started
- Notes:
  - **Real recheck done** (this shop's SHOP-CANDIDATES.md row said Ingest notes "Unknown", scrape verdict "Ambiguous (order-bot clause + generic copyright)").
  - **ToS** (found via homepage footer link, WebFetched directly — not the vague homepage this time): `https://www.zizzi.no/vilkaar-og-betingelser/kjoepsvilkaar/20548623470109.html`, section 4.5: *"We reserve the right not to accept or cancel orders placed using software, web robots, web crawlers, web spiders or other automated systems or scripted behavior."* — this is the same category of clause SHOP-CANDIDATES.md's explicit "Do not scrape" table used to exclude Zalando. **New finding — reclassifying to Excluded**, since this wasn't in the original prohibited-ToS table.
  - `robots.txt` (`curl -sL https://www.zizzi.no/robots.txt`, sandbox disabled): only disallows locale cart paths (`*/winkelwagen/*`, `*/panier/*`, `*/warenkorb/*`) — no product/category block, no named-bot block. Robots.txt alone would have been Silent, but the ToS clause governs.
  - JSON-LD spot-check (`https://www.zizzi.no/olivengroenn-lagvis-eleganse-STL26W28N1.html`, real product page from the shop's own `sitemap-custom_sitemap_0-product.xml`): **no Product JSON-LD found at all** — only 1 `application/ld+json` block on the page and it isn't a Product type. So even absent the ToS clause, this shop wasn't a clean `scrapeSource()` candidate right now.
