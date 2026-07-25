# Gamezone

- URL: gamezone.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD, robots.txt is Silent on product paths (only blocks admin/checkout/search), ToS page (kundeservice/vilkar) has no automation/scraping clause. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate program signal in SHOP-CANDIDATES.md).
- Status: working — full-catalog sitemap discovery live 2026-07-25 (`tools/crawl-urls.json` → `$discover`, sitemap `https://gamezone.no/sitemap.xml`); 364 priced rows ingested to pricy.no in that run. Products with no gtin ride `p-<brand-name-slug>` ids (worker/sources.js `slugId`); categories come from the shared `CAT_RULES` vocabulary, so no per-shop CATMAP table was needed.
- Notes: `curl https://gamezone.no/robots.txt` (sandbox disabled) shows `Allow: /` with only `/bin/`, `/Kasse/` (checkout), `/search` etc. disallowed — product/category paths open. WebFetch of gamezone.no/kundeservice/vilkar found no automated-access/bot/scraping language. Real product page `https://gamezone.no/brettspill/129618/scythe-brettspill` returns clean JSON-LD: `{"@type":"Product","name":"Scythe Brettspill",...,"offers":{"@type":"Offer","availability":"...InStock","priceCurrency":"NOK","price":768.0}}` — exactly the shape `productOffer()` expects, price parses fine.

  Category mapping: Gamezone sells board games, TCG/Warhammer, gadgets & candy. Board games loosely fit the existing "Toys" cat (worker/cats.json); gadgets/candy don't map to anything current — a dedicated "Hobby" or "Games" category would fit better than shoehorning into Toys, but Toys works as a stopgap for the board-game SKUs. Flag for Phase B decision.

  Candidate product URLs for worker/extra.json (all real, spot-checked one):
  - https://gamezone.no/brettspill/129618/scythe-brettspill (Scythe Brettspill, brand "Brettspill" per JSON-LD — likely the publisher isn't captured well, verify brand field before wiring) — proposed id `scythe-brettspill`, cat `Toys` (or new "Hobby"), kw board game/strategy
  - https://gamezone.no/brettspill-nettbutikk/klassikere (category page, not a product — use for discovery, not as an extra.json row)
  - https://gamezone.no/brettspill/31005/backgammon-komplett-i-tre-39-cm-kommer-i-flott-treeske-m-trebrikker (Backgammon i tre 39cm) — proposed id `backgammon-tre-39cm`
  - https://gamezone.no/brettspill/164339/sjakk-dgt-centaur-chess-computer (DGT Centaur chess computer) — proposed id `dgt-centaur`
  - https://gamezone.no/brettspill/150376/sjakksett-best-chess-set-ever-50cm-50x50cm-triple-weighted (Best Chess Set Ever 50cm) — proposed id `best-chess-set-ever`
  - All four found via real category browse (`gamezone.no/brettspill-nettbutikk/klassikere`), not fabricated. Only the Scythe URL was spot-checked for JSON-LD (rest are same platform, same template — high confidence but not individually verified).

  JSON-LD spot-check result: PASS — Product+Offer present, price+currency+availability all populate cleanly.
