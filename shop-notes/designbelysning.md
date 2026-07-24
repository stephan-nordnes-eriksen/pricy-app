# Designbelysning

- URL: designbelysning.no
- Category: Home, interior, furniture, garden & DIY
- Tier: excluded
- Chosen method: n/a — domain is defunct.
- Alternatives: none — not a viable source at all.
- Status: not started
- Notes: SHOP-CANDIDATES.md flagged "503 WAF" as the verdict, worth a real recheck — did it, and the shop is gone.
  - `curl https://www.designbelysning.no/robots.txt` doesn't return a robots file at all — it returns a WordPress "maintenance mode" HTML page whose body says (translated): *"Designbelysning.no is for sale... one of the early Norwegian lighting webshops, established ~20 years ago... today around 5,000 products... a strategic opportunity for established players to strengthen SEO visibility / consolidate domain authority... sale concerns the domain and its digital structure."*
  - This is a domain-parking/for-sale page, not a transient 503 — the shop has ceased operating and the domain itself is listed for sale. Nothing to scrape, no live catalog, no prices.
  - Recommend removing this shop from future candidate lists entirely; it's not "blocked", it's gone.
