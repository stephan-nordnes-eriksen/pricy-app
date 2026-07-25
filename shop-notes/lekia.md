# Lekia.no

- URL: lekia.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape (scrapeSource(), no code changes needed) — real check confirms JSON-LD is present. robots.txt (checked live) is empty except a sitemap directive — Silent, matches SHOP-CANDIDATES.md. Fetched the `/kundeservice/generelle-vilkar` terms page and grepped for scrap/crawl/robot/automat — no hits, no automation ban. Fetched a real product page (leketoy/sport/fifa-ballers-series-1-samlefigur) and confirmed two `application/ld+json` blocks with `Product`, `Offer`, `Brand`, `MonetaryAmount`, `MerchantReturnPolicy`, `PeopleAudience` — exactly what `productOffer()` in worker/sources.js already parses. Ready to build in Phase B with zero parser changes.
- Alternatives: none needed.
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://lekia.no/sitemap.axd`); 349 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: Toys — maps directly to the existing "Toys" pricy.no category. Candidate product/category URLs: lekia.no/leketoy/sport/fifa-ballers-series-1-samlefigur, /varemerker/lego, /leketoy/utelek, /leketoy/spill.
