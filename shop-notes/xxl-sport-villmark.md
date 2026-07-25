# XXL Sport & Villmark

- URL: xxl.no
- Category: Sports, outdoor & cycling
- Tier: needs-recheck
- Chosen method: undetermined — see Notes. Robots/ToS are clean, but the
  generic `scrapeSource()` (schema.org JSON-LD parser) finds nothing on a
  real product page, so it can't be reused as-is.
- Alternatives: a bespoke parser reading XXL's Next.js hydration data
  (`price` appears 9x in inline JS state, not schema.org) — real new code,
  not evaluated further this round per instructions (no speculative
  parsing against unconfirmed shapes).
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/account, /cart, /search, /team-sales). Not crawled, not wired.
- Notes: Rechecked live (curl, sandbox disabled).
  `robots.txt`: `Allow: *` for all, only blocks `/account`, `/cart`,
  `/search`, `/team-sales`, `/checkout`, `/login`, and a long list of
  faceted-filter query params — product/category paths are open.
  `Content-Signal: ai-train=no, ai-input=no` (opts out of AI training, not
  scraping — matches SHOP-CANDIDATES.md's "Silent" verdict). ToS
  (`xxl.no/faq/betingelser`, WebFetch) has no scraping/bot/automated-access
  clause — only a Fair Use Policy about resale/photos.
  JSON-LD check: fetched a real single-SKU page (Åsnes fjellski, specific
  color/size:
  `xxl.no/sport/vintersport/langrenn/langrennski/fjellski/Åsnes--Grå--Størrelse-206-210cm/c/240222`,
  618 KB HTML) — **zero** `application/ld+json` blocks and no schema.org
  microdata beyond a bare BreadcrumbList. Price data lives in Next.js
  `__NEXT_DATA__`/inline JS state instead. `scrapeSource()`'s
  `productOffer()` only reads `<script type="application/ld+json">`, so it
  would return nothing here — this is a real negative finding, not a
  fetch/UA problem (page loaded fine, 200, full content).
  Sells sports/outdoor gear (skis, hiking boots, cycling, etc.) — no fit
  in current worker/cats.json (Audio, Phones, TV, Projectors, Gaming,
  Home, Computers, Toys, E-readers, Kitchen); would need a new
  "Sports"/"Outdoor" category regardless of ingest method.
