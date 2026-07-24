# Hi-Fi Klubben

- URL: hifiklubben.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: First-party scrape via scrapeSource() — reclassified up from SHOP-CANDIDATES.md's "Unknown (ToS unreachable)": a real check found clean Product/Offer JSON-LD, a wide-open robots.txt, and a reachable ToS with no scraping restriction. Cheaper than the already-Confirmed Adtraction (NO, 8%) route since it needs no advertiser-program approval.
- Alternatives: Confirmed Adtraction NO program (8% commission) — not yet on ADTRACTION-COOKBOOK.md's applied-for list (Elkjøp, Komplett, NetOnNet, Dustin, Clas Ohlson, CDON, Power, Proshop), so a fresh application would be needed if scrape coverage turns out insufficient (e.g. for products this shop doesn't show full JSON-LD detail on).
- Status: working — ingested for real 2026-07-24 (`node tools/crawl.mjs --shop "Hi-Fi Klubben"` → POST /api/ingest 200 `{"ok":true,"ingested":1}`, kr 3790 live on pricy.no)
- Notes:
  - Recheck done: `curl -sL https://www.hifiklubben.no/robots.txt` → `Disallow:` (empty, i.e. wide open, only a sitemap listed). WebFetch on https://www.hifiklubben.no/kundeservice/salgs-og-leveringsvillkar/ found no automated-access/bot/scraping restriction (only delivery/returns/warranty terms).
  - Category fit: **Audio** — direct match, hi-fi/headphones/speakers/amps.
  - Candidate URLs (real, WebSearch-found):
    - https://www.hifiklubben.no/sony-wh-1000xm5-traadloes-hodetelefon/sonywh1000xm5b/ — Sony WH-1000XM5 (over-ear; catalog currently only has the earbud sibling `ean-4548736143487` WF-1000XM5 — this is a different SKU, would need a new row or EAN if adding)
    - https://www.hifiklubben.no/sennheiser-hd-800-s-hodetelefon/senhd800sbk/ — Sennheiser HD 800 S
    - https://www.hifiklubben.no/sennheiser-ambeo-soundbar-soundbar-hoeyttaler/senambeosoundbar1bk/ — Sennheiser AMBEO Soundbar MAX
  - JSON-LD spot-check (curl, sandbox disabled) on the WH-1000XM5 URL: clean `@type: Product` (name, brand, images, `isSimilarTo` siblings for other colors) plus a separate `Offer`-shaped node with `priceCurrency: NOK, price: "3790", availability: InStock, itemCondition: NewCondition` (note: this shop's Offer node uses a bare `"type"` key instead of `"@type"` — harmless, since `productOffer()` in worker/sources.js matches on `offers.price` presence, not on `@type`). 3 JSON-LD blocks total on the page (Organization, Product, BreadcrumbList+ItemList graph).
  - No product_id mapping is a clean 1:1 yet — none of the 3 candidate URLs are exact-SKU matches to existing catalog rows (WH-1000XM5 is a sibling of the existing WF-1000XM5 earbuds, not the same product). Phase B should decide: add as new `extra.json` rows, or find the exact existing-EAN products (e.g. search Hi-Fi Klubben for WF-1000XM5 specifically) to feed real prices into current rows instead.
