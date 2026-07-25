# Würth Norge

- URL: nettbutikk.wuerth.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — likely not viable (B2B, bot-blocked)
- Alternatives: none found
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/*oauth*?*redirect_uri, /*authorize*?*redirect_uri, /is-bin/INTERSHOP.enfinity/, /*ViewRequisition-ViewOrderSummary). Not crawled, not wired.
- Notes: robots.txt is reachable and mostly open (Intershop-platform
  disallows are narrow — login/basket/quick-buy AJAX endpoints, not
  product pages). But a live fetch of a real category page
  (`https://nettbutikk.wuerth.no/Produktkategorier/Agriculture-and-gardening/…`)
  returned **HTTP 403** — the storefront itself blocks non-browser
  requests even where robots.txt allows it. SHOP-CANDIDATES.md already
  flags this as "Likely B2B" (workshop-supply catalog, business accounts,
  pricing commonly gated behind login) — consistent with the 403. Not
  worth pursuing without confirming (a) a public/list price is shown to
  anonymous visitors at all, and (b) a way past the 403. Stays
  needs-recheck.
