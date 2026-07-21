# Enrichment runbook — promoting auto-discovered products

Self-contained: everything an enrichment run needs is in this file.

## Background (30 seconds)

Sources (crawls, Adtraction feeds) auto-create any product they see whose
EAN we don't have: a `products` row with id `ean-<digits>`, `meta.hidden: 1`.
Hidden rows are invisible to users but collect real offers and price history
from day one. Enrichment is the manual pass that turns the good ones into
live catalog products. Nothing here touches the upstream prototype — it's
all repo-side (`worker/extra.json`, `worker/eans.json`) plus a deploy.

## The run

### 1. List

```
node tools/enrich.mjs          # PRICY_URL=<origin> to target non-prod
```

Prints every hidden product (id, ean, name, brand, offers with shop/price/
URL) plus a paste-ready `extra.json` skeleton per row. Open the offer URLs
when the scraped name isn't self-explanatory.

### 2. Triage every row into one of three buckets

**Junk** (accessories, cases, ear pads, spare parts, mismatches — e.g. a
steam iron matched from "steamdeck"): do nothing. It stays hidden and
harmless. Optionally delete its entry from `tools/crawl-urls.json` so the
crawler stops refreshing it.

**Variant of an existing catalog product** (a colour/size/regional SKU of
a product or one of its `~` children): do NOT write an extra.json row.
Instead append its EAN (13-digit, zero-padded string) to that product's
array in `worker/eans.json`, and move/remove the `ean-*` entry in
`tools/crawl-urls.json` (re-key it to the real product id if the page is
worth crawling). The orphaned hidden row stays in D1 — harmless.

**Genuine new product**: write a row into `worker/extra.json`:

```json
{ "id": "ean-4548736167902", "name": "Sony Bravia 3 55\" 4K Google TV",
  "brand": "Sony", "cat": "TV", "icon": "tv",
  "kw": "tv oled 4k google-tv 55 sony bravia fjernsyn" }
```

- `id`: **KEEP the `ean-` id unchanged** — the collected offers and price
  history are keyed to it. Never include `~` (reserved for variants).
- `name`: clean up the scraped shop title into a product name (the raw
  ones are often Norwegian listing titles with size/colour noise).
- `cat`: must be one of the prototype's CATEGORIES — currently Audio,
  Computers, E-readers, Gaming, Home, Kitchen, Phones, TV, Toys.
  `node build.js` fails with the authoritative list if you guess wrong.
- `icon`: a **lucide icon name** (`"tv"`, `"headphones"`, `"gamepad-2"`,
  `"smartphone"`, `"tablet"`, `"speaker"`, `"lamp"`, `"package"`…), NOT
  an emoji. Copy from a similar row in extra.json or the seed.
- `kw`: free-text search keywords, English + Norwegian variants.
- Optional `was`: original price in NOK if known — enables the drop-%
  badge. Omit when unsure.

### 3. Validate

```
node build.js && npm test
```

build.js validates every extra row (id/name/cat, category membership,
duplicates); the test suite covers serving/searching offer-less rows.

### 4. Ship

Commit (`worker/extra.json`, `worker/eans.json`, `tools/crawl-urls.json`),
push to `origin main`, then `npm run deploy`. The new seed's meta upsert
rewrites each enriched row's meta WITHOUT `hidden` → the product goes live
with the offers and history it already collected. Existing offers and
price_points are never touched by seeding.

### 5. Verify

```
curl -s "https://pricy.no/api/products?hidden=1"   # enriched ids gone from here
curl -s "https://pricy.no/api/products?q=<name>"   # …and findable here
```

`meta.products` in any /api/products response should have grown by the
number of promoted rows. Product images arrive automatically on the next
crawl/cron after unhiding (image sync deliberately skips hidden rows).

## Notes

- Enriched-then-renamed ids are NOT supported: a prettier id would orphan
  the collected offers. Live with `ean-*` ids for promoted products.
- If a promoted product later turns out to be a duplicate/variant, map its
  EAN in `eans.json` and remove the extra.json row again — future source
  rows follow `eans.json` first, the derived id second.
- The crawler keeps pricing hidden rows between enrichment runs — that's
  by design (history accrues while they wait).
