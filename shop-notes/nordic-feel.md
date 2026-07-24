# Nordic Feel

- URL: nordicfeel.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase2b-other-network
- Chosen method: Sovrn Commerce — SHOP-CANDIDATES.md lists Nordic Feel as
  "Confirmed affiliate program (Sovrn Commerce + affi.io)." Researched both
  names this round (WebSearch, not just ToS check, since the tier hinges on
  whether this is a real adapter path):
  - **affi.io** is just a directory/aggregator site that lists third-party
    affiliate programs (e.g. it has listing pages for "Afilio" and
    "Effinity" programs) — it is not itself a network with a feed API, so
    it's not a wiring target.
  - **Sovrn Commerce** (formerly VigLink) is the real network here: a
    content-monetization/affiliate platform with its own Merchant Update,
    Link, and Real-Time Reports APIs (see knowledge.sovrn.com). It is
    genuinely distinct from Awin, Partner-ads, and Tradedoubler — no
    existing adapter in worker/sources.js covers it (only `adtraction` and
    `scrape` exist). Building it needs both a Sovrn Commerce
    publisher/API contract AND new code (a `sovrnSource()` alongside
    `adtractionSource()`), so this is squarely phase2b, not phase2a.
  - Feed-format docs found: https://knowledge.sovrn.com/kb/api-implementation-with-commerce
    and https://knowledge.sovrn.com/kb/api-onboarding-guide-for-commerce
    (Merchant Update API: merchant rates/status/descriptions;
    Real-Time Reports API: per-transaction data) — worth reading closely in
    Phase B before designing the adapter, since Sovrn's APIs look
    performance/reporting-oriented (sub-affiliate/cashback use case) rather
    than a straightforward per-product price+EAN feed like Adtraction's XML
    — may need a different data shape than `adtractionSource()`'s row
    contract, or may not expose a raw catalog feed at all (worth confirming
    before committing to build).
- Alternatives: First-party scrape (scrapeSource()) as a stopgap if the
  Sovrn Commerce feed turns out not to carry per-product pricing/EAN data —
  scrape verdict is "Unknown (host blocked by fetch tool as unverified/
  unsafe — needs manual browser check)" per SHOP-CANDIDATES.md, not
  rechecked live this round (tier already determined by the confirmed
  affiliate signal per task rules — phase2b shops don't require the
  needs-recheck curl/WebFetch pass).
- Status: not started
- Notes: Same underlying shop as Blush (blush.no 301s here) — do not
  double-count; Blush's note (shop-notes/blush.md) points back to this
  file. No robots.txt/ToS curl performed this round since the tier is
  already fixed by the confirmed-affiliate-program signal; if Phase B
  decides Sovrn Commerce isn't viable as a real feed adapter and falls back
  to scrape, that unknown scrape verdict should get a real recheck first.