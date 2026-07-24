# Prompt: build ingestion for SHOP-CANDIDATES.md

Paste everything below this line into a fresh Claude Code session in this repo.

---

Read `CLAUDE.md`'s "real price sources" section and `worker/sources.js` end
to end before touching anything — you need to understand `adtractionSource()`
(per-shop XML feed, needs an approved affiliate account + feed URL in the
`ADTRACTION_FEEDS` secret) vs `scrapeSource()` (generic schema.org
Product/Offer JSON-LD off a shop's own pages, driven by `tools/crawl-urls.json`
+ `node tools/crawl.mjs`, no contract needed) before deciding anything.

Then read `SHOP-CANDIDATES.md` in full — it's the source of truth for the
~224-shop lead list, each with a sells/ingest-notes/scrape-verdict row. Do
**not** copy that data into a second file; always read it live.

**First, resolve one conflict before starting new work:** `tools/crawl-urls.json`
already scrapes 5 shops live — CDON, Clas Ohlson, NetOnNet, Power, Proshop.
SHOP-CANDIDATES.md's compliance pass independently flagged **CDON.no as
ToS-Prohibited** (bans robots/crawlers/automated agents explicitly). That's a
live shop already being scraped in apparent violation of its own terms.
Surface this to the user before doing anything else in this session — don't
silently rip it out, don't silently ignore it, ask how they want to handle it.

## Goal

For every shop in SHOP-CANDIDATES.md (skip the 5 already wired above, but do
still give CDON a note file recording the conflict), create one markdown note
file in a new `shop-notes/` folder at repo root:

```
shop-notes/<slug>.md          # e.g. shop-notes/kjell-and-company.md
```

Then, for the shops where it's genuinely low-effort, actually wire the
ingestion config too (see "Phase 1" below). Everything else gets prepared —
documented and, where the code path doesn't exist yet, stubbed — but not
activated, since it depends on something outside this session's control
(an affiliate-network application).

## Tiering — decide per shop, cheapest option first

Use the shop's row in SHOP-CANDIDATES.md (`Ingest notes` + `Scrape verdict`
columns) to place it in exactly one tier. If a shop shows up in more than one
category table in SHOP-CANDIDATES.md (e.g. Norrøna, Outnorth, Bikester — they
repeat across Fashion/Sports because they sell into both), treat it as one
shop with one note file.

1. **Excluded — do not build.** Anything in the two "Do not scrape" tables
   at the top of SHOP-CANDIDATES.md (explicit ToS **Prohibited**, or
   **Robots-blocked**). Also anything marked defunct/non-viable in a row's
   notes (Digital Impuls, GamingPoint, Villmarksbutikken, Blush → redirects
   to Nordic Feel). Note file records why and stops here — the point of the
   file is so nobody re-investigates this later.

2. **Phase 1 — scrape, build now.** Shop has **Confirmed Product JSON-LD**
   (or "Inconclusive JSON-LD" — worth a quick real check) and a verdict of
   Silent/Ambiguous/Unknown-but-not-blocked. No contract, no approval, no
   new code path needed — `scrapeSource()` already exists. This is the
   "simple ingestion flow, non third-party ad network" set the task is
   about. Build these.

3. **Phase 2a — Adtraction, prepare only.** Shop is "Confirmed Adtraction"
   in SHOP-CANDIDATES.md. Code path (`adtractionSource()`) already exists
   and is shipped. Blocked purely on a human step: applying to the
   advertiser program in the Adtraction dashboard and getting the feed URL
   (see `ADTRACTION-COOKBOOK.md` — some of these, e.g. Skousen, may already
   overlap with shops applied for there; check before assuming a fresh
   application). Note file records the shop is ready to wire the moment a
   feed URL exists — nothing to build in code.

4. **Phase 2b — other affiliate network, prepare only.** Shop is confirmed
   on Awin / Partner-ads / Tradedoubler instead. Unlike Adtraction, there is
   **no adapter for these networks in `worker/sources.js` yet** — this tier
   needs both a contract AND new code, so it's two steps behind Phase 2a.
   Note file should record the network and, if you can find one, a link to
   that network's feed format docs, so implementing the adapter later isn't
   a cold start. Do not write speculative parsing code against a feed
   format you haven't seen a real sample of.

5. **Needs manual recheck.** Ingest notes or scrape verdict is "Unknown"
   (ToS unreachable, bot-walled, JS-rendered, 403/429, etc). Do a real check
   — `curl -s <product-url> | grep -i 'ld+json\|scrap\|crawl\|robot'` and
   actually read the ToS/robots.txt yourself, WebFetch alone isn't reliable
   here (SHOP-CANDIDATES.md says why). Reclassify into tier 1, 2a, 2b, or
   Excluded based on what you find, and say in the note what you checked.

## Per-shop note file

Keep it short — a few lines, not a report. Suggested shape:

```markdown
# <Shop name>

- URL: <domain>
- Category: <from SHOP-CANDIDATES.md section>
- Tier: excluded | phase1-scrape | phase2a-adtraction | phase2b-other-network | needs-recheck
- Chosen method: <what, and why it's the least-manual option>
- Alternatives: <other viable option(s) noted for later, if any>
- Status: <not started | pilot wired | working | blocked on X>
- Notes: <anything shop-specific — weird JSON-LD shape, 403s on bot UA
  (needs `$ua: "browser"` like NetOnNet), currency mismatches on
  multi-country domains, etc>
```

If a shop has both a Phase 1 option (JSON-LD scrape) and a Phase 2 option
(confirmed on a network), pick Phase 1 to build now — it needs no contract —
and record the network option under "Alternatives" for a later swap (a feed
is less per-product manual upkeep than a hand-curated URL list once the
account exists).

## Phase 1 build steps, per shop

1. Pick 2-4 products that shop plausibly sells and that already exist in the
   catalog (`worker/seed.json` product ids, or add a couple via
   `worker/extra.json` first if the shop only sells things not yet
   catalogued — see CLAUDE.md's "Adding products needs no upstream edit").
   Find the real product page URLs by hand (WebFetch/WebSearch) — never
   fabricate a URL.
2. Add them to `tools/crawl-urls.json` under the shop's key. If the shop
   403s a bot UA, add `"$ua": "browser"` (see NetOnNet's existing entry).
3. `node tools/crawl.mjs --dry --shop "<Shop>"` and confirm it prints real
   prices for every product, not silent scrape failures (check stderr for
   `scrape failed` warnings — those mean the generic JSON-LD parser
   (`productOffer` in `worker/sources.js`) didn't find what it expected on
   this shop's markup).
4. If it doesn't parse: read the page's actual JSON-LD
   (`curl <url> | grep -A5 'ld+json'`) and see whether the existing
   candidate-name matching in `pick()` just needs a new tag name added (a
   one-line, shared, non-shop-specific change — same pattern as the
   `NetOnNet`/`priceSpecification` and `Power`/breadcrumb-category handling
   already in `scrapeSource()`) or whether the shop is genuinely
   non-standard and stays "blocked" for now. Don't hardcode a per-shop
   branch — the whole point of the shared parser is candidate-name/shape
   matching that works across shops.
5. Update the shop's note file status accordingly.
6. `npm test` before committing.

## Execution notes

- ~200 shops is too much for one linear pass. Fan out with the `Agent` tool
  (`general-purpose`, or `Explore` for the research-only steps) — a batch per
  SHOP-CANDIDATES.md category section is a natural split. Each agent's job
  ends at "note file written (+ pilot URLs wired for Phase 1 shops)"; don't
  have agents touch `proto/` or any repo-root design-system file, and don't
  have them commit `ADTRACTION_FEEDS`/`INGEST_TOKEN` values anywhere.
- Never scrape anything in the two "Do not scrape" tables, full stop, even
  as a test.
- Commit in reviewable batches (e.g. per category, or per completed tier),
  not one 224-file commit — makes it possible to spot a bad call.
