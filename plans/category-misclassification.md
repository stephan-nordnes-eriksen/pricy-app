# Category misclassification — the shop's own taxonomy is thrown away

**IMPLEMENTED 2026-07-26** (steps 1–4 and 6 in full, step 5 partially — see
"What actually shipped" at the bottom). The reported row now classifies as
**Toys / Figures & dolls**. Measured over the same 14,118-row live catalog:
216 products change category, 206 gain one they never had, 56 lose a wrong one.
Facet `type` coverage goes 7,099 → 8,321 rows. The diagnosis below is kept as
the record of why.

Reported 2026-07-26: *"Pokemon, Battle Feature Figure (Mewtwo) W16"* sits in
**TV**. It should be Toys, sub-type "Figures & dolls".

All numbers below are measured against the live catalog dump pulled
2026-07-26 (`GET /api/catalog.json`, 14,118 rows, 13,705 auto-promoted) —
not a sample. Reproduce with the bearer token in `tools/.ingest-token`.

## The reported row

```
ean-191726497868  "Pokemon, Battle Feature Figure (Mewtwo) W16"
  srcCat: "TV- og filmkarakterer"   cat: TV
```

`classify()` (worker/index.js:331) walks `CAT_RULES` (:296) in list order and
takes the first regex that matches **anywhere** in the label. The TV rule
`/\btv\b|fjernsyn|television/` is rule #4; it matches the `TV` in
"TV- og filmkarakterer" and wins. The Toys rule is #24 — and would not have
matched anyway: its vocabulary has `actionfigur` but not `figur`, and nothing
for `karakter`.

Its sibling `ean-191726507185` ("Pokemon, Battle Figure 4-pack Gen XI") is in
TV for the same reason. 14 rows share that srcCat.

Even after the category is fixed the **sub-type is still wrong**:
`deriveFacets({name, cat: 'Toys'})` returns `{type: 'Trading cards'}`, because
`\bpokemon\b` (Trading cards) is listed above `\bfigur` in
worker/facetrules.js:549-550. The shop's own label literally says "figurer"
and we never read it — `deriveFacets` takes `name` only (facetrules.js:627).

## This is not one bad regex

**TV holds 106 products. Two of them are televisions.**

| cat | rows | what's actually in it |
|---|---|---|
| TV | 106 | 2 TVs; ~30 TV benches (Furniture); 14 Pokémon figures; 1 wall mount; 1 "Nøkkelsylinder" |
| Projectors | 53 | 1 projector; 40 `Lerretsbilder` = canvas prints — `lerret` is both "projection screen" and "artist's canvas" |
| E-readers | 10 | ~1 (`Läsplattor`); the rest matched `e-?bok` as a **substring**: `Klokkebokser`, `Kakeboks`, `Plantebokser` |
| Photo | 346 | 22 `Fototapeter` (photo wallpaper) via `foto` |
| Shoes | 421 | 30 `Singles (Løskort)` — `\bsko[a-zæøå]*\b` matches `skort` in "Løskort", because `ø` is not a word character so JS puts a `\b` there |

Other measured leaks: `Spisestuestoler & kjøkkenstoler` (22) and
`Spisebord & kjøkkenbord` (16) in Kitchen; `Kopper og krus` and
`Akvarell- & vannmaling` in Tools; `Manga` (55) in Toys; `Luer og pannebånd`
(33) in Sport; `Tispe- og Hannbeskyttelse` (dog heat pants) in Baby.

**189 distinct srcCat labels (559 products) match more than one rule** — for
every one of them, list position alone decides the category.

## Root causes, ranked by measured blast radius

### 1. 60% of the catalog never sees a rule at all

Of the 13,705 auto-promoted rows:

| | rows | share |
|---|---|---|
| no `srcCat` stored at all | 2,981 | 22% |
| `srcCat` stored, no rule matches it | 5,271 | 38% |
| a rule actually decided the category | 5,452 | 40% |

The first two buckets fall through to `catmap[shop]['*']` (worker/index.js:393)
— **the shop floor**. 47 of the 50 shops in `CATMAP` declare a `"*"`, so for
~60% of the catalog "category" means "which shop we scraped".

CLAUDE.md already says *"Only set `"*"` where the WHOLE shop is one category;
a general retailer must stay unmapped."* The data says otherwise: `JYSK → Home`,
`Rusta → Home`, `Jernia → Tools`, `Outland → Toys` (Outland sells manga, board
games, books and figures — that is where Toys' 55 Manga rows come from),
`Intersport → Sport` (hence hats in Sport).

No amount of rule tuning touches this bucket.

### 2. The shop's sub-category is discarded at scrape, and never re-read

`breadcrumbCat` (worker/sources.js:256-268) returns **one crumb** — the leaf,
or its parent when the leaf is the product name. `Leker > Figurer >
TV- og filmkarakterer` reaches us as `TV- og filmkarakterer`; the "Leker" that
would have settled it is dropped at the source.

Only **1,281 of 10,733** stored srcCats contain a path separator at all (those
came through `Product.category`, not the breadcrumb). 88% are a bare leaf.

And even that leaf is written once into `meta.srcCat` and then never read
again — not by search, not by `deriveFacets`.

### 3. `cat` is frozen at first promotion; facet values are not

worker/index.js:380:

```js
if (!meta || !stillHidden.has(r.product_id) || meta.family || meta.auto) continue;
```

Once a row is promoted, `meta.auto` is set and ingest never reconsiders its
category. Contrast `deriveFacets`, which runs in `shapeRows`/`listIds` at
**read** time (index.js:527, :860) precisely so *"a rule fix reaches all 14k
rows on the next deploy with no backfill"* (facetrules.js:11-13).

The most important classification in the system is the one that can't
self-heal. Every fix below is worth roughly nothing to the existing 14k rows
until this changes.

### 4. Rule quality: polysemy plus first-match-wins

Ambiguous tokens confirmed in production data: `tv` (televisions / TV benches /
TV-and-film characters), `lerret` (projection screen / canvas), `foto` (cameras /
photo wallpaper), `e-?bok` unanchored (any `-boks-` compound), `\bsko[a-zæøå]*\b`
(any word with `sko` after a non-ASCII letter), `maling` (housepaint / artist
paint), `bord`/`stol` (Kitchen vs Furniture), `\bring(er)?\b`, `\bur\b`.

**Measured and rejected: a global "longest matched keyword wins" rule.** It
changes 235 of 10,733 rows and is not a clean win — it fixes `Løskort → Toys`,
`Klokkebokser → Watches`, `Spisebord & kjøkkenbord → Furniture`, but it breaks
`Nattbordslampe stående` (Lighting → Furniture, `nattbord` outscores `lampe`),
`Smykker > Herre > Armbånd` (Jewelry → Fashion) and `Boksehansker`
(Sport → Fashion). Do not adopt it as a blanket rule.

## Verdict on "should we build real sub-categories?"

**No.** SUBCATS-PLAN.md already resolved this: a sub-category *is* the `type`
facet, and that mechanism is the better one — read-derived, self-healing, no
migration, already rendered by Results. A second stored taxonomy tree would
need a column, a nav surface, a 14k-row backfill, and would freeze exactly the
way `cat` froze.

The user's underlying instinct is right, though, and it's cause #2: **we throw
the shop's sub-category away.** The fix is to capture and *use* it, not to
build a parallel tree.

Concretely — feeding `srcCat` into `deriveFacets` alongside `name`, measured
over the live catalog:

| | rows with a `type` value |
|---|---|
| today (name only) | 7,099 |
| name + srcCat | **8,319** (+1,220, +17%) |

Per category: Sport 169 → 386 (2.3×), Furniture 825 → 969, Fashion 800 → 957,
Toys 759 → 829, Outdoor 449 → 574. No new data, no backfill, no upstream edit.

## Done looks like

- `TV` contains televisions. `Projectors` contains projectors.
- A rule or vocabulary fix reaches the existing catalog, not just future rows.
- The shop's own leaf category is a *signal*, not an opaque string in `meta`.
- The share of rows categorized by shop floor alone is reported, and shrinking.

## Steps, in dependency order

**Step 1 — unfreeze `cat` (do this first; nothing else matters without it).**
worker/index.js:380 — let ingest re-run classification for live rows that are
`auto: 1` and have no human marker, instead of skipping every `meta.auto`. Add
`man: 1` in the admin PATCH handler so a hand-set `cat` is never overwritten,
and keep the existing rule that a demoted (`auto` + `hidden`) row never
re-promotes. The crawl already runs; a rule fix then lands on the whole catalog
on the next pass. Ship a one-off `tools/reclassify.mjs` (PATCH loop over
`catalog.json`, same shape as `apply-specs.mjs`) for the rows no crawl will
revisit soon.

**Step 2 — keep the whole breadcrumb.** `breadcrumbCat` returns the joined path
(`names.join(' > ')`, product-name leaf still dropped); `classify` splits on
`>`/`/`/`›`/`»`, applies `CAT_SKIP` per crumb, and walks **leaf → root**,
returning the first crumb that resolves. Leaf-first is the right direction:
`Dame / Sko / Komfortsko` must land on Shoes, not on `Dame` → Fashion. The
parent only speaks when the leaf says nothing — which is the `Leker > Figurer >
Nyankomne` case.

**Step 3 — `deriveFacets` reads `srcCat`.** facetrules.js:627 already receives
the whole meta object; match rules against `` `${name} ${srcCat}` ``. +1,220
typed rows, measured. Add `figur`/`karakter`/`samlefigur` to Toys' `type` and
move that rule **above** `\bpokemon\b` — a Pokémon *figure* is a figure, and
`pokemon` alone should not mean trading cards.

**Step 4 — fix the ambiguous tokens named in cause #4**, individually, and
re-measure each against a fresh `catalog.json` replay (memory: sample-tuned
category rules have been wrong twice). Add the missing vocabulary the data
shows: `figur`, `karakter`, `manga`, `tegneserie` → the right homes.

**Step 5 — audit the 47 `"*"` floors.** Drop it for the general retailers
(JYSK, Rusta, Jernia, Outland, Intersport, KappAhl…) and let steps 2–4 decide
per product. Single-category shops (Bikeshop, Klokker.no, Parfymeri) keep
theirs. Expect rows to go hidden — that is the correct outcome, and
`?hidden=1` is the backlog listing for them.

**Step 6 — a check that fails when this regresses.** One assert-style test over
a fixture of ~20 real `(srcCat, expected cat)` pairs taken from the labels in
this document — `TV- og filmkarakterer → Toys`, `Lerretsbilder → Hobby`,
`Klokkebokser → Watches`, `Singles (Løskort) → Toys`, `OLED TV → TV`,
`TV-benk → Furniture`. Cheap, and it is the only thing standing between a
vocabulary edit and a fresh 106-row TV category.

Steps 1–3 are the ones that pay. 4–6 are ongoing maintenance of a vocabulary
that will never be finished.

## Prior art — how other services do this (public sources, 2026-07-26)

Desk research only: vendor documentation, engineering blogs and papers the
companies published themselves. No comparison service was crawled.

### 1. Almost nobody guesses. The merchant supplies the category.

- **Kelkoo** requires the merchant's offer feed to carry *Kelkoo's own*
  category id (`catid 144801` for "Air Conditioner and Fan"). Kelkoo defines
  the taxonomy; the shop maps into it.
- **Google Merchant Center** makes `google_product_category` a required
  attribute; merchants map their catalog to a ~6,000-node tree.
- **Prisjakt** takes an XML/CSV feed submitted for review and approval.

pricy is in the hardest regime of the lot: we **scrape**, so no merchant is
contractually mapping anything and there is no review step. The only party
that ever normalizes a category here is us. That is a structural difference,
not an oversight — but it means the classifier is load-bearing in a way it
isn't for a feed-based competitor.

### 2. Two category fields, not one — and the merchant's path is kept verbatim

Google's feed spec has **both**:

| attribute | owner | values |
|---|---|---|
| `google_product_category` | Google | fixed taxonomy, ~6,000 nodes, 7 levels |
| `product_type` | the merchant | the shop's own path, free text, verbatim |

`product_type` is optional and *complementary* — Google states it uses **both**
to match queries to products.

This is the single strongest external validation of the reported instinct.
pricy already stores `meta.srcCat`; the defect is that we treat it as a
write-once artifact of promotion instead of a permanent, queryable signal.
Cause #2 above is exactly a missing `product_type`.

### 3. The breadcrumb is a *top* feature, not a fallback

- **"Don't Classify, Translate"** (arXiv 1812.05774; 94M+ items, ~4,100 leaf
  categories, Korean marketplace) ran feature ablations and found the best
  set is **word unigrams from the product name *combined with* navigational
  breadcrumbs**. Not one or the other.
- **Walmart** concatenates product name + description + the seller-provided
  product type into one token sequence before classifying.

pricy does the opposite of both, in two places: `classify()` reads the leaf
label and **deliberately never reads the name** (worker/index.js:387-392),
while `deriveFacets()` reads the name and **never reads srcCat**
(facetrules.js:627). Each half throws away the feature the other one uses.
Merging them needs no ML — it's a string concatenation.

### 4. A shop-level default is treated as a defect to be worked off

Walmart's re-shelving effort explicitly targets *"items with default taxonomy
hierarchy"* — products parked on a default node are the backlog, not the
answer. They gate on predicted probability and hand-check a 500-item sample
per department above the threshold before anything enters the catalog.

pricy's `catmap[shop]['*']` is the inverse: it produces a confident-looking
category from zero product evidence, for ~60% of the catalog, permanently, and
nothing ever revisits it. Step 5 above is the fix; the `hidden` backlog and
`?hidden=1` listing are already the unclassified bucket we'd need.

### 5. Re-classification is continuous everywhere else

Google versions its taxonomy, updates it periodically, and *translates old
category ids to the latest version* on submission. Shopify ships its taxonomy
under CalVer with at-most-quarterly releases plus machine-readable mapping
files to other taxonomies (`data/integrations`, MIT-licensed, txt + json).
Walmart re-runs classification over already-catalogued items.

pricy freezes `cat` at first promotion (cause #3). We are the only one in this
list where a taxonomy improvement cannot reach existing rows. That asymmetry —
facets self-heal, categories don't — is the thing to fix first.

### 6. Calibration: what accuracy is actually achievable

| system | scale | reported accuracy |
|---|---|---|
| Walmart CNN-LSTM | 200+ product types in one department | 88% validation; **80%** on a hand-checked 500-item sample |
| Rakuten (COLING 2016) | 150M products, 28,338 leaf categories | **81%** agreement with merchants' own assignments |
| Feedonomics "FeedAi" | — | 97% (vendor marketing, discount accordingly) |

Production ML lands around 80–88% against a taxonomy far deeper than ours. A
hand-written regex table will not beat that — but it doesn't have to. 80%
correct with a visible unclassified backlog is worth more than 100% assigned
where 60% is "whichever shop we scraped".

### 7. Matching ≠ categorizing — worth noting for plans item A

**PriceRunner's** own published post is about matching offers to products, not
categorizing them: a neural net trained with triplet loss and batch-hard
sampling, embeddings indexed with HNSW for approximate nearest-neighbour
lookup, >3 million labels, ~200 million offers/day. The number that matters
for us: that ML system *"currently stands for roughly 13% of all the matches"*
— the other 87% still comes from external identifiers (EAN/ISBN), manual
matching and rules. At PriceRunner's scale, identifiers plus rules still do
most of the work. They also published a labelled dataset (35,311 offers, 10
categories, 306 merchants) on Kaggle.

That is directly relevant to
[cross-shop-product-matching](cross-shop-product-matching.md): our EAN-first
approach is what the incumbent leans on too.

### What to take, and what to leave

**Take:**

1. **Google's two-field split.** Keep `srcCat` verbatim, permanently, and
   *use* it — for classification, for facet derivation, and as a search
   signal. This is steps 2–3, and it's the cheapest item in the plan.
2. **Name + breadcrumb together**, per the ablation. A concatenation, not a
   model.
3. **Walmart's "default node is a defect"** framing — retire the `"*"` floors,
   let rows fall to the hidden backlog, and report the size of that backlog.
4. **Continuous re-classification** — everyone does it; only we freeze.

**Leave:**

- **ML classification.** 14k products across 31 *flat* categories is not the
  problem the papers are solving (94M items / 4,100 leaves). With 60% of rows
  currently decided by shop-of-origin, the breadcrumb-plus-name path recovers
  most of the loss for a few dozen lines. Revisit if the vocabulary stops
  converging.
- **Adopting GS1 GPC / Google / Shopify taxonomy wholesale.** 31 categories
  that match the Browse page is the right size for this product, and Shopify's
  MIT-licensed tree is English-only — it can't seed a Norwegian vocabulary,
  which is the part that's actually hard here.
- **The feed-submission model.** Requiring shops to map into our taxonomy is
  how every competitor sidesteps this problem, and it is not available to a
  scraper. Assume we own classification forever.
- **Vendor accuracy claims.** 97% is marketing; plan against 80%.

## What actually shipped (2026-07-26)

| step | state | where |
|---|---|---|
| 1. unfreeze `cat` | done | `worker/index.js` promotion loop — live `auto` rows re-classify on every ingest; `meta.man` pins a hand-set category; demote still sticks |
| 2. whole breadcrumb | done | `worker/sources.js` `breadcrumbCat` joins the path; `classify` splits it and walks leaf→root |
| 3. `deriveFacets` reads `srcCat` | done | `worker/facetrules.js`; Toys' figure rule moved above the Pokémon/cards rule |
| 4. ambiguous tokens | done | `tv`, `lerret`, `foto`, `e-?bok`, `sko`, `kjøkkenbord`, plus missing vocabulary (`figur`, `karakter`, `manga`, `armbånd`, `tapet`, `luer`, `kopper`) — each re-measured against the live catalog |
| 5. retire the `"*"` floors | **done, differently** | 11 dropped (Outland/Rusta/Jernia, then Milrab/Widforss/Vitusapotek/Rum21/JYSK/Kid Interiør/Sport 1/Intersport), Gamezone's value corrected; 36 remain and the measurement says they are right — see "Item 1" below |
| 6. regression check | done | `test/api.test.js` — 27 real shop labels, one per failure mode |

Three deliberate calls, each smaller than what the plan proposed:

- **No `tools/reclassify.mjs`.** Step 1 makes every crawl a re-classification
  pass, and `tools/crawl.mjs` already covers all 50 shops. A separate backfill
  tool would run the same code over the same rows. Write it only if a shop goes
  dark long enough for its rows to matter.
- **Re-classification never un-promotes.** A live row whose label stops
  resolving keeps the category it has. Auto-demoting would pull products out
  from under live PDPs and watches on a vocabulary edit — a much worse failure
  than a stale category. Rows that *should* go are a manual `hidden: 1` PATCH.
- **`CAT_WEAK`**, a small list of crumbs that are an audience or a nav slot
  (`Dame`, `Herre`, `Home`, `Produkter`, `Nyankomne`…), skipped during the walk.
  Without it, leaf-first hits the gender crumb in `Smykker > Herre > Armbånd`
  before the department and answers Fashion for a bracelet.

### What the first production crawl actually did (2026-07-26)

Deployed, then `node tools/crawl.mjs --no-images` — 14,164 rows ingested, exit 0.

- **Visible catalog 14,118 → 21,353 products.** The 7,235 new rows are backlog
  rows that promoted because the *full path* now resolves where the bare leaf
  didn't ("Personlig pleie > Hårfjerning…" → Beauty, "Datakomponenter >
  Prosessorer > Intel…" → Computers). That is step 2 paying off, and it is the
  largest single effect of this work — bigger than the re-categorisation.
- **366 net category moves, every one driven by a real label**, and **0 rows
  dropped out of the catalog** (re-classification never un-promotes).
- The reported row serves as **Toys / Figures & dolls**.

**One defect shipped and was fixed the same day.** The first crawl produced 644
moves, not 366: 278 of them were a shop `"*"` floor re-filing a *live* row. With
`cat` no longer frozen, a product carried by two shops took the category of
whichever shop's row landed last in the batch — `Jenga Brettspill` (no `srcCat`
anywhere) flipped Toys→Gaming because Outland and Gamezone both stock it. The
floor is now allowed to promote a hidden row but never to re-file a live one
(`worker/index.js`, plus a regression test). The 278 rows were reverted to their
pre-crawl categories with `man: null`, so they stay eligible for future rule
improvements rather than being pinned — 0 rows in the catalog carry `man: 1`.

The lesson generalises: **unfreezing a value makes every weak input a recurring
writer, not a one-time guess.** Anything that was "good enough to seed with"
needs re-checking before it is allowed to run on every crawl.

### Item 3 (2026-07-26): CAT_SKIP reads the leaf, plus three missing words

`CAT_SKIP` tested the WHOLE label, so any `Tilbehør` in the path killed it —
`KLÆR > Tilbehør > Luer og pannebånd` lost 38 beanies with a perfectly readable
leaf. It now tests the **leaf** (what the product IS) and skips accessory crumbs
during the walk. A single-crumb label is its own leaf, so those are byte-for-byte
unchanged; only multi-crumb paths move. Plus `spisestue`, `spisegruppe`,
`sengeramme|sengestamme` → Furniture.

Measured over the 21,353-row live catalog: **387 rows newly classify, 8 move,
and 0 of the 387 have a name that `JUNK_RE` would block** — the leaf test still
catches `Mobil > Tilbehør > Deksel`, so the loosening admitted only real products
(beanies, outdoor rugs, backpacks, knitting needles, jewellery boxes, gym bags,
dog gates, bike lights). Not yet deployed: it needs a crawl to reach live data.

### Item 1 (2026-07-26): the floors, and what the measurement actually said

Worked against the 21,353-row live catalog with the new **`tools/score-cats.mjs`**
(replays the dump through the working tree's own `classify()` + `CATMAP`; it
exists because this was the third hand-rolled replay and the plan's own next step
was "a few at a time"). It reports the four numbers a rule edit needs: the
label/unreadable/no-label split, every row that would change category on the next
crawl, **how much of each category came from a shop floor**, and per-shop floor
agreement.

**The premise of this item was wrong in two places, and the tool is what showed
it.**

**First: dropping a floor cannot fix a single existing row.** Re-classification
never un-promotes, and since the 2026-07-26 fix a floor may not re-file a live
row either — so a live floor-decided row keeps its category no matter what
happens to the floor. Dropping one costs nothing today and changes nothing
today; it only stops *new* unreadable-label rows from being filed by shop. The
46% is not a backlog you can work off by editing config. It moves only when the
vocabulary learns to read those labels.

**Second: low floor agreement mostly meant our vocabulary was broken, not that
the shop was general.** "Of a shop's rows whose own label we CAN read, how many
land on the floor's category anyway" is the direct measurement of CLAUDE.md's
existing rule ("only where the WHOLE shop is one category"). A first pass cut
every floor under 75% — 16 shops. Reading the actual disagreements killed that:

- **Tegne.no (70%), Panduro (63%)** — art shops. `\bpapir`, `\bpenn`, `blekk`
  read Copic markers, artist ink and crepe paper as stationery; `maling` read
  children's and textile paint as housepaint. Rule bugs, same polysemy as `tv`
  and `lerret`. Fixed → 75% and 82%.
- **Trademax (58%), Chilli (66%), Fagmøbler (72%)** — furniture shops. Home's
  `oppbevaring` took 178 highboards and sideboards because Furniture had no word
  for a cabinet, and Lighting's `lampe` took the side tables out of "Lampebord &
  sidebord". Fixed → 61%, 72%, 76%.
- **Hi-Fi Klubben (71%), Bjørklund (74%)** — not disagreement at all. Their
  labels say `TV > Lydplanke` and `Analoge klokker`, which is *correct*, and the
  label already outranks the floor. The floor only ever speaks for their
  SKU-code rows, where it is right.

What survived as genuinely multi-department, on ≥60 readable labels: **Milrab**
(Outdoor, 10% — its own labels say Jakker/Gensere/Løpesko/Sportsklokker),
**Widforss** (Outdoor, 22%, plus a whole dog department), **Vitusapotek**
(Health, 25% — a pharmacy sells skincare and baby formula), **Rum21**
(Furniture, 38%, 84 rows of lighting), **JYSK** (42%), **Kid Interiør** (Home,
45% — furniture, kitchen, lighting, garden, office), **Sport 1** (12%) and
**Intersport** (15%). Those eight floors are gone; 36 remain, all at 61–100%.

**And one floor was simply the wrong value.** Gamezone sends no category at all
and its catalog is board games, Warhammer miniatures, dice, RPG books and TCG
singles — `Gaming` (consoles and video games) was wrong for ~580 of its 651
rows, which is most of why the Gaming category is 92% floor-decided. Now `Toys`.

**Where the 4,258 label-less rows actually come from.** Probing one product page
per shop: Gamezone, Nettdyret, Bikeshop, Foss Sport, Zooservice, Kicks and
Hobbii publish no category and no breadcrumb in any form — floor-or-nothing, and
for those specialists the floor is right. But **Japan Photo publishes
`Home > Kamera > Systemkamera` as schema.org *microdata*** and `breadcrumbCat`
only read JSON-LD, which is the whole reason Photo is 94% floor-decided.
`breadcrumbCat` now reads microdata crumbs too. Bergans publishes one as well and
it is the product name plus a colour — so a crumb equal to the product name is
now dropped wherever it sits in the path, not only at the leaf (left in,
`pocket` in the Books vocabulary read "Ally Map Pocket" as a book).

Net over the live catalog: rows decided by the product's own label 11,619 →
**12,152** (+533), floor share 44.5% → **42.0%**, and 739 rows change category
on the next crawl — every one traced to a real shop label. Two first-pass
additions measured badly and were re-placed rather than kept: sunglasses are an
accessory, not cosmetics, and a water bottle is kitchenware wherever it is sold
(as Outdoor it pulled ceramic mugs and a baby's drinking bottle along). The
regression check is 36 → **63** real shop labels.

The per-category floor share is now reported, which "Done looks like" asked for.
Worst: Photo 94% (fixed by the microdata reader on the next crawl), Gaming 92%,
Bikes 88%, Pets 80%, Outdoor 78%. The last three are single-specialist
categories where the floor is the shop's actual specialty — that number will
never go to zero, and it shouldn't.

### Open

1. **Gamezone's existing ~580 rows are still in Gaming.** A floor may not
   re-file a live row, so changing its value only helps new rows. These need a
   one-off admin PATCH with `man: null` (the same shape the 278 reverted rows
   used), and their names are readable — "Monikers Brettspill", "Aeldari
   Corsairs Dice". This is the one place a `tools/reclassify.mjs` would earn
   itself. **Held as of 2026-07-26** — not for data reasons: it adds 26% to
   Toys, the worst offender on the live CPU-ceiling failure
   ([read-path-whats-left](read-path-whats-left.md) §0). Refile after that
   lands.
2. **The remaining 36 floors still decide 8,788 rows**, but per the measurement
   above that is mostly *correct* — specialist shops that publish nothing. Only
   the vocabulary moves that number now. `tools/score-cats.mjs --labels` ranks
   what to read next; the tail is flat (top 100 labels = 1,192 of 3,920 content
   rows), and ~850 of the unread rows are pure navigation crumbs
   (`Home`, `Hjem > Produkter`, `Varemerker > Fjällräven`) that can never be read.
3. **The 4,258 rows with no `srcCat` at all**: seven shops publish no category
   in any form (probed 2026-07-26), so for them the floor is the only signal
   there will ever be. Item 2's "they need the shop to publish a breadcrumb" is
   answered — they don't, except Japan Photo, which is now handled.
4. **A crawl has to run** for any of this to reach production data. Existing
   rows keep their current category until re-ingested.
4. `meta.types` (Browse's type chips) still counts stored values only, so the
   +1,222 newly-derived types don't show there — pre-existing, noted in
   CLAUDE.md.
5. **`/api/catalog.json` now 503s intermittently** (1 in ~3 requests). The dump
   is 11.5 MB at 21,353 rows, up from 7.2 MB at 14k — it outgrew what one
   Worker response can reliably build. Ops-only endpoint, so nothing user-facing
   is affected, but `tools/` and any catalog replay need a retry or the endpoint
   needs paging. Pre-existing scale problem, newly load-bearing because a
   catalog replay is now the standard way to score a rule change.

## 2026-07-31: the product-eval vocabulary pass

The 29-shard LLM audit (`product-eval/`, 8,049 rows read, 797 category
findings) was replayed through the working tree: only 152 of its category
findings were already fixed by the shipped rules. The rest were rule-shaped,
so the fixes went into code per the eval's own guidance, each measured over
the live catalog (25,583 rows, `tools/score-cats.mjs`), not applied per-row.
The GPC layer raises the stakes on all of this: a brick page IS `cat=`
(+ `type` facet pin), so classifier and `type` correctness are now nav-visible.

**CAT_RULES / classify()** — the systematic regex defects, each with a
regression label in test/api.test.js (now ~120 cases):

- Fashion's unanchored `klær` read **Håndklær/Forklær/arbeidsklær** as
  clothing (~40 towels); Jewelry's `\bring` fired after æ/ø/å (**Skismøring,
  Rengjøring** — ø is not a JS word char) and bare `sølv` ate the fishing
  brand **Sølvkroken**; `sykkel` ate **Treningssykkel** (29 exercise bikes).
- Suffix compounds never matched `\bword\b`: `sko\b` (with `(?<!kabel)` —
  Kabelsko are cable lugs), `støvl`, `seng(er)?\b`, `sofa`, `dyne`, `teppe`,
  `puter?\b` (`(?<!com)` — Sykkelcomputer), `laken\b`, putevar/putetrekk/
  sengetepp → Home; møbel gained `(?<!hage|ute|tur)` + `(?!pleie|beslag…)`
  so garden furniture reaches Garden and furniture-care reaches Home/Tools.
- **A pet-department crumb now owns its whole path** (`Hjem > Katt > Leker`
  was Toys, `Hund > … > Shampoo og balsam` was Beauty) — animal words only,
  so a jewellery `halsbånd` path would still walk normally (measured: every
  live `halsbånd` label is a dog collar).
- The "og/& tilbehør" tail is stripped from the LEAF crumb only ("Dukker og
  Tilbehør" is a doll shelf) — mid-path accessory menus still skip, or
  eyelash curlers land in Tools.
- New vocabulary, one live label each: stelle/tåteflask/bæresele/ammepute →
  Baby, duftlys/romspray/dufter-til-hjem → Home (Beauty declines them),
  lerretsbilde → Home (they are printed wall art — fixture changed from the
  2026-07-26 Hobby call, all 42 live rows are Trademax/Chilli pictures),
  strikk guarded (Hårstrikk → Beauty, Strikkede gensere → Fashion,
  Treningsstrikk → Sport), parasoll/paviljong/basseng → Garden, frisbee/
  skismøring/spinning → Sport, fotballkort → Toys, `\bps[45]\b` → Gaming,
  mansjettknapp/slipsnål → Jewelry, mange flere.
- CAT_WEAK gained the `Til dame/herre/han/henne` audience forms (Bjørklund's
  cufflinks were Fashion via "Til herre").
- CATMAP exact entries for uniform shelves the vocabulary must never read
  globally (sampled row-by-row first): Fjellsport Sølvkroken → Outdoor,
  Garmin → Watches; Outland Merchandise → Toys; Proshop Spill → Gaming.
  **Measured and rejected:** Mestergull "Hjem > Produkter" → Kitchen — the
  eval's 36 cutlery rows share that label with 120+ real jewellery rows.

Net over the live catalog: **1,214 rows re-file on the next crawl** (was 0
pending), every top bucket a real label — 120 Furniture→Home garden/textile,
65+39 canvas prints → Home, 54 Manga → Books, 54+33 footwear → Shoes, 50
Furniture→Garden, 30 Løskort→Toys, 29 exercise bikes → Sport. Eval findings
fixed by rules: 152 → **622**. Floor share 37.1%.

**deriveFacets** (worker/facetrules.js) — the type facet is the GPC slice
dimension, so its two structural defects mattered most:

- **Segment priority: name → srcCat leaf → parents** (was one concatenated
  blob). Fixes the whole "parent crumb beats leaf AND name" class: 339
  card singles Games & puzzles → Trading cards, 45 Shorts-typed-Trousers,
  cushion covers typed Rugs, mugs typed Coffee makers. Also un-broke every
  `$`-anchored rule — **size derived 250 → 686 rows** (srcCat appended after
  the name had killed the end-anchor for any row with a label).
- **Colour no longer reads the brand** (color-only text strips it): Black
  Diamond → Black, Moccamaster → Brown, Gullkorn → Gold all gone (−60
  values, every removal checked). Type deliberately keeps the brand — LEGO →
  Building sets is the brand on purpose.
- Vocabulary/order: garment noun beats fabric word (Fashion + Outdoor:
  Shorts/Trousers/Jackets before sweat/strikk/shell), `jakker?\b` reads the
  Norwegian -jakke compounds (+111 typed rows), `\bull` prefix reads
  ull-compounds, headwear beats material (wool beanie ≠ baselayer),
  sleeping bag ≠ bag, `3-pack` ≠ backpack, TV-benk → Storage (was Chairs),
  `2,5-seter` no longer reads as 5 seats, pieces reads biter/stk/pcs
  (19 → 60 rows).

Type coverage 15,668 → **15,965**; every facet key not named above is
byte-identical across the 25k-row A/B replay.

**Not done, in order of value:** (1) deploy + a crawl — nothing above
reaches live data until then; (2) `score-cats --refile Kidsdreamstore=Toys`
and `--refile Skoringen=Shoes` for the label-less rows stuck on historical
mis-files (their floors are right, the rows predate them); (3) the eval's
non-rule fixes (`product-eval/fixes.jsonl`): brand hygiene (shop shelf
labels stored as brand — 78 rows/shard at Gamezone/Kidsdreamstore, an
ingest-level fix), scraper name defects (Ringo 40-char ALL-CAPS truncation,
Lekeverden SEO titles, Kicks doubled variant suffix), variant families;
(4) the remaining 945 eval rows that need a name-level signal classify
deliberately doesn't read (JYSK "Soverom" baby bedsets, Mestergull
silverware) — per-row PATCH territory, not vocabulary.

## GPC departments shipped 2026-07-31 — and does not touch any of this

[plans-implemented/gpc-departments.md](../plans-implemented/gpc-departments.md)
put a GS1 GPC *navigation* layer over Browse/rail/suggest. Read it as
consistent with, not contradicting, this file's verdicts:

- The "**Leave**: adopting GS1 GPC wholesale" call **stands**. `cat` is still
  the one stored classification dimension and `classify()`/`CATMAP` still own
  it; a GPC brick is an alias in `worker/depts.json` that *translates to* a
  backing `cat=` (+ optional facet pin). EAN→brick as a stored dimension
  remains parked. Nothing about the classifier, the vocabulary, the floors or
  the regression test moved.
- The "no real sub-categories" verdict **stands too** — a sliced dept rule
  (Headphones = Audio + `{type: ["Headphones"]}`) is exactly "a sub-category
  *is* the `type` facet", now with a nav surface. Which raises the stakes on
  facet vocabulary: a slice's `type` values must match `worker/facetrules.js`
  output exactly (build.js checks the keys, only measurement checks the
  values — replay like `tools/score-cats.mjs`).
- Practical coupling for future category work: build.js requires every
  `cats.json` cat to be reachable from a whole-cat rule in `depts.json`. **A
  new category now needs a dept rule too or the build fails.**
