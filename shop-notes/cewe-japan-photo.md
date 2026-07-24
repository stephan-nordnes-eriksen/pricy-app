# CEWE Japan Photo

- URL: japanphoto.no
- Category: Electronics & computers / appliances
- Tier: phase1-scrape
- Chosen method: scrapeSource() (generic JSON-LD Product/Offer parser
  already in worker/sources.js) — cheapest option, no approval needed,
  confirmed working JSON-LD shape below
- Alternatives: none found (no affiliate-network signal)
- Status: not started
- Notes: SHOP-CANDIDATES.md had "Unknown" ingest / "Ambiguous" verdict
  (generic copyright clause on kjøpsvilkår, not a scraping ban). Real
  recheck reclassifies this to phase1-scrape:
  `curl -sL -A 'Mozilla/5.0' https://www.japanphoto.no/robots.txt` → only
  blocks legacy WebSphere-Commerce query paths (`/SearchDisplay`,
  `/CategoryDisplay*`, faceted-search query params) — product detail
  pages (`/produkt/...`) are wide open, no bot names blocked.
  WebFetch of `japanphoto.no/kjopsvilkar` (this page rendered fine, not
  JS-gated) confirmed no automated-access/scraping language — just
  standard consumer terms (24-month complaint period, Norwegian law).
  Ambiguous verdict stands (copyright clause exists) but no ToS
  prohibition or robots block — clears the phase1 bar.
  Spot-check: `curl -sL -A 'Mozilla/5.0' https://www.japanphoto.no/produkt/sigma-mc-11-ef`
  → 1 `<script type="application/ld+json">` block, clean top-level
  `Product` node:
  `{"@type":"Product","name":"Sigma MC-11 Adapter Canon EF til Sony E","offers":{"@type":"Offer","priceCurrency":"NOK","price":2900.0,"availability":"OutOfStock","seller":{"@type":"Organization","name":"CEWE Japan Photo"}}}`
  — exactly the shape `productOffer()` already expects (top-level
  `offers.price`, NOK currency, availability string). No code change
  needed for this shop specifically.
  Category fit: japanphoto.no sells cameras/lenses/drones/photo
  accessories — **no existing worker/cats.json category fits** (checked
  Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen
  and worker/seed.json + worker/extra.json — no camera products exist
  today). Phase B will need a new `"Cameras": "camera"`-style line in
  cats.json (icon TBD from lucide, e.g. `camera`) before extra.json rows
  can use it.
  Candidate real product URLs (from `japanphoto.no/kamera` category page,
  none fabricated):
  - https://www.japanphoto.no/produkt/sigma-mc-11-ef (adapter, spot-checked above — not a camera body, good for a quick pilot but maybe not the ideal first head)
  - https://www.japanphoto.no/produkt/canon-eos-r6-mark-ii-hus (Canon EOS R6 Mark II body)
  - https://www.japanphoto.no/produkt/fujifilm-x-e5--xf-23mm-f-28-s (Fujifilm X-E5 kit)
  - https://www.japanphoto.no/produkt/fujifilm-instax-mini-12--mint-green (Instax Mini 12, instant camera — cheap/simple pilot candidate)
  Proposed extra.json shape once cats.json gets a Cameras line, e.g.:
  `{ "id": "canon-eos-r6-ii", "name": "Canon EOS R6 Mark II", "brand": "Canon", "cat": "Cameras", "icon": "camera", "kw": "camera kamera canon eos r6 mirrorless speilløst" }`
