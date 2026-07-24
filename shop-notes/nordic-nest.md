# Nordic Nest

- URL: nordicnest.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase2a-adtraction
- Chosen method: adtractionSource() — already shipped in worker/sources.js, cheapest path once approved. SHOP-CANDIDATES.md confirms Nordic Nest is on Adtraction.
- Alternatives: none — no first-party scrape check done this round since Adtraction is strictly cheaper (no new code) once approved; could fall back to scrape if the Adtraction application stalls (SHOP-CANDIDATES.md verdict is Ambiguous, not blocked, so scrape would remain an option).
- Status: not started
- Notes:
  - Pure human/dashboard blocker, no code needed (`adtractionSource()` + `ADTRACTION_FEEDS` secret + `SOURCES` var wiring all exist and work per ADTRACTION-COOKBOOK.md).
  - Checked ADTRACTION-COOKBOOK.md's "Apply to advertiser programs" list (Part 1): Elkjøp, Komplett, NetOnNet, Dustin, Clas Ohlson, CDON, Power, Proshop. **Nordic Nest is not on that list** — it needs to be added as a new application target, it's not something already in flight per the [[adtraction-rollout]] memory note (which only tracks Proshop/Komplett/Dustin as applied-for).
  - Next human step: in the Adtraction dashboard, search the advertiser directory for "Nordic Nest" / "Nordic Nest AB" and apply to their program (same flow as the existing cookbook Part 1 list). Once approved, copy the product feed URL and follow ADTRACTION-COOKBOOK.md Part 2 (verify field names, add to `ADTRACTION_FEEDS` secret, flip into `SOURCES` in wrangler.jsonc, test, deploy).
  - **Category gap**: Nordic Nest sells Scandinavian design furniture & interior — no existing `worker/cats.json` category fits; same "Furniture" gap as JYSK/Bohus/etc. Flagging, not building. Adtraction feed rows carry their own `category`/`categoryname` field which would need a CATMAP entry (wrangler.jsonc) once a Furniture category exists.
