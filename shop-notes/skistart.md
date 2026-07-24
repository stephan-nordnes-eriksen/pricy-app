# Skistart

- URL: skistart.no
- Category: Sports, outdoor & cycling
- Tier: phase2a-adtraction
- Chosen method: Confirmed Adtraction per SHOP-CANDIDATES.md — cheapest
  option once the program is approved: no new code, `adtractionSource()`
  in worker/sources.js already handles per-brand XML feed parsing. Scrape
  verdict is "Unknown (no ToS found)" rather than a clean Silent/Ambiguous,
  so scraping isn't obviously safer anyway — Adtraction sidesteps that
  question entirely.
- Alternatives: first-party scrape, unverified until ToS is actually
  checked — not pursued this round since Adtraction is already confirmed
  and is the standard path (per ADTRACTION-COOKBOOK.md).
- Status: not started
- Notes: Not in ADTRACTION-COOKBOOK.md's current application list
  (Elkjøp/Komplett/NetOnNet/Dustin/Clas Ohlson/CDON/Power/Proshop) — add
  Skistart to the "apply to advertiser programs" checklist next time that
  doc is touched (Phase B or later, not this round — no shared-file edits
  this pass). Once approved: copy the feed URL, verify field names against
  the `pick(...)` candidates in `adtractionSource()`, add to
  `ADTRACTION_FEEDS` secret + `SOURCES` var. No sample feed seen yet, so
  no field-name verification possible this round.
