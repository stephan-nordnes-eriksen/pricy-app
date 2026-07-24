# Miinto.no

- URL: miinto.no
- Category: Fashion, clothing & shoes
- Tier: phase2b-other-network
- Chosen method: Awin — SHOP-CANDIDATES.md's Ingest notes say "Awin affiliate", scrape verdict Silent. Listed in SHOP-CANDIDATES.md's own "Confirmed affiliate network, Silent/Ambiguous" best-next-candidates shortlist. No Awin adapter exists yet in `worker/sources.js` — needs a merchant contract AND new parsing code once a real feed sample is available.
- Alternatives: scrape verdict is Silent, but no confirmed Product JSON-LD signal was recorded — worth a real JSON-LD spot-check in a later round if Awin approval stalls (a multi-boutique marketplace like this may have inconsistent JSON-LD across sub-sellers, worth verifying on more than one product before trusting it at scale).
- Status: not started
- Notes: Multi-boutique fashion marketplace — Awin feed-format docs weren't found this round; if/when applied for, check whether the feed carries a per-boutique seller field (relevant for `srcCat`/dedup logic later).
