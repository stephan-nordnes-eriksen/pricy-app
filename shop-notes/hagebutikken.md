# Hagebutikken

- URL: hagebutikken.no
- Category: Home, interior, furniture, garden & DIY
- Tier: excluded
- Chosen method: none — do not build
- Alternatives: none
- Status: not started
- Notes: Recheck performed (SHOP-CANDIDATES.md had this as "No signal
  found" ingest / Silent verdict) — reclassified to excluded because the
  shop itself is winding down, not because of a ToS/robots block:
  - robots.txt: standard WordPress defaults, nothing blocking product
    pages — not the disqualifier.
  - Site's own JSON-LD (`WebSite` node on
    `https://hagebutikken.no/produkt/hagegjodsel-npk-12-4-18-sekk-10-kg-96/`)
    carries `"description":"Under avvikling"` — i.e. the company states
    itself as under liquidation/winding down. Web search independently
    turned up the same (proff.no-style listing, "only available by
    appointment").
  - Same page's JSON-LD graph has zero `"@type":"Product"` and zero
    `"@type":"Offer"` nodes (only WebPage/ImageObject/BreadcrumbList/
    WebSite/Organization) — scrapeSource()'s productOffer() needs an Offer
    node with a price and would find nothing here regardless.
  - Combination of "business is shutting down" + "no usable Product/Offer
    schema on its own product pages" makes this not worth building even
    though nothing legally blocks it. Not a compliance exclusion like
    Felleskjøpet/Hyttehobbyhage — flagging the distinction for Phase B in
    case the shop's status changes.
