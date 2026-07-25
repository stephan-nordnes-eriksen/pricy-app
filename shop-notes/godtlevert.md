# Godtlevert.no

- URL: godtlevert.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: none — meal-kit recipe boxes are not discrete SKUs, and no Product markup exists to scrape anyway
- Alternatives: none identified
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  `curl -sL https://www.godtlevert.no/robots.txt`: plain `Allow: /` for
  `User-Agent: *`, disallowing only `/app/` and `*print=true` — no
  restriction on the menu/recipe pages themselves.

  WebFetch of `godtlevert.no/vilkar`: no scraping/bot/crawler/API mention
  anywhere — the terms describe Godtlevert as a subscription service for
  home delivery of pre-composed meal boxes/recipes (e.g. "Favorittboks",
  "Ekspressboks"), explicitly excluded from the right of withdrawal
  because they're perishable bundles. Covers membership, payment,
  delivery, bonus points, food safety, dispute resolution — nothing about
  automated access. Silent, not prohibitive.

  Fetched the homepage and the recipe/menu page (`godtlevert.no/menyen`,
  a 2.9 MB largely client-rendered response): both carry exactly one
  JSON-LD block, `@type: Organization` (name/address/contact point) — no
  `Product`, no `Offer`, no per-recipe or per-box price markup anywhere
  on either page. There's nothing resembling a SKU-level price to
  extract even if scraping were wanted.

  **Catalog-fit verdict:** confirms the SHOP-CANDIDATES.md note exactly —
  Godtlevert sells weekly recipe boxes (a bundle of ingredients for N
  meals at one subscription price), not individual products with their
  own stable price/EAN. There's no unit here that maps onto pricy.no's
  product/offer/price_point model at all — box contents rotate weekly, so
  even a hypothetical scrape has nothing stable to track price history
  against. This isn't a scraping or category-registry problem, it's a
  fundamental mismatch with what the site compares. Lowest priority of
  the four to ever revisit.
