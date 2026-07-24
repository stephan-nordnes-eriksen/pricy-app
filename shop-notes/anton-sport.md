# Anton Sport

- URL: antonsport.no
- Category: Fashion, clothing & shoes (also listed in Sports, outdoor & cycling — same shop, pointer only there)
- Tier: needs-recheck
- Chosen method: none — genuinely bot-walled, confirmed with a real (non-sandboxed) check, not just an unreliable WebFetch/sandboxed-curl artifact.
- Alternatives: none identified — no affiliate-network signal found either (Ingest notes: Unknown).
- Status: not started
- Notes:
  - **Real recheck done** (SHOP-CANDIDATES.md's scrape verdict was "Unknown (429 rate-limited)" — confirmed, not a fluke).
  - `curl -sL -o /dev/null -w "%{http_code}" https://antonsport.no/robots.txt` (sandbox disabled): **HTTP 429**, i.e. the site rate-limits/blocks even a single `robots.txt` request from this UA/IP.
  - A direct page fetch (attempted while probing the domain generally) returned a **Vercel Security Checkpoint** bot-challenge page — heavily obfuscated inline JavaScript running a browser-fingerprint challenge before granting access, titled "Vercel Security Checkpoint" with "We're verifying your browser" copy. This is a real, active bot-detection layer (likely Vercel's own bot-management product or a similar service sitting in front of an Astro-based frontend), not a false negative from a markdown-converting tool.
  - This shop is genuinely not scrapable without a real browser (headless Chrome solving a JS challenge) — out of scope for `scrapeSource()`'s plain `fetch()`. No affiliate-network alternative was found either. Leaving as needs-recheck rather than inventing a tier for "blocked but not by ToS/robots.txt" — there's no cheap path here right now; revisit only if a real browsing tool becomes available or the site's bot-management posture changes.
