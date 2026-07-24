# Oda (fmr. Kolonial)

- URL: oda.com/no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: none yet — this is the strongest of the four on legality/technical grounds, but there's no Groceries vertical for it to compete in yet
- Alternatives: first-party `scrape` (JSON-LD Product/Offer is real and matches `scrapeSource()`'s existing `productOffer()` parser unchanged) is technically viable whenever this vertical is pursued
- Status: not started
- Notes:
  `curl -sL https://oda.com/robots.txt` returns a real, documented scraper
  policy (not boilerplate): "Policy for running scrapers/crawlers" —
  requires a meaningful User-Agent (must contain the substring "bot", a
  program name, and a contact/company), and exponential backoff +
  respecting `Retry-After` on 429/5xx; non-compliant traffic "may result
  in your traffic being blocked." Only `MJ12bot` is disallowed outright;
  everything else in the disallow list is ajax/cart/login plumbing, not
  product or category pages. This is the "scraper-permission policy"
  SHOP-CANDIDATES.md flagged, and it's genuinely permissive — though
  pricy.no's current `UA` const
  (`pricy.no price watcher (kontakt@pricy.no)`) does **not** literally
  contain the substring "bot", so it wouldn't strictly satisfy Oda's own
  stated requirement as written today.

  WebFetch of `/no/legal/betingelser/` (ToS): no scraping/bot/API clause
  anywhere — just a generic copyright/IP statement ("Alt innhold...
  tilhører Oda-konsernet... og er beskyttet av opphavsrett... og andre
  relevante lover"). Not a red flag.

  Fetched a real product page with a browser UA
  (`oda.com/no/products/2149-superbra-musli-med-eple-kanel-og-tranebaer/`):
  HTTP 200, genuine schema.org `Product` + nested `Offer` JSON-LD —
  `name`, `image`, `brand`, `offers.price` ("66.80"),
  `priceCurrency: "NOK"`, `availability` (this particular sample came
  back `Discontinued`, illustrating grocery SKU churn). No GTIN/EAN in
  the markup, but that's fine for `scrapeSource()` (only
  `adtractionSource()` needs EANs for discovery — `scrapeSource()` maps
  `product_id → url` by hand via `cfg.urls`).

  **Catalog-fit verdict:** Oda alone doesn't complete a "groceries"
  vertical — there is no second grocery retailer currently in scope with
  comparable per-SKU pages (Meny is per-store/SPA-rendered, Foodora
  Market is bot-walled/app-only; see their notes), so a solo Oda feed
  gives no cross-shop price-comparison value, which is the entire premise
  of pricy.no. On top of that, groceries need a "Groceries" category
  (doesn't exist in `worker/cats.json`) and some accommodation for
  perishables/weight-based units and fast SKU churn that the current
  specs/CATMAP model never anticipated. This is a real-catalog-fit issue,
  not a scraping-legality one — Oda itself is the cleanest of the four
  shops checked here, and would be the natural first pick IF a Groceries
  vertical with 2+ retailers is ever prioritized.
