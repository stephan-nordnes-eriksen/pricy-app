# Eleven

- URL: eleven.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: excluded
- Chosen method: none — not independently operated
- Alternatives: covered by Nordic Feel's own shop instead, if that shop is ever wired (see shop-notes/nordic-feel.md)
- Status: not started
- Notes: SHOP-CANDIDATES.md listed this as "Unknown (fetch tool blocked
  domain)". Real check: `curl -sIL https://eleven.no/` (unsandboxed)
  → `301 → https://www.nordicfeel.no` → `301 → https://www.nordicfeel.com/no`
  → `200`, and the final page's `<title>` is "Parfyme, hudpleie, sminke &
  hårpleie på nett | NordicFeel". Same disposition as Blush (already
  excluded in SHOP-CANDIDATES.md as absorbed into Nordic Feel) — Eleven is
  also no longer an independent storefront, just another redirect into the
  same nordicfeel.com property. Excluding, not re-checking further; if
  Nordic Feel itself gets wired (see the coordinator's shop-notes/nordic-feel.md
  for its affiliate-network research), that covers this shop's catalog too.
