# Jakt og Fjellsport

- URL: jaktogfjellsport.no
- Category: Sports, outdoor & cycling
- Tier: needs-recheck
- Chosen method: undecided — no restriction found in robots.txt, but the
  platform serves zero structured product data of any kind, so the generic
  scrapeSource() JSON-LD parser has nothing to read.
- Alternatives: none surfaced.
- Status: not started
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off): the
  request returned the site's homepage HTML instead of a robots.txt file —
  i.e. no robots.txt exists (old custom PHP cart, csrf-token + Fancybox JS
  in the markup, app-router 404 fallback serves the index page). No
  restriction found, effectively Silent by absence. **ToS**: no vilkår/
  terms link surfaced from the homepage footer scan this round — treat as
  unverified, not "checked clean". **JSON-LD spot-check** on
  `https://www.jaktogfjellsport.no/products/zeiss-conquest-hd-10x42`: zero
  matches for `ld+json`, `schema.org`, or `@type` anywhere in the 500KB
  page — this shop's product pages carry no machine-readable structured
  data at all (an old bespoke PHP storefront, not a modern platform).
  scrapeSource()'s generic JSON-LD parser genuinely cannot use this site;
  onboarding it would need bespoke HTML scraping (regex/DOM against the
  page's own markup), not just adding URLs to a `scrape` config — bigger
  lift than the "prepare for build" bar for phase1. Sells hunting/
  fishing/optics gear (Härkila, Zeiss, Breitler) — would also need a new
  "Sports"/"Outdoor" category if ever wired.
