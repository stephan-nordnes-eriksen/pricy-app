# Ringo (yesvileker.no)

- URL: ringo.no (yesvileker.no is the legacy chain brand name; the live storefront and all product links resolve to ringo.no)
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape (scrapeSource() already shipped) — real check confirms it's the least-manual option: robots.txt is fully open (only blocks wp-admin/cart/checkout/known SEO bots MJ12bot/Amazonbot/SemrushBot, nothing aimed at product/category paths or scrapers generally), and product pages carry standard WordPress/WooCommerce+Yoast JSON-LD (`@graph` with `Product`/`Offer`/`BreadcrumbList` nodes) that productOffer() parses natively. No affiliate network signal found, so scraping is also the only currently-viable path.
- Alternatives: none found.
- Status: pilot wired — tools/crawl-urls.json has `lego-roses` → the confirmed LEGO 10328 URL; `node tools/crawl.mjs --dry --shop Ringo` returns kr 830, npm test green
- Notes: Checked `https://ringo.no/robots.txt` directly (open) and curled a real product page (`https://www.ringo.no/produkt/way2play-babygym/`) — 2 ld+json blocks, one is the standard WooCommerce Product/Offer/BreadcrumbList graph, confirms scrapeSource() would work unmodified. Pure toy shop → maps directly to the existing "Toys" pricy.no category (icon toy-brick). Candidate URLs for Phase B: `https://www.ringo.no/produkt/way2play-babygym/`, `https://www.ringo.no/produkt/way2play-babygym-m-3-leker/` (both Way2Play baby gyms, found via category browse at `/produkt-kategori/babyleker/aktivitetsleker/babygym/`) — no existing pricy.no catalog match for these (worker/extra.json's only Toys entry is lego-roses), so they'd be new worker/extra.json rows in Phase B, not aliases to existing ids.
  **Additional find**: Ringo also directly carries the *existing* `lego-roses`
  catalog entry (LEGO Bouquet of Roses 10328) at
  `https://www.ringo.no/produkt/lego-10328-rosebukett/` — confirmed via
  Ringo's own site search (`?s=10328`), a real, working product URL. That
  makes Ringo a price *source* for an already-cataloged product, not just a
  source of new ones — worth wiring first in Phase B since it needs no new
  extra.json row, just a `tools/crawl-urls.json` entry. Also spot-checked
  two more LEGO Duplo product pages while there
  (`https://www.ringo.no/produkt/lego-10412-dyretog/`,
  `https://www.ringo.no/produkt/lego-10416-dyrestell-pa-garden/`,
  `https://www.ringo.no/produkt/lego-10421-alfabetlastebil/`) — same clean
  Product/Offer JSON-LD shape, further NEW-entry candidates beyond the
  Way2Play ones above.
