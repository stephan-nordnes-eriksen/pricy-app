# Urverket.no

- URL: urverket.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase2b-other-network
- Chosen method: Tradedoubler — SHOP-CANDIDATES.md flags it "Confirmed
  Tradedoubler". No adapter exists in worker/sources.js for Tradedoubler
  yet (only `adtractionSource()` and `scrapeSource()` are implemented) —
  needs a merchant contract/program approval AND new feed-parsing code.
- Alternatives: scrape — verdict Unknown (ToS not found in
  SHOP-CANDIDATES.md's pass); didn't do a fresh recheck this round since
  Tradedoubler is already confirmed and is the more durable long-term
  source for a branded/pre-owned watch reseller (stock and pricing on
  luxury watches turns over fast).
- Status: not started
- Notes: Tradedoubler's product feed format is XML/CSV via their "MyAdvertiser"
  or "Feed Manager" portal, broadly similar in spirit to Adtraction's
  per-advertiser XML feeds — see Tradedoubler's publisher/advertiser docs
  (tradedoubler.com) for the exact schema once a program relationship
  exists; couldn't pull an authenticated sample feed without an account.
  Phase B should budget for: (1) apply to the Urverket program on
  Tradedoubler, (2) write a `tradedoublerSource()` sibling to
  `adtractionSource()` in worker/sources.js once a real feed URL/format is
  in hand.
