# Sykkelbutikken

- URL: sykkelbutikken.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean
  Product/Offer JSON-LD confirmed, robots.txt is default PrestaShop
  boilerplate with no scraping-relevant block. No approval needed, code
  already exists.
- Alternatives: none found — no affiliate signal in SHOP-CANDIDATES.md.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes: Recheck performed — robots.txt is the stock PrestaShop
  auto-generated file: disallows only cart/account/order/search query
  params and controller paths (`?order=`, `controller=cart`,
  `controller=my-account`, etc.), no product/category block, no named
  bot rules. Could NOT find a dedicated "vilkår for bruk"/terms-of-use
  page distinct from checkout-time purchase terms (searched directly —
  only other shops' terms pages turned up); no scraping/automation
  clause found anywhere reachable, consistent with SHOP-CANDIDATES.md's
  "Silent" call. JSON-LD spot check on
  https://sykkelbutikken.no/landeveissykkel/3593-7957-cannondale-synapse-carbon-2-rl.html
  shows `Product`/`Brand`/`Offer`/`QuantitativeValue` types present
  (PrestaShop's default schema.org block) — clean shape,
  `productOffer()` should parse it directly. Sells bikes (Focus,
  Specialized, Cannondale) — maps to NO existing worker/cats.json
  category; needs the new "Sports"/"Outdoor" category flagged elsewhere
  in this batch, not added this round. Candidate rows:
  - `sykkelbutikken-focus-aventura2-68` — Focus Aventura² 6.8, diamant
    (e-hybrid bike)
    https://sykkelbutikken.no/ehybrid/4395-9849-focus-aventura-6-8-diamant.html
  - `sykkelbutikken-specialized-chisel-ht-base` — Specialized Chisel
    Hardtail Base, 29
    https://sykkelbutikken.no/halvdemper/4339-9401-specialized-chisel-ht-base-29.html
  - `sykkelbutikken-cannondale-synapse-carbon-2` — Cannondale Synapse
    Carbon 2 RL
    https://sykkelbutikken.no/landeveissykkel/3593-7957-cannondale-synapse-carbon-2-rl.html
