# Nettdyret.no

- URL: nettdyret.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean,
  parser-compatible schema.org JSON-LD confirmed on three live product
  pages, no affiliate network signal found, so scraping is the
  least-manual option.
- Alternatives: none found (no Adtraction/Awin/Partner-ads/Tradedoubler
  markers on the homepage or product pages).
- Status: not started
- Notes:
  - robots.txt (curl'd live): only disallows one specific category id
    (`/*cat-c/c90262` and its children) — every other category/product
    path is open for `User-agent: *`. Silent, not a product/category
    block in the sense SHOP-CANDIDATES.md's "Robots-blocked" table means.
  - ToS: found at `/pages/terms` (linked from the homepage footer),
    fetched successfully via curl. Human-readable text is standard
    Norwegian purchase terms (angrerett/right of withdrawal, order
    confirmation, etc.) — no scraping/bot/crawler/automation ban in the
    actual terms text.
  - **Worth flagging even though it doesn't meet the exclusion bar**: the
    same `/pages/terms` page ships a client-side `TraceLogger` JS config
    with a `userAgentBlockKeywords` list that explicitly names `'bot'`,
    `'crawler'`, `'spider'`, `'scraper'`, plus generic HTTP clients
    (`curl`, `wget`, `python-requests`, `axios/`, `node-fetch`,
    `Go-http-client`, `okhttp`) and named AI crawlers (`GPTBot`,
    `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `CCBot`, `Amazonbot`).
    This reads as an error-tracking/analytics noise filter (it filters
    which user agents get logged for JS errors), not an access-control
    block — the project's plain `curl` fetch of the same page returned
    200 with no resistance, and every product JSON-LD fetch below
    succeeded cleanly with the project's honest UA. It does not meet this
    task's exclusion bar (no explicit ToS ban, no robots.txt path block),
    but it signals the platform vendor is bot-aware at the infra level —
    re-verify at real ingest volume that the honest UA (`pricy.no price
    watcher (kontakt@pricy.no)`) doesn't get rate-limited/blocked once
    hitting many product pages instead of a handful.
  - JSON-LD confirmed on 3 live product pages — clean `@type: Product`
    with `offers` directly present (`price`, `priceCurrency: "NOK"`,
    `availability`, `gtin13`, `sku`, `mpn`) — matches `productOffer()` in
    `worker/sources.js` exactly, no parser changes needed. One sampled
    page (`acme-gjeterhundfloyte-575`, a preorder item) had no `price` in
    its offer — expected per `scrapeSource()`'s existing "no JSON-LD offer
    price → skip, freeze at last stored price" handling, not a shape bug.
  - Category fit: worker/cats.json has no pet-supplies category (current
    set: Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/
    Kitchen) — a new "Pets" category is required regardless of tier.
  - Candidate product URLs (from `sitemap-1-1.xml`, not WebSearch — budget
    was exhausted this session):
    - https://nettdyret.no/acme-acme-gjeterhundfloyte-575/cat-p/c/p1500013363
      (spot-checked — no price, preorder)
    - https://nettdyret.no/akudim-hundesnacks-storfevom-200g/cat-p/c/p1500017424
      (spot-checked — price 89.00 NOK)
    - https://nettdyret.no/acme-acme-640-dobbel-hundefloyte/cat-p/c/p1500034120
      (spot-checked — price 229.00 NOK)
  - Proposed `product_id` naming: `<brand>-<product-slug>` lowercased,
    e.g. `acme-640-dobbel-hundefloyte`, `akudim-hundesnacks-storfevom-200g`
    — the shop's own URL slugs already follow this pattern closely enough
    to reuse directly (strip the leading duplicated brand token where the
    slug repeats it, e.g. `acme-acme-640-...` → `acme-640-...`).
