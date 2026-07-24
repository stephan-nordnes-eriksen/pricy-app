# Skeidar

- URL: skeidar.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none viable yet — see notes
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes:
  - **Real check performed.** robots.txt (`skeidar.no/robots.txt`) blocks only `_next/data`, cms/`episerver`, cart/checkout/account/search/compare — product/category paths are open.
  - ToS (`skeidar.no/kundeservice?tab=kjopsvilkar-for-netthandel`, via WebFetch): silent on scraping/crawling/bots/robots/automated access.
  - **Blocker**: a real product page (`https://www.skeidar.no/alle-produkter/alle-sofaer/sofa/moduli-sofa/`, found via web search) DOES return full server-rendered HTML (~200 KB, unlike Bohus) but contains **zero** `application/ld+json` blocks anywhere — Skeidar's data model is a Sitecore JSS `__NEXT_DATA__` JSON blob (`props.pageProps.layoutData.sitecore...`) with a custom, non-schema.org shape. `scrapeSource()`'s `productOffer()` only looks inside `application/ld+json` script tags, so it finds nothing here even though the price data is technically present in the page.
  - Getting a price out would mean writing a bespoke parser for Skeidar's specific Sitecore JSON shape — new code, not zero-code wiring — so this stays `needs-recheck` rather than `phase1-scrape`. Worth revisiting if Phase B decides a custom-shape scraper is worth building (the JSON is at least present server-side, no headless browser needed, just a different extraction path than `productOffer()`).
  - Category gap (moot until scraping is possible): furniture — same "Furniture" category gap as JYSK/Bohus.
