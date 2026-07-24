# Milrab

- URL: milrab.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via existing `scrapeSource()` — clean
  schema.org Product JSON-LD confirmed on a real product page, no
  approval or new code needed.
- Alternatives: none found (no affiliate-network signal).
- Status: not started
- Notes: SHOP-CANDIDATES.md flagged scrape verdict as "Unknown (site
  403s)" — reproduced with WebFetch (403 on the ToS page), but a plain
  curl (sandbox disabled) got a normal 200, so the 403 is WebFetch's
  fetcher/UA getting blocked, not the site itself refusing scraping.
  `robots.txt`: only blocks `Baiduspider`, sitewide `Allow` for everyone
  else — product/category paths open. ToS (`milrab.no/kjopsvilkar`, curl)
  has no scraping/automated-access prohibition — the only "robot"
  mentions are Milrab's own warehouse pick-robot ("robotsystem på lageret"
  making order cancellation technically impossible) and their internal
  dynamic-pricing "prisrobot" for bestsellers — unrelated to third-party
  scraping.
  JSON-LD spot-check: fetched a real product page
  (`https://milrab.no/p/eagle-ryggsekk-25l-superlett-bla-22fee`) — clean
  `{"@type":"Product","name":"Ryggsekk 25L Superlett Blå",...}` plus a
  BreadcrumbList block; image served from `widforss.centracdn.net` —
  Milrab appears to run on the same Centra e-commerce platform as
  Widforss (also in this Sports batch, different agent).
  Sells tactical/outdoor gear (bags, optics) — no fit in current
  worker/cats.json; flag new "Sports"/"Outdoor" category (shared need
  with Intersport/Sport 1 in this batch).
  Candidate worker/extra.json rows (real product pages, backpacks):
  - https://milrab.no/p/eagle-ryggsekk-25l-superlett-bla-22fee
  - https://milrab.no/p/eagle-ryggsekk-18l-superlett-svart-29c3a
  - https://milrab.no/p/eagle-ryggsekk-45l-superlett-bla-87ca6
