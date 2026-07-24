# Vitusapotek

- URL: vitusapotek.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: first-party scrapeSource() off Product JSON-LD — no contract, no approval, code already exists
- Alternatives: none found (no affiliate-network signal for this shop)
- Status: not started
- Notes: Real check done (not just the table). `curl -sL
  https://www.vitusapotek.no/robots.txt` (unsandboxed) is Silent: only
  `Disallow: /cart`, `/checkout`, `/api` — product/category paths are open.
  WebFetched `vitusapotek.no/c/salgsbetingelser/a/A74023` — covers minors,
  binding orders, delivery/PostNord/Helthjem — no automated-access/scraping/
  bot clause. Spot-checked a real product page (unsandboxed curl, HTTP 200):
  `https://www.vitusapotek.no/kosthold-og-kosttilskudd/vitaminer/vitamin-d/m%C3%B6ller's-pharma-d-vitamin-40%C2%B5g-150-tabletter-150-stk/p/909223`
  — server-rendered, contains `application/ld+json` with `"@type":"Product"`.
  scrapeSource()'s generic `productOffer()` parser should pick this up
  cleanly (standard commerce-platform shape, not the NetOnNet
  priceSpecification-nesting oddity).

  No existing worker/cats.json category fits (Audio, Phones, TV,
  Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) — this
  needs a new category, e.g. `"Beauty"` or `"Health"`, + worker/extra.json
  rows before any wiring. Candidate products (all real, live URLs, all
  vitamins/supplements — no prescription meds, which is the right subset to
  price-compare anyway):
  - `moller-pharma-d-vitamin-40ug-150` — https://www.vitusapotek.no/kosthold-og-kosttilskudd/vitaminer/vitamin-d/m%C3%B6ller's-pharma-d-vitamin-40%C2%B5g-150-tabletter-150-stk/p/909223 (spot-checked, JSON-LD confirmed)
  - `nycoplus-d3-vitamin-20ug-100` — https://www.vitusapotek.no/kosthold-og-kosttilskudd/vitaminer/vitamin-d/nycoplus-d3-vitamin-20-%C2%B5g-100-tabletter-100-stk/p/904166
  - `vidi-pluss-vitamin-d-40mcg-100` — https://www.vitusapotek.no/kosthold-og-kosttilskudd/vitaminer/vitamin-d/vidi-pluss-vitamin-d-40mcg-100-tabletter-100-stk/p/809146
  - `vidi-pluss-multivitamin-100` — https://www.vitusapotek.no/kosthold-og-kosttilskudd/vitaminer/multivitamin/vidi-pluss-multi-vitamin-&-mineral-100-tabletter-100-stk/p/851965

  Proposed extra.json shape (illustrative, cat pending the new registry entry):
  `{id:"moller-pharma-d-vitamin-40ug-150", name:"Möller's Pharma D-vitamin 40µg 150 tabletter", brand:"Möller's", cat:"Beauty", icon:"pill", kw:["vitamin d","kosttilskudd"]}`.
