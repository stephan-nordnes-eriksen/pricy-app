# Autodoc (Norway)

- URL: autodoc.co.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none yet — blocked on reachability
- Alternatives: Autodoc has affiliate programs elsewhere in the EU
  (SHOP-CANDIDATES.md), unconfirmed for Norway — worth a directory search
  (Awin/Adtraction/Tradedoubler) before assuming scrape is the only path.
- Status: not started
- Notes: Live recheck (`curl -sL https://autodoc.co.no/robots.txt`, sandbox
  disabled) returns a Cloudflare "Just a moment..." JS challenge page, not
  robots.txt content — confirms SHOP-CANDIDATES.md's "Cloudflare challenge"
  verdict rather than overturning it. Didn't attempt a product-page fetch
  since the domain itself is gated at the edge. Stays needs-recheck: retry
  later with a browser-rendered fetch, or check EU affiliate networks for a
  NO-market program before spending more effort on scraping.
