# Maanesten

- URL: maanesten.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none yet — JSON-LD shape doesn't match scrapeSource() as-is
- Alternatives: none found
- Status: not started
- Notes: robots.txt is Shopify boilerplate open (`Allow: /`, agentic-access
  friendly, same as Klokker.no/Stefan Papir). Fetched a real product page
  (`https://maanesten.no/products/rio-ring`, 200 OK) and found ld+json, but
  the product node's `@type` is **`ProductGroup`**, not `Product` —
  Shopify's newer variant-aware schema. `productOffer()` in
  worker/sources.js looks for `[n?.offers].flat().find(o => o &&
  (o.price != null || …))` on each top-level node; a `ProductGroup` node
  has no top-level `offers` itself — the real Offers live nested inside
  `hasVariant[].offers` per variant (each variant is its own `"@type":
  "Product"` with a `gtin` and presumably its own `offers`). So the
  generic parser will likely just skip the ProductGroup node and may or
  may not find a variant's nested Product node depending on scan order —
  needs a closer look at whether `hasVariant` items appear as their own
  matchable nodes in the `@graph`, or whether scrapeSource() needs a small
  patch to also check `n.hasVariant[].offers`. Flagging as needs-recheck /
  needs-a-decision rather than assuming it "just works" — this is
  otherwise a clean, Silent, no-approval-needed target (jewelry, would
  share the new "Jewelry" category with Mestergull/David-Andersen/Pandora/
  Bjørklund/Gullfunn/Klokker.no).
