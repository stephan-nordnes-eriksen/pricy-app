# Varekompaniet

- URL: varekompaniet.no
- Category: Home, interior, furniture, garden & DIY (per SHOP-CANDIDATES.md;
  actual catalog is broader — see Notes)
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — Shopify storefront
  with standard Product/Offer JSON-LD, and its own robots.txt/agents.md
  explicitly invite read-only agent access to product pages. Cheapest and
  most clearly-sanctioned option of anything checked this round.
- Alternatives: none needed — this is about as green a light as scraping
  gets.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes: Recheck performed (SHOP-CANDIDATES.md verdict was "Silent
  (explicitly invites agent/MCP access)" — confirmed and detailed below):
  - robots.txt (`curl -sL https://varekompaniet.no/robots.txt`): standard
    Shopify `Allow: /` plus explicit agent-instructions comments pointing to
    `https://varekompaniet.no/agents.md` and a UCP/MCP endpoint
    (`/api/ucp/mcp`) for catalog/cart/checkout. Only restriction stated is
    on autonomous checkout/payment ("Checkouts are for humans... do NOT
    complete checkout/payment automatically without buyer approval") — pure
    price/catalog reads are explicitly fine and even the intended use case.
  - Confirmed `https://varekompaniet.no/llms.txt` (WebFetch): documents
    `GET /collections/all` and `GET /products/{handle}` as the sanctioned
    read-only browse path — exactly what scrapeSource() does.
  - Spot-checked product page
    `https://varekompaniet.no/products/trefat-i-bjork-2-stk`: 1x
    `"@type":"Product"`, 1x `"@type":"Offer"`, `"price":"99.00"`,
    `"priceCurrency":"NOK"` — clean schema.org, parses fine.
  - Category mapping caveat: despite the SHOP-CANDIDATES.md description
    ("Garden equipment & tools"), the live catalog
    (`/collections/alle-produkter`) is actually general liquidation/bulk
    stock — watches (Invicta), kitchenware/bowls, home décor — not
    garden-specific. Doesn't cleanly fit any single worker/cats.json
    category; "Home" or "Kitchen" fit some SKUs, a chunk (watches) fits
    none. Worth flagging to Phase B: this shop may be miscategorized in
    SHOP-CANDIDATES.md, or belongs split across categories rather than one
    new "Garden" bucket.
  - Candidate product URLs for worker/extra.json (brand "Varekompaniet" or
    per-item brand where shown, cat TBD per item):
    1. `https://varekompaniet.no/products/trefat-i-bjork-2-stk` — "Trefat i
       bjørk, 2 stk", kr 99, cat candidate: Kitchen
    2. `https://varekompaniet.no/products/nero-skal-svart-22x9-cm` — "Nero
       skål svart 22x9cm", cat candidate: Home
    3. `https://varekompaniet.no/products/invicta-montres-prestige-x-dameklokke-33-5mm-gold-2-ars-garanti`
       — Invicta women's watch, no existing cat fits (would need a
       "Watches" category — out of scope for this pass)
    4. `https://varekompaniet.no/products/gridwall-nettingvegg-til-butikkinnredning-150-x-60-cm-krom`
       — shop-fitting mesh wall — B2B-ish, probably skip in Phase B
