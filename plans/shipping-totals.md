# Shipping-inclusive totals + availability filters (upstream PROMPT 01)

**Status 2026-08-03: backend SHIPPED (steps 1 mechanics + 2–6 below) —
`worker/shipping.json` registry (validated by build.js, EMPTY until
curated), `shipCost`/`etaDays`, offers serve `shipCost`/`total`, rows
serve `bestTotal`/`bestTotalShop`, `sort=total`, `freeship=1`/`maxeta=N`
filters (shipAgg pass in listIds, only on queries that touch shipping),
`watches.inclShip` end to end (PUT → meBody → boot round-trip), and
fireAlerts fires/arms on the watch's own basis (arming moved from SQL to
JS — an inclShip watch whose item price sat below target while its total
was above must stay armed; `bestTotalOffer` treats unknown shipping as
the item price so such a watch fires late rather than never). Three new
tests + two shape assertions updated; suite green.**

**Measured 2026-08-03:** 119 of 34,445 offers carry `ship` (0.3%), eta
8.1% (Trademax + Chilli only). The registry is the real source and it is
empty — **remaining labor is curating `worker/shipping.json` from real
shop terms pages** (never guessed); until then totals/freeship surface
only for the few offer-level shops and everything else is honestly
unknown.

## Registry curation (2026-08-05)

`worker/shipping.json` curated from each shop's own frakt/terms page —
every entry is a stated fixed rate, quoted below where it matters.
Convention: `flat` = the cheapest stated fixed NON-MEMBER delivery
option (pickup point / locker / mailbox); the price is uniform
nationwide even where the method isn't offered at every address.
Member-only rates and thresholds are never recorded.

Recorded (source pages):
- Hi-Fi Klubben 79 — "Vi har fast lav frakt på 79 kr"
  (hifiklubben.no salgs-og-leveringsvillkar; 699 kr >35 kg home
  delivery is a bulky surcharge on top).
- Kidsdreamstore 59/499 — "Ombud: 59 kr … Fri frakt: vid köp över
  499 kr" (kidsdreamstore.no shipping-policy).
- David-Andersen 139/700 — "fastpris på kr: 139" / "spanderer frakt
  … over kr: 700" (david-andersen.no/retningslinjer/frakt).
- Japan Photo 119/2000 — "Kamera og utstyr: 119,- / Over 2 000 kr:
  0,-" (japanphoto.no/frakt-og-levering; photo prints ship at 69 —
  our rows are camera gear).
- Skoringen 69/799, Sport 1 99, Fjellsport 59/1200, KappAhl 49
  (Helthjem; the 500 kr free-ship is member-only, omitted),
  Guttelus 59/1299 (pakkeautomat; 39 kr tier is member-only),
  Lekia 79/999, Nettdyret 79/1000 (current terms page + header; an
  older stale page still says 499 — followed the terms), Panduro
  49/599, Rusta 69 (utleveringssted; bulky home delivery is a
  599–999 range on top), Rum21 49/599 (bulky classes 129/499 on
  top), Tegne.no 50/750.

Skipped (no plain fixed nationwide rate on the shop's own pages):
- Threshold stated but no base rate: Ringo (fri frakt >1000, no
  under-price anywhere incl. Salgsvilkår PDF), Lekeverden (>1000),
  Klokker.no (>1000), PetXL (>599), Dyrekassen (>599), Mestergull
  (>1000), Jernia (>800), Bergans (>1700) — schema needs `flat`, a
  freeOver alone can't be recorded.
- Weight/size/region/cart-computed: Clas Ohlson ("fra 79/29 kr",
  weight-based), Blivakker, Zooservice (volume weight), JYSK ("fra
  89,95"), Chilli / Trademax (per postal area), Widforss (per
  postnummer), Kjell & Company (checkout-only), Obs / Obs Bygg
  (size/weight/region), Fagmøbler (store-area), Sporttema (cart),
  Shark Gaming (per product/address, ranges), Møbelringen (per
  product category 99–1499), Christiania Belysning ("fra 139"),
  Hobbii ("fra 49"), Kicks (checkout-only; >199 free option exists
  but no rate), Vitusapotek (order-size dependent), Foss Sport (99
  flat stated but explicitly excludes sykkel/ski/staver with
  unstated separate freight — we serve its rows in Bikes/Sport, so
  a shop-wide 99 would misprice exactly that inventory).
- Rate depends on product VAT status: Outland (59/89/79 by vare).
- Member-only free shipping, no public rate: Bjørklund, Kid
  Interiør (member >799; standard is address/size/weight-computed).
- Ambiguous terms: Junior Barneklær ("kr 90 og kr 125" with no
  stated distinction; threshold stated as both 1000 and 1500).
- No shipping info found on own pages: Gamezone, Parfymeri
  (unqualified "Gratis frakt" badge only), Intersport (only Klikk &
  hent free).
- Unreachable (bot wall / broken TLS): Power (JS-only pages),
  Proshop (403), NetOnNet (403), Milrab (403), Bikeshop
  (deskpro.bikeshop.no TLS failure), CDON (marketplace — seller
  decides shipping, skip regardless).

**Sync contract (when upstream PROMPT 01 lands):** field names are
`shipCost`/`total` per offer, `bestTotal`/`bestTotalShop` per row —
upstream's genOffers-derived names must match. Its Totalpris comparator
must fall back `bestTotal ?? best` (SORT_VAL.total does). Boot's
listQuery already sends `freeship=1`/`maxeta=N` from
`filters.freeship`/`filters.maxeta` — map upstream's universal
availability defs to those keys in boot when syncing. Availability
fcounts are NOT served (upstream counts its own rows, page-local like
the refine fallback — fine, documented there).

Backend plan for `proto/PROMPT - 01 Shipping Totals & Delivery Filters.md`
(fetched 2026-08-03, not yet built upstream). Upstream will add `shipCost`
(numeric), `total`, `p.bestTotal`, availability filters (In stock / Free
shipping / Delivery ≤ 2 days), a "Totalpris" sort, and `inclShip` on watch
targets. Everything it fakes in `genOffers` must come from us, and every
new predicate/sort must be mirrored server-side or the served `total`/
`fcounts` disagree with the screen (the standing failGroups/sortRows
invariant, read-path-whats-left.md).

## Current state (verified)

- The data mostly already flows: `offers` has `ship TEXT, stock, eta`
  (worker/index.js:20); `scrapeRow` fills them from JSON-LD
  `OfferShippingDetails` (worker/sources.js:373 — normalised to
  `'Free shipping'` / `'kr N shipping'` + eta days) and Adtraction rows
  carry `shippingcost` (sources.js:95). Ingest COALESCEs so a source that
  doesn't know keeps the old value (index.js:559).
- **Coverage is unmeasured.** Most shops likely publish no
  shippingDetails; those offers have `ship = null` = unknown, not free.
- Server query pipeline already filters `instock=1` (index.js:938); no
  free-shipping filter, no eta filter, no total sort.
- `watches` has no `inclShip` (index.js:18); `fireAlerts` compares
  target against the offer item price.

## Plan

1. **Measure first.** Replay `/api/catalog.json` (bearer): % of offers
   with non-null `ship`, per shop. If a big shop is at 0%, its shipping
   is knowable from its terms page → hand-curated fallback registry
   `worker/shipping.json` `{shop: {flat, freeOver}}` (freeOver matters:
   "fri frakt over 500 kr" is the Norwegian norm, and PROMPT 06 needs
   the same registry). Offer-level `ship` wins; registry fills blanks;
   still-unknown stays unknown — never render unknown as free.
2. **Serve numbers, no migration.** In `shapeRows`/`group` (index.js:689),
   parse `ship` → `shipCost` (`'Free shipping'`→0, `'kr N shipping'`→N,
   else registry, else null) and `total = price + shipCost` per offer;
   `bestTotal`/`bestTotalShop` = min over offers with known shipCost.
   Derived at read like facets — a registry fix reaches all rows next
   deploy.
3. **Query layer.** `listIds`: sort id `total` (rows with unknown
   shipping sort by item price — decide and mirror upstream), filters
   `freeship=1`, `maxeta=N`. Extend `failGroups`/`sortRows`/`sliceFilters`
   line-for-line with upstream's predicate, quirks included. `fcounts`
   cross-filtering picks the new groups up for free if they ride the same
   failGroups path.
4. **Watch targets.** Guarded `ALTER TABLE watches ADD COLUMN inclShip`
   (the index.js:62 pattern). `PUT /api/watches` accepts it, `meBody`
   serves it, `fireAlerts` compares target against
   `inclShip ? price + shipCost : price` (per triggering offer).
5. **Boot.** `onQuery` passes the new filter keys through; nothing else —
   hydrateCatalog already merges whatever `rowsFor` serves.
6. **Tests.** Parse table for the ship string, unknown-is-not-free, a
   listIds total-sort/freeship case, inclShip alert firing.

## Dependencies / order

Do after the upstream prompt is built and synced — field names must
match its genOffers shapes exactly. Registry curation is the only real
labor; start with the ~10 shops that dominate offer counts.
