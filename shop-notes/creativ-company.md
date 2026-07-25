# Creativ Company (CC Hobby)

- URL: cchobby.no (www.cchobby.no)
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD, robots.txt is Silent on product paths (Magento boilerplate: search/checkout/customer paths only), ToS page (handelsbetingelser) has no scraping/automation clause. Cheapest option, no approval needed. SHOP-CANDIDATES.md's "bot-detection wall" note didn't reproduce with a plain curl this round.
- Alternatives: none found.
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes: `curl https://www.cchobby.no/robots.txt` (sandbox disabled) is standard Magento — disallows `/checkout/`, `/customer`, `/catalogsearch`, `/clerk/search/` etc., product pages open. WebFetch of `cchobby.no/handelsbetingelser` (terms) found no automated-access/bot/scraping mention — only orders/payment/returns/privacy/cookies. Real product page `https://www.cchobby.no/creativ-kartong-a4-ark-210x297-mm-180-g-ass-farger-30-ass-ark-1-pk` has clean JSON-LD:
  `{"@type":"Product","name":"Creativ Kartong...","offers":{"@type":"http://schema.org/Offer","price":69.95,"priceCurrency":"NOK","availability":"http://schema.org/InStock"}}` — note the `@type` values are full schema.org URIs rather than bare strings (`"http://schema.org/Offer"` not `"Offer"`), but `productOffer()` in worker/sources.js only checks for `o.price != null`, not the `@type` string, so this parses fine as-is.

  Category mapping: scrapbooking/paper-craft/hobby supplies fit none of worker/cats.json's current categories — needs a new "Hobby"/"Crafts" category + worker/extra.json rows.

  Candidate product URLs for worker/extra.json (real, from category browse):
  - https://www.cchobby.no/creativ-kartong-a4-ark-210x297-mm-180-g-ass-farger-30-ass-ark-1-pk (Creativ Kartong A4 180g) — proposed id `cc-kartong-a4-180g`, cat `Hobby` (new) — spot-checked, PASS
  - https://www.cchobby.no/mini-diy-kit-kreppapir-kreppblomster-pastellfarger-1-pk (Mini DIY Kit Kreppapir, crepe flowers) — proposed id `cc-diy-kreppblomster`
  - https://www.cchobby.no/vellumpapir-a4-ark-210x297-mm-100-g-rahvit-10-ark-1-pk (Vellumpapir A4 100g) — proposed id `cc-vellumpapir-a4`
  - https://www.cchobby.no/designpapir-i-blokk-ark-15-2x15-2-cm-120-g-mintgronn-lilla-50-ark-1-pk (Designpapir i blokk) — proposed id `cc-designpapir-blokk`
  - Only the first was individually spot-checked for JSON-LD; the rest are the same Magento template so high confidence but unverified.
