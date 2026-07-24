# XL-BYGG

- URL: xl-bygg.no
- Category: Home, interior, furniture, garden & DIY
- Tier: needs-recheck
- Chosen method: none yet — actively bot-walled, can't even read robots.txt
- Alternatives: none found (SHOP-CANDIDATES.md notes a "Confirmed affiliate (network unconfirmed)" ingest signal — worth chasing in a later pass if the network can be identified, since that would sidestep the scrape block entirely)
- Status: not started
- Notes:
  - SHOP-CANDIDATES.md verdict going in was "Unknown (429 rate-limited)" from a single WebFetch pass. Rechecked with a direct curl (sandbox disabled, spaced from other requests) instead of hammering it further: `https://xl-bygg.no/robots.txt` returns a full **Vercel Security Checkpoint** bot-challenge page (JS-obfuscated proof-of-work challenge, `arn1::...` ray-id, "We're verifying your browser" / blocks non-browser clients), not actual robots.txt content and not a 429.
  - This is an active anti-bot wall at the infra level (Vercel's own bot-detection product), not a site-authored robots.txt/ToS policy — curl/plain fetch cannot pass it, and repeatedly trying would be pointless (and rude). Did not attempt the product page or ToS for the same reason — a challenge on `/robots.txt` means every other path gets the same treatment.
  - This is a harder, more definitive block than "Unknown" — reclassifying as needs-recheck with the technical reason documented, since it isn't safely callable by `scrapeSource()` (plain `fetch()`, no JS execution) at all. Not marking `excluded` outright since it's an infra-level bot wall rather than an explicit ToS prohibition or robots disallow — if the "Confirmed affiliate" lead from SHOP-CANDIDATES.md pans out, that path bypasses the checkpoint entirely (feed fetches don't hit the storefront).
  - No category-mapping or candidate-URL research done — couldn't reach a single page.
