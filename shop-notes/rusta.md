# Rusta

- URL: rusta.com/nb-no (also rusta.no, redirects there)
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — Product/Offer
  JSON-LD confirmed live, robots.txt wide open, ToS silent on scraping. No
  approval needed, cheapest option.
- Alternatives: none found (no affiliate-network signal for NO)
- Status: not started
- Notes: Recheck performed (SHOP-CANDIDATES.md had this as "Unknown"
  ingest / Silent verdict):
  - robots.txt (`curl -sL https://rusta.com/robots.txt`): `User-agent: *` /
    `Sitemap: ...` only — no Disallow at all.
  - ToS (WebFetch `kjopsvilkar/kjop-nett`): consumer purchase terms only
    (payment, delivery, returns, warranty), no scraping/bot/automation
    language.
  - Spot-checked product page
    `https://www.rusta.com/nb-no/hage/hagemobler/parasoll/parasoll-tilt-marstrand-o200-cm-gra-polyester`:
    2x `"@type":"Product"`, 2x `"@type":"Offer"`, `"price":"199.00"`,
    `"priceCurrency":"NOK"` — standard schema.org, scrapeSource()'s
    productOffer() will parse this fine.
  - Category mapping: Rusta is a general budget home/garden chain (Sweden-
    owned). Its catalog is overwhelmingly furniture/garden/décor, which
    does NOT fit any current worker/cats.json category (Audio, Phones, TV,
    Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) well —
    a new "Garden" or "Furniture" category + worker/extra.json rows would
    be needed for most of the catalog. Some SKUs (storage boxes, indoor
    décor) could plausibly ride the existing "Home" category if Phase B
    wants a smaller first slice.
  - Candidate product URLs for worker/extra.json (all garden furniture,
    proposed cat: new "Garden", icon candidate `armchair` or similar,
    brand "Rusta"):
    1. `https://www.rusta.com/nb-no/hage/hagemobler/parasoll/parasoll-tilt-marstrand-o200-cm-gra-polyester`
       — "Parasoll, tilt Marstrand", kr 199–499
    2. `https://www.rusta.com/nb-no/hage/hagemobler/parasoll/parasollfot-30-kg-gra-granittrustfritt-stal`
       — "Parasollfot 30 kg", kr 599
    3. `https://www.rusta.com/nb-no/hage/hagemobler/parasoll/parasoll-sidehengende-sandhamn-o300-cm-gra-polyester`
       — "Parasoll, sidehengende Sandhamn", kr 1299
    4. `https://www.rusta.com/nb-no/hage--og-utemobler/parasoller-og-parasollfotter/parasoll-tilt-o180-cm-bla-polyester-604013520102`
       — "Parasoll, tilt Ø180cm blå"
