# ComputerSalg.no

- URL: computersalg.no (redirects 301 → csmegastore.no, same shop/backend)
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: undecided — the "own affiliate program" noted in SHOP-CANDIDATES.md couldn't be confirmed or identified (no Adtraction/Awin/Partner-ads/Tradedoubler mention found anywhere on-site), and no product page could be confirmed to carry usable JSON-LD via curl.
- Alternatives: none confirmed yet.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - `computersalg.no` 301-redirects every path to the equivalent `csmegastore.no` URL (confirmed via `curl -I`, sandbox disabled) — they're the same site/company, csmegastore.no is the live domain.
  - Checked robots.txt live on csmegastore.no: only checkout/order/account paths disallowed, nothing product/category-related, no named scraper block.
  - WebFetched the ToS (`https://www.csmegastore.no/shopping-policy`): no mention of scraping/automated access/bots/crawlers/copying — standard Norwegian consumer e-commerce terms.
  - Tried to spot-check a real product page for JSON-LD twice: both product IDs found via WebSearch (`/i/21839426/...`, and a second `/i/7788484` via a follow-up search) 301-redirect to `/itemeol/<id>` ("end of life" placeholder — title just reads "CS MEGASTORE", no real product content, 0 `ld+json` blocks). This looks like search-index staleness (delisted/discontinued SKUs), not a bot block — the site is served over Cloudflare + ASP.NET (`x-powered-by: ASP.NET`) and returns normal 200s, no challenge page.
  - **Needs a live browser check** (not just curl) to find a currently-listed product URL and see its actual JSON-LD shape — this round's WebSearch results for this shop were all stale/EOL'd listings.
  - Category fit: general IT/electronics — sells laptops, monitors, graphics cards; would map to worker/cats.json's "Computers" category reasonably well once a real product page is confirmed.
  - No product URLs are recorded as "candidates" here since none of the ones tried actually resolved to live product content — do not reuse the two IDs above; they are dead ends (confirmed 301 → itemeol).
