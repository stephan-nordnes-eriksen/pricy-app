# Codebase problems — audit 2026-08-11

Owner review 2026-08-12: per-item **Review** lines below.

**Status 2026-08-13: 26 of 27 solved** (✅ in the heading, commit hash on the
Review line). Open: #2 only (verify — www may redirect fine). #5's
WatchStore/ListStore offline-PUT swallow remains tracked under the PWA
offline story.

Scope: all hand-written code (worker/, boot.jsx, build.js, tools/, configs).
proto/ is sync-owned and was only read to verify contract drift. `npm test`
passes (189/189). Findings ranked by severity; every item has a concrete
failure scenario. Spot-verified claims are marked; the regex/decoder ones were
reproduced in node by the reviewers.

## HIGH

### 1. ✅ Stored XSS on the pricy.no origin via scraped SVG images
**Review 2026-08-12:** FIXED 2026-08-12 (4602b7a, deployed): drain allowlists jpeg/png/gif/webp/avif.
`worker/sources.js:164`, `worker/index.js:666-674`, `worker/index.js:1980-1986`
`scrapeRow` queues any third-party `Product.image`/`og:image` URL (http:
accepted); `drainImages` stores any `content-type` starting `image/` —
including `image/svg+xml` — and `GET /img/<id>` serves the bytes inline on the
main origin with no `X-Content-Type-Options: nosniff`, no
`Content-Disposition`, no CSP (verified: neither header appears anywhere in
worker/index.js). A compromised/malicious shop publishes an SVG containing
`<script>`; anyone navigating to `https://pricy.no/img/<id>` executes attacker
script same-origin — the session cookie rides every `/api` call it makes.
**Fix:** serve `/img/` with `nosniff` + `Content-Disposition: inline` headers,
or reject `image/svg+xml` in the drain. One line either way.

### 2. www.pricy.no redirect is dead; login from www breaks
**Review 2026-08-12:** Unsure it's a problem — www.pricy.no does seem to redirect in the owner's browser. Verify before acting.
`wrangler.jsonc:14` + `worker/index.js:1965`
The www→apex 301 lives in the Worker fetch handler, but `run_worker_first`
only lists `/api/*, /img/*, /.well-known/*, /authorize, /token, /register,
/mcp` — every page path on the www custom domain is answered by the asset
layer, so the redirect never runs and the SPA serves on www. Login from there
then fails: `POST /api/auth/login` does hit the Worker, gets the 301, and
fetch re-issues it as GET; even on success the cookie would be set for the
apex while the page sits on www. **Fix:** zone-level redirect rule (Cloudflare
dashboard), or drop the www custom domain.

### 3. ✅ build.js PWA/base-tag injection has no success guard
**Review 2026-08-12:** Fix soon. — already fixed pre-review in 5d36cd2 (the build.js:229 guard).
`build.js:216`
The `<title>…</title>` replace is the only thing injecting `<base href="/">`,
the manifest link and the apple-* tags — and unlike the app.js injection and
CDN swaps (guarded at build.js:226-229), nothing checks it landed.
`proto/index.html` is sync-owned: if a sync drops/moves the title or gives it
a child element (`[^<]*` fails on any `<`), the build succeeds and ships a
dist with no `<base>` — every deep link (`/product/xm5`) then resolves
`vendor/react…js` relative to the route, the SPA fallback answers with HTML,
and the page is blank; installability is gone too. **Fix:** one
`if (!html.includes('rel="manifest"')) throw` after the replace.

### 4. ✅ One bad XML entity freezes an entire Adtraction shop's offers
**Review 2026-08-12:** Fix soon. — FIXED 2026-08-12 (0e74e0a).
`worker/sources.js:45-49`
`decodeXml` calls `String.fromCodePoint` on unclamped numeric character
references — `&#99999999999;` throws RangeError (reproduced in node). In the
scrape path that's caught per page, but in `adtractionSource` it throws inside
`scan()` with no catch: the whole feed promise rejects, `collectRows` logs
"offers frozen", and one corrupt entity anywhere in a multi-MB feed silently
freezes every offer for that shop. **Fix:** try/clamp in `decodeXml`.

## MEDIUM

### 5. ✅ Rejected reviews are silently discarded while the optimistic card stays on screen
**Review 2026-08-12:** Fix upstream: input limits + exception handling in the front-end.
**Fixed 4a75850 + 4977e87 (2026-08-13):** upstream WriteReviewModal caps its
free-text inputs at the server limits (textarea 2000, shop 60, paid clamped)
and awaits the store call's verdict AuthCard-style — busy-disabled submit, a
rejection renders in the err slot with the modal open. Boot's add/update
wrappers return the postReview promise; on failure the store snapshot is
restored (optimistic card gone) and a short Norwegian message rethrown.
The WatchStore/ListStore offline-PUT swallow noted here remains open —
tracked as part of the PWA offline story, not this fix.
`boot.jsx:331-345` (and `ReviewStore.update` at 346-352)
`postReview`'s `.catch(() => {})` swallows every failure and the optimistic
`ReviewStore.add` card stays visible. Concrete trigger today: the worker 400s
on body `text.length > 2000` (worker/index.js:2625) and the upstream write
modal caps only the title, not the textarea (proto/Reviews.jsx:186). A
2,100-char review shows as saved, silently 400s, and is gone on next load.
Same swallow-class: WatchStore/ListStore emit PUTs (boot.jsx:208-228) lose
offline mutations without feedback — notable for an installable PWA.
**Fix:** on failure, roll back the store (or surface an error) — plus an
upstream textarea maxLength.

### 6. ✅ Transient hydration failure can permanently delete active auto-buy orders
**Review 2026-08-12:** Must be resolved. — FIXED 2026-08-12 (a93f303).
`boot.jsx:81-94`, `boot.jsx:581-582`, `boot.jsx:376-389`
`hydrateMe` filters `AutobuyStore.orders` to rows whose product resolved; the
products come from one `.catch(() => {})`-ed `ids=` batch that is also sliced
to 100 ids. The wrapped `AutobuyStore.emit` then PUTs the filtered array to a
whole-object-replace endpoint — orders dropped by a flaky fetch are deleted
server-side the next time the user touches any order. Latent while
HIDE_AUTOBUY hides the surfaces, but armed the day the switch flips.
Watches/lists filter only display copies; autobuy is the one store where the
filter reaches the persistence payload. **Fix:** don't filter the persisted
array, only the display copy.

### 7. ✅ Boot chain has no catch — a throw during logged-in hydration renders a permanently blank page
**Review 2026-08-12:** Must be resolved. — FIXED 2026-08-12 (e8db0a0).
`boot.jsx:1095-1111`, hydration bodies at 583-587
`render` runs only after the boot promise resolves; the fetches are caught
individually but the synchronous hydration bodies (`hydrateMe`/`hydrateFeed`/
`hydrateRecent`) are not. One malformed row in the me blob or a bad
`pricy_recent` id → rejected promise, nothing ever mounts, no ErrorBoundary
(it never mounted), and it's per-user data-dependent so invisible in your own
testing. **Fix:** `.catch` that still calls `render`.

### 8. ✅ GDPR account deletion can 503 mid-way, leaving deleted users in review aggregates
**Review 2026-08-12:** Must be resolved. — FIXED 2026-08-13 (4b92f14): `refreshReviewMetas` batches all products (~3 subrequests per 45, not 3 each).
`worker/index.js:2393-2414`
After the atomic delete batch, `refreshReviewMeta` runs per reviewed product
(~3 subrequests each). A user with 16+ reviewed products exceeds the ~50-
subrequest budget: the account is deleted but the loop 503s partway, and the
remaining products keep `meta.udom` counting the deleted person's claims and
paid amounts until someone else touches a review there. **Fix:** batch the
refreshes, or queue them for the cron.

### 9. ✅ Reachable free-plan CPU 503 on "All products"/Ukategorisert with a rating sort or facet filter
**Review 2026-08-12:** Should be resolved.
**Fixed 3d114ce (2026-08-13):** both halves of the suggested fix, no stored
column: `rating` joined SQL_SORT as a SQL domScore expression (mirrors the JS
one claim for claim), so the filterless Folkedommen sort rides the fast path;
the residual JS scan on uncat/all-heads (filters, facet sorts) is capped at
SCAN_MAX = 5,000 best-ranked rows — approximate total/prange beat a 503 — and
the shipAgg offers fetch joins the same capped set.
`worker/index.js:1275` (fast-path guard) → JS scan at 1298-1382
The SQL fast path skips `sort=rating` and any facet filter, so
`node=uncat&sort=rating` (~50k rows) or all-heads + a facet parses every meta
blob in JS — past the ~40 ms free-plan CPU ceiling. 503s are never
edge-cached, so every retry re-runs the scan: permanently broken from the
shipped UI (Browse → All products / Ukategorisert dept), not just ops.
**Fix:** cap the uncat/all-heads scan (or precompute domScore into a column
so `rating` joins SQL_SORT).

### 10. ✅ Accessories lookbehind doesn't scope over the spare-parts alternatives
**Review 2026-08-12:** Should be resolved. — FIXED 2026-08-12 (1a21ccb).
`worker/facetrules.js:691` (comment at 683-687)
`NOT_INCL` is concatenated onto the first alternation group only;
`\breservedel|\bspare ?parts?\b|\breplacement\b` sit outside it. Reproduced:
"Gressklipper med reservedeler" types `Accessories` — the documented
"med X = included, not is" rule isn't applied to spare-parts wording, so a
bundled mower drops out of its brick-slice listings. **Fix:** wrap the whole
alternation in one group under the lookbehind.

### 11. ✅ ASCII `\b` next to ø makes several Norwegian facet terms dead or inverted
**Review 2026-08-12:** Should be resolved. — FIXED 2026-08-12 (f12d8b6).
`worker/facetrules.js:322, 410, 573, 319` (all reproduced in node)
- `\bøks\b` (Garden:322, Outdoor:410): never matches "Øks" after a space.
- `\bstrø\b` (Pets:573): misses standalone "strø", matches "strømpe".
- `\bfrø\b` (Garden:319): misses both " frø " and "blomsterfrø".
- `\børeringe\b|\børedobb\b` (Jewelry:498): dead but shadowed by working
  unanchored alternatives — harmless.
The comment at facetrules.js:682 shows the constraint is known; these slipped
through. **Fix:** the same non-\b anchoring used elsewhere in the file.

### 12. ✅ Garbage push subscriptions are never pruned and burn subrequests forever
**Review 2026-08-12:** Should be resolved. — FIXED 2026-08-12 (5e2a397).
`worker/index.js:697, 2347-2349` + `worker/push.js:27-57`
Subscribe validates only type/length, not that `p256dh` is a valid P-256
point or the endpoint parses as a URL. `encrypt`/`vapidAuth` then throw per
send; `sendPush(...).catch(() => 0)` maps that to status 0 — not 404/410 — so
the row is never deleted and every future alert burns one of the ≤40 devices
per call on a subscription that can never work. **Fix:** validate at
subscribe, or prune on persistent throw.

### 13. ✅ tools/group.mjs prints admin curls the server rejects (stale since gpc-strict)
**Review 2026-08-12:** Undecided — possibly mark the tool deprecated. — FIXED 2026-08-13 (db1abff): mirrors enrich.mjs (`brick: FILL_ME_8_DIGITS`).
`tools/group.mjs:110`
It emits `PATCH { cat: 'FILL_ME', icon: 'package', kw: '', … }` — the admin
validator (worker/index.js:2146) accepts neither `cat` nor `icon`, and
`kw: ''` fails the trim check, so the printed head-promotion curl 400s. An
operator who "fixes" it by deleting the failing keys promotes a head with no
brick → Ukategorisert with variants attached. enrich.mjs was updated to
`brick:`; group.mjs wasn't. **Fix:** mirror enrich.mjs
(`brick: 'FILL_ME_8_DIGITS'`, drop cat/icon/kw).

### 14. ✅ tools/score-facets.mjs scores the wrong ruleset per row — reports "0 would change" on real changes
**Review 2026-08-12:** Undecided — possibly mark the tool deprecated. — FIXED 2026-08-13 (894a45c): resolves the key via a local facetKeyOf over gpc.json/gpcno.json, passed to both sides of the diff.
`tools/score-facets.mjs:39` → `worker/facetrules.js:715`
It calls `deriveFacets(r)` which defaults the ruleset key to `r.cat` — post
gpc-strict that's the SEGMENT display name, not a RULES key, so most rows
derive `undefined` in both baseline and candidate. The tool exists to measure
rule-change blast radius against the live catalog and currently can't.
**Fix:** resolve the key via `facetKeyOf(r.brick)` like production does
(worker/index.js:829).

### 15. ✅ Four tools still depend on GET /api/catalog.json, which 503s at the current catalog size
**Review 2026-08-12:** Undecided — possibly mark the tools deprecated. — FIXED 2026-08-13 (ad9812a): shared tools/catalog.mjs pages the all-heads listing; fetch-specs detail-fetches its candidates via `ids=` for specs.
`tools/group.mjs:48`, `tools/fetch-specs.mjs:24`, `tools/gpc-coverage.mjs:23`,
`tools/score-facets.mjs:22`
The endpoint dies with exceededCpu at ~52k rows (see memory note; gpc-llm.mjs
already documents this and pages `/api/products` instead). group.mjs and
fetch-specs.mjs don't check `res.ok` and die parsing the 503 body;
score-facets retries the CPU-dying endpoint 6× in a tight loop. **Fix:** the
paged `/api/products` pattern gpc-llm.mjs already uses.

## LOW

### 16. ✅ Missing NOK guard when JSON-LD carries no currency at all
**Review 2026-08-12:** Undecided. — FIXED 2026-08-13 (c56078c): no declared currency = row refused. Live dry crawl of all 50 shops lost zero rows.
`worker/sources.js:147-148` — a SEK-priced page that omits `priceCurrency`
ingests as NOK; the guard only fires when a currency IS present. Money path.

### 17. ✅ Unrecognized Adtraction stock values map to out-of-stock instead of unknown
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (f53d38a).
`worker/sources.js:96` — `truthyStock` only knows `yes|true|1|in stock`; a
feed writing "på lager" or `http://schema.org/InStock` marks the shop's whole
inventory unavailable in the UI. Should default to 2 (unknown).

### 18. ✅ sitemapUrls recurses unbounded despite its "one level deep" comment
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (c3a1eb7).
`worker/sources.js:222-238` — a nested or self-referencing sitemapindex
(third-party-controlled content) recurses forever, ~40 fetches per level.
**Fix:** depth parameter defaulting to 1.

### 19. ✅ JSON-LD literal `null` aborts a whole page scrape
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (e2df177).
`worker/sources.js:298, 345` — `JSON.parse("null")` succeeds, so
`doc['@graph']` throws TypeError outside the catch; a shop template emitting
`<script type="application/ld+json">null</script>` on every page scrapes zero
rows, indistinguishable from an outage. **Fix:** `doc?.['@graph']`.

### 20. ✅ No rate limit on POST /api/auth/request
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (b4c7120).
`worker/index.js:2233-2258` — arbitrary emails, repeatedly; each writes a
login_tokens row and (once SEND_EMAIL is live) sends an email. `/api/report`
has a 20/day limiter (2698); this trust boundary has none.

### 21. ✅ OAuth redirect allowlist permits any localhost redirect in production
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (fd7252a).
`worker/index.js:1760-1762` — a malicious local app can register via
`/register` and receive an auth code. PKCE narrows the risk; gate on a dev
flag anyway.

### 22. ✅ bricksUnder expansion reads hidden products' bricks
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (12e758e).
`worker/index.js:1237` — the DISTINCT-brick query lacks `visible()`; no leak
(listing re-filters), but wasted IN-list slots and scan work on a hot path.

### 23. ✅ ensureRoute on a cold /search?cat=… deep link fires the most expensive query as a wasted prefetch
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (b779678).
`boot.jsx:494` — before `CAT_NODE` hydrates, `scopeNode` is undefined and the
prefetch goes out node-less: the 144 ms all-heads-with-sort query, whose 400
rows the screen never uses (the mount onQuery 250 ms later fetches the right
slice). `gpcRoute` (boot.jsx:530-536) already bootstraps the tree first for
brick/dept scopes — the cat path needs the same, or a no-fetch resolve.

### 24. ✅ setupPush only runs at boot
**Review 2026-08-12:** Should be fixed — upstream fix (or equivalent). — FIXED 2026-08-12 (9157d4f).
`boot.jsx:1110` — logging in via the form never sets up push until a full
reload; `onAuthed` and the magic-link driver don't call it. Partially masked
by `saveSettings`'s own subscribe path.

### 25. ✅ WATCHED holds copies, contradicting hydrateCatalog's live-reference comment
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (403d917).
`boot.jsx:69-72` vs the merge comment at 895-897 — `hydrateMe` spreads
(`{ ...p, target }`), so merged price updates never reach the home watched
rail; it shows login-time prices all session. Cosmetic today; the comment
will mislead the next change that relies on it.

### 26. ✅ tools/latency.db is a git-tracked binary rewritten by every probe run
**Review 2026-08-12:** Should be fixed. — FIXED 2026-08-12 (770e866).
Tracked deliberately (4672d5f); contents verified credential-free. But the
tree is dirty right now (`M tools/latency.db`), history will bloat, and
`git add -A` commits half-run data. If trend history belongs in git, append
CSV/JSONL; otherwise gitignore it like the report.

### 27. ✅ Doc drift: CLAUDE.md claims a red test that passes
**Review 2026-08-12:** Docs should be updated. — FIXED 2026-08-12 (92244ba).
CLAUDE.md (Folkedommen section) says `test/ui.test.js` "filter search:
narrows groups" is red pending the upstream `pRating`→`pDom` fix — the full
suite passes 189/189, so either the fix landed or the note is stale. Update
the paragraph (and check whether the second pending fix, `_calcStats`, also
landed).

## Verified clean (checked, no finding)

- Edge cache: ops bearer bypasses match AND put; `/api/products` never reads
  the user; no Set-Cookie on cached responses; `?hidden=1` 401s before any
  put. No poisoning path.
- SQL injection / D1 param cap: all user input bound; IN-lists chunked ≤100.
- Privacy promises enforced server-side: gift-list `by` stripping (both
  surfaces), review `paid` gating + ≥3-reporter rounded aggregate, hidden
  rows excluded on every path incl. `ids=`.
- All admin/ingest/catalog/hidden surfaces bearer-gated.
- push.js crypto (RFC 8291/VAPID): fresh ephemeral keys + salt per message,
  correct info strings/pad/header, ES256 output shape right — test-pinned.
- Secrets: nothing leaked in tracked files; all documented gitignores hold
  (.ingest-token, seed.json, VAPID JWKs, latency probe config).
- Crawl politeness: SAMPLE_LIMIT default-on, no `approved` shops, per-host
  sequential with delays.
- Contract mirrors: FOLD lists identical worker↔Results; sale/instock/dom/
  freeship predicates, PAGE=PAGE_MAX=400, prefetch sort=best/asc all line up;
  meta wholesale replacement safe (`{...catMeta, ...extra}` on every branch).
