# Paste-ready prompt — implement the catalog-scale backlog

Copy the block below into a fresh Claude Code session in this repo. Replace
`<ITEM>` with the letter you want (A–F from [README.md](README.md)), or leave
the "start with A" wording to let it pick.

Do **one item per session**. These touch ingest, the query layer and 14k rows
of live data; a session that tries three will run out of context mid-migration
and leave prod half-changed.

---

```
Read plans/README.md, then work item <ITEM> from the catalog-scale backlog
(A–F). Read that item's plan file in full before touching anything — each one
states current state with file:line evidence, what "done" means, and the
steps.

Context you need up front:
- CLAUDE.md is authoritative on how this repo works. Read it first. The rules
  that will bite you: proto/ and the repo-root design files are sync-owned and
  must never be hand-edited (behaviour fixes go upstream in Claude Design,
  then re-sync); hand-written code is only boot.jsx, build.js, worker/, test/
  and configs.
- These plans came out of the 2026-07-25 run that took the catalog from 647
  products / 8 shops / 10 categories to 14,059 / 55 / 31. The numbers in them
  were measured against live prod, not estimated. Re-measure before you trust
  any of them — the catalog changes every crawl.

How I want you to work:

1. Measure first, then decide. Every one of these plans exists because
   something that looked obviously right was wrong when counted. The last
   session added a product-name fallback that a 451-row sample said was
   essential; against the full 12,614-row crawl it decided 101 rows (+0.8%)
   and most were things CATMAP deliberately excludes, so it got deleted. Do
   not tune promotion, matching or ranking by reading code and reasoning
   about it. Get real rows (`node tools/crawl.mjs --dry --limit 12 --out
   s.json`), score the change, and READ THE MISSES — "more matches" is not
   "more correct".
2. Tell me the number before and after. If a change is supposed to improve
   coverage, quality or speed, I want the measured delta, not an assertion.
3. If the plan file's premise turns out to be wrong, stop and say so rather
   than implementing it anyway. Item A explicitly warns that its own headline
   number is confounded by sampling — check that before building anything.

Constraints:
- `npm test` must pass before any deploy (it builds, then runs the jsdom UI
  suite + Worker API tests). Add a test for whatever you change; for a bug
  fix, verify the new test actually FAILS with the fix reverted — a test that
  passes either way is worse than none.
- Bash runs sandboxed by default and the sandbox has NO network. Anything
  that talks to prod or a shop — curl, wrangler deploy, tools/crawl.mjs,
  npm run test:e2e — needs the sandbox disabled or it fails misleadingly.
- pricy.no API GETs are edge-cached. When verifying a deploy landed, add a
  throwaway query param (`&cb=$RANDOM`) or you will debug code that is
  already fixed.
- Deploys are manual and separate from the push: `npm run deploy`, unsandboxed.
- Anything that changes ingest or promotion must be DEPLOYED BEFORE you crawl,
  because promotion happens Worker-side at ingest time.
- Never scrape competing comparison services (Prisjakt, Prisguiden etc.);
  first-party shop pages and licensed feeds only. If a shop's robots.txt
  disallows its product paths, it does not get crawled — 17 shops were
  refused on exactly that basis and that call stands.

Migrations: items A and D touch data already written to 13,705+ live rows.
Auto-promoted rows are guarded against re-promotion (meta.auto + hidden
checks), so a backfill has to write the field directly rather than re-run
promotion. Plan the backfill and tell me the row count and how long it will
take before you start writing to prod.

Commit in logical chunks with real commit messages — what was broken, why the
fix is shaped this way, what you measured. Push to origin main. Do not deploy
without telling me what you are about to deploy.

Start by reading the plan file and telling me what you found when you
re-measured its premise. Do not write code until we agree the premise holds.
```

---

## Per-item notes worth pasting alongside

Add whichever applies — these are things the 2026-07-25 session learned the
hard way and the plan files reference only briefly.

**A (cross-shop matching)** — before any matcher: raise `limit` in
`tools/crawl-urls.json` and re-crawl, then recount products with >1 offer. The
94/14,059 figure is from a 400-page-per-shop sample and is probably mostly a
sampling artefact. Also: never auto-merge on a fuzzy score. "Sony WH-1000XM5"
and "Sony WH-1000XM5 etui" are one token apart, and merging them shows a wrong
price — the worst failure this site has.

**B (crawl robustness)** — the 429s are per-source-IP across hosts, not per
host: 5 shops failed at `CRAWL_CONC=10` and every one succeeded when run
alone. Test any concurrency change against the shops that actually failed
(Guttelus, Hobbii, Junior Barneklær, Klokker.no, PetXL), not against shops
that were already fine.

**C (drop cards)** — with one crawl there is exactly one price point per
product, so nothing has a drop yet regardless of how you rank. Verify there is
real multi-day history before concluding the ranking works. `topDropIds` also
does a full head scan and its own comment caps that at ~2k heads; it is 14k
now, so measure the query before shipping it.

**D (search)** — the diacritic fix is a migration, not a one-liner: `kw` is
written once at promotion and 13,705 rows already have an unfolded one.

**E (facets)** — check what upstream Results renders for a category with no
facet defs BEFORE building data. If it renders a bare heading or empty
column, that is a Claude Design fix, not a registry edit.

**F (hidden rows)** — decide the intent first. The code comment says the
`ids=` behaviour is deliberate. If `hidden` is only ever meant to mean
"unlisted", the fix is documentation and something else has to become the
moderation tool for a bad product page.
