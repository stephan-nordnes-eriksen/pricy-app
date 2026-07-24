# Foss Sport

- URL: foss-sport.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean
  Product/Offer JSON-LD confirmed, robots.txt fully permissive, ToS is
  standard consumer terms with no scraping clause. No approval needed,
  code already exists.
- Alternatives: none found — no affiliate signal in SHOP-CANDIDATES.md.
- Status: not started
- Notes: Recheck performed — robots.txt: `Allow: /`, only admin/checkout/
  search-ish paths disallowed (`/bin/`, `/obj/`, `/Kasse/`, `/search`,
  etc.), no named bot blocks. ToS
  (foss-sport.no/kundesenter/startside/kjøpsbetingelser) is standard
  Forbrukerkjøpsloven consumer terms — no automated-access mention.
  JSON-LD spot check on
  https://www.foss-sport.no/asics/194860/asics-l%C3%B8pesko-metaspeed-sky-tokyo-rask-konkurransesko-med-god-demping-fr-b
  shows a clean `ProductGroup` with `hasVariant` `Product`/`Offer` nodes
  (priceCurrency NOK, price, availability, gtin13, sku per variant) —
  same platform/shape as bikeshop.no (identical robots.txt boilerplate,
  same "Multicase"-style storefront — likely the same vendor serving
  both shops). `productOffer()` should parse the group-level offer fine.
  Sells cross-country ski gear, running shoes & cycling — maps to NO
  existing worker/cats.json category; needs the new "Sports"/"Outdoor"
  category flagged elsewhere in this batch, not added this round.
  Candidate rows:
  - `foss-asics-metaspeed-sky-tokyo` — Asics Løpesko Metaspeed Sky Tokyo
    https://www.foss-sport.no/asics/194860/asics-l%C3%B8pesko-metaspeed-sky-tokyo-rask-konkurransesko-med-god-demping-fr-b
  - `foss-saucony-triumph-24` — Saucony Løpesko M Triumph 24
    https://www.foss-sport.no/saucony/201088/saucony-l%C3%B8pesko-m-triumph-24-myk-mengdesko-for-lange-turer-w-t
  - `foss-control-eon-elsykkel` — Control Eon Elsykkel (800Wh e-bike)
    https://www.foss-sport.no/control/200032/control-eon-elsykkel-sterk-elsykkel-med-800wh-blue
