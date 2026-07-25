# Sport 1

- URL: sport1.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via existing `scrapeSource()` — same
  platform as Intersport Norge (identical robots.txt boilerplate, same
  `media.sportholding.no` image CDN, same clean JSON-LD shape), no
  approval or new code needed.
- Alternatives: none found (no affiliate-network signal for Sport 1).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://www.sport1.no/sitemap.xml`); 355 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: Rechecked live (curl, sandbox disabled).
  `robots.txt`: byte-identical structure to Intersport's — `Allow: /` for
  all, only `/profile/`, `/signup/`, `/signin/` blocked. ToS page at the
  Intersport-style path 404'd (`sport1.no/kjopshjelp/salgsbetingelser`) —
  didn't chase the exact URL further since the platform match (see below)
  makes it very likely the same Sport Holding AS boilerplate; treat as
  Silent-by-strong-inference, worth a direct ToS-URL confirmation before
  Phase B wiring if that matters.
  JSON-LD spot-check: fetched a real product page
  (`https://www.sport1.no/adidas-f50-club-mid-cut-firm-ground-multi-ground-fotballsko-tesoyecblacklucred-unisex-jq4030`)
  — clean `{"@type":"Product","brand":{"name":"ADIDAS"},"offers":
  {"@type":"Offer",...}}` JSON-LD, images from `media.sportholding.no`
  (same CDN as Intersport) confirming this and Intersport run on the same
  underlying e-commerce platform (likely same corporate group, "Sport
  Holding AS").
  Sells sports equipment/clothing/bikes/skis — no fit in current
  worker/cats.json; flag new "Sports"/"Outdoor" category for Phase B
  (shared with Intersport/Milrab in this batch).
  Candidate worker/extra.json rows (real product pages, football boots):
  - https://www.sport1.no/adidas-f50-club-mid-cut-firm-ground-multi-ground-fotballsko-tesoyecblacklucred-unisex-jq4030
  - https://www.sport1.no/adidas-copa-pure-iv-club-firm-groundmulti-ground-fotballsko-cblackftwwhtlucred-unisex-jr6185
  - https://www.sport1.no/adidas-f50-club-firm-ground-multi-ground-fotballsko-gresskunstgress-barn-lurabltesoyeluaq-barn-js1479
