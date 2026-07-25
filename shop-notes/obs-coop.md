# Obs (Coop)

- URL: obs.no/elektronikk
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: undetermined — see notes.
- Alternatives: none found.
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.obs.no/sitemap.xml`); 341 priced rows ingested to pricy.no. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes:
  - Real check performed: WebFetch on https://www.obs.no/kjopsvilkar (real
    ToS page, found via search since /kjopsvilkar isn't linked from the
    robots.txt or homepage footer directly) — no clause on automated
    access/scraping/bots/crawlers/price-comparison. curl (sandbox disabled)
    on /robots.txt — only blocks `/kasse/` (checkout), a restrictions page,
    `/sok` (search), `/startside`; no bot-name blocks. Confirms
    SHOP-CANDIDATES.md's "Silent" verdict for ToS/robots.
  - However: curl (sandbox disabled) on a real category page
    (https://www.obs.no/elektronikk/lyd-og-bilde, 200 OK, ~1 MB HTML) found
    **zero** product links, zero `application/ld+json` blocks, and no
    embedded state blob (`__NEXT_DATA__`/`__NUXT__`/etc.) in the raw HTML —
    this storefront appears to be client-side rendered, so a plain
    `fetch()` (what scrapeSource() does) won't see any product data or
    JSON-LD at all. This matches SHOP-CANDIDATES.md's caveat about
    WebFetch/curl missing JS-rendered content — it's a real technical
    blocker, not a ToS one.
  - Could not find a single real per-product URL to spot-check directly
    (WebSearch only surfaced category/brand pages, not product detail
    pages) — another sign this is JS-hydrated.
  - Next step for a real recheck: load a category page in an actual browser
    (Playwright) to see if product URLs/JSON-LD appear after hydration, or
    look for a JSON API the frontend calls (Network tab) that could be
    treated like a feed. Not attempted this round — out of scope for a
    curl-based check.
  - Category fit: general electronics store (lyd-og-bilde = audio/TV,
    elektronikk-og-underholdning = phones/tablets/smart home) — would
    plausibly span Audio/TV/Phones/Computers/Home depending which products
    get picked, once/if a working ingest method exists.
