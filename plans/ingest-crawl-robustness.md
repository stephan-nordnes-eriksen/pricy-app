# Crawl/ingest robustness gaps found running 55 shops

Found 2026-07-25, on the first full-catalog run (55 shops, 14k rows). Two of
these were fixed in flight and are recorded for context; the rest are open.

## Fixed already (2026-07-25)

- **Unbounded sitemap-index walk.** `sitemapUrls` fetched *every* sub-sitemap
  before returning a URL. Hobbii lists one per yarn colour, so a retry crawl
  sat for 45 minutes without reaching a product page. Now capped at 40
  sub-sitemaps with a warn on truncation, plus a 60s per-fetch timeout.
  Hobbii then completed with 164 rows.
- **Nameless rows poisoning a whole POST.** Hi-Fi Klubben's brand landing
  pages carry a price and a brand but no product name, so `slugId` keyed them
  on the brand alone (`p-aiaiai`). 32 such rows 400'd two entire 500-row
  chunks. `discoverSource` now requires a name on the slug path.

## Open 1 — ingest is all-or-nothing per POST

`POST /api/ingest` validates the whole array and rejects it wholesale
(worker/index.js:1047 for shape, :1061 for `unknown product_id`). One bad row
loses 499 good ones. That is exactly what happened above, and the cause was a
row the crawler should never have emitted — but the fragility is structural,
not specific to that cause.

**Fix shape:** reject per-row and return `{ingested, skipped: [{id, why}]}`.
Keep the hard 400 for a malformed body. Ponytail caveat: partial success
makes the crawler's exit code less meaningful, so the tool has to surface
`skipped` loudly or a shop can silently stop ingesting.

## Open 2 — concurrent crawling trips shop rate limits

`CRAWL_CONC` defaults to 8 (tools/crawl.mjs:59). At 10, five shops failed
outright on the sitemap fetch — Guttelus, Hobbii, Junior Barneklær and
Klokker.no with **429**, PetXL with **403**. All five succeeded later when
run one at a time, so the limit is per-source-IP across hosts, not per host.

Pages within a shop are already sequential with a `delayMs` pause; the
problem is the burst of sitemap fetches when N shops start at once.

**Fix shape:** lower the default, stagger shop starts, and — the real gap —
**retry on 429/403 with backoff** instead of dropping the shop for the whole
run. Today a 429 means that shop contributes nothing and someone has to
notice and re-run it by hand. See also the existing
`shop-crawl-rate-limits` memory (Proshop blocks for hours, CDON ~1h).

## Open 3 — multi-country sitemaps burn the page budget

kjell.com's sitemap covers every country it trades in. The first run spent
its entire 400-page budget on `/se/` pages that `scrapeRow` correctly threw
away as SEK — 260 wasted fetches, 0 rows. Fixed for that one shop with
`"pathFilter": "/no/"`, but nothing detects the problem generally.

**Fix shape:** have the crawler report a per-shop `rejected-by-currency`
count so this is visible instead of looking like a low-yield shop. Candidates
to check: kappahl.com, rusta.com, panduro.com, na-kd.com, bianco.com — all
international domains already wired.

## Open 4 — price refresh does not scale

`SOURCES` is empty in prod, so the hourly cron writes no prices (it is no
longer a full no-op — since 2026-07-26/31 it drains the image queue and
refreshes GPC slice counts) and the laptop crawl (`tools/crawl.mjs`) is the
only price writer. That was fine for 647
products across 8 shops. At 14k across 55 it is a person remembering to run
a ~40-minute job.

Moving it into the cron as-is will not work: a Worker invocation has a
subrequest budget far below 55 shops × 400 pages.

**Fix shape:** the honest options are (a) shard by shop across cron ticks —
the hourly trigger already exists, so N shops per tick cycles the whole set
daily; (b) Cloudflare Queues, one message per shop; (c) keep it off-Worker
and schedule it somewhere that can run for minutes. Decide before adding
more shops — this is the thing that makes prices *stale*, which is the one
claim a price-comparison site cannot be wrong about
(cf. [marketing-copy-honesty](../plans-implemented/marketing-copy-honesty.md)).

## Open 5 — the bulk catalog has no images — MOSTLY CLOSED 2026-07-26/27

The mechanism this described is gone: ingest now only *queues* image URLs
(D1 `images` table) and a drain (hourly cron + bearer-gated admin endpoint)
streams them into R2 — the 40-row POST cap that forced `--no-images` no
longer exists, and the UI **does** render `img` (`ProdImg`, CLAUDE.md
corrected 2026-07-27). What remains is not an image problem but a crawl-scope
one: full-catalog crawls are opt-in per shop (`approved` on `$discover`,
2026-07-27, none approved yet), so sampled shops' other products keep no
image (~8,937 as of 2026-07-27). That resolves with approval + a crawl, not
with new image code.
