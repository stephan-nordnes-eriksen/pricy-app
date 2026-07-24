# Blivakker

- URL: blivakker.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: first-party scrapeSource() off Product JSON-LD — no contract, no approval, code already exists
- Alternatives: none found (no affiliate-network signal; payments run through Avarda Checkout, not relevant to pricing)
- Status: not started
- Notes: Real check done. `curl -sL https://www.blivakker.no/robots.txt`
  (unsandboxed): mostly Silent (`Disallow: /cart`, `/search`, `/checkout`,
  `/mypage`, `/login`, etc — no product-path block) **but** it opens with a
  named block: `User-agent: HvorMyeBot / Disallow: /` — HvorMyeBot is a
  Norwegian price-comparison crawler (hvormye.no), i.e. Blivakker is
  already actively blocking exactly the category of bot pricy.no is. It
  doesn't name pricy.no's own UA (`pricy.no price watcher...`) or block
  scrapers generically, so it's not in the same bucket as the explicit
  "Robots-blocked" table entries — but it's a soft signal worth weighing
  before real ingest, not just Silent. WebFetched
  `blivakker.no/brukerbetingelser` — no automated-access/scraping clause,
  just age/registration/loyalty-program terms.

  Spot-checked a real product page (unsandboxed curl, HTTP 200):
  `https://www.blivakker.no/product/3254721/cosrx-the-niacinamide-15-serum-20ml`
  — confirmed `application/ld+json` with `"@type": "Product"`. (First URL
  I tried, `/product/3288675/the-ordinary-...`, 404'd — that product ID is
  stale; the working ones came from crawling a live category page.)

  No cats.json category fits — needs "Beauty" (shared with
  Vitusapotek/Kicks). Candidate product URLs (real, live, from the
  `/products/hudpleie/ansikt/serum` category page):
  - `cosrx-niacinamide-15-serum-20ml` — https://www.blivakker.no/product/3254721/cosrx-the-niacinamide-15-serum-20ml (spot-checked, JSON-LD confirmed)
  - `cosrx-advanced-snail-96-mucin-power-essence-100ml` — https://www.blivakker.no/product/3202346/cosrx-advanced-snail-96-mucin-power-essence-100ml
  - `cosrx-bha-blackhead-power-liquid-100ml` — https://www.blivakker.no/product/3202352/cosrx-bha-blackhead-power-liquid-100ml
  - `cosrx-hyaluronic-acid-3-serum-20ml` — https://www.blivakker.no/product/3254722/cosrx-the-hyaluronic-acid-3-serum-20ml
