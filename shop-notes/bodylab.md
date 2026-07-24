# Bodylab

- URL: bodylab.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirms product pages carry
  standard schema.org Product/Offer JSON-LD with an NOK price; no contract
  or approval needed, code already exists. Matches the table's "Silent"
  verdict.
- Alternatives: none found — no affiliate network signal in this pass.
- Status: not started
- Notes:
  - robots.txt only disallows `/search/`, `/account/`, `/checkout/`,
    `/widgets/` — product pages wide open.
  - ToS: `https://www.bodylab.no/kundeservice/handelsvilkaar` — read in
    full, standard Norwegian consumer sales terms (angrerett, levering,
    betaling). No automated-access/scraping/bot/crawler/price-comparison
    clause.
  - Spot-check: `curl` (sandbox disabled) on
    `https://www.bodylab.no/whey-100-1-kg` → 200, Product JSON-LD:
    `{"@type":"Product","name":"Whey 100 (1 kg)","sku":"M0008","brand":{"name":"Bodylab"},"offers":{"@type":"Offer","priceCurrency":"NOK","price":399.0,"availability":"...InStoc[k]"}}`
    — clean hit for productOffer().
  - **New category needed**: sports-nutrition/supplements fit none of
    worker/cats.json's categories. Propose a "Health" category (icon
    suggestion: `pill`) shared with Life/Proteinfabrikken/Gymgrossisten —
    not added this round.
  - Candidate product URLs for worker/extra.json, all real (found via
    WebSearch):
    - https://www.bodylab.no/whey-100-1-kg → id `bodylab-whey100-1kg`,
      brand Bodylab, cat Health (spot-checked above)
    - https://www.bodylab.no/creatine-capsules-180-stk → id
      `bodylab-creatine-caps-180`, brand Bodylab, cat Health
    - https://www.bodylab.no/whey-100-deluxe-1-kg → id
      `bodylab-whey100-deluxe-1kg`, brand Bodylab, cat Health
    - https://www.bodylab.no/casein-protein-750-g → id
      `bodylab-casein-750g`, brand Bodylab, cat Health
