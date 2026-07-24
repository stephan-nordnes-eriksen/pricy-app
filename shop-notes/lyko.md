# Lyko

- URL: lyko.com/no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase2a-adtraction
- Chosen method: Adtraction — SHOP-CANDIDATES.md marks Lyko "Confirmed
  Adtraction," and `adtractionSource()` in worker/sources.js is already
  shipped and generic (XML per-brand feed, field-name candidates via
  `pick()`). Nothing to build in code: this is purely the human step of
  applying to Lyko's advertiser program in the Adtraction dashboard and
  copying the product feed URL (see ADTRACTION-COOKBOOK.md Part 1/2).
  Cheapest option — no scrape verdict needed since the network path exists
  and needs no new code.
- Alternatives: Scrape verdict is Ambiguous (generic copyright-style clause,
  no explicit scraping ban) — first-party scrape via scrapeSource() would
  also be viable if Adtraction approval stalls, but Adtraction is strictly
  less manual (no page-by-page URL curation, feed self-updates prices for
  the whole catalog).
- Status: not started
- Notes: ADTRACTION-COOKBOOK.md's current apply-for list (Elkjøp, Komplett,
  NetOnNet, Dustin, Clas Ohlson, CDON, Power, Proshop) does NOT include
  Lyko — this is a new advertiser application, not something already
  in flight. Once approved: verify field names against the `pick()`
  candidates in adtractionSource() (ean/gtin/gtin13/barcode,
  price/priceinclvat, instock/availability/stock,
  trackingurl/producturl/url/deeplink) with
  `curl -s "<feed-url>" | head -c 4000`, same as any other Adtraction shop.
  No live check performed this round beyond what SHOP-CANDIDATES.md already
  recorded, since "Confirmed Adtraction" needs no recheck per the task
  tiering rules.