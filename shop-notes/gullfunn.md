# Gullfunn

- URL: gullfunn.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: phase1-scrape
- Chosen method: scrapeSource() — RECLASSIFIED from SHOP-CANDIDATES.md's
  "Possible Adtraction, unverified" / Silent. Live recheck: `robots.txt`
  redirects to the homepage (no robots.txt file exists → no restriction,
  confirmed 200 at `https://www.gullfunn.no/`). Fetched a real product page
  and confirmed full Product + Offer JSON-LD with a real NOK price — no
  contract or approval needed, cheapest option beats chasing an unverified
  Adtraction listing.
- Alternatives: "Possible Adtraction" per SHOP-CANDIDATES.md but
  unverified — worth checking the Adtraction directory in Phase B, but
  scrape works today with zero setup.
- Status: not viable 2026-07-25 — no sitemap: no usable sitemap to drive full-catalog discovery from.
- Notes:
  - **Category mapping**: jewelry/watches/bunad silver/gifts — needs the
    new **"Jewelry"** category (shared with Mestergull/David-Andersen/
    Pandora/Bjørklund/Klokker.no) — not added this round.
  - **Candidate product URLs** (real, from
    `https://www.gullfunn.no/sitemap.xml`):
    - https://www.gullfunn.no/produkter/125626/charms-i-925-solv-med-dommerfloyte
    - https://www.gullfunn.no/produkter/125634/charms-925-solv-med-skjell
    - https://www.gullfunn.no/produkter/13172/ring-i-925-forgylt-solv-med-sort-zirkonia
    - https://www.gullfunn.no/produkter/13899/ring-i-585-gult-gull-med-zirkonia
  - **JSON-LD spot-check** (charms-dommerfløyte URL, 200 OK): confirmed
    `"@type":"Product"` and `"@type":"Offer"` both present in one ld+json
    block (Sanity-backed storefront). Usable by scrapeSource() as-is.
