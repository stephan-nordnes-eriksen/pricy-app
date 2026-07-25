# Zoobutikken

- URL: zoobutikken.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape — robots.txt is Silent for us (only names AhrefsBot/SemrushBot/MJ12bot/dotbot, explicitly `Allow: /` for Googlebot, blocks only `/admin`, `/kvittering` (receipt), `/kasse_*` (checkout) — no ban on our UA or on product/category paths). ToS page (`/vilkar`) returned 200 with no extractable body text and no bot/scrape language found. Spot-checked a real product page (`https://www.zoobutikken.no/produkt/katt/kattesnacks/churu-tunfisk-varianter-40stk`, from the real sitemap.xml) — genuinely server-rendered (118 KB, correct `<title>`), but has **no** `application/ld+json` at all. It does carry `itemtype="http://schema.org/Product"` microdata **and** `<meta property="product:price:amount" content="399.00">` — real, usable product/price data, just not in the JSON-LD shape `productOffer()` currently parses. Needs a small scrapeSource() extension (microdata `itemtype=Product` or OG `product:price:amount` fallback) before onboarding — same gap as dyrekassen.no/petxl.no, different platform.
- Alternatives: none confirmed on any affiliate network.
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Aquariums, nosework, pet supplies. No existing pricy.no category fits; needs a new "Pets" category. Candidate URL for Phase B: https://www.zoobutikken.no/produkt/katt/kattesnacks/churu-tunfisk-varianter-40stk (sitemap.xml has many more, organized under /butikk/{hund,katt,smadyr,fiskakvarium}/...).
