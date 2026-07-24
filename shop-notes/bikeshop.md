# Bikeshop

- URL: bikeshop.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: First-party scrape via `scrapeSource()` — clean, simple
  Product/Offer JSON-LD confirmed, robots.txt fully permissive, ToS is
  standard consumer terms with no scraping clause. No approval needed,
  code already exists.
- Alternatives: none found — no affiliate signal in SHOP-CANDIDATES.md;
  "Norway's largest bike shop" per its own marketing, family-owned.
- Status: not started
- Notes: Recheck performed — robots.txt disallows only admin/checkout/
  search-ish paths (`/bin/`, `/obj/`, `/Kasse/`, `/search`, etc.), no
  named bot blocks — identical boilerplate to foss-sport.no, likely same
  underlying storefront platform. ToS (bikeshop.no/kundesenter/terms) is
  standard consumer terms — no automated-access mention. JSON-LD spot
  check on
  https://bikeshop.no/high5/59016/high5-energigel-b%C3%A6r-40-gram
  shows a clean, flat `Product`+`Offer` (no ProductGroup wrapper for this
  single-variant item — priceCurrency NOK, price, availability,
  itemCondition) — about as easy a shape as `productOffer()` handles.
  Sells bikes, cycling nutrition/gels & components — maps to NO existing
  worker/cats.json category; needs the new "Sports"/"Outdoor" category
  flagged elsewhere in this batch, not added this round. Candidate rows:
  - `bikeshop-high5-energigel-baer` — High5 Energigel Bær 40g
    https://bikeshop.no/high5/59016/high5-energigel-b%C3%A6r-40-gram
  - `bikeshop-maurten-gel-100` — Maurten Gel 100 Nordic Energigel Nøytral
    https://bikeshop.no/maurten/211075/maurten-gel-100-nordic-energigel-n%C3%B8ytral-40-gram
  - `bikeshop-sis-go-energigel` — SiS GO Isotonic Energigel 60ml
    https://bikeshop.no/science-in-sport/nysisgoisogl/sis-go-isotonic-energigel-60-ml
