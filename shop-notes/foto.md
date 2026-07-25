# Foto.no

- URL: foto.no
- Category: Electronics & computers / appliances
- Tier: needs-recheck
- Chosen method: none viable yet — see Notes
- Alternatives: none identified (no affiliate-network signal found)
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/bin/, /obj/, /fckeditor/, /Services/). Not crawled, not wired.
- Notes: SHOP-CANDIDATES.md had "Unknown" ingest / "Silent" verdict. Real
  recheck done:
  `curl -sL -A 'Mozilla/5.0' https://www.foto.no/robots.txt` → genuinely
  open (`Allow: /`, only blocks admin/checkout/search/internal paths —
  `/bin/`, `/Kasse/`, `/Logginn.aspx`, `/search`, etc — no product-path
  block, no named bot block). Silent verdict confirmed for robots.
  WebFetch of `foto.no/kundesenterinfo/alt-om-handleopplevelsen/kjopsbetingelser`
  only returned nav/footer (JS-rendering gap), so ToS text itself is still
  not independently confirmed — same caveat SHOP-CANDIDATES already noted.
  BUT the actual blocker: `curl -sL -A 'Mozilla/5.0' <product-url>` on
  `https://www.foto.no/sony/175345/sony-a7r-vi-kamerahus-66-8-mp-fullformat-kamera`
  (200 OK, 137 KB) → **zero** `ld+json`/`schema.org` hits. Despite Silent
  robots/ToS, the product page itself ships no static Product markup —
  fully client-rendered, nothing for `scrapeSource()`'s `productOffer()`
  to parse. Not a compliance blocker, a technical one.
  Recommendation: needs-recheck stays open — would need JS rendering (out
  of scope for the Worker-based scraper) or a confirmed affiliate program
  (none found this pass) before this shop is viable.
