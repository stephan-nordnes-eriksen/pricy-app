# OneCall nettbutikk

- URL: nettbutikk.onecall.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: none viable yet — see Notes
- Alternatives: none identified (no affiliate-network signal found)
- Status: not started
- Notes: SHOP-CANDIDATES.md had "Unknown" ingest / "Unknown (ToS not
  retrievable)" verdict. Real recheck done, same conclusion — still
  unresolved:
  `curl -sL -A 'Mozilla/5.0' https://nettbutikk.onecall.no/robots.txt` did
  **not** return a robots.txt at all — it served the site's own Next.js
  SPA HTML shell (prismic.io preconnects etc.) at that path, i.e. no real
  robots.txt exists / isn't route-handled separately from the app. No
  disallow directives found, but that's because there effectively aren't
  any, not because it was checked and found open.
  WebFetch of `onecall.no/vilkar-og-angrerett/kjop-i-nettbutikk` also
  failed to surface real terms text — got only nav/footer markup, same
  JS-rendering gap SHOP-CANDIDATES already flagged.
  `curl -sL -A 'Mozilla/5.0' <product-url>` on
  `https://nettbutikk.onecall.no/products/apple/iphone-14-pro-max`
  (200 OK, 123 KB) → **zero** `ld+json` / `schema.org` hits. Fully
  client-rendered (Next.js), no static Product markup for
  `scrapeSource()` to parse.
  Same telecom caveat as Ice: phones are sold on subscription/installment
  plans (Klarna instalments, contract bundles), not flat retail prices —
  a second, independent reason this wouldn't be a clean scrape target even
  if JSON-LD existed.
  Recommendation: needs-recheck stays open; no path forward without JS
  rendering or a confirmed affiliate feed (none found).
