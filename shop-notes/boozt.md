# Boozt.com

- URL: boozt.com
- Category: Fashion, clothing & shoes
- Tier: phase2b-other-network
- Chosen method: Awin — SHOP-CANDIDATES.md's Ingest notes say "Awin affiliate". No Awin adapter exists yet in `worker/sources.js` (only `adtractionSource()`/`scrapeSource()`) — needs a merchant contract (advertiser program application) AND new parsing code once a real feed sample is available. Nothing to build in code this round.
- Alternatives: no confirmed Product JSON-LD signal recorded (scrape verdict is Ambiguous, not Silent), so first-party scrape isn't a documented fallback this round.
- Status: not started
- Notes: Premium multi-brand fashion & footwear. Awin feed-format docs weren't found this round (would need a merchant login to pull a real datafeed spec/sample — no speculative parsing code written against an unseen format, per instructions). Same corporate group as Booztlet (Nordic outlet arm) — likely one Awin merchant relationship could cover both, worth checking during application.
