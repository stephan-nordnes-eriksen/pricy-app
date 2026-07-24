# Maxbo

- URL: maxbo.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() cannot work against this shop's server-rendered HTML at all
- Alternatives: none found (no affiliate-network signal)
- Status: not started
- Notes:
  - robots.txt (curled, sandbox disabled): narrow disallow list (account/checkout/internal-search/tracking-param paths only: `/registrere`, `/handlekurv`, `/minside/`, `/sok*`, various `?query=`/`?nosto=`/`?algoliaQueryId=` tracking params). Product pages are not blocked.
  - ToS (WebSearch + WebFetch summary of `https://www.maxbo.no/kundeservice/kjopsbetingelser/`): standard Norwegian consumer-purchase boilerplate, no scraping/automation language.
  - **Real finding that changes the tier**: curled a real product page (sandbox disabled) — `https://www.maxbo.no/skrutrekker-be8907-t7-p1510000/` returns HTTP 200, 407KB of HTML, but **zero schema.org signals of any kind** (no `application/ld+json`, no `itemtype=`, `<title>` is just the literal string "Maxbo"). The page is a client-side-rendered React SPA — the initial HTML is a shell; product name/price/JSON-LD only exist after JS executes in a real browser.
  - `scrapeSource()`/`productOffer()` fetches HTML with plain `fetch()` and regexes the raw response — it will never see anything on this shop as currently built, regardless of ToS/robots verdict. This is a hard technical blocker, not a policy one.
  - Flagging as needs-recheck rather than phase1-scrape or excluded: policy-wise this shop looks fine to scrape, but the current scraper architecture can't do it. Would need either a headless-browser fetch (expensive, not what scrapeSource() does) or discovery of an underlying JSON API the SPA calls (not investigated — out of scope for this pass).
  - No category-mapping or candidate-URL research done given the technical gap.
