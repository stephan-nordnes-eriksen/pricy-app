# Coop Obs BYGG

- URL: obsbygg.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() as it exists today cannot get a price from this shop
- Alternatives: none found (no affiliate-network signal)
- Status: wired but not yet ingested — `$discover` entry present in `tools/crawl-urls.json` (sitemap `https://www.obsbygg.no/sitemap.xml`), but the 2026-07-25 full crawl got no rows from it (the run logged a rate-limit/403 on the sitemap fetch). Retry it on its own with `node tools/crawl.mjs --shop "Obs Bygg"`.
- Notes:
  - robots.txt (curled, sandbox disabled): only disallows `/kassen/`, `/sok`, `/startside`. Product/category paths open — no block.
  - ToS (WebFetch'd `https://www.obsbygg.no/kjopsvilkar`): standard consumer-purchase boilerplate, no scraping/automation language.
  - **Real finding that changes the tier**: spot-checked 2 product pages (curl, sandbox disabled, python JSON-LD parse) — `hage-og-utemiljo/hagemaskiner/gressklipper/2716572` (Stiga Combi 553 SE) and `merkevarer/gardena/2169083` (Gardena Sileno robot mower). Both pages carry exactly **one** `application/ld+json` block each, and it's a `BreadcrumbList`, not `Product` — no Product/Offer schema present at all. Plain-text grep shows the word "price"/"Price" does appear somewhere in the page (likely a Next.js hydration data blob, not schema.org markup), which `productOffer()` doesn't parse.
  - So there is no JSON-LD price path here for the generic scraper to use, on either sample checked. SHOP-CANDIDATES.md's ingest note for this shop was already "Unknown" (not "Confirmed JSON-LD") — this recheck confirms the pessimistic read.
  - Flagging as needs-recheck: would need either a different (non-JSON-LD) parsing strategy for this specific site, or a look at whatever internal API populates the price into the page.
  - No category-mapping or candidate-URL research done given the price-extraction gap.
