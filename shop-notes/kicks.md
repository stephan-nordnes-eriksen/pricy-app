# Kicks

- URL: kicks.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: first-party scrapeSource() off Product JSON-LD — no contract, no approval, code already exists (needs one small allowance, see Notes)
- Alternatives: none found (no affiliate-network signal)
- Status: not started
- Notes: Real check done. `curl -sL https://www.kicks.no/robots.txt`
  (unsandboxed) is Silent — only `Disallow: /internal/`, `/hkb/`; a
  Sitemap is listed. WebFetched `kicks.no/kundeservice/kjopsvillkar` — no
  automated-access/scraping/bot clause, just payment/delivery/returns terms.

  **Important quirk found via spot-check:** every real Kicks product URL
  I tried returns **HTTP 404 at the status-line level while still serving
  full, correct HTML** — confirmed with a live category page
  (`https://www.kicks.no/makeup/oyesminke/mascara`, HTTP 200) → live product
  link `https://www.kicks.no/beautyact-38c-lengthening-mascara-black`
  (unsandboxed curl: `HTTP/2 404`, yet `<title>Kjøp 38°C Lengthening
  Mascara Black - BeautyAct - KICKS</title>`, 2 `application/ld+json`
  blocks, `"@type":"Product"`, `"price":"116.25"` all present and correct).
  Two earlier product URLs I tried from search-engine results (Benefit
  Badgal Bang, Chanel Volume Mascara) soft-404'd to the homepage shell
  instead — so not every 404 carries real content, only some do; the
  category-page-derived links did.

  This matters because `scrapeSource()` in worker/sources.js does
  `if (!res.ok) throw new Error(...)` — `res.ok` is false for any 4xx,
  so as written it would silently treat every real Kicks product as a
  scrape failure even when the JSON-LD is right there. Phase B needs a
  Kicks-specific carve-out (e.g. don't gate on `res.ok`, gate on "did we
  get a parseable Product JSON-LD" instead — same file already tolerates
  per-shop quirks like `cfg.ua`). Flagging this precisely so Phase B
  doesn't have to re-discover it.

  No existing cats.json category fits — needs "Beauty" (or reuse whatever
  Vitusapotek/Blivakker end up defining). Candidate product URLs (real,
  reached via the mascara category listing):
  - `beautyact-38c-lengthening-mascara-black` — https://www.kicks.no/beautyact-38c-lengthening-mascara-black (spot-checked, JSON-LD confirmed, 404 status quirk present)
  - `chanel-definition-mascara-10-noir` — https://www.kicks.no/chanel-definition-mascara-10-noir
  - `benefit-badgal-bang-mascara-mini` — https://www.kicks.no/benefit-badgal-bang-mascara-mini
