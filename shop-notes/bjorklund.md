# Bjørklund

- URL: bjorklund.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — SHOP-CANDIDATES.md flags "Confirmed
  Product JSON-LD", verdict Silent. No contract, no approval needed.
  Cheapest option.
- Alternatives: none found
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://bjorklund.no/sitemap.xml`); 395 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - **Category mapping**: jewelry & watches — needs the new **"Jewelry"**
    category (shared with Mestergull/David-Andersen/Pandora/Gullfunn/
    Klokker.no) — not added this round.
  - **Candidate product URLs** (real, from
    `https://www.bjorklund.no/sitemap/products-nb-no.xml`):
    - https://www.bjorklund.no/kongekjede-i-925-soelv-50-cm (silver chain)
    - https://www.bjorklund.no/slangekjede-925-soelv-40-cm
    - https://www.bjorklund.no/bybiehl-classic-halssmykke-i-gullforgylt-soelv-45mm
    - https://www.bjorklund.no/inex-soesterur-i-staal-30mm-ow69125s-ra
      (watch)
  - **JSON-LD spot-check** (kongekjede URL, 200 OK): clean flat
    `"@type":"Product"` with `offers`:
    `{"@type":"Offer","url":"…","priceCurrency":"NOK","price":4999,
    "availability":"InStock"}`. Textbook shape for scrapeSource() —
    no workaround needed, this is the simplest of the jewelry sites
    checked.
