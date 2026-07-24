# RoyalDesign

- URL: royaldesign.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase2b-other-network
- Chosen method: affiliate feed via whichever network they're actually on — SHOP-CANDIDATES.md tags them "Confirmed intl. affiliate" but the specific network could not be pinned down this round (see Notes). No adapter exists in worker/sources.js for anything but Adtraction, so this needs both a contract and new parsing code regardless of which network it turns out to be.
- Alternatives: first-party scrape — SHOP-CANDIDATES.md verdict is Silent (not blocked), and robots.txt (`royaldesign.no/robots.txt`, checked: `Allow: /`, only a sitemap pointer) confirms nothing is disallowed. Scraping was NOT spot-checked this round since the task scoped RoyalDesign as the phase2b research target, but it's a live fallback worth a quick JSON-LD check in Phase B if the affiliate network hunt stalls.
- Status: not started
- Notes:
  - **Network unconfirmed**: checked royaldesign.no's homepage HTML and cookie-policy path for the three usual telltales — (1) affiliate tracking-pixel domains (`awin1.com`, `tradedoubler.com`, `partner-ads.com`, `adtraction.com`, etc.) grepped from the homepage source: none found (expected — these only fire on the order-confirmation page, not the homepage, so absence here isn't conclusive). (2) `/cookies` policy page: 404. (3) Footer "affiliate"/"partner" program links: none found. Site uses OneTrust for consent management (no info there either). WebSearch budget was exhausted for this session before this could be searched externally.
  - **Recommendation for Phase B**: search for "RoyalDesign affiliate program" directly (Awin advertiser directory search, or check if royaldesign.com/UK site has a clearer "Affiliates" footer link than the .no site did), or just ask Adtraction/Awin account reps directly since pricy.no already has an Adtraction account and would need an Awin one regardless.
  - **Category gap**: design furniture, lighting, garden — no existing `worker/cats.json` category fits; same "Furniture" gap flagged across this batch.
  - See [[rum21]] — same corporate group (Royal Design Group AB), but do not assume they share network enrollment; confirmed independently.
