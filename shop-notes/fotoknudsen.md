# Fotoknudsen

- URL: fotoknudsen.no
- Category: Electronics & computers / appliances
- Tier: excluded
- Chosen method: n/a
- Alternatives: none
- Status: not started
- Notes: Real recheck done, two independent reasons to exclude. (1) **Product
  model mismatch**: Fotoknudsen isn't a fixed-catalog electronics retailer —
  it's a personalized photo-product creation service (photo books, canvas
  prints, calendars, cards). Prices depend on user-chosen size/page
  count/quantity per order, there's no stable per-SKU price the way
  pricy.no's catalog model expects (same structural issue as Godtlevert in
  the groceries section: "not discrete SKUs"). No 2-4 comparable product
  page URLs exist because there's no fixed product to point at. (2)
  **ToS** (fetched `fotoknudsen.no/vilkar` directly, not the redirected
  helpcenter page): explicitly prohibits "automated or scripted uploading of
  content" (§9.10.1) and states "You are not allowed to reproduce, modify or
  make available to the public any part of our services... Decompiling,
  reverse engineering or any form of translation or editing of our website,
  applications, photo editor and services is not permitted" (§11.2–11.4) —
  broader and more explicit than the "software-IP boilerplate" characterization
  in SHOP-CANDIDATES.md; reads as covering automated access generally, not
  just upload spam. **robots.txt**: actually permissive (explicit `Allow: /`
  for GPTBot/ClaudeBot/PerplexityBot/etc, standard e-commerce sitemap
  disallows only) — so the block here is the ToS + the business-model
  mismatch, not robots. No existing worker/cats.json category fits
  (Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen —
  nothing is "custom photo products"); would need a new category if this
  were ever pursued, which it shouldn't be given the ToS language above.
