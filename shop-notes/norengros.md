# Norengros

- URL: norengros.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — Product JSON-LD present but has no price at all
- Alternatives: none found
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: robots.txt is open (`Allow: /`, only `/search/` and `/user/*`
  disallowed). Fetched a real product page
  (`https://www.norengros.no/product/tendercare-allroundsape-med-parfyme--P400078/400078`,
  200 OK) and confirmed `"@type":"Product"` JSON-LD exists (name, image,
  category, productID) — but there is **no `offers`/price field anywhere
  in it**. SHOP-CANDIDATES.md already tags this shop "B2B wholesale"; this
  confirms it: prices are almost certainly gated behind a logged-in
  account, so scrapeSource()'s generic parser will always fail with "no
  JSON-LD offer price" on Norengros regardless of robots/ToS status. Not
  viable as a source unless a public price list surfaces somewhere else on
  the site — needs a human to check whether any price is shown to an
  anonymous visitor at all.
