# Junior Barneklær

- URL: junior-barneklaer.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape (scrapeSource() already shipped) — real check confirms it's viable: same Shopify robots.txt template as Kidsdreamstore/Guttelus, explicitly agent/crawl-friendly for reading (only checkout automation is restricted). Product pages carry standard Product/Offer JSON-LD.
- Alternatives: none found.
- Status: not started
- Notes: robots.txt open. The homepage/collection pages render with no visible product links or ld+json in the raw HTML (client-rendered navigation), so had to pull a real product URL from the sitemap (`sitemap_products_1.xml`) instead — `https://junior-barneklaer.no/products/maxemilia-emma-festdrakt` curled clean: `@type: Product` with an `offers: [Offer, Offer, ...]` array (one per size variant, price 1999 NOK, standard shape), a direct match for productOffer(). Branded kids clothing only (ages 0–16) — no existing pricy.no category fits; would need a new "Kids clothing" category before this shop's SKUs could actually be onboarded, even though the scrape method itself is confirmed ready.
