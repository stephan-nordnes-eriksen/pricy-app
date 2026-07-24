# Guttelus

- URL: guttelus.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape — real check confirms same Shopify agent-friendly robots.txt as Junior Barneklær/Kidsdreamstore. JSON-LD is present, so this is still the cheapest path, but with a caveat below.
- Alternatives: none found.
- Status: not started
- Notes: robots.txt open (Shopify boilerplate, explicit agents.md welcome). Curled a real product page (`https://guttelus.no/products/gullkorn-bukse-villvette-askebla`) — JSON-LD is present but shaped as `@type: ProductGroup` with a `hasVariant` array of `@type: Product` sub-nodes, each carrying its own nested `offers`. worker/sources.js's `productOffer()` only looks for `offers` directly on top-level/@graph nodes, not inside `hasVariant` — **this shop's JSON-LD would NOT be picked up by scrapeSource() unmodified**; Phase B would need a small productOffer() extension to also check `n.hasVariant?.[0]?.offers` (or similar) before this shop can actually be wired, even though the tier is still phase1 (no ToS/affiliate blocker, just a parser gap). Kids clothing (newborn–16y) — no existing pricy.no category fits.
