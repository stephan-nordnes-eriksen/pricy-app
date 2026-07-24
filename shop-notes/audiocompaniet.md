# Audiocompaniet

- URL: audiocompaniet.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: undetermined — see notes.
- Alternatives: none found.
- Status: not started
- Notes:
  - Real check performed: WebFetch found the real terms page at
    https://www.audiocompaniet.no/side/kjopsbetingelser via the site footer
    (search alone couldn't find it) — no clause on automated access/
    scraping/bots/crawlers. curl (sandbox disabled) on /robots.txt — blocks
    AhrefsBot/SemrushBot/SemrushBot-SA/MJ12bot/dotbot outright, but the `*`
    and `Googlebot` groups only disallow admin/checkout/account/search
    paths (`/admin`, `/kasse`, `/konto`, `/search`, etc.) — no general
    scraper or price-comparison block. Confirms SHOP-CANDIDATES.md's
    "Ambiguous" verdict has no real restriction for a normal fetch UA.
  - However: tried 2 real product pages via curl (sandbox disabled) —
    https://www.audiocompaniet.no/produkt/merker/copland-audio/copland-audio-cta-408
    (200 OK) and the earlier `.../integrerte-forsterkere/.../copland-csa-100`
    URL (which actually 200-redirects to a search results page, not a real
    product — a dead lead from search). Neither has a single
    `application/ld+json` script anywhere in the HTML. scrapeSource()'s
    JSON-LD-only parser finds nothing here.
  - Category fit would be **Audio** (high-end hifi amps/speakers) if a
    working ingest method is found.
  - Next step: same as Oslo Hifi Center — no structured data at all on real
    product pages checked, so this needs a custom HTML scraper (visible
    price/name text) rather than scrapeSource() as it exists today. Flag
    for Phase B triage rather than Phase 1.
