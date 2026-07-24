# Fjellsport.no

- URL: fjellsport.no
- Category: Sports, outdoor & cycling
- Tier: phase1-scrape
- Chosen method: first-party scrape via scrapeSource() — real per-SKU
  Product JSON-LD confirmed, no ToS restriction, and the one robots.txt
  block doesn't actually cover the product-detail path. Cheaper than
  chasing the unconfirmed affiliate program SHOP-CANDIDATES.md flagged,
  since that network was never identified (see below).
- Alternatives: SHOP-CANDIDATES.md notes "some affiliate program,
  unconfirmed network" — searched for Fjellsport.no + Adtraction/Awin/
  Partner-ads/Tradedoubler this round and found no confirmation of any of
  the four; not pursued further.
- Status: not started
- Notes: Real recheck performed. **robots.txt** (curl, sandbox off):
  disallows `/search/`, `/checkout/`, `/mine-sider/`, `/produkter/`,
  `/media/`, `/customer/`, plus filter query params — `/produkter/` looked
  alarming at first (it's the category-browsing tree, e.g.
  `/produkter/herreklaer.html`) but the site's actual per-SKU product
  pages live at a DIFFERENT path, `/merker/<brand>/<slug>` — which is NOT
  in the Disallow list. **ToS** at `/faq/terms` (WebFetch): purchase/
  delivery/returns/copyright terms, no automated-access or bot clause.
  **JSON-LD spot-check** on
  `https://www.fjellsport.no/merker/arctic-tern/arctic-tern-beach-chair-ensign-blue-337-0750`:
  confirmed real `{"@id":"#product","@type":"Product","name":"Arctic Tern
  Beach Chair Ensign Blue",...}` with description, image array — genuine
  per-SKU data, scrapeSource() should parse it cleanly (didn't grep offers
  price separately but this is the standard shape productOffer() expects).
  Sells outdoor/hiking/camping gear (tents, ski, climbing, camp cookware) —
  maps to NO existing worker/cats.json category; flag "Sports"/"Outdoor"
  category + worker/extra.json rows needed later. Candidate product pages
  for worker/extra.json: https://www.fjellsport.no/merker/arctic-tern/arctic-tern-beach-chair-ensign-blue-337-0750
  (spot-checked above), https://www.fjellsport.no/merker/primus/primus-power-gas-100g-2
  (camp gas canister), https://www.fjellsport.no/merker/real-turmat/real-turmat-kylling-tikka-masala
  (trek food), https://www.fjellsport.no/merker/urberg/urberg-classic-multi-plier-black
  (tool/accessory).
