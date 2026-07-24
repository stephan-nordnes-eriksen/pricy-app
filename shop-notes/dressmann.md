# Dressmann

- URL: dressmann.com
- Category: Fashion, clothing & shoes
- Tier: phase2a-adtraction
- Chosen method: Adtraction feed (`adtractionSource()` already exists and is shipped) — SHOP-CANDIDATES.md's Ingest notes say "Confirmed Adtraction" outright. Cheapest available option: no new code, just the human step (apply to the Varner/Dressmann advertiser program via Adtraction, get the feed URL into the `ADTRACTION_FEEDS` secret and a `SOURCES` entry). See ADTRACTION-COOKBOOK.md for the application flow.
- Alternatives: first-party scrape not viable — scrape verdict is "Unknown (Cloudflare 403 sitewide)", so the site itself is bot-walled even if Adtraction weren't an option.
- Status: not started
- Notes: Part of the Varner group (same as Bik Bok, Cubus, Carlings, Junkyard) — likely shares one Adtraction advertiser relationship/account across the group, worth checking during application whether one contract covers all four non-excluded Varner brands here. Scrape verdict irrelevant to this tier since Adtraction pulls from a licensed feed, not the shop's own pages.
