# G-Sport / G-Max

- URL: gsport.no
- Category: Sports, outdoor & cycling
- Tier: excluded
- Chosen method: n/a — not an independent shop.
- Alternatives: none — any G-Sport/G-Max SKUs are already reachable via
  Intersport Norge once that source is wired (see
  shop-notes/intersport-norge.md).
- Status: not started
- Notes: Rechecked live (curl -IL, sandbox disabled): `gsport.no/robots.txt`
  302-redirects to `https://www.intersport.no`, and the redirect target
  confirms it's the live Intersport Next.js/Vercel storefront (not a
  parked domain). SHOP-CANDIDATES.md's "redirects to Intersport" note is
  correct and total — there's no separate G-Sport/G-Max site or catalog
  left to scrape. Excluded to avoid double-counting the same underlying
  Intersport offers as a second "shop".
