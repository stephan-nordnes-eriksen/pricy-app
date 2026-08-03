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
