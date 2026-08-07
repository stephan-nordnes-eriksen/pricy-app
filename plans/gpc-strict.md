# gpc-strict — categorization by GS1 GPC brick, nothing else

Branch `gpc-strict`, 2026-08-07. The regex/breadcrumb classifier guessed,
and a guess in the wrong category is a total failure for a comparison
site. Now: a product's category IS its 8-digit GPC brick (`meta.brick`),
written only by the resolver (gtin → brick) or an admin pin. No GTIN, or
no resolvable brick → the visible, honest **Ukategorisert** bucket.
Architecture details live in CLAUDE.md; this file holds the rollout
runbook and the pending upstream work.

## Rollout (deploy order)

1. Deploy the branch. Cold start runs the `gpc` DDL, drops
   `idx_products_cat`, creates `idx_products_brick`, and runs the row-5
   migration (strips stored cat/icon/kw/man + dead demo bricks from every
   row; the meta rewrite refolds the search index). On prod's ~34k rows
   consider pre-running the same UPDATE + marker insert via
   `wrangler d1 execute` so the first request doesn't pay it.
2. Day 1: everything is Ukategorisert except the fixture-resolved demo
   rows. Sparse but honest — search/PDP/prices/watches unaffected.
3. Drain the known GTINs: loop `POST /api/admin/gpc?n=500` until
   `remaining: 0`. With the stub, unknown gtins record `status: 'none'`
   and stay honestly unsorted; the queue rows persist for the real
   resolver.
4. Re-scrape (`node tools/crawl.mjs`) — every source now captures `ean`
   into meta.ean/eans/gpc-queue, so `p-*` rows acquire GTINs. Measure
   before/after with `node tools/gpc-coverage.mjs`.
5. **Verified by GS1** (the real resolver): sign up with GS1 Norway
   (owner-GLN membership + API Basic, ~1 600 NOK/mnd, unlimited batch
   lookups — see the research summary below). Then, in a follow-up
   branch: implement `resolveGtins` in `worker/gpc-resolver.js` against
   `POST {VBG_API_URL}/api/v2/Grp/gtins/verified` (gtins zero-padded to
   14 digits, batches ≤500, map `gpcCategoryCode` back), set
   `VBG_API_URL`/`VBG_API_KEY` secrets, flip `RESOLVER_SOURCE` to 'vbg',
   and re-queue the stub's answers:
   `UPDATE gpc SET status = 'queued' WHERE status = 'none'`.
   LICENSING: the `gpc` table's five columns are the boundary — VbG terms
   restrict storing/republishing Content; gtin → brick + timestamp +
   provenance is all we keep, every other response field is discarded.
6. Rows with genuinely no GTIN (most Shopify shops): admin pins only —
   `tools/gpc-pin.mjs` from a curated `{id: brick}` file. gpc-coverage's
   per-shop gtin% shows where that backlog is.

## GPC publication upgrades

`node tools/gpc-build.mjs --refresh` pulls the next edition
(ref.gs1.org, biannual). A curated/fixture code going inactive fails
build.js — remap it in gpcno.json, and migrate stamped rows with a
follow-up seed_meta-marker UPDATE if the retired brick is stocked.

## Verified-by-GS1 research (2026-08-07, live-checked)

- GS1 Norway GRP API: `POST /api/v2/Grp/gtins/verified` (batch), swagger
  at keys.prd.no.duplex.app/api/help. API Basic 1 600 NOK/mnd, quarterly,
  "unlimited" (throttleable). Eligibility: GS1 Norway member with an
  owner-GLN (no company prefix needed) — order at minside.gs1.no.
- Response: `gpcCategoryCode` (8-digit brick, NULLABLE — brand owners
  self-report; expect a real miss rate outside FMCG), `isComplete`,
  brand/description/image/netContent (all discarded, see licensing).
- Terms (GS1 UK wording; ask GS1 Norway for their avtalevilkår):
  §19 restricts redistribution/permanent copies of "Content" —
  category-code-only storage is the low-risk design.
- Tradesolution EPD (epdapi.tradesolution.no, v1) returns full GPC incl.
  brick for the Norwegian grocery vertical — a possible second resolver
  if groceries ever matter; v2 dropped GPC, so confirm before building.

## Pending upstream work (Claude Design, prototype project)

Everything ships without these — they remove the marked degradations:
legacy `cat=` deep links lose their scope, onboarding chips are GPC
segment names, multi-tile "All <dept>" pages stay client-side, and the
flat SPEC_KINDS path plus Compare's same-kind rule run through boot's
rebound `specKindOf`.

> **=== PASTE-READY UPSTREAM PROMPT (prototype project) ===**
> Pricy now categorizes strictly by GS1 GPC brick, resolved from the
> product's barcode. The host serves per-row `p.brick` (8-digit GPC code),
> `p.path` ("Segment › Family › Class"), and display `p.cat` (the
> segment's display name); `CATALOG.meta.tree` is the stocked GPC
> hierarchy `[{code, name, icon?, n, children: […]}]` (4 levels; names are
> Norwegian where curated, English GPC titles otherwise — render them as
> given, never translate or invent); `meta.uncat` counts "Ukategorisert" —
> products whose barcode has no verified GPC category yet. Please:
> 1. **Browse**: keep the department cards, and render a final
>    "Ukategorisert" card (icon `package-search`, count `meta.uncat`, one
>    chip "Vis alle" → `go('results', {brick: 'uncat'})`). Panel copy:
>    "Produkter vi ennå ikke har verifisert kategori for. Prisene og søket
>    virker som vanlig." Optionally add an "Alle kategorier (GPC)"
>    collapsible 4-level tree from `meta.tree`, navigating
>    `go('results', {brick: code})` at any level.
> 2. **Results**: when `brick === 'uncat'`, show only the Ukategorisert
>    head in the category rail (no siblings) and a muted "usortert" hint
>    by the title.
> 3. **Specs/Compare**: `specKindOf` should key on the host-provided
>    ruleset (`window.BRICK_CAT[p.brick]`) instead of `p.cat` — the
>    SPEC_KIND_BY_CAT keys are ruleset ids now, not display names.
> 4. Confirm onboarding/SearchSuggest hardcode none of the old category
>    names — `CATEGORIES` now holds GPC segment display names.
> 5. Never re-add name-based category guessing anywhere; `p.cat` is
>    display-only, derived from the brick.
> **=== END ===**

## Parked / open

- VbG brick coverage for non-grocery Norwegian retail is unmeasured —
  buy one month, run the ~10k known GTINs through it, read the hit rate
  before judging the miss-mitigation strategy.
- Multi-tile dept pages as ONE server query needs a node-set dialect —
  only build it if the client-side fallback ever hurts.
- Compare candidate pools are same-segment (display cat); narrow to
  class-level if cross-segment pools ever feel wrong.
