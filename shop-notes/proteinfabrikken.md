# Proteinfabrikken

- URL: proteinfabrikken.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() as it exists today would NOT
  work (see Notes); no affiliate network confirmed either.
- Alternatives: none identified this pass.
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/*prefn*=*, /*prefv*=*, /*pmin*, /*pmax*). Not crawled, not wired.
- Notes:
  - Platform: Salesforce Commerce Cloud/Demandware (`prefn`/`prefv`
    facet params, `on/demandware.store/*` disallow, `?dwcont*` cart
    param) — same tech + storefront pattern as Gymgrossisten (both sell
    the "Proteinfabrikken" brand; likely same corporate group).
  - robots.txt disallows account/cart/checkout/wishlist paths only —
    product pages open — AND carries a block explicitly opting AI
    crawlers IN (`User-agent: ChatGPT-User/Claude-User/Google-Extended/
    bingbot/CCBot/Amazonbot` all `Disallow:` empty = allowed).
  - ToS: `https://www.proteinfabrikken.no/generelle-vilkar.html` read in
    full — standard Norwegian consumer terms (angrerett, levering,
    betaling, Forbrukertvistutvalget). No scraping/bot/crawler clause.
  - **Spot-check finding (the actual blocker):** `curl` (sandbox disabled)
    on a real product page
    (`https://www.proteinfabrikken.no/whey-tech-protein-1kg-sjokolade/300322.html`)
    → 200, but only ONE `application/ld+json` block on the page, and it's
    a `BreadcrumbList` — no `Product`/`Offer` node, no price anywhere in
    static HTML (checked for a `"price":` literal and a `dataLayer` price
    payload — neither present). Price is very likely injected client-side
    by an SFCC pricing widget/API call after page load. `scrapeSource()`'s
    `productOffer()` only reads static JSON-LD, so it would throw "no
    JSON-LD offer price" for every product on this shop — confirmed dead
    end for the current scraper, not just an untested one.
  - To actually ingest this shop would need either: (a) reverse-engineer
    the SFCC pricing API/endpoint the page calls client-side and add a
    new source type, or (b) find an affiliate feed (none confirmed — "No
    public affiliate feed" per SHOP-CANDIDATES.md, not re-verified here).
    Recommend re-flagging as excluded-for-now unless someone wants to
    invest in a new scraper path in Phase B.
