# Gimle Parfymeri

- URL: parfymeri.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirms clean product-detail
  URLs carry standard schema.org Product/Offer JSON-LD with an NOK price;
  no contract or approval needed, code already exists.
- Alternatives: none found — Ingest notes said "Unknown", no affiliate
  network signal turned up in this pass.
- Status: not started
- Notes:
  - robots.txt (Magento default) disallows `/catalog/product/view/`,
    `/catalog/category/view/` (the raw controller paths) — but real product
    pages use clean URLs like `/byredo-mojave-ghost-eau-de-parfum`, which
    are NOT blocked. Same pattern SHOP-CANDIDATES.md notes for
    Klokkegiganten ("category paths disallowed, product pages open").
  - No dedicated ToS/vilkår/kjøpsvilkår page found on the site (checked
    `/vilkar` → 404, homepage footer only links "Om oss" / "Ordre og
    Returer" / "Kontakt oss" — no scraping/automation clause exists to
    trip on).
  - Spot-check: `curl` (sandbox disabled) on
    `https://www.parfymeri.no/byredo-mojave-ghost-eau-de-parfum` → 200,
    one `application/ld+json` Product block:
    `{"@type":"Product","name":"Byredo Mojave Ghost Eau de Parfum","brand":{"name":"Byredo"},"offers":{"@type":"Offer","priceCurrency":"NOK","price":"2690.00","availability":"...InStock","seller":{"name":"Gimle Parfymeri"}}}`
    — productOffer() would find this cleanly.
  - **New category needed**: none of worker/cats.json's categories (Audio,
    Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers,
    Kitchen) fit perfume/skincare/makeup. Propose a "Beauty" category
    (icon suggestion: `sparkles`) + worker/extra.json rows — not added
    this round.
  - Candidate product URLs for worker/extra.json (name/brand/cat/icon/kw),
    all real, found via WebSearch + confirmed reachable:
    - https://www.parfymeri.no/byredo-mojave-ghost-eau-de-parfum
      → id `byredo-mojave-ghost-edp100`, brand Byredo, cat Beauty
      (spot-checked above)
    - https://www.parfymeri.no/creed-millesime-spring-flower-75ml
      → id `creed-millesime-spring-flower-75`, brand Creed, cat Beauty
    - https://www.parfymeri.no/d-s-durga-coriander-50ml
      → id `dsdurga-coriander-50`, brand D.S. & Durga, cat Beauty
    - https://www.parfymeri.no/byredo-bal-d-afrique-body-lotion-225ml
      → id `byredo-bal-dafrique-lotion-225`, brand Byredo, cat Beauty
