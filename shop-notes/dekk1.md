# Dekk1

- URL: dekkteam.no (SHOP-CANDIDATES.md: "Dekk1 (→ dekkteam.no)")
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — no per-SKU product catalog found
- Alternatives: none found
- Status: not started
- Notes: robots.txt is wide open (Yoast default, `Disallow:` empty). But a
  live crawl of the site structure shows this is a tire-fitting
  dealer-network business, not a conventional e-commerce catalog: the
  sitemap only indexes dealer locations (`/dekkforhandler/dekkteam-*`), and
  the nav's `/dekk/` section is organized by vehicle-use category
  (`/dekk/anleggsdekk/`, `/dekk/buss-og-lastebildekk/` etc.) whose pages
  carry only 1 ld+json block each (Organization/breadcrumb, no
  Product/Offer — checked `/dekk/anleggsdekk/`). Didn't find an individual
  tire-SKU product page with its own URL and price in the time budget —
  Dekk1 may sell only through a size/fitment picker at checkout time, not
  static per-product pages. Needs a human to identify whether a scrapeable
  per-SKU URL exists at all before this can move past needs-recheck.
