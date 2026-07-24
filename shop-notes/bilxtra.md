# BilXtra

- URL: bilxtra.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none yet — JSON-LD not usable as scrapeSource() expects it
- Alternatives: none found (no affiliate signal)
- Status: not started
- Notes: robots.txt is open (`Allow: /`, only admin/api/checkout/account
  paths disallowed) — reachable, not blocked. Fetched a real product page
  (`https://bilxtra.no/bildeler/eksosanlegg/01-eksosanlegg-komplett/ljuddampare-83f77`,
  200 OK, a muffler/"Ljuddämpare" listing) and confirmed the site is a
  Next.js app: there is NO `<script type="application/ld+json">` tag on the
  page at all (grepped `_next/static` chunks confirm client-rendered app
  router). The price (`"price":2543,"priceCurrency":"NOK"`) does exist on
  the page but only inside an escaped JSON string embedded in a Next.js
  RSC/flight-data `<script>` payload — not a literal ld+json block, so
  `productOffer()`'s regex (which only matches
  `type="application/ld+json"` scripts) will not find it. scrapeSource() as
  it exists today would fail silently (no offer found) on every BilXtra
  product page. Would need a custom parser for the Next.js payload shape —
  out of scope for this round; flag for Phase B to decide whether that's
  worth building, or to look for an affiliate program instead.
  ToS page wasn't located to check for an explicit scraping clause.
