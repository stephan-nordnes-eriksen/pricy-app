# AktivVinter.no

- URL: aktivvinter.no
- Category: Sports, outdoor & cycling
- Tier: phase2b-other-network
- Chosen method: Confirmed on Partner-ads (per SHOP-CANDIDATES.md) —
  cheapest viable option is applying for the Partner-ads program once a
  contract exists; no adapter exists in worker/sources.js for this network
  yet (only `adtraction` and `scrape` types are wired).
- Alternatives: first-party scrape not evaluated this round — Partner-ads
  is already confirmed, so no need to chase an unverified scrape path in
  parallel.
- Status: not started
- Notes: Network = Partner-ads (partner-ads.com), a Danish affiliate
  network with NO-market shops (AktivVinter listed there). Feed-format
  docs: produktfeeds are CSV or XML, pulled via a per-advertiser URL or
  full download; official field reference at
  https://www.partner-ads.com/dk/feed_advinfo.htm (fields include Brand,
  Produktnavn, Beskrivelse, Nypris/Glpris, BilledURL — sale price vs.
  original price, not existing `pick()` synonyms, so `adtractionSource()`
  cannot be reused as-is). New code needed: a `partnerAdsSource()`
  adapter once a real sample feed is available to verify exact tag names —
  deliberately not writing speculative parsing code against an unseen
  feed, per instructions. Needs a Partner-ads publisher account/contract
  before a sample feed URL can even be pulled.
