# KappAhl

- URL: kappahl.com
- Category: Fashion, clothing & shoes
- Tier: phase1-scrape
- Chosen method: `scrapeSource()`-style scrape — real recheck found genuine schema.org Product data and a clean ToS/robots. No approval needed. **Caveat**: the JSON-LD is `ProductGroup`+`hasVariant` shaped with no flat top-level `Product`/`Offer` block anywhere on the page (unlike DinSko/Bianco/NA-KD) — `productOffer()` as it exists today would find nothing on this page and return null, since it only reads `n.offers` on the top-level node, never descending into `hasVariant`. Phase B needs a small addition (dig into `hasVariant[0].offers`, or the cheapest matching variant) before this shop actually yields prices — same shape of gap `spec.priceSpecification` handling already covers for NetOnNet.
- Alternatives: none — no affiliate-network signal found in the research pass either (Ingest notes: Unknown).
- Status: not started
- Notes:
  - **Real recheck done** (Ingest notes/scrape verdict were both Unknown/Ambiguous).
  - `robots.txt` (sandbox disabled): only disallows search/utility/checkout paths (`*/search`, `*/etsi`, `*/szukaj`, `/kassan`, `/checkout`, etc.) — no product/category block, no named bots.
  - ToS (WebFetched `https://www.kappahl.com/nb-no/kundeservice/bestilling/generelle-kjopsvilkar`, the real link found in the page footer): no clause on automated access, bots, crawlers, or scraping.
  - JSON-LD spot-check (`https://www.kappahl.com/nb-no/newbie/bukser--leggings/leggings/693903`, real product from the shop's own `sitemap.xml?batch=0&language=nb-no`): exactly 2 blocks — `ProductGroup` (has `hasVariant`, each variant carries its own `offers` with NOK-ish pricing) and `BreadcrumbList`. No flat `Product`+`offers` block exists on this page at all — confirmed by enumerating every block's `@type` and keys, not just the first match.
  - **New category needed**: same "Clothing" gap as the rest of this section.
  - Candidate `worker/extra.json` rows (real URLs from the shop's own NO-locale sitemap):
    1. `kappahl-newbie-leggings-med-fot` — "Leggings med fot", brand Newbie, cat Clothing — https://www.kappahl.com/nb-no/newbie/bukser--leggings/leggings/693903 (JSON-LD spot-checked above; needs the `hasVariant` parsing fix to actually ingest)
    2. `kappahl-boyle-bh` — brand KappAhl, cat Clothing — https://www.kappahl.com/nb-no/dame/undertoy/bh/boyle-bh/199315
    3. `kappahl-herre-sokker` — cat Clothing — https://www.kappahl.com/nb-no/herre/undertoy/sokker/892083
    4. `kappahl-string-truser` — cat Clothing — https://www.kappahl.com/nb-no/dame/undertoy/truser/string/600858
