# Ice nettbutikk

- URL: nettbutikk.ice.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: none viable yet — see Notes
- Alternatives: none identified (no affiliate-network signal found)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: SHOP-CANDIDATES.md had "Unknown" ingest / "Silent" verdict. Real
  recheck done: `curl -sL -A 'Mozilla/5.0' https://nettbutikk.ice.no/robots.txt`
  → open for general UAs (only `MJ12bot` and `FreddyAiBot` named-blocked;
  `Disallow: /api/`, `/checkout/` for `*`, product paths untouched).
  WebFetch of `ice.no/kundeservice/nettbutikk/salgsbetingelser/` found no
  scraping/bot language — consumer terms only (payment, returns, disputes).
  So ToS/robots verdict really is Silent, confirmed.
  BUT: `curl -sL -A 'Mozilla/5.0' <product-url> | grep -c 'ld+json\|schema.org'`
  on a real product page (`https://nettbutikk.ice.no/mobiltelefoner/apple/iphone-16/128gb-svart`,
  200 OK, 365 KB) → **zero hits**. The server-rendered HTML is a
  React/Next.js shell with no schema.org markup at all; product name/price
  load client-side. `scrapeSource()`'s JSON-LD parser (`productOffer()` in
  worker/sources.js) has nothing to find here — this isn't a ToS/robots
  block, it's a technical dead end for the current adapter (no headless
  rendering in a Worker).
  Also: Ice is a telecom operator — phones are sold bundled with 12-month
  contracts (upfront price shown alongside kr/month subscription price,
  e.g. "iPhone 16 fra 8790 kr" + "428 kr/mnd"), not one flat retail price.
  Even with JSON-LD, a scraped "price" here would need to disambiguate
  upfront-vs-subscription — another reason this isn't a clean scrape target.
  Recommendation: leave as needs-recheck / effectively non-viable until
  either (a) a JS-rendering fetch path exists, or (b) Ice turns up on an
  affiliate network (none found this pass).
