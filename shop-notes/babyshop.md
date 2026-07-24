# Babyshop

- URL: babyshop.com
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase2a-adtraction
- Chosen method: Adtraction (adtractionSource() already shipped) — SHOP-CANDIDATES.md confirms both Adtraction AND Awin for this shop; Adtraction is the lower-effort path since worker/sources.js already parses that feed format, so pick it over building a new Awin adapter. Scrape verdict is Unknown (Cloudflare challenge blocks automated checks), so scraping isn't a realistic near-term option regardless.
- Alternatives: Awin (confirmed program alongside Adtraction) — would need a new Awin feed adapter in worker/sources.js; not worth building while Adtraction covers the same shop.
- Status: not started
- Notes: Kids fashion & baby equipment — no existing pricy.no category fits (clothing + baby gear, not Toys/Home/etc.); would need a new category if onboarded. Cloudflare challenge blocks any scrape-verification attempt, reinforcing that Adtraction is the only realistic path here.
