# DinSko

- URL: dinsko.no
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: First-party scrape via scrapeSource() — real, clean schema.org Product/Offer JSON-LD confirmed on a live product page (see spot-check below), NOK currency, in stock, no affiliate program on record. No contract/approval needed; scrapeSource() already exists in worker/sources.js.
- Alternatives: none found — no Adtraction/Awin/etc signal in SHOP-CANDIDATES.md's research pass.
- Status: not started
- Notes:
  - robots.txt (`curl -sL https://www.dinsko.no/robots.txt`, sandbox disabled) is essentially open: `Allow: /` for `*`, only disallows `/stage`, `/search`, `/login`, `/checkout`, `/%url%`, `/ShowProductPrint.aspx` — product/category paths are untouched. Matches SHOP-CANDIDATES.md's "Silent" verdict.
  - Spot-checked `https://www.dinsko.no/damesko/sandaler/reimsandaler/so-all-jane-sandal-sort-349295` with `curl -sL <url> | grep -iE 'ld\+json'` (sandbox disabled, real fetch, 200 OK, ~949KB HTML). Found clean `Product` JSON-LD: `{"@type":"Product","name":"Jane",...,"offers":{"@type":"Offer","priceCurrency":"NOK","price":499,"availability":"https://schema.org/InStock"},...}` plus a separate `BreadcrumbList` block (`Damesko > Sandaler > Reimsandaler > Jane`) — scrapeSource()'s `breadcrumbCat()` fallback would correctly pick "Reimsandaler" as srcCat since the last crumb equals the product name. No `Product.category` field on this shop, so category always comes from the breadcrumb fallback.
  - Category page HTML (e.g. `/herresko/sneakers/lave-sneakers`) is client-rendered (React/Apollo bundle) so product links aren't in the static page source — worked around by pulling real URLs from the shop's own Google sitemap (`/googlesitemap.axd` → sitemap index → `?SitemapType=products&page=1`, 1.3MB of real `<loc>` product URLs). Worth remembering this sitemap trick for wiring later (it's a clean, complete product-URL source, better than scraping category pages).
  - **No existing worker/cats.json category fits** (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) — this needs a new category, e.g. "Shoes", added to worker/cats.json before any worker/extra.json rows land. Not done this round.
  - Candidate worker/extra.json rows for later (all real URLs, confirmed live via the sitemap):
    - `dinsko-jane-sandal-sort` — "Jane sandal" / brand "So All" / cat "Shoes" — https://www.dinsko.no/damesko/sandaler/reimsandaler/so-all-jane-sandal-sort-349295 (JSON-LD spot-checked, see above)
    - `dinsko-lejon-bailey-sneakers-hvit` — "Bailey sneakers" / brand "Lejon" / cat "Shoes" — https://www.dinsko.no/herresko/sneakers/lave-sneakers/lejon-bailey-sneakers-hvit-334012
    - `dinsko-lejon-eli-sandal-sort` — "Eli sandal" (kids) / brand "Lejon" / cat "Shoes" — https://www.dinsko.no/barnesko/sandaler/lejon-eli-sandal-sort-300006
    - `dinsko-so-all-pumps-sort` — "Pumps" / brand "So All" / cat "Shoes" — https://www.dinsko.no/damesko/pumps/so-all-pumps-sort-331858
