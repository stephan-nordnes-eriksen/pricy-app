# VetZoo.no

- URL: vetzoo.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: first-party scrape of `/produkt/<slug>-P<id>` pages — no
  affiliate-network signal found and ToS/robots are clean, so scraping own
  pages is the least-manual option. Caveat: the current `scrapeSource()` /
  `productOffer()` in worker/sources.js only reads schema.org JSON-LD, and
  VetZoo product pages carry **no JSON-LD at all** (confirmed by grep: zero
  `application/ld+json`, zero `@type` matches, no `og:` meta tags either).
  Price data does exist on the page, embedded in a different inline JSON
  blob (`"currentPrice"`/`"listPrice"` keys visible via grep, react-helmet-
  managed meta tags for description/theme-color only). Phase B would need a
  small custom extractor for this shop rather than reusing `productOffer()`
  as-is.
- Alternatives: none — no Adtraction/Awin/Partner-ads/Tradedoubler signal
  found in homepage or product-page HTML (matches pass 1's "Unknown").
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - robots.txt: `Allow: /` with only `Disallow` on `?size=`, `?color=`,
    `?q=` filter query strings — product/category paths themselves are
    open. The linked sitemap (`sitemap_index.xml`) is actually broken
    (returns a Demandware "Pipeline not found (SiteMap)" error page) but
    the storefront itself (`vetzoo.no/kategori/*`, `/produkt/*`) serves
    fine over plain curl — this is a Salesforce Commerce Cloud
    (Demandware) site.
  - ToS checked: `/vilkar` and `/abonnementsvilkar` — cover shipping,
    returns, payments, subscriptions, refunds, cookies; no automation/bot/
    crawler/scraper/robots language anywhere. Silent, not Ambiguous or
    Prohibited.
  - Technical check: `/kategori/hund-1` and `/kategori/hund/hundemat-11`-
    style pages served real HTML with dozens of genuine
    `/produkt/<slug>-P<id>` links (brand names, sizes as query params).
    Fetched `/produkt/royal-canin-medium-adult-torrfor-til-hund-P001398`
    directly: 200 OK, ~950KB HTML, zero JSON-LD/schema.org markup, but
    `currentPrice`/`listPrice` keys present in an embedded JSON blob — real
    price data is there, just not in the shape `scrapeSource()` currently
    parses.
  - Candidate product URLs (verified reachable, real listings as of
    2026-07-24):
    - https://www.vetzoo.no/produkt/royal-canin-medium-adult-torrfor-til-hund-P001398
    - https://www.vetzoo.no/produkt/eukanuba-dog-everyday-adult-large-16-5-kg-P142128
    - https://www.vetzoo.no/produkt/hills-prescription-diet-canine-zd-food-sensitivities-original-P156168
    - https://www.vetzoo.no/produkt/pala-3beef-salmon-lufttorket-kornfritt-hundefor-P204188
  - Proposed product_id scheme: `<brand>-<slug>` derived from the product
    name (e.g. `royal-canin-medium-adult-torrfor-til-hund`), matching the
    style of hand-added rows elsewhere in the catalog — no shop prefix,
    since the same food/SKU could later show up at another pet shop and
    should dedupe the same way EAN-matched rows do.
  - Category-fit: worker/cats.json currently has Audio/Phones/TV/
    Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen — none cover
    pet supplies. A new "Pets" category would be required regardless of
    tier if VetZoo is ever onboarded.
