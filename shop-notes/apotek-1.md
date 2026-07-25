# Apotek 1

- URL: apotek1.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none viable yet — see Notes
- Alternatives: none found (no affiliate-network signal in any search)
- Status: not viable 2026-07-25 — sitemap reachable, but a sampled discovery crawl through `discoverSource()` produced no priced JSON-LD offer on any page tried (several sub-sitemap/UA/path-filter combinations). Nothing to ingest until the shop's markup changes.
- Notes: Did a real check, not just the ToS text. `curl -sL https://www.apotek1.no/robots.txt`
  (unsandboxed) shows a Silent robots.txt — `Disallow: /p/`, `/artikler/`,
  `/komponenter/` etc, none of which match the real product path
  (`/produkter/<slug>p`, confirmed via a live product URL:
  `https://www.apotek1.no/produkter/apotek-1-d3-vitamin-draaper-25ml-924869p`).
  WebFetched `apotek1.no/kundesenter/kjopsbetingelser` — no automated-access/
  scraping/bot clause found. So ToS/robots are fine.

  The blocker is technical, not legal: `curl`ing the live product URL
  (HTTP 200, unsandboxed) returns an Angular universal-style SSR shell with
  **no server-rendered content at all** — `<title>Apotek 1</title>` (not the
  product name), no `og:title`, no price string, zero `application/ld+json`
  blocks. It's a client-side-rendered SPA; `scrapeSource()`'s plain `fetch()`
  will never see product data here, JSON-LD or otherwise. Would need either
  a headless render (out of scope for the Worker) or a reverse-engineered
  JSON API behind the Angular app — worth a follow-up look at the network
  tab in a real browser before writing this shop off entirely. Also: Vitusapotek
  (same "Beauty, health & pharmacy" bucket, same product category) DOES
  render server-side JSON-LD — see `shop-notes/vitusapotek.md` — so if
  pharmacy coverage is wanted, prioritize that one over this one for now.
