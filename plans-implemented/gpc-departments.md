# GPC departments ("Departments II") — implement the 2026-07-31 sync

Status: **DONE and deployed (2026-07-31).** Steps 0–6 all landed (commits
693181b…499997f), including the step-5 upstream fix (Results passes GPC scopes
through `onQuery`; boot's `scopeCat` translates brick/dept → `cat=`, re-synced
in ca0767d/499997f). Live smoke-tested: `meta.depts` serves 14 departments over
all 31 cats, Pets lists 1,169 real rows, brick URLs deep-link. The three parked
items were also picked up same-day (see bottom section) — only the multi-cat
"All <dept>" client-side degradation remains, and it's documented in CLAUDE.md
as an accepted limitation, not open work.

## What upstream changed

The prototype moved category navigation to GS1 GPC (Global Product
Classification) with a shopper-facing "departments" layer on top:

- **`proto/GpcData.jsx` (new):** GPC tree (Segment → Family → Class → Brick)
  with icons, Norwegian synonyms (`syn`), and DEMO counts (`n`); `DEPTS` —
  curated departments, each an editorial list of brick rules (whole brick, or
  a brick sliced by an attribute, carrying `label` + `n`); a bridge
  `brickToCat` (via `CLS_CAT`/`BRICK_CAT`) from bricks to legacy `p.cat`
  strings; `brickProducts`/`deptProducts` resolving against `window.CATALOG`
  with legacy-cat fallback; `brickSearch` (name + synonyms). Its own header:
  departments are editorial data that will come from the server (same pattern
  as CATALOG/CATEGORIES); brick codes are illustrative until a real GS1 import.
  Everything is exported on `window` AND as top-level consts (mutable objects).
- **`proto/BrickData.jsx` (new):** `BRICK_FACETS` (per-brick facet defs) +
  ~160 demo rows (`BRICK_ROWS`) that Results.jsx merges into the demo CATALOG
  (`_NEW.concat(window.BRICK_ROWS || [])`), so they flow into seed.json like
  the existing `_NEW` rows.
- **Browse (`PagesBrowse.jsx`):** department card grid (`.dgrid`/`.dcard`),
  open card expands a full-width sub-category panel (`DeptXp`). Navigates
  `go('results', {dept})` or `go('results', navOfRule(r))` where
  `navOfRule(r) = {brick, label?, count?}`. Exports `navOfRule`.
- **SignedHome/HomeSections:** `CategoryGrid` is the same dept cards (static,
  no expand); metric-strip tiles link to alerts/browse; `SectionHead onMore`.
- **Results.jsx:** takes `brick`/`dept`/`label`/`count` props. Category
  rail + filterbar render `catNavModel()` — root = DEPTS, scoped = owner dept
  with sibling sub-categories, "All categories" back link, `GpcTrail` (GS1 GPC
  #code + Segment › Family › Class › Brick path). Facet defs:
  `BRICK_FACETS[brick]` first, else `FACETS[catF]` where
  `catF = cat || brickToCat(brick)`. `catTotal` for brick/dept scopes comes
  from `count`/`gb.n`/`gd.n` (GpcData numbers). **The `onQuery` effect skips
  brick/dept scopes** (`if (!window.onQuery || query || brick || dept)`) —
  they sort/filter client-side over the cache.
- **AppData/AppHeader/SignedHome search suggest:** category suggestions are
  now departments + bricks (via `brickSearch`), each entry carrying a `nav`
  payload; `onPick(v, nav)` → `go('results', nav)`. `facetNorm` handles array
  values (worker `fval` already does). FACETS demo defs got much richer
  (demo-only — boot replaces FACETS wholesale with the served facets.json).
- **AppRouter.jsx:** passes `brick/dept/label/count` through to Results —
  boot.jsx must mirror.
- CSS: `.dgrid/.dcard/.dxp/.subtile/.mchip` (pages.css), `.catgpc/.catback/
  .catlink--hd/.fmenu__item--sub` etc. (app.css). Copied by build.

## The core problem

Our 31 server cats are the real catalog (~22k rows, most outside
electronics). Upstream browse/rail/suggest now render ONLY `DEPTS`, whose
demo bricks bridge to ~10 legacy cats. Shipped as-is: Pets/Sport/Jewelry/…
unreachable, every count a demo number. And since the rail navigates by
brick/dept — which skip `onQuery` — server-side sort/filter/fcounts (the
2026-07-25 work) would be bypassed on effectively every list page.

**Design decision (settled):** dept/brick is a served NAVIGATION alias over
the existing `cat=` + `facets=` query surface — not a new classification
dimension in D1. Matches the prototype's own fallback bridge; zero worker
query-path changes. Real GPC classification of rows is parked (see end).

## Steps

### 0. Commit what's parked (two commits before any new work)
1. The uncommitted `worker/index.js` + `test/api.test.js` + CLAUDE.md changes
   are the FINISHED cross-filtered-fcounts work from a previous session
   (`matches` → `failGroups`, cross-filtered `meta.fcounts`, CLAUDE.md already
   documents it as 2026-07-27). Run `npm test`, commit as its own commit.
   Check `git diff --cached` first (concurrent sessions share the index).
   `product-eval/` is untracked scratch — leave it.
2. Commit the sync (`proto/` only), message `sync: GPC departments …`.

### 1. Build + boot param mirroring (demo parity)
- `node build.js` — the loader references the new files so they compile
  automatically. Verify: seed.json gains the BRICK_ROWS rows; their cats
  (Kitchen, E-readers, Toys, …) must already be in worker/cats.json (build
  enforces CATEGORIES ⊆ cats.json; BRICK_ROWS aren't CATEGORIES entries but
  eyeball one row anyway). CATEGORIES itself is unchanged upstream.
- boot.jsx, mirroring the AppRouter diff:
  - Results invocation gains `brick={params.brick} dept={params.dept}
    label={params.label} count={params.count}`.
  - `parseUrl`/`toUrl`: `/search` gains `dept=`, `brick=`, `label=`, `count=`
    params. `cat=` URLs keep working (back-compat, old links).
- `npm test` — expect UI-suite fallout from the new Browse/home markup; fix
  the tests, not the prototype.

### 2. `worker/depts.json` — our department registry
The cats.json/facets.json pattern: a worker-owned JSON, served via `catMeta`,
swapped in wholesale by boot. Shape (editorial, hand-written):

```json
{ "id": "audio", "name": "Audio & Headphones", "icon": "headphones",
  "rules": [
    { "b": "10001085", "name": "Headphones", "icon": "headphones",
      "cat": "Audio", "syn": ["hodetelefoner", "ørepropper", "headset"],
      "path": "Audio Visual / Photography › Audio Visual Equipment › Audio Equipment",
      "facets": {"type": ["Over-ear", "In-ear"]}, "label": null }
  ] }
```

- One rule per sub-category; `b` = real GPC brick code (from GpcData.jsx
  where it has one, else from the GS1 published list — illustrative is fine,
  same as upstream). `cat` = our server cat backing it. `facets` optional
  (slice, like the old Browse type-chips). `path` = display-only GPC trail.
- Cover ALL 31 cats of worker/cats.json. Electronics depts can mirror
  upstream's DEPTS; the other ~21 cats get sensible departments (Sport &
  Outdoor, Pets, Fashion, Home & Interior, Books & Media, …). A dept rule may
  be 1:1 with a cat — that's fine.
- `catMeta` serves it as `meta.depts` with real counts: whole-cat rules get
  the count from the cats histogram catMeta already computes; facet-sliced
  rules get NO count in v1 (client shows the brick count instead — omit `n`,
  never fake it). Keep an eye on size — meta rides every list response;
  registry should stay a few KB (paths/synonyms are the bulk; measure, and if
  fat, serve depts only on `catMeta`-bearing responses like the rest of meta,
  which is already the case).
- build.js guards (extend the existing cats.json checks):
  - every rule's `cat` ∈ worker/cats.json
  - **every cats.json cat is reachable from at least one whole-cat (unsliced)
    rule** — this is the no-orphan-category regression guard
  - every rule has `b`, `name`, `icon`.

### 3. boot.jsx — swap the GPC layer wholesale
In `hydrateCatalog`, when `meta.depts` arrives (once — guard like the FACETS
swap): rebuild upstream's structures IN PLACE (they're top-level consts in
the built bundle — same trick as the CATEGORIES append; mutate, don't
reassign):
- `DEPTS.length = 0; DEPTS.push(...)` — dept objects shaped like GpcData's
  (`{id, name, icon, rules, n, segs}`); `rules` entries `{b, label?, n?}`.
- `brickBy` — delete demo keys, add ours: each brick shaped
  `{code, name, icon, n, seg: {name, icon, code}, fam: {name}, cls: {name,
  bricks: []}}` (GpcTrail reads seg/fam/cls `.name`; catNavModel's
  outside-every-dept branch reads `cls.bricks` — our registry puts every
  brick in a dept so it stays empty). Parse the three names from `path`.
- `ALL_BRICKS.length = 0; ALL_BRICKS.push(...)` (brickSearch reads it; keep
  `syn` so Norwegian suggest works).
- `BRICK_CAT[code] = cat` for every rule (empty `CLS_CAT` misses fall through
  to it — set every brick here, ignore CLS_CAT), so `brickToCat` → our cats,
  which makes `brickProducts`/`deptProducts`/`catF`-driven facet defs and
  `catNavModel`'s legacy-cat branch all resolve correctly with NO upstream
  edit.
- `BRICK_DEPT` rebuild (first dept claiming each brick).
- Keep the existing CATEGORIES append (onboarding still reads CATEGORIES).
- `ensureRoute`: `results` with `brick`/`dept` prefetches the backing slice —
  brick → `listQuery({cat: brickToCat(brick), sort: 'best', dir: 'asc'})` +
  the rule's `facets` when sliced; dept → its first/primary cat (v1: prefetch
  each distinct backing cat of the dept's unsliced rules, capped at 2–3 —
  they're 400-row pages; or just the largest. Decide by measuring; do NOT
  fetch all heads).
- `searchCatalog({brick, dept})` then works as upstream wrote it: PRODMAP
  misses on real ids → legacy-cat fallback → our cats via the swapped
  BRICK_CAT.

### 4. Tests
- api.test.js: `meta.depts` present on catMeta responses, counts match
  `meta.cats`, sliced rules carry no fabricated count, registry guards fire
  (bad cat / orphan cat → build throws; test via the build or a direct check).
- UI suite: Browse renders dept cards + expand panel; dept card → results
  with dept scope; rail shows sub-categories + GPC trail; `/search?brick=…`
  round-trips through parseUrl/toUrl; suggest shows a dept and a
  Norwegian-synonym brick hit.

### 5. Known v1 degradation + upstream follow-up
Brick/dept pages sort/filter the prefetched page client-side (upstream skips
`onQuery` for them); totals come from the served registry counts. Since our
bricks are just cat(+facets), boot could serve them fully — the only blocker
is upstream's skip. Fix upstream, then boot's `onQuery` maps
`{brick, dept}` → `cat=`+`facets=` via the same rule table. Until then,
document the degradation in CLAUDE.md honestly.

Paste-ready prompt for the Claude Design prototype project
(7fa9cba6-ae13-4aa3-9ae4-f76a18ff1573):

> In Results.jsx, the server-query effect currently skips GPC scopes:
> `if (!window.onQuery || query || brick || dept) { setServed(...); return; }`.
> Let brick/dept scopes use the host too: only skip when `!window.onQuery ||
> query`, and pass the scope through — `window.onQuery({ cat, brick, dept,
> label, sort, dir, filters, page })`. Contract: a host that can't serve the
> scope resolves `null`/`{total: null}`, and the screen behaves exactly as
> today (client-side sort/filter over the cache). Also re-run the effect when
> brick/dept change (they're already in the reset effect's deps — mirror
> that). No other behavior change; the preview host has no onQuery so the
> preview is unaffected.

After that lands: re-sync, extend boot's `onQuery` to translate brick/dept,
extend the api tests (served total on a brick page ≠ page length).

### 6. Ship
`npm test`, commit boot/worker/build/test work (separate from the sync
commit), push origin main, `npm run deploy` (unsandboxed; cache-bust when
smoke-testing — API GETs are edge-cached). Smoke-test live: /browse shows all
departments incl. non-electronics; a Pets sub-category lists real rows; a
brick URL deep-links. Update CLAUDE.md (browse/categories section + the
degradation note).

## Parked follow-up — resolved 2026-07-31 (same-day session)
All three parked items were picked up:
- **Real GS1 GPC**: registry codes/paths renumbered to the real published EN
  schema (fetched from the GPC browser API; `node tools/gpc-check.mjs`
  validates every rule, `99…` codes are marked synthetic where GPC 2020 has
  no brick). EAN→brick classification stays parked for real: the EAN→GPC
  mapping lives in GS1 Verified (member API we have no credentials for), and
  while every brick ≡ cat(+facets) it changes nothing user-visible.
- **Real counts for sliced rules**: 16 attribute-sliced rules (Headphones,
  Consoles, Pet food, …) landed; `refreshDeptCounts` (hourly cron) computes
  each slice via `listIds` — the served page's exact predicate — into
  `seed_meta` row 4, `catMeta` merges as `n` on sliced rules only.
- **Per-brick facet defs**: dissolved rather than built. The slice pin rides
  `history.state.params.facets` (boot `gpcParams`) into Results' own filter
  state — visible, checked in the rail, applied client-side, sent as
  ordinary `facets=`. With the pin being real filter state, `FACETS[cat]`
  defs are exactly right and a per-brick def registry has no job.
