# Enrichment runbook — promoting auto-discovered products

Self-contained: everything an enrichment run needs is in this file.

## Background (30 seconds)

Sources (crawls, Adtraction feeds) auto-create any product they see whose
EAN we don't have: a `products` row with id `ean-<digits>`, `meta.hidden: 1`.
Hidden rows are invisible to users but collect real offers and price history
from day one. Two promotion paths exist:

- **Auto** (OPEN-CATALOG-PLAN B): a hidden row goes live by itself the
  moment a source supplies name + brand + a source category that the
  `CATMAP` var (wrangler.jsonc, per-shop `{raw source cat → our cat}`)
  maps. Machine-promoted rows carry `meta.auto: 1`. Growing CATMAP is the
  highest-leverage enrichment work — one mapping promotes every product in
  that feed category, now and forever. Never map accessory categories;
  unmapped = stays hidden, which is the junk filter.
- **Manual** (this runbook): everything CATMAP can't decide. All writes go
  through the admin API (bearer = `INGEST_TOKEN`, same token as ingest,
  also in untracked `tools/.ingest-token`) — **no deploy needed**.

## The run

### 1. List

```
node tools/enrich.mjs          # PRICY_URL=<origin> to target non-prod
```

Prints every hidden product (id, ean, name, brand, srcCat, offers) plus
ready-to-run promote/alias curls. Open the offer URLs when the scraped
name isn't self-explanatory. Also run `node tools/group.mjs` — it clusters
hidden rows into variant families (same product, different storage/colour)
and prints the grouping curls; handle its proposals before triaging the
members one by one.

### 2. Triage every row into one of three buckets

**Junk** (accessories, cases, ear pads, spare parts, mismatches): do
nothing. It stays hidden and harmless. Optionally delete its entry from
`tools/crawl-urls.json` so the crawler stops refreshing it. If a whole
source category keeps producing junk, that's confirmation it must never
enter CATMAP.

**Variant of an existing catalog product** (a colour/size/regional SKU of
a product or one of its `~` children) — run the alias curl with the real
target id:

```
curl -sX POST "$BASE/api/admin/alias" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"ean":"<13 digits>","product_id":"xm5"}'
```

This maps the EAN in the `eans` table (future source rows route to the
target) AND migrates the orphaned `ean-*` row's collected offers, price
history and watches onto the target, then deletes it. Where the target
already has an offer from the same shop, the target's wins. Re-key or
drop the `ean-*` entry in `tools/crawl-urls.json` if the page is worth
crawling.

**Genuine new product** — run the promote curl with real values:

```
curl -sX PATCH "$BASE/api/admin/products/ean-4548736167902" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Sony Bravia 3 55\" 4K Google TV","cat":"TV","icon":"tv",
       "kw":"tv led 4k google-tv 55 sony bravia fjernsyn","hidden":null}'
```

- `hidden: null` deletes the hidden flag = go live; `hidden: 1` demotes
  (also how to un-publish a bad auto-promotion — demoted rows are never
  re-promoted by the machine).
- `name`: clean up the scraped shop title into a product name.
- `cat`: must be one of the prototype's categories — the API 400s with
  the authoritative list if you guess wrong.
- `icon`: a **lucide icon name** (`"tv"`, `"headphones"`, `"gamepad-2"`,
  `"smartphone"`, `"speaker"`, `"package"`…), NOT an emoji.
- `kw`: free-text search keywords, English + Norwegian variants.
- Optional `was`: original price in NOK if known — enables the drop-%
  badge. Omit when unsure.

### Facets (optional, any live product)

Facets feed the per-category filters on Results (FILTERS-PLAN.md). Keys
per category live in `worker/facets.json` (TV: `size`/`panel`/`refresh`,
Audio: `anc`/`fit`, Phones: `refresh`). Numbers as numbers, bools as
bools:

```
curl -sX PATCH "$BASE/api/admin/products/<id>" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"facets":{"size":65,"panel":"OLED","refresh":120}}'
```

Products without facets still filter via their demo spec strings where
those exist; `facets` wins when both are present. `"facets": null`
deletes the whole object.

The `type` facet is the sub-category (SUBCATS-PLAN.md) — use the
canonical values, never invent near-duplicates (each new spelling becomes
its own filter option): Audio `Headphones`/`Earbuds`/`Speakers`; Gaming
`Consoles`/`Handhelds`/`Controllers`; Computers `Laptops`/`Tablets`;
Home `Vacuums`/`Smart lighting`; Kitchen `Coffee makers`/`Air fryers`/
`Microwaves`. Seed rows already carry theirs (extra.json / build.js
`DEMO_TYPE`) — only discovered `ean-*` rows need the curl.

### 3. Verify

```
curl -s "$BASE/api/products?hidden=1"     # triaged ids gone from here
curl -s "$BASE/api/products?q=<name>"     # …and promoted ones findable here
```

Product images arrive automatically on the next crawl/cron after
promotion (image sync deliberately skips hidden rows).

## Notes

- Promoted meta lives in D1 only. `worker/extra.json` still exists for
  hand-curated rows worth version-controlling — but note the seed upsert
  overwrites D1 meta for ids present in extra.json on every new deploy,
  so a row belongs in exactly one place: extra.json OR admin-API-managed.
- `worker/eans.json` is now only the *bootstrap* for the D1 `eans` table
  (seeded `OR IGNORE` — runtime aliases win). New mappings should go
  through `/api/admin/alias`; only touch the file for mappings that must
  survive a from-scratch database.
- Promoted-then-renamed ids are NOT supported: a prettier id would orphan
  the collected offers. Live with `ean-*` ids for promoted products.
- The crawler keeps pricing hidden rows between enrichment runs — that's
  by design (history accrues while they wait).
- After promoting, run `node tools/fetch-specs.mjs specs.json && node
  tools/apply-specs.mjs specs.json` — pulls the full Icecat Open datasheet
  (Norwegian, ~100 rows) by EAN for every visible head that lacks an
  Icecat-depth sheet and lands it as the PDP Specifications section. Only
  Open-Icecat (sponsoring) brands resolve; misses are listed and stay on
  whatever thin sheet they had.
