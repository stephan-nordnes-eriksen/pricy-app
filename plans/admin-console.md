# Admin console — from mock harness to real ops surface

(Synced 2026-08-22: `proto/admin.html` + `Admin*.jsx` + `admin.css`, a
standalone 7-tab ops app — Overview, Products, Webstores, Crawlers,
Moderation, Users, System. It runs entirely on the mock arrays in
`AdminData.jsx` and is NOT in build.js yet: committing the sync changed
nothing that deploys.)

**Status 2026-08-22: phase 1 SHIPPED.** User's calls: real admin
accounts (manual grant, no UI), Users tab included. What landed:
`users.admin` column + `adminAuth` (INGEST bearer OR admin session) on
the console surface, `GET /api/admin/overview|reviews|users`, joins/
product-PATCH/review-PATCH/alias opened to admin sessions,
`/api/products` privileged params (`hidden=1`, new `admin=1`) accept the
session (lookup only runs when asked — anonymous traffic keeps its
zero-auth path), build.js emits `dist/admin.html`+`admin.js` with the
repo-owned `admin-boot.jsx` slotted after AdminData.jsx (mocks emptied at
parse time, login gate, hydration), API + jsdom tests. Deviations from
the plan as written: no localStorage token — auth is the session cookie
outright, so the token-prompt idea died before birth.

**Status 2026-08-22 later: the hookable upstream landed and is WIRED.**
The prompt below was pasted, synced, and admin-boot.jsx now implements
both seams: `onAdminProducts` (q → blob search ≤100 client-refined;
draft → node=uncat; live → node=<every stocked segment, from
meta.tree>; a category → its segment code; hidden → the 200-row backlog
listing client-filtered; flagged/dupe → truly empty, no machinery
exists; totals/counts from overview + meta.total, all filterless fast
path — no sort param, no CPU cliff) and `onAdminAction` (product.save →
meta PATCH + alias for a changed GTIN + hidden⇄live via hidden:1/null,
mod.act → review hidden PATCH, user.block → users PATCH,
merchant.reject → joins DELETE; everything else returns an honest error
toast — merge/publish/resolve/unlink/crawler.*/user.export/erase/
merchant.advance/flags/banner). New worker bits: `users.blocked`
(enforced at the sessionUser choke point — web/MCP/OAuth sessions all
die; login 403s with a clear message; admins unblockable),
`PATCH /api/admin/users/:id {blocked}`, `DELETE /api/admin/joins/:id`.
Remaining fiction: none rendered. Remaining empty: Crawlers tab and
System's flags/admins/audit (phase 2 data), Overview's clicks/searches
panels ("No analytics yet" until an events table exists). Save caveat:
a renamed SEED row reverts on the next deploy (seed keys win in the
json_patch merge) — discovered `ean-*`/`p-*` rows keep edits.

**Status 2026-08-22 later still: phase 2 (a–d) SHIPPED.** `audit` table
(90-day prune on insert; actor = admin email or 'ops-bearer' stamped by
adminAuth; products/reviews/users PATCH, alias, joins DELETE/PATCH
audited) + `GET /api/admin/audit`; `crawl_runs` + bearer
`POST /api/admin/crawl-report` (tools/crawl.mjs posts one row per shop
per run, also on failure, even on --dry) + `GET /api/admin/crawlers`
(shopStats ⋈ last 14 runs); `merchant_joins.stage` + audited
`PATCH /api/admin/joins/:id {stage}` with merchant.advance wired (boot
attaches `issues: []` on advance-to-feed — upstream's feed card reads
`issues.length` and apply() never sets it; a crawl-stage card takes its
crawl box from a crawl_runs match on the domain's shop name, else honest
zeros so "Go live" stays blocked); admins panel = boot filtering the
users roster. No upstream change was needed. Still deliberately unwired
(error toasts): crawler.run/toggle/schedule, merchant.revalidate,
flag.toggle, banner.set, user.export/erase, product.merge/publish/
resolve, offer.unlink. Overview clicks/searches stay "No analytics yet"
(phase 3, events table).

## Current state

The prototype is its own page (`admin.html`), not a route in the SPA —
own loader, own css, shares only `Primitives.jsx` (Icon, Btn, fmt,
Sparkline, PRODUCTS demo rows) and the three kit css files. Structure
mirrors the main app exactly:

- `AdminData.jsx` = the harness: mock `ADMIN` object (stats, catalog,
  users, mods, merchants, crawlers, flags, audit) + a tiny `AdminStore`
  (subs/emit/say-toast) + `useAdmin()`. Pages read `useAdmin()` and
  MUTATE the shared object in place, then emit.
- `AdminUI.jsx` shared primitives (Pill/Stat/Panel/Drawer/tables…),
  `AdminPages1-3.jsx` the screens, `AdminApp.jsx` the shell
  (sidebar/topbar/history-state tab routing) which mounts on load.

That in-place-mutation store is good news: like `hydrateCatalog`
merging into `CATALOG`, a boot file can empty the mock arrays and
refill them from real APIs **without touching a byte of upstream**.

## Ship model (phase 1)

Mirror the main app's build exactly, no new machinery:

1. build.js: compile the admin loader's refs into `dist/admin.js` —
   order `Primitives, AdminData, admin-boot, AdminUI, AdminPages1-3,
   AdminApp`. `admin-boot.jsx` (hand-written, repo-owned) sits right
   after `AdminData` so it empties the mock arrays at parse time —
   mock users/stats never render — and starts real fetches; `AdminApp`
   mounts last as upstream wrote it. Same CDN→vendored UMD swap, copy
   `admin.css`, emit `dist/admin.html`.
2. Auth = the existing `INGEST_TOKEN` bearer, nothing new. The static
   page is public (it holds no data once boot empties the mocks); boot
   prompts for the token once, keeps it in localStorage
   (`pricy_admin_token`), sends `Authorization: Bearer` on every fetch,
   re-prompts on 401/403. Real per-admin accounts/roles are v2 — the
   `admins` panel in System renders whatever a future endpoint serves,
   today it can list the single implicit "bearer holder".
3. `/admin` does NOT need `run_worker_first` — it's a real static
   asset. Ops bearer fetches already bypass the edge cache.

## Reality map — what each tab can be backed by TODAY

| Tab | Real today | Missing |
|---|---|---|
| Products | `/api/products` query surface (q=, node=, hidden=1 bearer listing), `PATCH /api/admin/products/:id` (meta merge, brick pin, hidden 1/null), `POST /api/admin/alias` (= the drawer's "merge into canonical", for real) | server-side paging hook in AdminProducts (it filters `A.catalog` client-side — 52k rows can't ship to the browser, see catalog.json CPU death); status vocabulary mapping (below) |
| Webstores | `merchant_joins` + `GET /api/admin/joins` | a `stage` column + `PATCH /api/admin/joins/:id`; feed validation / test crawl are ONBOARDING.md manual steps — the drawer shows status text, buttons advance the stage only |
| Crawlers | `catMeta.shopStats` {offers, updated} per shop; SOURCES config names the feed/scrape/adtraction kind | run history — crawls are local `tools/crawl.mjs` runs; add a `crawl_runs` table + `POST /api/admin/crawl-report` that crawl.mjs (and the cron's own source refresh) writes a summary row to. "Run now" stays hidden: nothing server-side can start a crawl |
| Moderation | reviews table, `verified`, `PATCH /api/admin/reviews/:id {hidden}` | `GET /api/admin/reviews` queue listing (recent / reported-later); the other three kinds (price reports, corrections, photos) have NO user-facing submit surface — boot serves only `kind: review`, the Seg counts go to 0 for the rest |
| Users | `users` table; GDPR export/delete exist as self-serve endpoints | `GET /api/admin/users` (list + watch/list counts, LIKE search, paged) and a block flag (new `users.blocked` column enforced at session check). Admin-triggered erasure can reuse the self-serve delete path. Plan/plus column: no such concept — serve nothing, boot blanks it |
| System | `HIDE_AUTOBUY` + tweak freeze (deploy-time) | flags are build-time by design — render read-only "deploy-time" pills, no switches. Banner needs a D1 kv row + a public `GET /api/banner` + the MAIN app rendering it (upstream change) — defer to its own item. Audit: new `audit` table, written by the existing admin endpoints (one INSERT in the shared bearer-gated paths), served by `GET /api/admin/audit` |
| Overview | cheap real counts: products/offers/uncat (catMeta), gpc queue depth, image queue depth, stale-offer share (SQL), pending joins | clicks-out / searches / user-growth analytics — no events table exists. Do NOT fake: boot drops those panels; an `events` table is a separate future plan |

**Status vocabulary**: prototype has live/flagged/dupe/draft. Real
rows have `hidden` (demoted/junk) and "in Ukategorisert" (unresolved
brick). Map: live = visible+brick, draft = visible+uncat, hidden =
the bearer-only backlog; flagged/dupe don't exist server-side —
dupe candidates come from `tools/group.mjs` output later, not phase 1.

**Honesty rule** (same as SHOP_META/demo ratings): no number renders
unless a real source serves it. Empty ≠ fake — panels and columns
without data are dropped by boot, never left showing mock values.

## Phases

1. **Ship the shell + the three tabs that are nearly free**
   - build.js admin bundle + `admin-boot.jsx` token gate (above)
   - Products wired to `/api/products` via the upstream paging hook
     (prompt below); edit drawer PATCHes meta, merge calls alias,
     hidden toggles demote/promote
   - Webstores read-only off `/api/admin/joins` (all cards in
     "Applied" until stages land)
   - Moderation = reviews only: new `GET /api/admin/reviews` +
     existing hidden PATCH
   - Overview with real counts only
   - tests: bundle builds, token gate 401 path, reviews queue
     endpoint, one jsdom mount of the admin app with hydrated data
2. **Ops truth** — spec as of 2026-08-22 (users listing + block column
   already shipped in phase 1; what follows is the REMAINDER, in
   priority order). Ground rules unchanged: byte-faithful upstream (any
   upstream need = a prompt in this file, user pastes it), mocks never
   render, no invented numbers, unwired actions error honestly, new
   admin reads/writes gate on `adminAuth`, D1 migrations are guarded
   ALTERs in `ensureSchema`, tests in api.test.js + the bootAdmin jsdom
   harness in ui.test.js, deploy unsandboxed + cmp live bytes.

   a. **Audit table** (smallest, do first): `audit` (id, at, actor,
      action, target) written by every mutating admin call — products
      PATCH, reviews PATCH, users PATCH, alias, joins DELETE/PATCH,
      gpc/images drains NOT audited (cron noise). Actor = the admin
      session's email, or 'ops-bearer' for token calls. Serve
      `GET /api/admin/audit` (LIMIT 200 desc); boot hydrates
      ADMIN.audit ({t: rel(at), actor, action, target}) and System's
      audit panel goes live. Cap growth: on insert, delete rows older
      than 90 d (one DELETE, no cron).
   b. **Crawl runs**: `crawl_runs` (id, shop, kind, started_at, dur_ms,
      pages, rows, errs, note) + bearer `POST /api/admin/crawl-report`
      (one row per shop per run; crawl.mjs posts it after each shop
      finishes, also on failure with note). Boot fills the Crawlers tab:
      one row per shop from `meta.shopStats` (offers, updated) joined
      with its last crawl_runs rows — items = offers, last = minutes
      since updated, ok-sparkline = last 14 runs' error-free flag, log =
      last runs as lines. sched renders '—' (crawls are manual;
      schedule select stays an error toast), run/pause/toggle stay
      unwired errors. Serve the join as `GET /api/admin/crawlers` (per
      shop: shopStats + last 14 runs) rather than shipping raw tables.
   c. **Merchant stages**: `merchant_joins.stage` TEXT (NULL = applied)
      + `PATCH /api/admin/joins/:id {stage: feed|crawl|live}` (audited).
      Wire `merchant.advance` in boot; `merchant.revalidate` stays an
      error toast (feed validation is ONBOARDING.md manual). Boot maps
      the stage onto the pipeline columns; a `crawl`-stage card renders
      the drawer's crawl section only if a crawl_runs row exists for
      the domain's shop name (else plain).
   d. **Admins panel**: no new endpoint — boot filters the users roster
      (admin === 1) into ADMIN.admins ({who: email, role: 'Admin'}).
   e. **Scope guards**: flags stay deploy-time (error toast), banner
      and clicks/searches analytics stay phase 3, no upstream changes
      expected — if one turns out needed, write the prompt into this
      file and stop.
3. **Deferred, each its own decision**
   - announcement banner (needs main-app upstream render)
   - runtime feature flags (today deploy-time by design)
   - events/analytics for Overview charts + top searches
   - moderation kinds beyond reviews (need submit surfaces first)
   - real admin accounts/roles

## Upstream prompt (paste into the prototype project — makes the admin app hookable)

Written 2026-08-22 after phase 1 shipped. One paste. Boot will be
written against these exact contracts, so signatures must land as
specified. After the sync: extend admin-boot.jsx to implement
`onAdminAction`/`onAdminProducts` and set the window overrides.

> In the admin app (admin.html + AdminApp/AdminData/AdminUI/
> AdminPages1/2/3.jsx), make every screen hookable by a host page so a
> production boot can serve real data and persist actions. Hard rule:
> with NONE of the hooks or window overrides present, the preview must
> behave exactly as it does today — same mock data, same local-only
> actions, same visuals.
>
> 1. **Action hook.** Add to AdminData.jsx:
>    ```js
>    // host seam: when window.onAdminAction exists, every mutating
>    // control awaits it; true = proceed, a string = error toast, and
>    // the local mutation + success toast happen only inside apply()
>    async function admAct(kind, payload, apply) {
>      const h = window.onAdminAction;
>      if (h) {
>        let r; try { r = await h(kind, payload); } catch (e) { r = String(e && e.message || e); }
>        if (r !== true) { AdminStore.say(typeof r === 'string' ? r : 'Action failed'); return false; }
>      }
>      apply(); return true;
>    }
>    ```
>    Route EVERY mutating control through it. `payload` always carries
>    the store row object itself under `row` (a host attaches its own
>    fields, e.g. a server id — never rebuild or clone the row):
>    - ProductDrawer: `product.save` {row, fields, specs} ·
>      `product.merge` {row, into} · `product.publish` {row} ·
>      `product.resolve` {row} · `offer.unlink` {row, shop, price}
>    - Moderation: `mod.act` {row, ok}
>    - Users: `user.block` {row, on} · `user.export` {row} ·
>      `user.erase` {row}
>    - Webstores: `merchant.advance` {row, to} · `merchant.reject`
>      {row} · `merchant.revalidate` {row}
>    - Crawlers: `crawler.run` {row} · `crawler.toggle` {row, paused} ·
>      `crawler.schedule` {row, sched}
>    - System: `flag.toggle` {row, on} · `banner.set` {on, text} —
>      fired on the switch AND on textarea blur, never per keystroke
>
> 2. **Server-driven Products table.** When `window.onAdminProducts`
>    exists, AdminProducts must NOT filter `A.catalog`. Instead:
>    `const res = await window.onAdminProducts({q, cat, status, page})`
>    — debounce q by 250 ms; `page` starts at 0, increments via a
>    "Show more" button visible while `rows.length < total`, and resets
>    to 0 on any q/cat/status change; a call that resolves `null` was
>    superseded — ignore it. Render `res.rows` (append page > 0) and
>    `res.total`; the count line becomes
>    `fmt(total) + " matching — showing " + rows.length`. When
>    `res.counts` is present ({all, live, flagged, dupe, draft,
>    hidden}) it feeds the status-seg badges. Also add `hidden` as a
>    P_STATUS option and to the drawer status select — it is the real
>    backlog vocabulary. Hook absent → today’s client-side path.
>
> 3. **Drawer offers from the row.** ProductDrawer’s "Matched offers"
>    reads the demo lookup `A_PROD[row.id]`. Prefer `row.offerRows`
>    (array of {shop, price, updated_at}) when present; fall back to
>    the A_PROD path.
>
> 4. **No invented numbers.** Move every hardcoded stat into data so a
>    host can override, and render each line only when its value is
>    non-null:
>    - `A_STATS.totals = { products: 84312, users: 41208,
>      webstoresLive: 96, spamCaught7d: 61 }` — AdminProducts’
>      "84 312 in catalog", AdminUsers’ "41 208 registered",
>      Webstores’ "96 live total" and Moderation’s "Auto-filters
>      caught 61 spam items" all render from these fields.
>    - AdminOverview’s "Needs attention": move the four mock rows into
>      `A_STATS.issues` ([{ic, k, t, d, tab}]) and render from
>      `A.stats.issues`; empty → one muted "Nothing needs attention"
>      row.
>    - Panel hint strings ("× 1 000 · total 187 k", "red = returned no
>      results", "share of 1.24 M offers") move into `A_STATS`
>      (clicksHint, searchesHint, healthHint); render the hint only
>      when set.
>    - The clicks chart and Top searches panels: when `clicks14` has
>      fewer than 2 points / `searches` is empty, render a muted "No
>      analytics yet" placeholder instead of the chart.
>
> 5. **Live chrome.** Topbar: real `new Date()` in the current format,
>    and the environment tag from `window.ADMIN_ENV || "PREVIEW"`.
>    Sidebar identity: add `me: ADMIN_ME` to the ADMIN object, render
>    `A.me` in the sidebar footer, and use `ADMIN.me` as the audit
>    actor in AdminStore.say.
>
> 6. **Small guards.** `agoM`: return "—" for null/undefined/NaN
>    input. `Sparkline`: render nothing for fewer than 2 points.
>    `Cols`: render nothing when `points` is empty.

## Decisions (2026-08-22)

- Real admin accounts, created manually — no onboarding, no UI
  (`users.admin`, wrangler d1 one-liner). The token-in-localStorage
  idea died before birth.
- Users tab is in, real customer emails included (admin-only surface).
