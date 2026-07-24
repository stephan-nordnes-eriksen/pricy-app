# Kjell & Company

- URL: kjell.com/no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: First-party scrape via scrapeSource() — clean Product/Offer JSON-LD found, ToS and robots.txt have no automated-access restriction. Cheaper than the SE-only Awin lead noted in SHOP-CANDIDATES.md (NO market unconfirmed on that program anyway).
- Alternatives: SE Awin affiliate program exists per SHOP-CANDIDATES.md, but NO-market presence on it is unconfirmed — not worth chasing while scrape works cleanly.
- Status: not started
- Notes:
  - Recheck done: WebFetch on https://www.kjell.com/no/kundeservice/vilkar found no mention of bots/crawlers/scraping/automated access. `curl -sL https://www.kjell.com/robots.txt` returns the site's client-rendered 404 SPA shell (no robots.txt file at all, no server-side disallow rules found).
  - Category fit: best overlap is **Home** — Kjell sells Philips Hue smart lighting, and the catalog already carries Philips Hue rows (`ean-8719514289130` White Starter Kit, `ean-8719514339965` Gradient Lightstrip) under `Home`/`lamp`. Kjell could supply real prices for those exact EANs via crawl-urls once product URLs are found for those specific items. Chargers/cables would need a new `extra.json` product (fits `Computers` or a phone-accessories niche not currently in cats.json — flagging, not acting).
  - Candidate URLs (real, WebSearch-found):
    - https://www.kjell.com/no/produkter/mobilt/iphone-tilbehor/iphone-lader/linocell-gan-usb-c-lader-med-pd-65-w-p22580 — Linocell GaN USB-C charger 65W
    - https://www.kjell.com/no/produkter/mobilt/tilbehor-til-baerbar-pc/ladere-til-baerbar-pc/unisynk-gan-lader-med-usb-c-65-w-p45035 — Unisynk GaN USB-C charger 65W
    - https://www.kjell.com/no/produkter/data/tilbehor-til-baerbar-pc/ladere-til-baerbar-pc/unisynk-gan-lader-med-usb-c-pd-100-w-p45036 — Unisynk GaN USB-C charger 100W
    - No live single-product Philips Hue URL surfaced via search (only category pages) — a proper URL needs finding by hand before wiring; do not fabricate one.
  - JSON-LD spot-check (curl, sandbox disabled) on the Linocell charger URL: clean `@type: Product` with nested `offers` — `priceCurrency: NOK, price: 360, availability: InStock, itemCondition: NewCondition, seller: Kjell & Company`, plus a `BreadcrumbList`. scrapeSource()'s `productOffer()`/`parsePrice()` would parse this without changes. (First attempt hit a different charger URL that 200'd into a generic category-listing page — Kjell's app falls back to a category page for some stale/mistyped slugs; always verify the returned `<title>` matches the intended product before trusting a URL.)
  - No product_id mapping proposed yet since chargers don't map to an existing catalog row and no live Hue single-product URL was found — Phase B should either find the real Hue product URLs (to feed existing EANs) or add new `extra.json` rows for chargers under a category flagged above.
