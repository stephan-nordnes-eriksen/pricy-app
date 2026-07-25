# Thune

- URL: thune.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none yet — reachable but no product page checked in time
- Alternatives: none found
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/account/, /checkout/, /widgets/, */f/*). Not crawled, not wired.
- Notes: robots.txt (via the `www.thune.no` redirect target) is open —
  only `/account/`, `/checkout/`, `/widgets/` disallowed, everything else
  crawlable, and it's clearly a Shopware storefront (sitemap uses
  Shopware's `salesChannel-<uuid>` naming). Ran out of time budget this
  round to pull an actual product URL out of the gzip'd sitemap and
  confirm JSON-LD shape — Shopware sites do emit schema.org Product/Offer
  by default, so this is likely a good phase1-scrape candidate, but
  needs a live spot-check before committing (find a product page, curl for
  `ld+json`, check for `Product`/`Offer` with a NOK price) rather than
  assuming.
