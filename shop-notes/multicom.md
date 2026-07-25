# Multicom

- URL: multicom.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: First-party scrape via scrapeSource() — Product JSON-LD confirmed, robots.txt only blocks one unrelated category (`/*cat-c/c90262`), ToS has no automation restriction. No approval needed, cheapest option and only option found.
- Alternatives: none found — no affiliate-network signal in SHOP-CANDIDATES.md ("Unknown" ingest notes).
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - Recheck done: WebFetch on https://www.multicom.no/pages/terms found no bot/crawler/scraping restriction. `curl -sL https://www.multicom.no/robots.txt` (note: bare `multicom.no` redirects — use `www.`) shows only `Disallow: /*cat-c/c90262` (+ wildcard) and a sitemap link — product/category paths in general are open.
  - Category fit: **Computers** — Multicom sells PC components (GPUs, CPUs, RAM, motherboards). The current catalog has no discrete GPU/component rows, so this would need new `worker/extra.json` entries — flagging, not acting.
  - Candidate URLs (real, WebSearch-found, all GPUs):
    - https://www.multicom.no/palit-geforce-rtx-4070-super/cat-p/c/p1004474207 — Palit GeForce RTX 4070 SUPER Dual 12GB
    - https://www.multicom.no/asus-dual-geforce-rtx-4070/cat-p/c/p1003802891 — ASUS Dual GeForce RTX 4070 12GB
    - https://www.multicom.no/inno3d-geforce-rtx-4070-ti/cat-p/c/p1003478565 — INNO3D GeForce RTX 4070 Ti 12GB
  - JSON-LD spot-check (curl, sandbox disabled) on 3 of the above URLs: all return a clean `@type: Product` node (name/sku/mpn/gtin13/brand/image) but **the nested `offers` object has NO `price` field on any of them** — only `url`, `availability: PreOrder`, `itemCondition: NewCondition`. All three checked happened to be in `PreOrder` availability state; scrapeSource() would throw `no JSON-LD offer price` and drop these specific rows (freezing, not erroring the shop). **Before wiring, re-check an in-stock (non-PreOrder) Multicom product** to confirm price does appear when stock is available — untested whether the price omission is PreOrder-specific or shop-wide.
  - No product_id mapping proposed — GPUs aren't in the catalog today; Phase B would need new `extra.json` rows first.
