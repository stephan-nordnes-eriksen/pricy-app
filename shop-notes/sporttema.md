# Sporttema

- URL: sporttema.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — cheapest viable
  option: real per-SKU Product JSON-LD with offers/price confirmed, no
  robots/ToS restriction found, no code changes needed (existing JSON-LD
  parser handles this shape as-is).
- Alternatives: none found — no affiliate-network signal in
  SHOP-CANDIDATES.md or this recheck.
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://sporttema.no/sitemap.xml`); 313 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off):
  disallows `/admin/`, `/apps/`, `/account/`, `/api/`, `/frontend-api/`,
  and `?filters`/`?sort` query params — no block on product/category
  browsing paths themselves. **ToS**: no reachable terms/vilkår link found
  in the homepage footer this round (site is Shoplazza-hosted, no obvious
  `/vilkar` path) — treat as unverified, not "checked clean"; robots.txt is
  the only hard signal here. **JSON-LD spot-check** on
  `https://sporttema.no/styrke/hantler`: confirmed real
  `{"@context":"schema.org","@type":"Product","name":"Håndvekter",...}`
  block WITH `offers`/`price` fields present (grepped the raw JSON)  —
  scrapeSource()'s existing `productOffer()` will parse this cleanly.
  Sells fitness/training equipment (dumbbells, exercise bikes, multigyms) —
  maps to NO existing worker/cats.json category (Audio, Phones, TV,
  Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen); a new
  "Sports"/"Fitness" category + worker/extra.json rows would be needed
  before this shop's products could actually be added (not done this
  round). Candidate product pages for later worker/extra.json rows:
  https://sporttema.no/styrke/hantler (Håndvekter/dumbbells, spot-checked
  above), https://sporttema.no/no/categories/traningscykel (exercise
  bikes), https://sporttema.no/no/categories/multigym (multigyms),
  https://sporttema.no/fitness-yoga/fitnessutstyr (general fitness gear).
