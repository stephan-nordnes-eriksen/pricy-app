# Skousen

- URL: skousen.no
- Category: Electronics & computers / appliances
- Tier: phase2a-adtraction
- Chosen method: Confirmed Adtraction (DK program) per SHOP-CANDIDATES.md, Silent scrape verdict. adtractionSource() already exists and is shipped — nothing to build, only the human apply/feed-URL step is outstanding.
- Alternatives: First-party scrape wasn't ruled out — robots.txt is genuinely open (only blocks `/api/`, `/next-api/`, `/pimberly/`, `/cart_display/`, `/checkout`, `/search_result/`, `/cdn-cgi/`; a `Content-Signal: ai-train=no` line is an AI-training opt-out, not a scraping restriction) — but no real product-page URL was found in this pass to confirm JSON-LD shape, so Adtraction (already confirmed working elsewhere in this codebase) stays the safer pick. Worth a scrape recheck in Phase B if the Adtraction application stalls.
- Status: not started
- Notes: Not yet on ADTRACTION-COOKBOOK.md's applied-for list (Elkjøp, Komplett, NetOnNet, Dustin, Clas Ohlson, CDON, Power, Proshop) — a fresh advertiser-program application is needed. `curl -sL https://www.skousen.no/robots.txt` confirmed (real check, sandbox disabled): no disallow on product/category paths, sitemap at `https://www.skousen.no/seo/sitemap-skouno-index.xml`.
