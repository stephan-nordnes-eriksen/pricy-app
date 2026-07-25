# Panduro

- URL: panduro.com/nb-no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirms clean, server-rendered Product JSON-LD with a full Offer. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate-network signal in original sweep).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://panduro.com/sitemap.panduro.xml`); 100 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: robots.txt open (`Allow: /`, only disallows `/home/`). No scraping/automation clause found via search of panduro.com/en/customer-service/terms. Spot-checked https://panduro.com/nb-no/products/sy-strikk/garn/akrylgarn/garn-wow-trendy-100-g-bringebarrod-400242 — Product ld+json (plus a separate BreadcrumbList block) with `"offers":{"@type":"Offer","priceCurrency":"NOK","price":"129.90","availability":"https://schema.org/InStock"}`, `brand":{"name":"Katia"}`, `sku`/`productID`. No `category` field on the Product node itself — would fall through to breadcrumbCat(), which the BreadcrumbList block on this page supports (Sy & strikk > Garn > Akrylgarn).
  Category mapping: craft/hobby supplies (yarn, scrapbooking, sewing) — none of worker/cats.json fit; needs a new "Hobby" category.
  Candidate product URLs for worker/extra.json (cat: "Hobby" once it exists):
  - https://panduro.com/nb-no/products/sy-strikk/garn/akrylgarn/garn-wow-trendy-100-g-bringebarrod-400242 (Garn Wow Trendy, brand Katia) — spot-checked above
  - https://panduro.com/nb-no/products/sy-strikk/garn/ullgarn/garn-alice-50g-rosa-324222 (Garn Alice, wool/alpaca blend)
  - https://panduro.com/nb-no/products/sy-strikk/garn/bomullsgarn/garn-mininoste-100-bomull-10-noster-%C3%A0-30-meter-per-stk-301343 (cotton yarn mini-skeins)
  - https://panduro.com/nb-no/products/sy-strikk/garn/ullgarn/garn-pure-merino-50g-morkgra-320363 (Garn Pure Merino)
