# Rum21

- URL: rum21.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none confirmed yet — see notes
- Alternatives: first-party scrape (SHOP-CANDIDATES.md verdict Silent; robots.txt confirmed open — `Allow: /`, only a sitemap pointer, nothing disallowed) is the likely cheapest real option here, not checked for JSON-LD this round.
- Status: wired but not yet ingested — `$discover` entry present in `tools/crawl-urls.json` (sitemap `https://www.rum21.no/sitemap.xml`), but the 2026-07-25 full crawl got no rows from it (the run logged a rate-limit/403 on the sitemap fetch). Retry it on its own with `node tools/crawl.mjs --shop "Rum21"`.
- Notes:
  - **Real check performed**: SHOP-CANDIDATES.md's own row for Rum21 says "Same corp family as RoyalDesign" but does NOT itself claim "Confirmed" on any network (unlike RoyalDesign's "Confirmed intl. affiliate"). Verified via WebFetch of `rum21.no/om-oss`: confirmed Rum21 is legally part of **Royal Design Group AB** (same parent as RoyalDesign.no, "med butikker som RoyalDesign.no"). But shared ownership doesn't guarantee shared affiliate-network enrollment for pricy.no's purposes — [[royaldesign]]'s own network is itself unconfirmed this round (see that note), so there's nothing concrete to inherit here yet.
  - No affiliate tracking-pixel domains found on the Rum21 homepage (same caveat as RoyalDesign — these normally only fire post-purchase, so absence isn't conclusive).
  - **Recommendation**: whichever network Phase B confirms for RoyalDesign, check Rum21's presence in that same network's advertiser directory before assuming — don't wire it on the assumption alone.
  - Since first-party scrape is Silent/open and no code exists for either path yet, this could plausibly become `phase1-scrape` on a real JSON-LD spot-check — that check wasn't done this round (out of scope, this shop was scoped as "check if it shares RoyalDesign's network", not as a scrape candidate). Flagging for Phase B to do a quick product-page JSON-LD check the same way as [[mobelringen]]/[[fagmobler]] before deciding between phase1-scrape and phase2b-other-network.
  - **Category gap**: furniture, lighting & interior — same "Furniture" gap as the rest of this batch.
