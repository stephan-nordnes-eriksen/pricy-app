# Skruvat.no

- URL: skruvat.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase2a-adtraction
- Chosen method: Adtraction — SHOP-CANDIDATES.md flags it "Confirmed Adtraction
  (SE)". `adtractionSource()` in worker/sources.js already ships; the only
  blocker is applying for the Skruvat program in the Adtraction dashboard and
  copying the feed URL (ADTRACTION-COOKBOOK.md Part 1/2). Cheapest option —
  no code needed.
- Alternatives: scrape — verdict is Unknown (DataDome challenge), and a live
  recheck confirms it: `curl https://skruvat.no/robots.txt` and a product
  page both return a DataDome/Cloudflare-style JS challenge page, not real
  content. Not worth pursuing while the Adtraction path is free.
- Status: not started
- Notes: Skruvat isn't yet on ADTRACTION-COOKBOOK.md's advertiser
  application list (Elkjøp/Komplett/NetOnNet/Dustin/Clas Ohlson/CDON/
  Power/Proshop) — it's a SE-region program, so confirm during Phase B
  whether the existing pricy.no Adtraction channel can apply to it or needs
  a separate SE advertiser search. Add "Skruvat" to the application list
  when doing that.
