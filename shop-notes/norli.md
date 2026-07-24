# Norli

- URL: norli.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none viable yet — scrapeSource() is a plain `fetch()` + regex over the HTML, and Norli's product pages return only a client-rendered SPA shell (13 KB, `<title>Norli Bokhandel</title>`, zero `application/ld+json` or `schema.org` occurrences anywhere in the raw response). No mechanism in worker/sources.js can extract price/offer data from this without executing JS, which is out of scope.
- Alternatives: none confirmed — no affiliate-network signal in the original sweep either.
- Status: not started
- Notes: robots.txt is genuinely open (only disallows /search, /cart, /checkout, /my-account etc. — no bot names, no product-path block). Could not locate a standalone kjøpsvilkår/terms page distinct from the angrerettskjema (withdrawal-form PDF, which is silent on scraping); nothing found suggests a ToS block, so the blocker is purely technical, not legal. Spot-checked https://www.norli.no/boker/skjonnlitteratur/romaner/barcode-2 — raw HTML has no ld+json, no `__NEXT_DATA__`/`__NUXT__` blob either, confirming data loads via a later XHR/API call the current scrapeSource() doesn't follow. Would need either a headless-render step (not in this codebase) or reverse-engineering Norli's underlying product API — flag for Phase B discussion rather than building now. No category-mapping/candidate-URL work done since there's no confirmed pull mechanism yet.
