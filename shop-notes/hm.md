# H&M

- URL: www2.hm.com/no_no
- Category: Fashion, clothing & shoes
- Tier: phase2b-other-network
- Chosen method: Awin (or Sovrn) — SHOP-CANDIDATES.md's Ingest notes say "Awin/Sovrn affiliate" (two networks named, unconfirmed which is live for NO specifically). No adapter exists yet in `worker/sources.js` for either network — needs a merchant contract AND new parsing code once a real feed sample is available, and confirming which of the two programs actually covers the NO storefront.
- Alternatives: first-party scrape not viable — scrape verdict is "Unknown (Akamai WAF 403 sitewide)", so the site is bot-walled regardless of network choice.
- Status: not started
- Notes: One of the largest shops on the list by volume — worth prioritizing the network confirmation (Awin vs Sovrn) early in Phase B since it'll gate which feed-parsing code gets written. Scrape verdict irrelevant to this tier since the chosen method doesn't touch the site.
