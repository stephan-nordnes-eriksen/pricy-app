# Open catalog plan — every ingested product becomes a product, variants group themselves

Written 2026-07-21. **Status 2026-07-22: Phases A, B and C SHIPPED** (B4
LLM classifier deliberately skipped — revisit only if CATMAP plateaus).
Implementation deviations from the text below:
- C1 fingerprint is NOT stored in meta — name/brand are already there, so
  `tools/group.mjs` computes it at read time. No worker change, no backfill.
- A5 kept `tools/enrich.mjs` name (no extra.json skeletons anymore, curls
  only). ENRICHMENT.md rewritten for the deploy-free flow.
- CATMAP ships as an empty wrangler.jsonc var — grow it per real feed. Goal: stop relying on static pre-approved lists
(`worker/extra.json`, `worker/eans.json`, a deploy per promotion). Any
product a source sees gets added; thin-metadata rows stay hidden until
enriched; same-product variations (storage/colour SKUs) surface as ONE
product with variants, not N separate rows.

## What already exists (don't rebuild)

- **Discovery is live** (commit `7f457b5`): any source row with an unknown
  EAN + name auto-creates a `products` row (`ean-<digits>`, `meta.hidden: 1`),
  collecting offers + price history from day one, excluded from every
  user-facing query. Two shops with the same EAN dedupe for free.
- **Variant model is live** (PLAN.md 4e): combo = child `products` row
  (`iphone~256-blue`), `meta.family` + `meta.vlabel` on children, `variants`
  (axes) on the head, boot hangs children on `head.listings[combo]`, MCP
  hides them. The machinery works — only seed-defined products use it.
- **Enrichment runbook** (ENRICHMENT.md): manual triage into
  junk / variant-of-existing / genuine, via extra.json + eans.json + deploy.

## The three gaps

1. **Identity is a build artifact.** EAN→product mapping is
   `worker/eans.json` baked into the Worker (`EAN_TO_PRODUCT` in
   sources.js); promotion metadata is `worker/extra.json` baked into
   seed.json. Every triage decision costs a commit + deploy, and the
   decision can't be made by anything but a human editing files.
2. **Promotion is 100% manual.** A row with perfectly good source
   metadata (name, brand, feed category, image) still waits for a human
   to invent `cat`/`icon`/`kw` by hand.
3. **No variant grouping for discovered rows.** "iPhone 15 128GB" and
   "iPhone 15 256GB" from a feed become two unrelated `ean-*` products.
   eans.json variant arrays are curated after the fact.

Fix them in that order — each phase ships alone and makes the next one
possible. B and C both *write* their decisions through A's machinery.

## Phase A — identity lives in D1, not in files

**A1. `eans` table.** `eans (ean TEXT PRIMARY KEY, product_id TEXT NOT NULL)`
(ean = `eanKey`-normalized digits). Seeded from `worker/eans.json` inside
`seedCatalog` with `INSERT OR IGNORE` — the file bootstraps, runtime rows
win. New mappings land via ingest/admin, no deploy.

**A2. Resolution moves to ingest.** sources.js stops importing eans.json:
every EAN-carrying row is emitted as `ean-<key>` (scrape rows keyed by
cfg.urls product id stay as-is). `ingest()` re-maps `ean-*` product_ids
through one `SELECT ean, product_id FROM eans` lookup before doing
anything else. One resolution point covers cron, `/api/ingest`, and
crawl.mjs alike. The `EAN_TO_PRODUCT` head-mapping entries in eans.json
keep working — they're just table rows now.

**A3. Admin writes (bearer = INGEST_TOKEN, like `/api/ingest`):**
- `PATCH /api/admin/products/:id` — merge fields into meta (`name`,
  `brand`, `cat`, `icon`, `kw`, `was`, `hidden: null` to unhide, `hidden: 1`
  to demote). Validates `cat` against the seed's category list.
- `POST /api/admin/alias` `{ean, product_id}` — upsert the eans row AND
  migrate the orphaned `ean-*` row's collected data:
  `UPDATE offers/price_points/watches/purchases SET product_id`, delete
  the orphan (images: just delete the row; the R2 object re-fetches
  under the new id next ingest). Today that history is thrown away —
  this is the biggest single win of the phase.

**A4. Seed precedence.** `seedCatalog`'s meta upsert only touches ids in
seed.json; discovered/promoted rows aren't in it, so admin-written meta
survives deploys untouched. Rule going forward: extra.json is for
hand-curated rows we want version-controlled (it overwrites D1 meta on
seed change — that's the override mechanism, document it in
ENRICHMENT.md); everything else lives in D1 only.

**A5. enrich.mjs emits curl.** Keep the skeleton output, add the
equivalent `PATCH`/`alias` curl per row so a triage session is
paste-run-done with zero deploys. ENRICHMENT.md updated to the new flow;
extra.json demoted to "optional, for rows worth version-controlling".

Tests: ean-table resolution in ingest, alias migration (offers/history
move, orphan gone), admin auth + cat validation, seed doesn't clobber
promoted meta.

## Phase B — auto-promotion at ingest

A hidden row goes live the moment its metadata is complete enough. What
"complete" means:

**B1. Sources carry category evidence.** adtractionSource picks
`category`/`categoryname`/`producttype` fields into the row; scrapeSource
takes JSON-LD `category` / BreadcrumbList when present. New row field:
`srcCat` (raw string).

**B2. Category mapping = the junk filter.** `worker/catmap.json`:
`{ "<shop>": { "<raw source category>": "<prototype cat>" } }`, checked
into the repo, grown by hand as feeds reveal their vocabularies (a
`tools/` one-liner lists unmapped srcCat values by frequency). An
unmapped category stays hidden — accessories, spare parts and cases
simply never get mapped, which is exactly the triage "junk" bucket for
free. This is deliberately NOT fuzzy: a wrong auto-category on a live
product is worse than a hidden product.

**B3. Promotion rule in `ingest()`** (right after auto-create): a hidden
row that now has `name` + `brand` + a mapped `cat` gets:
- `icon`: per-cat default (9-entry map: Phones→smartphone, TV→tv, …)
- `kw`: lowercased distinct tokens of name + brand + cat (the search
  LIKE already matches whole-meta, so kw only needs the obvious terms)
- `hidden` removed, `auto: 1` set (so auto-promoted rows are listable
  and bulk-demotable if a mapping turns out bad)
- name blocklist guard: matches like /deksel|etui|case|cover|skjerm-?
  beskytter|strap|reim|refill|spare/i stay hidden regardless — belt and
  suspenders under B2.

Demotion is `PATCH … {hidden: 1}` (A3). No new UI: promoted rows appear
via the existing visibility queries; images start syncing on the next
ingest automatically (syncImages already keys off hidden).

**B4 (optional, later).** Workers AI batch-classifier for rows whose
srcCat never maps — cron-budgeted, writes `cat` proposals as a report,
not directly to meta. Skip until B2's hand map measurably plateaus.

Tests: srcCat plumbed from both source types, mapped row promotes with
icon/kw/auto, unmapped and blocklisted rows stay hidden, demote sticks
(promotion must not re-fire on a row a human demoted — `auto: 1` present
+ hidden = human said no, leave it).

## Phase C — variant grouping for discovered products

**C1. Family fingerprint at discovery.** When ingest auto-creates a row,
also store `meta.fp`: lowercase(brand + name) with variant tokens
stripped — storage (`\d+\s?(gb|tb)`), colour words (small NO+EN list:
svart/black, hvit/white, blå/blue, …), pack counts (`\d+(-pack|stk)`),
punctuation/whitespace collapsed. Backfill existing hidden rows with a
one-off tool. fp is a grouping hint, never shown.

**C2. Grouping stays human-confirmed (a tool, not a cron).**
`tools/group.mjs`: fetch hidden + `ean-*` visible rows, cluster by fp,
and for each cluster ≥ 2 propose:
- head = one member (keep its id — offers/history keyed to it), the one
  with the most offers;
- axes synthesized from the differing stripped tokens (storage axis from
  the GB/TB values, colour axis from the colour words), in the exact
  `variants` shape build.js emits from the prototype (`axes: [{id,
  label, options}]`; option ids must never contain `-` or `~`);
- each non-head member re-keyed to `<head>~<combo>` via A3's alias
  machinery (same migration: offers, price_points, watches, purchases,
  eans row), meta gets `family` + `vlabel`, no `variants`.

Human reviews the proposal (names are messy shop titles — clustering
will be wrong sometimes), confirms per cluster, tool POSTs the admin
calls. Fully automatic clustering is explicitly out of scope until the
fp false-positive rate is known from real runs.

**C3. Interaction with promotion.** A family head promotes via Phase B
like any row; children never promote independently (`family` present →
skip in B3). If a member of a cluster is an existing *seed* product
(iphone etc.), group.mjs proposes an eans-alias to the right existing
child/head instead of building a new family — same as today's manual
"variant of existing" triage, now suggested by fp match.

Tests: fp normalization table-driven (real messy names from prod),
grouping migration end-to-end (head keeps id, child re-key moves data,
PDP `get_product` lists the variants), B3 skips family children.

## Risks / notes

- **D1 becomes the only home of promoted meta** — it's already the only
  home of offers/history, so backup story is unchanged, but note it.
- **Re-key touches money-adjacent tables** (purchases). Alias migration
  is a batch of UPDATEs — idempotent, but write the test first.
- **fp clustering on Norwegian listing titles will misfire** — that's
  why C2 is human-confirmed. Revisit automation only with data.
- **catmap is per-shop by design**: shops disagree about what
  "Lyd & Bilde" contains; a global map would promote junk.
- Order of ops per ingest run: resolve eans (A2) → auto-create → promote
  (B3) → offers/history/alerts/images as today. One pass, no new cron.
