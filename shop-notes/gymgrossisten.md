# Gymgrossisten

- URL: gymgrossisten.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none yet — scrapeSource() as it exists today would NOT
  work (see Notes); no affiliate network confirmed either.
- Alternatives: none identified this pass.
- Status: not started
- Notes:
  - Same Salesforce Commerce Cloud/Demandware platform and storefront
    template as [[proteinfabrikken]] (both carry the "Proteinfabrikken"
    brand; near-identical robots.txt, including the same explicit
    AI-crawler allowlist for ChatGPT-User/Claude-User/Google-Extended/
    bingbot/CCBot/Amazonbot).
  - robots.txt disallows account/cart/checkout/wishlist/search paths
    only — product pages open.
  - ToS: `https://www.gymgrossisten.no/Generelle-vilkar.html` read in
    full — standard Norwegian consumer terms (16+ to order, 14-day
    angrerett, levering). No scraping/bot/crawler clause.
  - **Spot-check finding (the actual blocker):** `curl` (sandbox disabled)
    on a real product page
    (`https://www.gymgrossisten.no/whey-tech-protein-1-kg-vanilje/300324.html`)
    → 200, but only ONE `application/ld+json` block — a `BreadcrumbList`,
    no `Product`/`Offer` node, no price literal anywhere in the static
    HTML. Same client-side-rendered-price problem as Proteinfabrikken —
    `scrapeSource()` would throw "no JSON-LD offer price" for every
    product here too.
  - Recommend re-flagging as excluded-for-now unless someone wants to
    invest in reverse-engineering the SFCC price API (new source type,
    out of scope this round).
