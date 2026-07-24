# Life

- URL: life.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirms rich Product/Offer
  JSON-LD (price, availability, AND OfferShippingDetails with
  handlingTime/transitTime — exactly the shape shippingInfo() in
  worker/sources.js already parses). Best-fit candidate of this batch, no
  contract or approval needed.
- Alternatives: none found — no affiliate network signal in this pass.
- Status: not started
- Notes:
  - robots.txt: explicit `Allow: /`, only disallows `/search*`,
    `/checkout*`, and a handful of sort/filter query params. Also has a
    dedicated `User-agent: OAI-SearchBot / Allow: /` block — this shop is
    actively friendly to bot/agent traffic, not just silent.
  - ToS: `https://www.life.no/kundeservice/kjopsvilkar` — read in full,
    standard Norwegian consumer terms (shipping, returns, payment). No
    automated-access/scraping/bot/crawler clause. One relevant line:
    "In case of inaccuracies in stock status or price, Life.no reserves
    the right to cancel the purchase agreement" — a price-accuracy
    disclaimer aimed at Life's own storefront errors, not at third-party
    scraping.
  - Spot-check: `curl` (sandbox disabled) on
    `https://www.life.no/kosttilskudd/vitaminer/betakaroten/life-betakaroten-25-mg-60-tbl`
    → 200, Product JSON-LD:
    `{"@type":"Product","name":"Life Betakaroten 25 MG 60 TBL","offers":{"@type":"Offer","priceCurrency":"NOK","price":219,"availability":"...InStock","shippingDetails":{"shippingRate":{"value":99,"currency":"NOK"},"deliveryTime":{"handlingTime":{"minValue":1,"maxValue":2,"unitCode":"DAY"},"transitTime":{"minValue":2,"maxValue":5,"unitCode":"DAY"}}}}}`
    — a *third* JSON-LD block on the same page carries the same product
    name but `priceCurrency: SEK` / OutOfStock (a life.se cross-list
    artifact); it comes after the NOK block in document order so
    productOffer()'s "first offer with a price" scan lands on NOK first —
    fine as-is, but worth a note if this shop's pages ever get reordered.
  - **New category needed**: vitamins/supplements fit none of
    worker/cats.json's categories. Propose a shared "Health" category
    (icon suggestion: `pill`) with Bodylab/Proteinfabrikken/Gymgrossisten
    — not added this round.
  - Candidate product URLs for worker/extra.json, all real (WebSearch):
    - https://www.life.no/kosttilskudd/vitaminer/betakaroten/life-betakaroten-25-mg-60-tbl
      → id `life-betakaroten-60tbl`, brand Life, cat Health (spot-checked
      above)
    - https://www.life.no/kosttilskudd/magehelse/zerochol-60-tbl → id
      `life-zerochol-60tbl`, brand Life, cat Health
    - https://www.life.no/tips-rad/kvinnehelse/pms/hvorfor-et-pms-produkt/life-multiwoman-90-tbl
      → id `life-multiwoman-90tbl`, brand Life, cat Health
    - https://www.life.no/kosttilskudd/magehelse/melkesyrebakterier/probioform-2l
      → id `life-probioform-2l`, brand Life, cat Health
