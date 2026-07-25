# Zooservice

- URL: zooservice.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: `scrapeSource()` first-party fetch with `cfg.ua = 'browser'` — real Product/Offer JSON-LD confirmed on an actual product page, no affiliate program found. **Important gotcha:** `www.zooservice.no` 404s the default honest UA (`pricy.no price watcher (kontakt@pricy.no)`) but returns 200 with a normal browser UA — same workaround `worker/sources.js` already uses for NetOnNet (`cfg.ua = 'browser'`), not a scraping ban, just crude UA sniffing (its own robots.txt is fetchable with a browser UA and doesn't block bots by name).
- Alternatives: none confirmed on any affiliate network (no Adtraction/Awin/Partner-ads/Tradedoubler signal on homepage or product page).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://zooservice.no/sitemap.xml`); 347 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - robots.txt only resolves with a browser UA (`curl -A '<browser-UA>' https://www.zooservice.no/robots.txt`) — with the default UA the whole site 404s. Content itself only blocks account/checkout/search utility paths (`/min-side`, `/handlekurv`, `/utsjekk`, `/sok`, etc.) — no product/category disallow, no named scraper-bot block.
  - ToS (`/betingelser`, fetched with browser UA, script/style stripped before reading): standard Norwegian consumer-purchase terms (angrerett, reklamasjon, force majeure, tvister, Forbrukerkjøpsloven/Angrerettloven references). No "robot"/"crawl"/"scrape"/"automatisert" language found. Verdict: **Silent** — matches SHOP-CANDIDATES.md pass-1.
  - The root sitemap.xml is mostly CMS/template plumbing (`/template-visning`, `/vis-mal-variant-selector-...`) — real product pages are reachable by walking the category tree instead: root sitemap → category (`/akvarium/varmeelement`) → subcategory (`/akvarium/varmeelement/varmekolber-glass`) → product-detail leaf. Category slugs in the sitemap look encoding-mangled (missing ø/æ, e.g. `/akvarium/fr-til-akvariefisk`) but the real URLs work fine when followed by hand.
  - Spot-checked `https://www.zooservice.no/akvarium/varmeelement/varmekolber-glass/eheim-thermocontrol-jger-varmekolbe-25w-20-25l`: real `<script type="application/ld+json">` `Product` block — `gtin: "4011708361153"`, `sku`, `name`, `offers: [{price: "409", priceCurrency: "NOK", availability: "http://schema.org/InStock"}]`. Clean fit for the existing `productOffer()` parser, EAN available for the `eans.json`/discovery flow.
  - Category-fit: worker/cats.json currently has no pet-supplies category (Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen) — a new "Pets" category would be required regardless of tier.
  - Candidate product URLs (real, fetched):
    - https://www.zooservice.no/akvarium/varmeelement/varmekolber-glass/eheim-thermocontrol-jger-varmekolbe-25w-20-25l
    - https://www.zooservice.no/akvarium/varmeelement/varmekolber-glass/eheim-thermocontrol-varmekolbe-300w-600-1000l
    - https://www.zooservice.no/akvarium/varmeelement/varmekolber-glass/juwel-aqua-heat-varmekolbe-300w
  - Proposed product_id naming: `brand-product-slug` derived from the JSON-LD `name` (e.g. `eheim-thermocontrol-jager-varmekolbe-25w`), since `gtin` is present here and should route through the `eans.json`/D1 `eans` table auto-discovery instead of a hand-picked id where possible.
