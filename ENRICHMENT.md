# Enrichment runbook — promoting auto-discovered products

Self-contained: everything an enrichment run needs is in this file.

## Background (30 seconds)

Sources (crawls, Adtraction feeds) auto-create any product they see whose
EAN we don't have: a `products` row with id `ean-<digits>` (or `p-<slug>`
without a barcode). **gpc-strict**: any non-junk NAMED row goes live at
once into the honest "Ukategorisert" bucket (`meta.auto: 1`); only
fees/gift cards (`JUNK_RE`) and human demotions stay `meta.hidden: 1`.
Categorization is the resolver's job alone: the row's GTIN queues in the
`gpc` table and Verified-by-GS1 (stub until credentials land) answers with
an 8-digit GPC brick, which stamps `meta.brick` on the head. **No name or
breadcrumb ever categorizes anything.** Two triage surfaces exist:

- **Resolver backlog**: `node tools/gpc-coverage.mjs` — coverage %, per-shop
  GTIN capture, and the uncurated-brick worklist (English titles needing
  `worker/gpcno.json` names).
- **Manual** (this runbook): junk triage, variant aliasing, and brick PINS
  for rows the resolver can never reach (shops publishing no gtin). All
  writes go through the admin API (bearer = `INGEST_TOKEN`, same token as
  ingest, also in untracked `tools/.ingest-token`) — **no deploy needed**.

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

**Junk** (fees, gift cards, priced landing pages that slipped the gate):
demote with `{"hidden": 1}` — demoted rows never re-promote. Optionally
delete the entry from `tools/crawl-urls.json` so the crawler stops
refreshing it.

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

**Categorize by hand** (the resolver answered `none`, or the row has no
GTIN at all) — pin a real GPC brick:

```
curl -sX PATCH "$BASE/api/admin/products/ean-4548736167902" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Sony Bravia 3 55\" 4K Google TV","brick":"10001400",
       "kw":"tv led 4k google-tv 55 sony bravia fjernsyn","hidden":null}'
```

- `brick`: an 8-digit GPC brick from the current publication — the API
  400s on anything else (codes: `worker/gpc.json`, or the GPC browser at
  gpc-browser.gs1.org). A hand-set brick pins `man: 1` — the resolver may
  never overwrite it; `{"brick": null}` clears the pin and re-queues the
  gtin. Display name/icon/trail all derive from the brick — there is
  nothing else to fill in.
- Bulk pins: a `{id: brick}` file through `node tools/gpc-pin.mjs pins.json`
  (print-only curls, like this runbook).
- `hidden: null` = go live; `hidden: 1` demotes (demoted rows are never
  re-promoted by the machine).
- `name`: clean up the scraped shop title into a product name.
- `kw`: free-text search keywords, English + Norwegian variants.
- Optional `was`: original price in NOK if known — enables the drop-%
  badge. Omit when unsure.

### Facets (optional, any live product)

Facets feed the per-ruleset filters on Results (FILTERS-PLAN.md). A
product's ruleset comes from its brick (`worker/gpcno.json` facetKeys);
keys per ruleset live in `worker/facets.json` (TV: `size`/`panel`/
`refresh`, Audio: `anc`/`fit`, Phones: `refresh`). Numbers as numbers,
bools as bools:

```
curl -sX PATCH "$BASE/api/admin/products/<id>" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"facets":{"size":65,"panel":"OLED","refresh":120}}'
```

Products without facets still filter via values derived from their name
(`worker/facetrules.js`, every category) and their demo spec strings where
those exist; a PATCHed `facets` wins over both. `"facets": null` deletes the
whole object — the name-derived values come back, since they're computed per
request, not stored. So the curl below is for **corrections and the values
no name carries** (panel, refresh rate, ANC), not for bulk typing: a rule
fix in facetrules.js beats a thousand PATCHes.

The `type` facet is the sub-category (SUBCATS-PLAN.md) — use the
canonical values, never invent near-duplicates (each new spelling becomes
its own filter option): Audio `Headphones`/`Earbuds`/`Speakers`/
`Soundbars`; Gaming `Consoles`/`Handhelds`/`Controllers`/`Games`;
Computers `Laptops`/`Tablets`/`Monitors`; Home `Vacuums`/`Smart lighting`/
`Media streamers`/`Security`/`Small appliances`; Kitchen `Coffee makers`/
`Air fryers`/`Microwaves`/`Multicookers`. The other 26 categories' values
are whatever `worker/facetrules.js` emits for that cat — read them there
before typing a row by hand. Seed rows already carry theirs (extra.json /
build.js `DEMO_TYPE`). Product kind unclear from the name? Leave it untyped
(it just won't match type selections) — a wrong sub-category is worse than
none.

### 3. Verify

```
# triaged ids gone from here (the listing is bearer-gated)
curl -s "$BASE/api/products?hidden=1" -H "authorization: Bearer $TOKEN"
curl -s "$BASE/api/products?q=<name>"     # …and promoted ones findable here
```

Reading a hidden row by `ids=` needs the same bearer. `hidden` means not
served to a normal caller anywhere, PDP included — so demoting a bad row
really does take its product page down, and the discovery backlog is not
enumerable by guessing `ean-<barcode>` ids.

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
