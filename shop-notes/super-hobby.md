# Super-Hobby

- URL: super-hobby.co.no (www.super-hobby.co.no)
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD, robots.txt is Silent on product paths (only blocks Amazonbot by name + search/checkout query params). Cheapest option, no approval needed. SHOP-CANDIDATES.md's "JS-rendered ToS" note didn't block the product pages themselves.
- Alternatives: none found.
- Status: not started
- Notes: `curl https://super-hobby.co.no/robots.txt` (sandbox disabled) shows `Disallow: /` for `Amazonbot` specifically, `Allow: /` for `facebookexternalhit`, and a generic `User-agent: *` section that only blocks search/checkout/account query params — product pages (`/products/*.html`) are open, `Sitemap: https://super-hobby.co.no/sitemap.xml` is listed and live (fetched today, lastmod 2026-07-24).

  Caveat: fetching bare `https://www.super-hobby.co.no/` returned an unrelated 404 page branded "SPISELIGHAGE.NO" (a different Norwegian garden shop) — looked like the domain was dead/repurposed at first. But the sitemap and real product URLs pulled from it resolve fine on the same host, so the root path itself is just misconfigured/uncached, not the shop — don't be misled by testing `/` alone here, always hit a real product URL. Real product page `https://www.super-hobby.co.no/products/German-Infantry-WWII.html` (title "German Infantry (WWII) Italeri 6033") has confirmed `"@type": "Product"` and `"@type": "Offer"` JSON-LD blocks.

  Category mapping: plastic model kits (military, historical figures, dioramas) fit none of worker/cats.json's current categories cleanly — "Toys" is the closest existing fit (model kits are toy-adjacent) but a dedicated "Hobby"/"Models" category would be more accurate; flag for Phase B decision.

  Candidate product URLs for worker/extra.json (real, from sitemap):
  - https://www.super-hobby.co.no/products/German-Infantry-WWII.html (Italeri 6033 German Infantry WWII) — proposed id `super-hobby-italeri-6033`, cat `Toys` or new `Hobby` — spot-checked, PASS
  - https://www.super-hobby.co.no/products/Union-Artillery-Set-US-Civil-War.html (Union Artillery Set, US Civil War) — proposed id `super-hobby-union-artillery`
  - https://www.super-hobby.co.no/products/French-Artillery-Set-Napoleonic-Wars.html (French Artillery Set, Napoleonic Wars) — proposed id `super-hobby-french-artillery`
  - https://www.super-hobby.co.no/products/Celtic-Cavalry.html (Celtic Cavalry) — proposed id `super-hobby-celtic-cavalry`
  - Only the first was individually spot-checked; the rest are the same platform/template.
