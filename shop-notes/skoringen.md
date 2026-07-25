# Skoringen

- URL: skoringen.no
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: `scrapeSource()` — real recheck confirms clean, working `Product`/`Offer` JSON-LD, clean robots.txt. No approval needed, cheapest tier. **Gotcha found**: `priceCurrency` on this shop's pages is the lowercase string `"nok"`, not `"NOK"`. `scrapeSource()`'s check `if (currency && currency !== 'NOK') throw` is case-sensitive — as written today it would treat every real Skoringen offer as "wrong currency" and silently drop every price. Phase B needs a one-line case-insensitive compare (or `.toUpperCase()`) before this shop can actually ingest anything, otherwise it'll look wired but ingest zero rows.
- Alternatives: no affiliate-network signal found (Ingest notes: Unknown).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.skoringen.no/product-sitemap.xml`); 373 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - **Real recheck done** (Ingest notes were Unknown; scrape verdict Silent already, confirmed).
  - `robots.txt` (sandbox disabled): `Allow: /`, disallows only `/globale-spots*`, `/campaigns*`, `/segments*`, `/highlighted-products*`, `/forfattere*`, `/dk/`, `/no/`. That last pair looks alarming at first glance but is a false alarm: real product URLs (confirmed via the shop's own `product-sitemap.xml`) live at the domain root, e.g. `skoringen.no/odiin-herresko-brun-1211100230`, not under a `/no/` path prefix — so the disallow doesn't touch them. (`/dk/`/`/no/` are likely leftover from a shared multi-country platform template.)
  - JSON-LD spot-check (`https://www.skoringen.no/odiin-herresko-brun-1211100230?productid=1211100230`): 3 blocks — `FAQPage`, a flat `Product` with `offers` (this is what `productOffer()` will use), and `Organization`. Raw offer fields: `"priceCurrency":"nok"`, `"price":"999.00"` — confirmed the lowercase casing directly in the raw JSON text, not just via a Python dict print.
  - **New category needed**: "Shoes", same as DinSko/Skomani.
  - Candidate `worker/extra.json` rows (real URLs from `product-sitemap.xml`):
    1. `skoringen-odiin-herresko-brun` — brand Odiin, cat Shoes — https://www.skoringen.no/odiin-herresko-brun-1211100230?productid=1211100230 (JSON-LD spot-checked above)
    2. `skoringen-odiin-lett-herresko-svart` — brand Odiin, cat Shoes — https://www.skoringen.no/odiin-lett-herresko-svart-1213500210?productid=1213500210
    3. `skoringen-tommy-hilfiger-kraftig-herresko` — brand Tommy Hilfiger, cat Shoes — https://www.skoringen.no/tommy-hilfiger-kraftig-herresko-blaa-fm0fm04818dw5?productid=1613511150
    4. `skoringen-tommy-hilfiger-canvas-sneakers` — brand Tommy Hilfiger, cat Shoes — https://www.skoringen.no/tommy-hilfiger-canvas-sneakers-blaa-fm0fm05688dw5?productid=1616112050
