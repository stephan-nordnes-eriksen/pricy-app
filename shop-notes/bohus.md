# Bohus

- URL: bohus.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none viable yet — see notes
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes:
  - **Real check performed.** robots.txt (`bohus.no/robots.txt`) blocks only cart/account/search/filter/sort paths — product/category pages are open.
  - ToS (`bohus.no/kjopsbetingelser`, via WebFetch): silent on scraping/crawling/bots/robots/automated access.
  - **Blocker**: `curl`'d a real product page (`https://www.bohus.no/stue/sofa/line-hjoernesofa`, found via web search) with both the honest UA and a browser UA — both return an identical ~10 KB HTML shell (`<title>Bohus</title>`, GTM boilerplate, no content, no `application/ld+json` anywhere). This is a client-side-rendered SPA: the product data loads via JS after the initial fetch, so plain `fetch()` (what `scrapeSource()` does) gets nothing. Not a bot block (same result both UAs, HTTP 200) — a genuine JS-rendering requirement.
  - `scrapeSource()` as it exists can't reach this shop's data at all without a headless-browser fetch step, which is new code/infrastructure, not zero-code wiring — hence `needs-recheck` rather than `phase1-scrape` despite the Silent ToS/robots verdict. Worth a second look if/when the Worker gains a rendering path (e.g. via a headless-browser service), otherwise this shop stays out of scope.
  - Category gap (moot until scraping is possible): furniture — would need the same new "Furniture" category flagged in the JYSK note.
