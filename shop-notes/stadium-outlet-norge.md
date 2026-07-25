# Stadium Outlet Norge

- URL: stadiumoutlet.no
- Category: Sports, outdoor & cycling
- Tier: needs-recheck
- Chosen method: undetermined — robots.txt and ToS are clean, but a real
  single-product URL / JSON-LD presence couldn't be confirmed via curl
  this round (see Notes). Needs a browser-based recheck.
- Alternatives: none evaluated (no affiliate-network signal found).
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes: Rechecked live (curl, sandbox disabled).
  `robots.txt`: only blocks `/*SearchParameter*` and `/my-stadium/` —
  product/category paths open (Intershop-platform boilerplate). ToS
  (`stadiumoutlet.no/systempage.termsAndConditions.pagelet2-Page`,
  WebFetch) has no scraping/bot/automated-access clause. Both confirm
  SHOP-CANDIDATES.md's Silent verdict.
  JSON-LD spot-check: category pages
  (e.g. `stadiumoutlet.no/herre/herresko.no31764820990`) return full HTML
  (430 KB) but contain **no individual product links** in the server-
  rendered markup — this looks like an Intershop PWA storefront that
  hydrates the product grid client-side via API calls, so curl alone
  can't reach a real single-SKU page. Tried the product sitemap URL from
  robots.txt directly
  (`.../ViewSiteMapXML-Start?FilePattern=product...`) — Akamai returned
  "Access Denied" (edge WAF rule, not a scraping block specifically, but
  blocks this path for non-browser clients). Needs a real browser
  (Playwright/headless) or a found single-product URL via search to
  actually confirm JSON-LD shape before committing to phase1-scrape.
  Sells discount sportswear/footwear — no fit in current worker/cats.json;
  would need the same new "Sports"/"Outdoor" category as the rest of this
  batch if it converts to phase1-scrape later.
