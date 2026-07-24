# HomeStore

- URL: homestore.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: scrapeSource() — clean schema.org Product/Offer JSON-LD on
  real product pages, no approval needed, cheapest option available.
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md
  or otherwise).
- Status: not started
- Notes:
  - Real check performed: WebFetch on https://www.homestore.no/pages/conditions
    (ToS) — no scraping/bot/automation clause. curl (sandbox disabled) on
    /robots.txt — generic `Disallow` list is checkout/invoice/search
    housekeeping paths only (kontrollpanel, search, pdfinvoice, etc.),
    `Crawl-delay: 5`, no bot-name blocks, Googlebot explicitly `Allow: /`.
    Confirms SHOP-CANDIDATES.md's "Silent" verdict.
  - Category fit: **none of the current worker/cats.json categories fit**
    (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers,
    Kitchen). HomeStore sells hvitevarer (washing machines, fridges, dryers,
    dishwashers) — a new cats.json category (e.g. "Appliances"/"Whitevarer")
    + extra.json rows would be needed before this shop can ship any products.
    Flagging for Phase B / a cats.json decision, not wiring anything now.
  - Candidate real product URLs (all washing machines, same missing category
    problem — picked as the clearest JSON-LD spot-check, not because they're
    ready to onboard):
    - https://www.homestore.no/products/aeg-vaskemaskin-8-kg-1400-omin-lr724o84n
    - https://www.homestore.no/products/electrolux-vaskemaskin-med-torketrommel-9-kglwr732a96k
    - https://www.homestore.no/products/electrolux-vaskemaskin-8-kg-lr612m84i
    - https://www.homestore.no/products/electrolux-vaskemaskin-9-kg-aeg-lr622o94d-6000
  - JSON-LD spot-check (curl, sandbox disabled) on the AEG URL: clean
    `@graph` with a `Webpage.mainEntity` of `@type: Product` — `name`, `sku`,
    `brand.name`, `image`, and `offers: { @type: Offer, priceCurrency: NOK,
    price: "7459.00", availability: https://schema.org/InStock, itemCondition,
    url }`, plus a `BreadcrumbList` (Hjem → Hvitevarer → Vask & Tørk →
    Vaskemaskin → product). scrapeSource()'s `productOffer()` would find this
    fine (it recurses `@graph`) — this is a Confirmed JSON-LD shop, not
    Inconclusive.
