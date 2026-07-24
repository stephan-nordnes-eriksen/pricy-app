# Widforss

- URL: widforss.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — real per-SKU
  Product JSON-LD confirmed, no robots.txt restriction on product pages,
  no code changes needed.
- Alternatives: none found — no affiliate-network signal.
- Status: not started
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off):
  disallows `/account/*`, `/nyakassan*`, `/kassa*` (checkout), `/sok/*`
  (search), sort/list-style query params, plus a blanket Baiduspider
  block — nothing against product pages or a generic honest UA.
  **ToS**: tried `/terms` and `/kjopsvilkar`, both 404 (Next.js app, 404
  page rendered) — the correct terms URL wasn't found this round; treat as
  unverified rather than "checked clean," robots.txt is the only hard
  signal. **JSON-LD spot-check** on
  `https://www.widforss.no/p/harkila-moose-hunter-2-0-fleece-jacket-mossyoak-break-up-countrymossyoak-red`:
  confirmed real per-SKU
  `{"@context":"schema.org","@type":"Product","name":"Moose Hunter 2.0
  Fleece Jacket MossyOak Break-Up Country/MossyOakRed","image":[...],
  "description":"..."}` block (plus a separate BreadcrumbList block) —
  standard shape, scrapeSource() should parse it cleanly. Sells hunting/
  outdoor clothing (Härkila, Chevalier, Bergans, Swedteam) — maps to NO
  existing worker/cats.json category; flag "Sports"/"Outdoor" category +
  worker/extra.json rows needed later. Candidate product pages for
  worker/extra.json:
  https://www.widforss.no/p/harkila-moose-hunter-2-0-fleece-jacket-mossyoak-break-up-countrymossyoak-red
  (spot-checked above),
  https://www.widforss.no/p/lundhags-flok-wool-ms-pile-vest-olive,
  https://www.widforss.no/p/icebreaker-ms-anatomica-briefs-black,
  https://www.widforss.no/p/browning-liberty-wax-cap-brown.
