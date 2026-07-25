# Skomani

- URL: skomani.no
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: `scrapeSource()`-style scrape — real recheck found the site explicitly invites automated/agent access, and real schema.org product data exists. **Caveat**: like KappAhl, the JSON-LD on the one page checked is `ProductGroup`+`hasVariant` only (no flat `Product`/`offers` block), so `productOffer()` as shipped won't extract a price here yet — needs the same small `hasVariant`-digging addition.
- Alternatives: none found — no affiliate-network signal in the research pass.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - **Real recheck done** (Ingest notes/scrape verdict were both Unknown/Silent).
  - `robots.txt` (sandbox disabled) is unusually explicit and scraper-friendly for a Shopify storefront: *"Shopify storefront. Public product, collection, page, blog, policy, cart, and localized HTML is crawlable."* It documents an `agents.md` file and a UCP/MCP endpoint (`/api/ucp/mcp`) for agentic shopping, and its only caution is against **fully automated checkout/payment** without human approval — reading product/price data isn't restricted at all. `Allow: /` for `*`. Real product+collection sitemaps present (`sitemap_products_1.xml`, etc.).
  - JSON-LD spot-check (`https://skomani.no/products/9452853-rieker-03130-rieker-classic-walker`, real URL from the shop's own product sitemap): 2 blocks — `Organization` and `ProductGroup` (has `hasVariant`, no top-level `offers`). No flat `Product` block found on this page.
  - **New category needed**: "Shoes".
  - Candidate `worker/extra.json` rows (real URLs from the shop's own product sitemap):
    1. `skomani-rieker-03130-classic-walker` — brand Rieker, cat Shoes — https://skomani.no/products/9452853-rieker-03130-rieker-classic-walker (JSON-LD spot-checked above; needs the `hasVariant` parsing fix)
    2. `skomani-rieker-08090-crystal-shell` — brand Rieker, cat Shoes — https://skomani.no/products/9509162-rieker-08090-rieker-crystal-shell
    3. `skomani-rieker-04231-mantova-boot-black` — brand Rieker, cat Shoes — https://skomani.no/products/11363005-rieker-04231-rieker-mantova-boot-black
    4. `skomani-ecco-05333-city-tray-brown` — brand Ecco, cat Shoes — https://skomani.no/products/9507300-ecco-05333-city-tray-brown
