# Byggmakker

- URL: byggmakker.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none viable found this round.
- Alternatives: none confirmed.
- Status: not started
- Notes: Real recheck done (was "Unknown"/Ambiguous in SHOP-CANDIDATES.md).
  - `curl https://www.byggmakker.no/robots.txt` → only disallows `/sok`, `/checkout`, `/payment`, `/bonus`, `/login`, `/ai-chat-betatestaus` — product pages are open. No ToS red flag found either.
  - BUT: spot-checked a real product page (`https://www.byggmakker.no/produkt/gran-44x150-skurlast-us5/7000080001334`, found via WebSearch, size ~670KB) — **no Product/Offer JSON-LD at all**. Zero `ld+json` script tags, no `__NEXT_DATA__`/`__NUXT__` blob either. The only `@type` hits present are `GeoCoordinates`/`PostalAddress` (store-locator data) and a single stray `"offers"` string that isn't schema.org. scrapeSource()'s generic JSON-LD parser would find nothing to ingest here.
  - No affiliate network confirmed either (WebSearch turned up nothing beyond generic Byggern/XL-BYGG franchise mentions).
  - Conclusion: robots.txt/ToS are fine, but there's no technical path with the current scrapeSource() (no JSON-LD) and no confirmed affiliate feed. Needs either a non-JSON-LD scraper (parsing their embedded page state directly, more work) or an affiliate-network lead — leaving as needs-recheck rather than phase1, since "prepare for build" isn't honest without a working extraction path.
