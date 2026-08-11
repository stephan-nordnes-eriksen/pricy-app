# product-eval — LLM audit of the live pricy.no catalog

An LLM pass over every live product, complementing the coded classifier/facet
rules. Read-only: nothing here has been applied to the catalog.

Snapshot: `/api/catalog.json` pulled 2026-07-27 01:17 — 25,405 live products.

## Files

| file | what |
|---|---|
| `RUBRIC.md` | the spec every auditing subagent follows |
| `findings/<SHARD>.jsonl` | one line per product: `{"id","status":"ok"}` or a full issue record with a ready-to-apply `fix`; last line is the shard `_summary` |
| `REPORT.md` | generated rollup — counts by kind/category, proposed re-classifications, rule gaps, high-severity table, per-shard summaries |
| `fixes.jsonl` | just the applyable set: id + severity + kinds + `fix` |
| `REMAINING.txt` | shards not yet audited |
| `aggregate.mjs` | regenerates `REPORT.md` + `fixes.jsonl` from `findings/` |
| `shards/`, `catalog.json` | gitignored inputs (11 MB / 14 MB) |

## Status

29 of 101 shards done — 8,049 of 25,405 products. The rest stopped on a
session limit, not an error; every landed file is complete and validated
(all ids present exactly once, valid JSON, `_summary` last).

## Resume

For each shard in `REMAINING.txt`, run one subagent with:

> Audit one shard of the live pricy.no product catalog.
> 1. Read `/Users/stephaneriksen/github/pricy-ponytail/product-eval/RUBRIC.md` — the complete spec for this job.
> 2. Read the shard: `/Users/stephaneriksen/github/pricy-ponytail/product-eval/shards/<SHARD>.json`
> 3. Evaluate every product per the rubric.
> 4. Write `/Users/stephaneriksen/github/pricy-ponytail/product-eval/findings/<SHARD>.jsonl` in one Write call — one JSON object per line, every input id exactly once, `_summary` line last.
> No web fetches, no API calls, no catalog mutations. Reply in at most 5 lines.

Concurrency caps at 20 subagents. Then re-run `node product-eval/aggregate.mjs`
and refresh `REMAINING.txt`:

```sh
node -e 'const fs=require("fs");const d=new Set(fs.readdirSync("product-eval/findings").map(f=>f.replace(".jsonl","")));fs.writeFileSync("product-eval/REMAINING.txt",JSON.parse(fs.readFileSync("product-eval/shards/_manifest.json")).filter(m=>!d.has(m.shard)).map(m=>m.shard).join("\n")+"\n")'
```

If the snapshot goes stale, re-pull the catalog and re-shard — `shard.mjs`
logic is described in `RUBRIC.md`'s input table; shards are 300 rows, grouped
by category, each carrying its category's `worker/facets.json` entry.

## Before applying anything

`fix` payloads are LLM proposals, not verified truth. The systematic ones
(vocabulary gaps in `CAT_RULES` / `worker/facetrules.js`) are worth fixing in
code first — one rule change reaches every row, and per-row PATCHes for a
rule-shaped problem would be undone conceptually by the next crawl's
re-classification. Score any `CAT_RULES` edit with `node tools/score-cats.mjs`
before and after, per CLAUDE.md.

Note: `REPORT.md` dedupes rule gaps by exact string only, so the same gap
reported in different words by different shards appears more than once.
