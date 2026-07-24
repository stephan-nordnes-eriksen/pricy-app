# Elektroimportøren

- URL: elektroimportoren.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: n/a yet — see Notes, technical blocker not a legal one
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes: Real recheck done. **ToS** (elektroimportoren.no vilkar, via WebFetch):
  no explicit scraping/bot/automation ban found; only a generic copyright
  clause embedded as an HTML comment on every page ("Slike objekter kan ikke
  kopieres for kommersiell bruk eller distribusjon" — such objects can't be
  copied for commercial use/distribution) — Ambiguous, matches
  SHOP-CANDIDATES.md's verdict. **robots.txt**: `Allow: /` with only a few
  Disallow lines (mypage/cart/checkout paths) — Silent, no bot blocking.
  **Product JSON-LD check** (curl, sandbox disabled, real product page
  `https://www.elektroimportoren.no/philips-hue-wa-being-taklampe-hvit/60603/Product.html`,
  HTTP 200): only `WebSite` and `Organization` JSON-LD blocks present — no
  `Product`/`Offer` schema at all. No microdata (`itemtype`/`itemprop`)
  either, and no price string found anywhere in the raw server HTML (grepped
  for `kr`, `data-price`, common price CSS classes — nothing). Price is
  likely injected client-side via JS/AJAX after load, which `scrapeSource()`
  (plain HTML fetch, no JS) cannot see. So despite an Ambiguous ToS verdict,
  this shop is NOT ready for Phase 1: `productOffer()` would return null and
  every row would be dropped as "no JSON-LD offer price". Would need either
  a look at the page's underlying price API (network-tab level
  investigation, out of scope for this pass) or a different scrape strategy
  before it's buildable. Category fit if it ever works: smart lighting
  (Philips Hue, WiZ, Namron ceiling lamps/strips) maps cleanly to existing
  `Home` category — `worker/extra.json` already has two Philips Hue rows
  under `Home`/`lamp` icon (`ean-8719514289130`, `ean-8719514339965`), so a
  Philips Hue WA Being Taklampe or WiZ SuperSlim would sit naturally next to
  them. Candidate product URLs (not wired, name/brand/cat for later
  extra.json rows if a scrape method is found):
  - Philips Hue WA Being Taklampe Hvit — https://www.elektroimportoren.no/philips-hue-wa-being-taklampe-hvit/60603/Product.html
  - WiZ SuperSlim Taklampe 22W RGB Hvit — https://www.elektroimportoren.no/wiz-superslim-taklampe-22w-rgb-hvit/60951/Product.html
  - Namron Zigbee Luna Takarmatur LED 28W — https://www.elektroimportoren.no/namron-zigbee-luna-takarmatur-led-28w/3308431/Product.html
