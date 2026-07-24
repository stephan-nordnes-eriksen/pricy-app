# Junkyard

- URL: junkyard.no
- Category: Fashion, clothing & shoes
- Tier: phase2a-adtraction
- Chosen method: Adtraction feed (`adtractionSource()` already exists) — SHOP-CANDIDATES.md's Ingest notes say "Varner/Adtraction" (same Varner group as Dressmann, whose row is worded "Confirmed Adtraction"). No new code needed, just the human step: confirm/apply for this brand's advertiser listing under the shared Varner Adtraction account and get its feed URL.
- Alternatives: first-party scrape not viable — scrape verdict is "Unknown (Cloudflare 403 sitewide)".
- Status: not started
- Notes: Same caveat as Cubus/Carlings — wording is "Varner/Adtraction" not an explicit "Confirmed", verify this brand's own feed exists under the shared Varner account before assuming it's automatic. Junkyard sells streetwear/sneakers specifically, worth checking whether its feed overlaps in EANs with other sneaker-carrying shops already on Adtraction (e.g. Sportamore) for dedup via the `eans` table.
