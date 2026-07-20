# Adtraction rollout cookbook (PLAN.md 4d task 2)

Account created 2026-07-19 (channel: pricy.no). Advertiser approvals take
days-to-weeks — this is the pick-it-up-later runbook. All Worker code is
already shipped (`worker/sources.js`); everything below is dashboard work
and config.

## Part 1 — human, in the Adtraction dashboard

- [ ] Confirm the pricy.no channel itself is approved by Adtraction.
- [ ] Apply to advertiser programs (all at once; they trickle in):
  - [ ] Elkjøp
  - [ ] Komplett
  - [ ] NetOnNet
  - [ ] Dustin
  - [ ] Clas Ohlson
  - [ ] CDON
  - [ ] Power — search the directory first; presence unverified
  - [ ] Proshop — same. If neither is on Adtraction, they stay on
        scrape/manual crawl; fallback networks per PLAN.md: Awin,
        Partner-ads, Tradedoubler.
- [ ] Per approved program: copy the **product feed URL** (Tools →
      Product feeds, or on the program page). It embeds your channel
      token — treat it as a secret, don't commit it.

## Part 2 — wiring (hand the URLs to Claude, or do by hand)

One approved feed is enough to start; repeat per shop as approvals land.

1. **Verify field names** against the candidates in `worker/sources.js`
   (`ean/gtin/gtin13/barcode`, `price/priceinclvat`,
   `instock/availability/stock`, `trackingurl/producturl/url/deeplink`):

   ```sh
   curl -s "<feed-url>" | head -c 4000
   ```

   New tag name → add it to the `pick(...)` candidates in
   `adtractionSource()`.

2. **Set the secret** — whole `{shop: url}` map every time (it replaces,
   not merges):

   ```sh
   npx wrangler secret put ADTRACTION_FEEDS
   # paste: {"Elkjøp":"https://…","Komplett":"https://…"}
   ```

3. **Flip the shop(s) into SOURCES** in `wrangler.jsonc` — only shops
   that have a feed URL:

   ```jsonc
   "vars": { "SOURCES": { "Elkjøp": { "type": "adtraction" } } }
   ```

4. **Test + deploy:** `npm test`, then `npm run deploy`.

5. **Verify in prod:** wait for the hourly cron (or
   `npx wrangler tail pricy` and watch an `ingest:` line), then
   spot-check `https://pricy.no/api/catalog.json` for real prices and
   feed deep links on that shop.

6. **Extend `worker/eans.json`** with variant EANs the feed reveals
   (13-digit, zero-padded, confirmed same product only). Feed rows with
   unknown EANs are silently skipped — low match count means missing
   variants, not a bug.

## Scrape reachability (probed 2026-07-20, honest UA)

Seed offers exist for all eight network shops; `crawl-urls.json` covers the
shops that let us scrape. The rest refuse our UA outright — that's what the
feeds are for, don't work around it:

- **Clas Ohlson, Power, CDON** — scraping works, URLs in `crawl-urls.json`.
- **Proshop** — sitemap open; 10 EAN-confirmed URLs in `crawl-urls.json`.
  Discovery's own page fetches worked, but heavy crawling trips a
  longer-than-8-min 429 ban — keep `crawl.mjs` runs occasional.
- **Elkjøp** — 429 on first contact, even robots.txt; standing bot block.
- **NetOnNet** — 403 on everything.
- **Komplett** — connection killed at the TLS layer regardless of UA.
- **Dustin** (dustinhome.no) — sitemaps served, product pages 403.

Blocked shops freeze at seed prices until their Adtraction feed lands
(they're all on the application list above). `POST /api/ingest` still
accepts hand-entered rows for any shop if a price must move before then.

## Aftermath (once first feed is stable)

- Shops covered by a feed: remove their entries from
  `tools/crawl-urls.json` — the cron owns them now, laptop crawl drops
  out per shop.
- Ten products currently have zero real offers (tv, ps5, steamdeck, s24,
  pixel8, lgc3, bravia, roborock, hue, mba) — Elkjøp/Komplett/NetOnNet
  feeds should cover most; re-check the coverage table in PLAN.md 4d.
- Pending product decision (PLAN.md): seeded demo prices still undercut
  real ones — purge demo offers once feed coverage is decent, or "Best"
  stays a dead seed row.
