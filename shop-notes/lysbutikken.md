# Lysbutikken

- URL: lysbutikken.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD with NOK prices, robots.txt fully open. No approval needed.
- Alternatives: none found.
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes: Real recheck done (was "Unknown" ingest note, Silent verdict — confirmed Silent holds).
  - `curl https://www.lysbutikken.no/robots.txt` → `Allow: /`, `Crawl-delay: 3` (be polite, but nothing disallowed).
  - Spot-checked `https://www.lysbutikken.no/mira-gulvlampe`: JSON-LD has `"@type":"Product"`, `"@type":"Offer"` (x2 — likely variant pricing), `"price":"2409.00"`/`"1699.00"`, `"priceCurrency":"NOK"`. Clean match.
  - Fetched `lysbutikken.no/info_betingelser` (terms page) — no scrape/crawl/bot/automat clause.
  - Category mapping: lighting/lamps — doesn't fit any existing worker/cats.json category. Flagging a new "Lighting" category (shared candidate with Lampan.no and Christiania Belysning below) + worker/extra.json rows, not adding it.
  - Candidate product URLs (real, JSON-LD confirmed on the first):
    - `https://www.lysbutikken.no/mira-gulvlampe` (Markslöjd floor lamp) — proposed `product_id: markslojd-mira-gulvlampe`, `cat: Lighting(new)`
    - `https://www.lysbutikken.no/multi-vegglampe-med-dimmer-hylle-og-usb` (Markslöjd wall lamp w/ USB)
    - `https://www.lysbutikken.no/expand-2-x-e27-taklampe-50-cm-sort` (Markslöjd ceiling lamp)
