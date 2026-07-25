# Oslo Hifi Center

- URL: oslohificenter.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: undetermined — see notes.
- Alternatives: none found.
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/waf/, /edit/, /ViewHelper/DesktopSwitch, /*?sortby=). Not crawled, not wired.
- Notes:
  - Real check performed: WebFetch on https://oslohificenter.no/hvorfor-handle
    (real sales-terms page, found via search) — no clause on automated
    access/scraping/bots/crawlers. curl (sandbox disabled) on /robots.txt —
    only blocks `/waf/`, `/edit/`, a desktop-switch helper, and sort/filter/
    search query-string variants (SEO-index hygiene); explicitly `Allow:
    /*?pid=` and `/*?iid=` (product/item id params) and `Allow: Googlebot`.
    No named-bot blocks. Confirms SHOP-CANDIDATES.md's "Ambiguous" verdict
    was actually closer to Silent — no real restriction found.
  - However: curl (sandbox disabled) on a real product page
    (https://oslohificenter.no/hoyttalere/kompakte/kef-ls50-meta, 200 OK,
    ~69 KB HTML) found **no** `application/ld+json` script anywhere on the
    page — only an `og:type="product"` OpenGraph meta tag. scrapeSource()'s
    `productOffer()` only reads JSON-LD, so it would find nothing here as-is.
  - Category fit would be **Audio** (speakers, amps — matches existing
    Audio-cat products) if a working ingest method is found.
  - Next step: check a couple more product templates (this site may have
    a legacy/Vue-ish stack with per-category templates) in case some page
    types do carry JSON-LD; otherwise this needs a custom HTML scraper
    (OpenGraph tags + visible price text) rather than the generic JSON-LD
    path — bigger lift than Phase 1 assumes, flag for Phase B triage.
