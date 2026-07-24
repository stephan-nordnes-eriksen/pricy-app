# Musti.no

- URL: musti.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: undetermined — first-party scrape is the obvious least-manual
  option (robots.txt is wide open and ToS has no automation ban), but this
  pass could not confirm the site is technically scrapeable: every category
  and search page fetched via plain `curl` returned a near-empty shell with
  exactly one internal link (`/vare-behandlinger`) and zero product URLs —
  the product grid is rendered client-side (AJAX/JS), not present in the
  server HTML. `scrapeSource()`'s JSON-LD reader has nothing to parse
  without a headless browser or the underlying product API.
- Alternatives: no affiliate-network signal found (Adtraction/Awin/
  Partner-ads/Tradedoubler) in footer/home/category HTML — matches pass 1.
  If a headless-render check later finds product pages, re-classify to
  phase1-scrape.
- Status: not started
- Notes:
  - robots.txt: `User-agent: *` / `Allow: /` — fully open, no path blocks.
  - ToS checked: `/brukervilkar` — only a generic clause that users may
    browse/print/copy content "for personal use, not commercial purposes"
    (`til eget bruk og ikke til kommersielle formål`) — no automation/bot/
    crawler/scraper mention. This is Ambiguous by SHOP-CANDIDATES.md's
    standard, not Prohibited — does not justify excluding on its own.
    `/vilkar-kundemedlemskap` (loyalty program terms) and `/retur` (returns)
    checked too, same result: no automation language.
  - Technical check: fetched 3 different pages expected to list products —
    `/acana` (brand page), `/torrfor-til-kattunger` (category, from the
    sitemap), and `/sok?q=royal+canin` (search) — all ~500KB responses,
    all with zero product-detail links and zero `ld+json` blocks in the
    raw HTML. Site runs on Apache/PHP (own stack, not a recognizable
    platform like Centra/Litium), a cookie shows an `mno_internal_flags`
    checkout-version flag, consistent with a heavily client-rendered SPA.
  - Category-fit: worker/cats.json currently has Audio/Phones/TV/
    Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen — none cover
    pet supplies. A new "Pets" category would be required regardless of
    tier if Musti is ever onboarded.
