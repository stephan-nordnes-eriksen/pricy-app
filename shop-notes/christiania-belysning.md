# Christiania Belysning

- URL: christiania-belysning.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD with NOK prices, and their robots.txt is explicitly agent-friendly (best-case result of this whole batch). No approval needed.
- Alternatives: none found; robots.txt also advertises a UCP/MCP shopping endpoint, but that's out of scope for scrapeSource()'s pattern — noting it for awareness, not pursuing.
- Status: not started
- Notes: Real recheck done (was "Unknown" ingest note, Silent verdict).
  - `curl https://www.christiania-belysning.no/robots.txt` → standard Shopify robots.txt, header comment reads: *"Public product, collection, page, blog, policy, cart, and localized HTML is crawlable."* It even documents an `agents.md` and a `/.well-known/ucp` + `/api/ucp/mcp` endpoint aimed at AI shopping agents, and explicitly only restricts *checkout/payment automation*, not read/scrape access. Strongest Silent verdict of the batch.
  - Spot-checked `https://www.christiania-belysning.no/collections/taklamper/products/ph-5-taklampe`: JSON-LD has 21x `"@type":"Product"`/`"Offer"`, `"price":{"amount":8400.0...}`, `"priceCurrency":"NOK"` — note the nested `price.amount` shape (Shopify's newer JSON-LD emits price as an object, not a bare number/string) — scrapeSource()'s `parsePrice(offer?.price ?? ...)` currently expects a scalar; this shop may need `offer.price?.amount` handled specifically in Phase B, or `parsePrice` will choke on an object. Flagging this as a real implementation detail, not just a lead.
  - Fetched `christiania-belysning.no/policies/terms-of-service` — no scrape/crawl/bot/automat clause (standard Shopify terms).
  - Category mapping: same "Lighting" new-category flag as Lysbutikken/Lampan.no.
  - Candidate product URLs (real, JSON-LD confirmed on the first):
    - `https://www.christiania-belysning.no/collections/taklamper/products/ph-5-taklampe` (Louis Poulsen PH 5) — proposed `product_id: louis-poulsen-ph5`, `cat: Lighting(new)`
    - `https://www.christiania-belysning.no/collections/taklamper/products/ph-5-mini-taklampe`
    - `https://www.christiania-belysning.no/collections/taklamper/products/octo-4241-small-taklampe-o45`
