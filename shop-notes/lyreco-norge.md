# Lyreco Norge (Staples.no)

- URL: lyreco.no (same entity as staples.no)
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none yet — blocked on reachability
- Alternatives: none found
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes: Live recheck (`curl -sL https://lyreco.no/robots.txt` and
  `https://www.staples.no/robots.txt`, sandbox disabled): both return
  Akamai's "Access Denied" edge-block page on the robots.txt request
  itself (`errors.edgesuite.net` reference IDs) — a stronger signal than
  SHOP-CANDIDATES.md's plain "Silent" verdict suggested. This looks like
  Akamai bot-management blocking non-browser clients outright, not an
  absence of restriction. Stays needs-recheck; would need a
  browser-rendered fetch (and still might get challenged) before assuming
  scrape is viable — B2B office-supply chain, price-gating behind login is
  also plausible (seen on Norengros/ISA Norge in this same batch).
