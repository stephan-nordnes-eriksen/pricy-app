# Bianco

- URL: bianco.com/no-no
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: `scrapeSource()` — real recheck found clean, complete `Product`/`Offer` JSON-LD (brand, NOK price, shipping details all present natively — no gaps at all, better signal than most shops in this batch). No approval needed, cheapest tier.
- Alternatives: none needed — this is the clean case.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - **Real recheck done** (Ingest notes were Unknown; scrape verdict Ambiguous).
  - `robots.txt` (sandbox disabled, `https://www.bianco.com/robots.txt`): explicitly friendly — opens with the comment *"Fashion lives here. Crawl and discover."* Only blocks cart/wishlist/order-confirmation/search-with-query paths and irrelevant filter-query params. Product pages fully open.
  - ToS (WebFetched via the real footer link `https://www.bianco.com/share?cid=terms-and-conditions`): no automated-access/scraping/bot clause. Only unrelated clause: BESTSELLER (Bianco's owner) reserves the right to block customers with an abnormally high return rate.
  - **Note on ownership**: Bianco is Bestseller-owned — same corporate group as Vero Moda, Only, and Jack & Jones (currently tiered `phase2b-other-network`/Awin in this batch, pending contract). Bianco's own site turns out to have working JSON-LD, so scraping is viable here even though the sibling brands aren't (their pages weren't checked for JSON-LD this round — worth a look if the Awin application stalls for those three).
  - The site's `/no-no/` locale isn't listed in `sitemap_index.xml` (only `en-gb` sitemaps are indexed) but does resolve live (`https://www.bianco.com/no-no/biamexico-flip-flops-11201626_Red.html` → HTTP 200, real NOK pricing) — found by taking a known product slug from the indexed `en-gb`/`da-dk` sitemap entries and substituting the `no-no` locale prefix, which resolved cleanly. Use the sitemap only to discover slugs/SKUs, then request them under `/no-no/`.
  - JSON-LD spot-check (same URL above): page carries 3 blocks — a flat `Product` with a complete `offers` object (`priceCurrency: NOK`, `price: 499.99`, `availability: InStock`, plus an `OfferShippingDetails` block with NOK shipping rate and handling/transit times — `shippingInfo()` will find this too), a separate `ProductGroup`+`hasVariant` block (redundant, ignored since the flat `Product` block comes first), and `BreadcrumbList`. `brand` is present as a proper `{"@type":"Brand","name":"Bianco"}` node — `productOffer()` will pick it up directly, unlike DinSko.
  - **New category needed**: "Shoes".
  - Candidate `worker/extra.json` rows (URLs derived from the shop's own sitemap slugs, each verified to resolve live under `/no-no/` with `curl -sL -o /dev/null -w '%{http_code}'` → 200):
    1. `bianco-biamexico-flip-flops-red` — brand Bianco, cat Shoes — https://www.bianco.com/no-no/biamexico-flip-flops-11201626_Red.html (JSON-LD spot-checked above)
    2. `bianco-biaadda-leather-loafers-black` — brand Bianco, cat Shoes — https://www.bianco.com/no-no/biaadda-leather-loafers-11251192_Black.html
    3. `bianco-biajody-western-boots-sand` — brand Bianco, cat Shoes — https://www.bianco.com/no-no/biajody-western-boots-11302453_Sand.html
