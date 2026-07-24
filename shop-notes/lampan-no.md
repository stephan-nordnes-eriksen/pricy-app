# Lampan.no

- URL: lampan.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD with NOK prices, robots.txt only blocks checkout/favorites. No approval needed.
- Alternatives: none found.
- Status: not started
- Notes: Real recheck done (was "Unknown" ingest note, Ambiguous verdict).
  - `curl https://lampan.no/robots.txt` → only `Disallow: /checkout/` and `/my-favorites/` — product pages open.
  - Spot-checked `https://lampan.no/p/mattis-20cm/`: rich JSON-LD — 16x `"@type":"Product"`, 32x `"@type":"Offer"` (likely a full catalog/OfferCatalog block on the page, not just the one product), `"price":"329"`, `"priceCurrency":"NOK"`. scrapeSource()'s `productOffer()` grabs the first Offer-bearing node so this should parse fine, though worth double-checking in Phase B that it picks the *right* offer given how many are embedded on one page.
  - Fetched `lampan.no/info/kjops-og-leveringsvilkar/` (terms page) — no scrape/crawl/bot/automat clause. Reclassify Ambiguous → effectively Silent.
  - Category mapping: same "Lighting" new-category flag as Lysbutikken/Christiania Belysning.
  - Candidate product URLs (real, JSON-LD confirmed on the first):
    - `https://lampan.no/p/mattis-20cm/` — proposed `product_id: lampan-mattis-20cm`, `cat: Lighting(new)`
    - `https://lampan.no/p/kaami-37cm-3/`
    - `https://lampan.no/p/buddy-25cm/`
