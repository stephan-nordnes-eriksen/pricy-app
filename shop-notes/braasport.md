# Braasport

- URL: braasport.no
- Category: Sports, outdoor & cycling
- Tier: needs-recheck
- Chosen method: undecided — robots.txt and ToS are both clean, but no
  actual per-SKU structured data (JSON-LD or microdata) could be located
  this round, so scrapeSource() viability is still unconfirmed.
- Alternatives: none surfaced — no affiliate-network signal found either.
- Status: not started
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off): only
  disallows `/ScriptResource.axd`, `/WebResource.axd`, `/upload/` — pure
  ASP.NET boilerplate, no product/category block, no named-bot block.
  **ToS** at `/kundeservice/kjopsvilkar` (found via homepage footer links,
  fetched directly): plain purchase-terms page, grepped for
  robot/crawl/scrap/automat/bot — no matches, nothing restrictive. **JSON-LD
  spot-check**: crawled `/produkter/utstyr/ski` down several levels
  (`/produkter/klar/jakker/dunjakker`, `/langrennski/felleski`, etc.) — every
  page reached is still a category/listing page (nav tree only, ~380KB
  HTML), no `application/ld+json` block and no `schema.org` microdata for a
  Product anywhere, and `/xml-sitemap/` (from robots.txt) rendered as a
  1.16MB page with zero `/produkter/...` product hrefs in the static HTML —
  the actual per-SKU add-to-cart page is likely behind client-side JS
  rendering that a plain curl can't reach. Didn't hammer the site further
  (per instructions) — needs either a browser-rendered check or someone who
  knows the platform's real product-URL pattern before this can be called
  phase1-scrape or ruled out.
