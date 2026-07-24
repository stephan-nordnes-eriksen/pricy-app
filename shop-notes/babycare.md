# Babycare.no

- URL: babycare.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: none yet — real check found no usable static price data. Magento storefront (robots.txt has the Magento-default `Disallow: /catalog/`, `/customer/`, `/checkout/` block, but product pages use clean rewritten URLs like `/cybex-cloud-g-moon-black-ink-base-g`, not literal `/catalog/product/view/…`, so that block doesn't actually cover them — unlike Mikopet, this is not a robots-blocked exclusion). The real blocker: fetched a real product page (cybex-cloud-g-moon-black-ink-base-g) and found zero `application/ld+json` blocks, zero schema.org microdata (`itemprop`), zero price in any `<meta>` tag — only Magento's client-side `x-magento-init` JS config, which doesn't carry price in the static HTML. scrapeSource() (worker/sources.js) fetches raw HTML only, so it would find nothing to ingest here as-is.
- Alternatives: none confirmed. No affiliate-network signal either (SHOP-CANDIDATES.md: "No signal found").
- Status: not started
- Notes: Checked robots.txt (Magento default, doesn't block the clean product-page paths this shop actually uses), ToS (no `/vilkar` or `/kjopsvilkar` found, 404 on both guesses — no explicit ToS reachable), and one real product page's HTML for JSON-LD/microdata/meta price (none found). If revisited, check whether the price loads via a discoverable JSON API endpoint (Magento's price-render or GraphQL) rather than assuming static HTML will ever carry it. Baby gear (strollers, car seats) — no existing pricy.no category fits (worker/cats.json has no baby-gear category); would need a new one regardless of ingestion method.
