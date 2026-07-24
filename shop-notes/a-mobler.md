# A-Møbler

- URL: a-mobler.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none viable yet — see notes
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes:
  - **Real check performed.** robots.txt (`a-mobler.no/robots.txt`) is essentially empty (just a sitemap pointer) — nothing blocked.
  - ToS (`a-mobler.no/salgsbetingelser/`, via WebFetch): silent on scraping/crawling/bots/robots/automated access. Site does sell online (hybrid showroom + e-commerce — order tracking, payment/installment options, checkout referenced on the kundeservice page), so scraping is at least conceptually relevant here (not a pure brochure/in-store-only site).
  - **Blocker**: could not find a genuine single-SKU product detail page. `a-mobler.no/sitemap.axd` (289 URLs) only contains series/category/collection pages (`/produkt/serier/caso/spisebord`, `/hagemobler/utesofaer/modulsofa`, etc.) — every "deep" URL checked is a `CollectionPage`/`ItemList` in its JSON-LD, never a lone `Product`+`Offer`. This may mean A-Møbler simply doesn't expose per-SKU pages (price/availability might only surface in-store or via a quote flow) rather than that JSON-LD is missing outright.
  - Not enough evidence to place this in `phase1-scrape` (no confirmed single-product JSON-LD found) or `excluded` (nothing prohibits it) — genuinely `needs-recheck`: someone should browse the live site by hand (not just sitemap+curl) to confirm whether individual product/SKU pages exist at all before writing this off.
  - Category gap (moot until a product-page pattern is found): furniture — same "Furniture" gap as JYSK/Bohus/Skeidar/Fagmøbler/Møbelringen.
