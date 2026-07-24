# 24hshop.no

- URL: 24hshop.no
- Category: Electronics & computers / appliances
- Tier: phase2a-adtraction
- Chosen method: Adtraction. SHOP-CANDIDATES.md lists this shop as "Confirmed Adtraction" with no confirmed Product JSON-LD on its own pages, so per the tiering rule it doesn't independently qualify for phase1-scrape without a fresh JSON-LD check — going straight to the already-shipped `adtractionSource()` path is the least-manual option given the data at hand.
- Alternatives: scrapeSource() is plausible (robots.txt is wide open, `Disallow:` empty for all UAs) but unconfirmed — a Phase B recheck of a real product page's JSON-LD could promote this to phase1-scrape instead, which needs no advertiser approval.
- Status: not started
- Notes: robots.txt checked live (`curl https://www.24hshop.no/robots.txt`, sandbox disabled) — `User-agent: * / Disallow:` (nothing blocked). Not on ADTRACTION-COOKBOOK.md's applied-for list yet (that list currently only covers Elkjøp, Komplett, NetOnNet, Dustin, Clas Ohlson, CDON, Power, Proshop) — a fresh Adtraction advertiser application is needed for this shop specifically. Sells mobile/tablet accessories (cases, chargers, screen protectors) — real product pages found via search, e.g. `https://www.24hshop.no/mobiltilbehor/mobildeksel/iphone/iphone-17/sttsikkert-skall-for-iphone-17-transparent` — not spot-checked for JSON-LD since this round is scoped to phase2a wiring prep, not scrape verification.
