# Browser extension (upstream PROMPT 08) — no backend work

Evaluation of `proto/PROMPT - 08 Browser Extension.md` (fetched
2026-08-03). The prompt is explicit: a **concept exploration** — a
static canvas doc (`Extension Explorations.html`) like Logo
Explorations, not wired into the app. **Zero backend implied; nothing
to build here now.** This file records what a real extension would need
so the exploration doesn't silently become a commitment.

If it's ever greenlit:

- **Page → product resolution** is the hard part: content script sees a
  shop URL + JSON-LD. EAN path is easy (the `eans` table; the
  `ean=` lookup from push-and-barcode-scanner.md is the same endpoint).
  URL path could match `offers.url` for crawled shops. Everything else
  needs name-matching — that's cross-shop-product-matching (A) again,
  wearing a trench coat.
- **API posture:** `GET /api/products` is already session-free
  (index.js:1574 — the login wall is client-side only), but an
  extension makes that load-bearing: CORS headers for the extension
  origin, rate limiting, and a deliberate decision that the read API is
  public. Watch/auth from the extension can ride the existing OAuth
  stack built for MCP (allowlist the extension's redirect).
- **Coupons (F4): no data exists** — no coupon table, no source, and
  the prompt's own honesty bar ("dead codes never suggested") means a
  verification pipeline. Treat as a separate product decision, not a
  side-effect of an extension.
- Push mock (F3) is PROMPT 04's push backend — same dependency chain
  (ingest-crawl-robustness B first).

Parked. Revisit only if the exploration graduates to a real deliverable.
