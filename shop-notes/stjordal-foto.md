# Stjørdal Foto

- URL: stjordalfoto.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: scrapeSource() — cheapest option, no approval needed,
  but **needs a small `productOffer()` extension first** (see Notes) —
  not a drop-in URL add like CEWE Japan Photo
- Alternatives: none found (no affiliate-network signal)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: SHOP-CANDIDATES.md had "Unknown" ingest / "Silent" verdict. Real
  recheck confirms Silent, and finds real JSON-LD, but in a shape
  `productOffer()` doesn't currently handle:
  `curl -sL -A 'Mozilla/5.0' https://www.stjordalfoto.no/robots.txt` →
  very scrape-friendly — explicitly `Allow: /` for `ClaudeBot`,
  `PerplexityBot`, `OAI-SearchBot`, `Googlebot`; only blocks
  admin/order/invoice/PDF paths (`/kontrollpanel`, `/pdfinvoice.php`,
  etc), `Crawl-delay: 5` for `*`.
  WebFetch of `stjordalfoto.no/pages/shipping` (kjøpsbetingelser) — no
  scraping/bot language, standard consumer terms.
  Spot-check: `curl -sL -A 'Mozilla/5.0' https://www.stjordalfoto.no/products/sony-alpha-a7-v`
  → 1 `ld+json` block, but the `Product` node is **nested two levels
  deep**: `{"@graph":[{"@type":"Webpage","mainEntity":{"@type":"Product","offers":{...}}}]}`
  — not a direct `@graph` entry with its own `.offers` the way
  `productOffer()`'s current loop expects
  (`nodes = [doc, ...doc['@graph']]`, then checks `n?.offers` on each
  node directly). On this shape `n.offers` is undefined on the Webpage
  node — the Product/Offer live at `n.mainEntity.offers`. **As currently
  written, `scrapeSource()` would silently fail to find a price on this
  shop's product pages** (falls into the `if (!price) throw` catch-all,
  logs a warning, freezes that product — not a crash, but no real prices
  either). Fix for Phase B: in `productOffer()` (worker/sources.js), also
  check `n?.mainEntity?.offers` (or generically also push `n.mainEntity`
  into the `nodes` list before scanning) — small, targeted change, still
  inside the existing generic-parser philosophy, not a shop-specific
  hack. Confirmed real Product data seen:
  `{"@type":"Product","name":"Sony Alpha A7 V","sku":"ILCE7M5B.CEC","brand":{"name":"Sony"},"offers":{"@type":"Offer","priceCurrency":"NOK","price":"36978.00","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition"}}`
  — otherwise a perfectly clean, complete Offer (note: `availability` is
  a full schema.org URL here, not a bare word — worth checking
  `scrapeSource()`'s `/instock|limitedavailability/i` regex still matches
  the URL form, which it should since it's just a substring test).
  Category fit: cameras — same gap as CEWE Japan Photo, **no existing
  cats.json category fits**; needs the same new `Cameras` line (share one
  cats.json addition across both shops in Phase B, don't duplicate).
  Candidate real product URLs (from `stjordalfoto.no/categories/fotokamera`,
  none fabricated):
  - https://www.stjordalfoto.no/products/sony-alpha-a1 (no Product JSON-LD found on this specific page — only WebSite/Organization/LocalBusiness blocks; looked stale/discontinued-listing, don't use as the pilot)
  - https://www.stjordalfoto.no/products/sony-alpha-a7-v (spot-checked above, confirmed working Product/Offer — good pilot candidate once the mainEntity fix lands)
  - https://www.stjordalfoto.no/products/canon-eos-r6-mark-iii-hus2 (Canon EOS R6 Mark III body)
  - https://www.stjordalfoto.no/products/canon-eos-c70 (Canon EOS C70 cinema camera)
