# Møbelringen

- URL: mobelringen.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real Product/Offer JSON-LD confirmed on a live product page. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `http://backend.mobelringen.no/media/sitemap/sitemaps-1-1.xml`); 371 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - **Real check performed.** robots.txt (`mobelringen.no/robots.txt`) blocks Yandex entirely, and blocks query-string filter/sort/search/account/cart paths for everyone else — plain product/category paths are open (`Allow: /`).
  - ToS (`mobelringen.no/kundeservice/kjopsbetingelser`, checked via WebFetch since curl returns a JS app-shell with a 404 "denne siden finnes ikke" body for this Next.js route): silent on scraping/crawling/bots/robots/automated access.
  - **Spot-check**: `https://www.mobelringen.no/galaxy-hjornesofa` — real, standard schema.org JSON-LD: `"@type":"Product"` with nested `Offer` (price/currency), `Brand`, `AggregateRating`. Standard shape, no gotchas — `productOffer()` should parse this cleanly.
  - Note this shop's *non-product* pages (like the ToS URL) are client-rendered Next.js and return near-empty shells to plain `curl` — but the actual product page tested came back fully server-rendered with JSON-LD present, so this doesn't block scraping the products themselves.
  - **Category gap**: sells furniture/interior — no existing `worker/cats.json` category fits (same "Furniture" gap noted for JYSK). Flagging, not building.
  - Candidate product URL for `worker/extra.json` (Phase B): `https://www.mobelringen.no/galaxy-hjornesofa` — Galaxy hjørnesofa (corner sofa), proposed `product_id: mobelringen-galaxy-hjornesofa`, cat: Furniture, icon: `sofa`, kw: sofa, hjørnesofa, modulsofa. Only one URL spot-checked this round — Phase B should pull 2-3 more via `mobelringen.no/sitemap.xml`.
