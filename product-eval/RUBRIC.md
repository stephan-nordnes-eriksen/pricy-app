# Product evaluation rubric (LLM pass over the live pricy.no catalog)

You are auditing rows from the LIVE catalog dump of pricy.no (a Norwegian price
comparison site). Most rows were created automatically by crawlers/feeds and
classified by regex rules — your job is the judgement those rules can't make.

Product names and source categories are mostly **Norwegian**. Read them as such
(`Luer` = beanies, `Sko` = shoes, `Kjøkken` = kitchen, `Leker` = toys,
`Maling` = paint, `Smykker` = jewellery, `Bøker` = books, `Sykkel` = bike…).

## Input

Your shard file has `{shard, category, declared_facets_for_this_category, products[]}`.
Per product:

| field | meaning |
|---|---|
| `id` | `ean-<digits>` = discovered by EAN, `p-<slug>` = discovered without EAN, anything else = curated/seeded. `x~y` = variant child of `x`. |
| `name` | as published by the shop |
| `brand` / `cat` / `icon` | our stored values |
| `srcCat` | the shop's own breadcrumb/category path (leaf-last), the main evidence for `cat` |
| `facets` | derived (from name+srcCat by regex) or explicitly enriched — you can't tell which apart |
| `specs` | present only for curated rows; `{_keys:[…]}` when it was too big to inline |
| `img` | 1 = a real product photo is stored, 0 = none |
| `offers` | `[[shop, price NOK], …]`, `best` = cheapest, `was` = list price |
| `variants` / `family` / `vlabel` | variant wiring (almost nothing has it) |
| `auto` | 1 = machine-promoted from the hidden backlog |
| `hist` | number of stored price points |

## The 31 valid categories

Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers,
Kitchen, Appliances, Furniture, Lighting, Garden, Tools, Auto, Bikes, Sport,
Outdoor, Fashion, Shoes, Watches, Jewelry, Beauty, Health, Pets, Baby, Books,
Office, Hobby, Photo

Never propose a category outside this list. Note the intended splits:
Fashion = clothing + bags/accessories; Shoes is separate; Hobby = craft, art
supplies, model kits, board/puzzle for adults, sewing, music instruments;
Home = interior/decor/textiles/storage; Kitchen = cookware + small kitchen
appliances; Appliances = large white goods; Outdoor = hiking/camping/fishing/
hunting; Sport = training/team sport; Office = stationery, printers, desk gear;
Photo = cameras, lenses, tripods, drones.

## What to check, per product

1. **Category** — does `cat` match what the product actually is, given `name`
   + `srcCat`? A shop breadcrumb beats a guess from the name; the product
   itself beats a vague breadcrumb (`Nyheter`, `Dame`, `Tilbud`, `Produkter`).
   Report only real mismatches, not "could arguably also be X".
2. **Facets** — for each key in `declared_facets_for_this_category`: is the
   stored value wrong (contradicted by the name), or clearly missing when the
   name states it (`Sort` → color Black, `Str. 42` → size 42, `500 ml` →
   volume)? Ignore keys the name/srcCat give no evidence for — absence there is
   normal, not a finding. A wrong value is high severity; a derivable-but-
   missing one is low unless the whole shard misses it (then say so once in the
   shard summary as a rule gap).
3. **Variants** — within this shard, are there rows that are plainly the same
   product in another colour/size/capacity, sitting as separate top-level rows?
   Group them: pick the best row as head and list the others as members. Also
   flag a row whose `name` carries a variant suffix (`- Sort - 42`,
   `256GB Blue`) but has no `vlabel`/`family`.
4. **Metadata quality** — `brand` missing when the name states it, or wrong /
   a shop name / duplicated inside the name; `name` garbled, HTML-entity-
   escaped, truncated, ALL CAPS boilerplate, containing SKU noise or the shop
   name; `icon` obviously wrong for the product; missing `img`; price
   implausible for what the product is (a kr 39 "sofa" is a sample/accessory,
   a kr 89 000 toy is a data error); `rating`/`reviews` present without offers.
5. **Should it be live at all** — accessories, spare parts, gift cards,
   shipping fees, services, sample swatches, empty display boxes, adult content
   mis-shelved, or a row so unidentifiable no shopper could use it. Propose
   demotion (`hidden: 1`).

Be strict but not inventive: if the data doesn't support a finding, the product
is `ok`. False positives cost more than misses here — every finding is meant to
be applied.

## Output — one JSONL file, one line per product, ALL products

Write to `product-eval/findings/<SHARD>.jsonl` (relative to the repo root,
`/Users/stephaneriksen/github/pricy-ponytail`). Use the Write tool once with
the whole file; do not append line by line.

Clean row:

```json
{"id":"ean-123","status":"ok"}
```

Row with findings:

```json
{"id":"ean-7050112345678","name":"Bergans Ally Map Pocket - Black","status":"issue","issues":[{"kind":"category","severity":"high","field":"cat","current":"Books","suggested":"Outdoor","why":"map pocket for a canoe, srcCat 'Ally Map Pocket > Black' has no real crumb; 'pocket' matched the Books vocabulary"},{"kind":"facets","severity":"low","field":"facets.color","current":null,"suggested":"Black","why":"name ends in '- Black'"}],"fix":{"patch":{"cat":"Outdoor","facets":{"color":"Black"}}}}
```

`kind` ∈ `category | facets | variant | metadata | name | brand | icon | image |
price | duplicate | junk`. `severity` ∈ `high | med | low`.

`fix` is what would correct it, one of:

- `{"patch": {…}}` → `PATCH /api/admin/products/<id>` meta-merge body
  (`cat`, `brand`, `name`, `icon`, `facets`, `specs`, `hidden:1` to demote).
- `{"alias": {"ean":"<13 digits>","product_id":"<target id>"}}` → re-home a
  duplicate/variant row onto an existing product (only when the row has an
  `ean`).
- `{"group": {"head":"<id>","members":["<id>",…],"axis":"color|size|capacity"}}`
  → a variant family that needs wiring.
- `{"rule": "<one line describing the CAT_RULES / facetrules.js vocabulary gap>"}`
  → when the same mistake will keep recurring for every future row like it.

A product may have several issues; it always has at most one `fix` (combine).

## Also write a shard summary

Last line of the JSONL, exactly one, `id` = `_summary`:

```json
{"id":"_summary","shard":"Toys-03","checked":300,"ok":271,"issues":29,"by_kind":{"category":11,"facets":9,"junk":6,"brand":3},"high":7,"rule_gaps":["'pannebånd' (headband) is unmapped and lands in Home"],"notes":"one sentence on the shard's overall health"}
```

## Rules of engagement

- Judge from the shard data only. Do NOT fetch web pages, do NOT call the pricy
  API, do NOT modify anything in the catalog — this pass is read-only and its
  only side effect is the findings file.
- Do not skip products. Every input `id` appears exactly once in the output.
- Return to your caller **at most 5 lines**: shard name, checked/ok/issues,
  the high-severity count, and the single biggest systematic problem you saw.
