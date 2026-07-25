# Tegne.no

- URL: tegne.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — Product JSON-LD not present despite a product
  catalog existing
- Alternatives: none found
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.tegne.no/sitemap_index.xml`); 393 priced rows ingested to pricy.no. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: robots.txt uses the Content-Signal convention
  (`Content-Signal: search=yes,ai-train=no,use=reference`, `Allow: /` for
  `User-agent: *`; only `Amazonbot`/`Applebot` etc. get a blanket
  `Disallow`) — this is an AI-training opt-out, not a general scraping
  block, and doesn't name pricy.no or price-comparison bots, so it's
  effectively Silent for our UA. Fetched a real product page
  (`https://www.tegne.no/produkt/folia-pomponger-30stk-tone-mix-gronn/`,
  200 OK, has a `product-sitemap.xml` confirming a real per-SKU catalog)
  and found only ONE ld+json block: a Yoast SEO `@graph` with `WebPage`,
  `BreadcrumbList`, `WebSite`, `Organization` nodes — **no `Product` or
  `Offer` node at all**. This is a WooCommerce store without WooCommerce's
  product-schema markup enabled (or a theme that strips it) — the price is
  presumably shown as plain HTML text, not structured data. scrapeSource()
  as it exists today (JSON-LD only) would find nothing here. Needs a
  human/Phase-B decision: either a small HTML-price-scrape fallback, or
  skip until the site adds Product schema.
