# Deichmann

- URL: deichmann.com/no-no (per SHOP-CANDIDATES.md)
- Category: Fashion, clothing & shoes
- Tier: excluded
- Chosen method: none — do not build.
- Alternatives: none — moot, see Notes.
- Status: not started
- Notes:
  - **Real recheck done** (Ingest notes said "Global affiliate program" — vague; scrape verdict "Unknown (WAF 403 sitewide)").
  - **New finding: Deichmann does not appear to operate a live Norwegian storefront at all**, independent of any scraping/ToS question:
    - `https://www.deichmann.com/no-no/` → HTTP 404 (checked with `curl -sL -o /dev/null -w '%{http_code}'`, sandbox disabled).
    - `https://www.deichmann.no/` and `https://deichmann.no/` → DNS resolution failure (curl exit code 7 / `000`).
    - The shop's own `sitemap.xml` sitemap-index lists 21 locale sitemaps (de-de, da-dk, sv-se, en-gb, etc.) — **no `no-no` entry** among them.
    - `https://www.deichmann.com/` homepage HTML has zero mentions of "no-no", "Norway", or "Norge".
  - This isn't a robots/ToS block (the base `robots.txt` is actually wide open — `Disallow: /search?q=` only, real `sitemap.xml`, no bot blocks) — it's that the NO market this row was built around doesn't currently exist as a reachable storefront. Reclassifying to Excluded as non-viable rather than leaving it in a build tier that has nothing to point at. Worth a periodic re-check in case Deichmann relaunches a Norwegian site later — this could flip back to phase1-scrape quickly given the parent's site otherwise looks very scrape-friendly.
