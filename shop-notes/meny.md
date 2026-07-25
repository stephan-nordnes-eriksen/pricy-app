# Meny nettbutikk

- URL: meny.no/nettbutikk
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: none — no scrapable structured product data found, and per-store pricing is a separate structural blocker
- Alternatives: none identified (no affiliate-network signal found either)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes:
  `curl -sL https://meny.no/robots.txt`: plain `Allow: /` for
  `User-Agent: *`, with a handful of marketing/test-page disallows
  (`/maler`, `/testing`, various campaign/newsletter confirmation pages)
  — nothing blocks product or category paths. Not restrictive.

  WebFetch of `meny.no/vilkar`: no scraping/bot/API/crawler clause at
  all — privacy, cookies, login sessions, business-customer terms.
  Silent, not prohibitive.

  Tried to find real product pages: `meny.no/varer` and
  `meny.no/varer/tema/grill` both return HTTP 200 but are near-empty
  server-rendered shells — the only JSON-LD present is a bare `WebPage`
  block (`name`/`datePublished`/`dateModified`), no `Product`/`Offer`
  markup anywhere. A guessed direct product URL
  (`/varer/meieri-egg/melk/helmelk/...`) 404'd. This is a client-side SPA
  (`trumf-portal-root` div for the Trumf loyalty widget) that loads
  actual product/price data via background API calls the static markup
  doesn't expose — there's no stable, documented first-party page for
  `scrapeSource()`'s server-rendered-JSON-LD model to point at.

  **Catalog-fit verdict:** even setting the missing scrape target aside,
  Meny is a NorgesGruppen chain storefront — Norwegian grocery pricing is
  commonly set per physical store/region, so "the Meny price" for a SKU
  isn't a single national number the way an electronics retailer's is.
  That's a structural mismatch with pricy.no's one-row-per-shop model,
  independent of scraping legality. Groceries category also doesn't
  exist yet in `worker/cats.json`. Would need Meny's internal API (if
  one exists and is usable) plus a policy on which store's price
  "counts" before this is even a legality/tier discussion.
