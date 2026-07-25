# Devold

- URL: devold.com
- Category: Fashion, clothing & shoes
- Tier: needs-recheck
- Chosen method: none yet — real recheck found the site is clean (robots/ToS) but genuinely lacks any schema.org `Product` JSON-LD to scrape with the existing `scrapeSource()`. Not a quick-fix gap like KappAhl/Skomani's `hasVariant` case — would need bespoke parsing of the site's Next.js `__NEXT_DATA__` JSON blob, which is a real (if small) engineering task, not zero-effort. Recording as needs-recheck rather than phase1-scrape since the shipped code genuinely won't ingest this shop as-is.
- Alternatives: no affiliate-network signal found either (Ingest notes: Unknown) — nothing cheaper on offer this round.
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/*/checkout, /*/myaccount, /*/cart, /*/basket). Not crawled, not wired.
- Notes:
  - **Real recheck done** (Ingest notes/scrape verdict were both Unknown/Ambiguous).
  - `robots.txt` (sandbox disabled): only disallows account/cart/wishlist/search/login/registration paths — no product/category block, no named bots. Has locale-specific product sitemaps (`sitemaps/product-sitemap_nb-no.xml`, confirming a real NO product catalog with URLs like `devold.com/nb-no/produkt/nansen-refined-sweater-tc786550a/`).
  - ToS: link not found in the server-rendered homepage HTML (the footer is client-rendered by the Next.js app, so a plain `curl` sees no ToS link) — not chased further given the scrape-parsing gap already rules this out for this round.
  - JSON-LD spot-check (`https://www.devold.com/nb-no/produkt/nansen-refined-sweater-tc786550a/`, real product from the shop's own sitemap): **zero** `application/ld+json` blocks anywhere on the page (confirmed by counting matches, not just grepping the first hit). The page does carry a `<script id="__NEXT_DATA__" type="application/json">` blob (~218 KB) that contains the string "price" — so the price data exists, just not in the schema.org shape `productOffer()` reads. Wiring this shop later means writing a Devold-specific `__NEXT_DATA__` JSON-path extractor, not just pointing `scrapeSource()` at it.
  - New-category flag applies here too if picked up later (Clothing/outdoor wool wear).
