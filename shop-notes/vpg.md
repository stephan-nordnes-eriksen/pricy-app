# Vertical Playground (VPG)

- URL: vpg.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean Product/
  Offer JSON-LD confirmed on a real product page, robots.txt is fully
  permissive (even explicitly `Allow` for GPTBot), no scraping clause in
  the purchase terms. No approval needed, code already exists.
- Alternatives: none found — SHOP-CANDIDATES.md's "Some affiliate program,
  unconfirmed network" note was actually for Fjellsport.no, not this shop;
  no affiliate signal found for VPG itself.
- Status: not started
- Notes: Recheck performed — robots.txt: `Allow: /` broadly, only
  `/account/`, `/checkout/`, `/widgets/` and a `*/f/*` param disallowed;
  no named bot blocks (GPTBot explicitly allowed). ToS
  (vpg.no/kundesenter/kjoepsbetingelser/) is standard Forbrukerkjøpsloven
  consumer terms — no automated-access/scraping clause. JSON-LD spot
  check on https://www.vpg.no/7mesh-Ashlu-Merino-Jersey-SS-M-s/359685/
  shows a clean `ProductGroup` + nested `Product`/`Offer`
  (priceCurrency NOK, availability, brand) — `productOffer()`'s generic
  parser should find it fine. Caveat: category *listing* pages
  (`/sykkel/sykkelklaer/...`) are client-rendered — only
  Organization/LocalBusiness/BreadcrumbList JSON-LD there, no product
  links in the raw HTML; had to find product URLs via web search + the
  gzipped sitemap (which itself only indexes category pages, so
  individual product URLs must come from search/crawl discovery, not a
  sitemap crawl). Sells outdoor/climbing/ski/cycling clothing & gear —
  maps to NO existing worker/cats.json category (Audio, Phones, TV,
  Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen); a new
  "Sports"/"Outdoor" category + worker/extra.json rows would be needed —
  not added this round. Candidate rows (real URLs, for later
  worker/extra.json):
  - `vpg-7mesh-ashlu-jersey` — 7mesh Ashlu Merino Jersey (cycling apparel)
    https://www.vpg.no/7mesh-Ashlu-Merino-Jersey-SS-M-s/359685/
  - `vpg-7mesh-synergy-jersey` — 7mesh Synergy Jersey LS W's
    https://www.vpg.no/7mesh-Synergy-Jersey-LS-W-s/273204/
  - `vpg-7mesh-glidepath-pant` — 7mesh Glidepath Pant M's
    https://www.vpg.no/7mesh-Glidepath-Pant-M-s/320010/
