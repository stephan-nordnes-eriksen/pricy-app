# Lightup.no

- URL: lightup.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() finds nothing usable on this store today; would need a Shopify-analytics-JSON parser (non-trivial new code), not the cheap path.
- Alternatives: none confirmed. No affiliate-network signal found (SHOP-CANDIDATES.md lists ingest notes as "Unknown").
- Status: not started
- Notes: Real live recheck done (SHOP-CANDIDATES.md only had it as Unknown/Ambiguous).
  - ToS: fetched `/pages/alle-vilkar` — it's just a links page (refund/shipping/privacy/ToS policy links), no inline text to read; the actual policy pages weren't reachable/rendered via WebFetch. Silent so far, not confirmed clean.
  - robots.txt: wide open (`Allow: /`), Shopify-standard, and unusually welcoming — explicitly documents an agents.md, a UCP (`/.well-known/ucp`) and an MCP endpoint (`/api/ucp/mcp`) "for catalog, cart, and checkout", and recommends installing shop.app's agent skill. Only disallows admin/cart/checkout/account paths. Best-case robots signal of any shop checked this round.
  - JSON-LD spot-check (2 real product pages: `/products/louis-poulsen-ph-5-pendel`, `/products/philips-3-8w-50w-warmglow-dimbar-gu10-led-ra90`): each page carries exactly ONE `application/ld+json` block, and it's `BreadcrumbList` only — no `Product`/`Offer` node at all. `productOffer()` in worker/sources.js only scans `application/ld+json` script tags, so it would find nothing and every row would fail with "no JSON-LD offer price".
  - Price data DOES exist on the page, but only inside an inline Shopify analytics JS blob (`"productVariants":[{"price":{"amount":12045.0,"currencyCode":"NOK"},...}]`), not schema.org markup. Getting a price would need a bespoke parser for that blob (or hitting Shopify's own `/products/<handle>.json` endpoint, which Shopify storefronts expose by default and robots.txt here doesn't block — worth checking in Phase B as a much cheaper alternative to a custom JS-blob parser).
  - Sells lighting/lamps — same as Lysbutikken/Lampan.no/Christiania Belysning in this batch; none of worker/cats.json's categories (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) fit — would need a new "Lighting" category + worker/extra.json rows if wired.
  - Given the open `/products/<handle>.json` Shopify endpoint spotted in robots.txt, this is probably closer to Phase 1 than the "needs bespoke JS-blob parsing" framing above suggests — flagged for Phase B to just try that JSON endpoint directly before writing off scrape as expensive.
