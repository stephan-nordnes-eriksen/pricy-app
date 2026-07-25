# Sykkelspesialisten.no

- URL: sykkelspesialisten.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean
  Product/Offer JSON-LD confirmed, robots.txt fully permissive (even to
  ClaudeBot by name), ToS is standard consumer terms with no scraping
  clause. No approval needed, code already exists.
- Alternatives: none found — no affiliate signal in SHOP-CANDIDATES.md
  (part of Norske Nettbutikker AS / importpris.no group).
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Recheck performed — robots.txt disallows admin/order/invoice
  paths only (`/kontrollpanel`, `/htmlpackingslip*`, `/pdfinvoice.php`,
  etc.), `Crawl-delay: 5` for `*` and `SemrushBot`, and explicitly
  `Allow: /` for Googlebot, OAI-SearchBot, PerplexityBot, **and
  ClaudeBot by name**. ToS (sykkelspesialisten.no/pages/conditions) is
  standard Forbrukerkjøpsloven consumer terms — no automated-access
  mention. JSON-LD spot check on
  https://www.sykkelspesialisten.no/products/bbb-allroundkit-btl-91-verktoykoffert--16-deler
  shows `Product`/`Brand`/`Offer`/`UnitPriceSpecification` types present
  — clean shape, `productOffer()` should parse it directly. Sells bikes,
  e-bikes & cycling parts/accessories — maps to NO existing
  worker/cats.json category; needs the new "Sports"/"Outdoor" category
  flagged elsewhere in this batch, not added this round. Candidate rows:
  - `sykkelspes-bbb-allroundkit` — BBB AllroundKit BTL-91 Verktøykoffert
    (16-piece bike tool kit)
    https://www.sykkelspesialisten.no/products/bbb-allroundkit-btl-91-verktoykoffert--16-deler
  - `sykkelspes-easton-ea50-setepinne` — Easton EA50 setepinne 27.2x350mm
    https://www.sykkelspesialisten.no/products/easton-ea50-setepinne-272x350-mm-alu-sort
  - `sykkelspes-sykkelslange-29` — Sykkelslange 29" 1.75-2.125 bilventil
    https://www.sykkelspesialisten.no/products/sykkelslange-29-175-2125-bilventil-40-mm
