# Skin Tonic

- URL: skintonic.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: excluded
- Chosen method: none — no online store to scrape
- Alternatives: none
- Status: not started
- Notes: Real check done, and it changes the SHOP-CANDIDATES.md verdict.
  Skin Tonic is "Kjeden for de lokale parfymeriene i Norge" — a chain of
  58 independently-run physical perfumeries, and skintonic.no is a plain
  WordPress marketing site, not a webshop. Confirmed via
  `curl -sL https://skintonic.no/wp-sitemap.xml` (unsandboxed): the only
  sitemaps are `post-sitemap`, `page-sitemap`, `mailpoet_page-sitemap`,
  `wpsl_stores-sitemap` (WP Store Locator plugin — physical store finder),
  `category-sitemap`, `post_tag-sitemap`, `author-sitemap` — no
  product/shop sitemap at all. Homepage/about page have no cart, checkout,
  or "kjøp på nett" language; WebFetch of the About page found no ToS link
  either (there's nothing to have terms about). robots.txt is a generic
  servebolt.com anti-hammering default, not a real signal either way.
  There is nothing here for scrapeSource() to point at — no product pages
  exist. Not a scrape-verdict problem, a "this isn't an e-commerce site"
  problem.
