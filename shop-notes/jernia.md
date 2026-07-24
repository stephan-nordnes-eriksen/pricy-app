# Jernia

- URL: jernia.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — real check confirmed Product/Offer JSON-LD is present and robots.txt is wide open. Cheapest option, no approval needed.
- Alternatives: none found (no affiliate program signal turned up).
- Status: not started
- Notes: SHOP-CANDIDATES.md flagged "Inconclusive JSON-LD" / "Unknown (ToS not found)" — did the real recheck as instructed.
  - `curl https://www.jernia.no/robots.txt` → `User-agent: *` / `Allow: /` (fully open, no disallowed paths).
  - `curl <product page> | grep -iE 'ld+json|scrap|crawl|robot'` on the Kenwood kjøkkenmaskin PDP found 6 `ld+json` blocks; every "robot" hit was a false positive from category names "Robotstøvsuger"/"Robotgressklipper" (robot vacuum/lawnmower — actual products they sell), not a scraping restriction.
  - Fetched `jernia.no/salgsbetingelser` (their terms-of-sale page) directly and grepped for scrape/crawl/bot/automat clauses — none found (only chatbot-widget script noise).
  - Verdict: reclassify from "Unknown" → **Silent**, tier phase1-scrape.
  - Category mapping: Jernia sells kitchen appliances (kjøkkenmaskin, gryter/kasseroller) which map directly onto the **existing** `Kitchen` category in worker/cats.json — no new category needed for that slice. They also sell hardware/tools/garden gear which wouldn't fit any current category (would need a "Hardware"/"DIY" cat — flagging, not adding).
  - Candidate product URL (real, JSON-LD spot-checked): `https://www.jernia.no/kjøkkenutstyr/kjøkkenapparater/kjøkkenmaskin/kenwood-kjøkkenmaskin-chef-xl-kvl4100w-1200w-6,7l-rfri/p/12303125` — proposed `product_id: kenwood-kvl4100w`, `cat: Kitchen`, brand Kenwood.
  - Couldn't pull more real candidate URLs this round: Jernia's category listing pages render their product grid client-side (no product links in raw HTML, likely an SFCC search API) — WebFetch/curl only see the nav shell. Getting more extra.json candidates needs a live browser or their search API in Phase B.
