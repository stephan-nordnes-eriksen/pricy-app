# Folkedommen: reviews without numbers (upstream sync 2026-08-05)

Supersedes the write/read half of `plans/reviews-layer.md` (shop-profile
v1 section there still stands, unchanged). Upstream replaced the 1–5 star
review with a **qualitative** one and there are no numeric ratings left
anywhere in the UI — not on the PDP, not on result rows, not in Compare,
not in the filter rail.

## What upstream now says a review is

`R(...)` in `proto/ReviewsData.jsx`, written by `WriteReviewModal`:

| field | required | shape |
|---|---|---|
| `claims` | **yes** | `{worth, durable, described}`, each `'y'\|'n'\|'u'` |
| `plus` / `minus` | no | string arrays — suggested chips from `TRAIT_POOL[cat]` **or free text** |
| `shop` | no | where the reviewer bought it (free text, not our shop registry) |
| `paid` / `showPaid` | no | integer NOK + "show it in my review" toggle |
| `title` / `body` | no | were required before — now both optional |
| `verified` | server | a `purchases` row matches (unchanged) |
| `helpful` | server | vote toggle (unchanged) |
| `edited` | server | shown as "· redigert" |

`ReviewStore` gained `update(id, patch)`, `remove(id)` and `mine()`.
`WriteReviewModal` takes a `review` prop and edits in place. `ReviewCard`
renders Edit/Delete on your own rows. `PagesAccount.jsx` gained a **My
reviews** tab listing `ReviewStore.mine()` across all products.

## What upstream now derives from it

`reviewStats(p)` → `{n, nReal, real, claims[], traits[], paid, verdict}`

- `claims[i] = {key, label, y, n, u, verdict}`; `claimVerdict(y,n,u)` is
  "For få svar" under 3 decided answers, then Bred enighet / Flertallet
  enig / Delte meninger / Flertallet uenig / Bred misnøye.
- `traits[] = {t, pos, c, share}` — every distinct plus/minus string with
  its count, sorted by count desc.
- `paid = {lo, hi, n}` — min/max of what reviewers said they paid.
- `verdict = verdictWord(score)` where
  `score = mean over the 3 claims of (y/(y+n)), and 0.5 for a claim with no
  decided answers`. Tiers: `≥.85 → 3`, `≥.6 → 2`, `≥.4 → 1`, else `0`.
- `domScore(p)` / `domTier(p)` are the sort key and the filter key.
- **Fallback**: with no rows in `ReviewStore` it *synthesises* the whole
  thing deterministically from `p.rating` — preview-only demo data.

## The one problem that makes this a backend job

`reviewStats` reads `ReviewStore.items`, and boot only ever fetches
reviews for **the PDP you are looking at**. Every other surface —
`ResultRow`, `ResultRowCompact`, `ResultCard`, the PDP header link,
Compare's two new rows, the `dom` filter, the `rating` sort — calls
`reviewStats(p)` for a product with zero loaded rows and falls through to
the `p.rating` synth. We strip demo `rating` at `shapeRows`, so in
production that returns `null`:

> **every list row, card and compare cell would read "Ingen omtaler ennå",
> the Folkedommen filter would match nothing, and sorting by Folkedommen
> would rank every row blank — including products that do have reviews.**

The fix is a served per-product aggregate on the product row plus a
three-line upstream change to consume it. `meta.urating`/`ureviews`
already prove the seam (write-time aggregate into product meta, kept off
`meta.rating` because seed's `json_patch` clobbers seed keys on every
deploy). This replaces them.

## Plan

### 1. Schema

`SCHEMA` in `worker/index.js` (new install) + `ALTER … .catch(() => {})`
lines next to the existing ones at ~line 71 (live table):

```
ALTER TABLE reviews ADD COLUMN claims     TEXT     -- 'ynu', order: worth,durable,described
ALTER TABLE reviews ADD COLUMN plus       TEXT     -- JSON array
ALTER TABLE reviews ADD COLUMN minus      TEXT     -- JSON array
ALTER TABLE reviews ADD COLUMN buy_shop   TEXT
ALTER TABLE reviews ADD COLUMN paid       INTEGER
ALTER TABLE reviews ADD COLUMN show_paid  INTEGER NOT NULL DEFAULT 0
ALTER TABLE reviews ADD COLUMN updated_at INTEGER
```

- `claims` as a **3-char string**, not JSON — it is exactly upstream's own
  `R()` encoding (`c[0]c[1]c[2]`) and needs no parse.
- `buy_shop`, not `shop`: `reviews.shop` is the reserved *target* column
  for shop reviews (product_id XOR shop). Reusing it would make a product
  review look like a shop review to the partial unique index.
- Leave the `rating` column alone. It is `NOT NULL`, nothing reads it after
  this change, and dropping it buys nothing.
  <!-- ponytail: dead column kept; drop it in a later cleanup if the table
       is ever rebuilt for another reason -->
- `title`/`body` stay `NOT NULL` — write `''` when omitted.

### 2. Write path — `POST /api/reviews`

Body becomes `{product_id, claims:{worth,durable,described}, plus[], minus[],
shop, paid, show_paid, title, body}`. Validation, at the trust boundary:

- `claims`: all three present, each in `y|n|u`. **This is the only required
  field** — reject 400 otherwise (upstream's own gate says the same).
- `plus`/`minus`: arrays of strings, trim → drop empties → dedupe →
  **≤ 6 entries each, ≤ 40 chars each**. These are free text rendered to
  other users; the cap is not optional.
- `shop`: string, ≤ 60 chars, or null. Free text — reviewers name shops we
  do not carry. Never joined to the shop registry, never a trust signal.
- `paid`: integer `1 … 1_000_000` or null. `show_paid` coerced to 0/1, and
  forced to 0 when `paid` is null.
- `title` ≤ 80, `body` ≤ 2000, both now **optional** (default `''`).
- Upsert stays create-or-edit-your-own on the partial unique index, and
  editing still cannot clear `hidden`. **Change: stop overwriting
  `created_at` on conflict** — set `updated_at = now` instead, so the card
  keeps its real date and `edited = updated_at > created_at` is derivable.

### 3. Delete — `DELETE /api/reviews/:id` (new)

`ReviewStore.remove` is wired on the PDP card *and* in the account tab, so
this is required, not optional. Own review only (404 otherwise — do not
distinguish "not yours" from "not there"). Cascade `review_votes`, then
`refreshReviewMeta`.

### 4. Read path — `GET /api/reviews?ids=`

Same batch shape, new fields: `claims` (as the 3-char string, or expanded —
boot maps either way), `plus`, `minus`, `shop`, `paid`, `showPaid`,
`edited`, `created_at`.

**Privacy rule, non-negotiable:** `paid` is served only when
`show_paid = 1` **or** the row is the caller's own (the edit modal
prefills from it). A hidden amount still counts toward the aggregate range
and is never returned as a number attached to a name. Same shape of
promise as the gift-list `by` stripping in `plans/list-sharing-backend.md`.

### 5. Read path — `GET /api/reviews?mine=1` (new)

The account tab needs the user's reviews **across all products**;
`ReviewStore` only ever holds the current PDP. Session-scoped, no `ids`,
`ORDER BY id DESC LIMIT 100`.

Deliberately *not* folded into `meBody`: `/api/me` is on every cold load
and this tab is rare. boot prefetches it in `ensureRoute('account')`, then
feeds the referenced `prodId`s through `fetchProducts({ids})` so
`prodOf()` resolves (upstream falls back to the bare id, which renders but
looks broken).
<!-- ponytail: LIMIT 100, no paging — add offset paging the day someone
     writes their 101st review -->

### 6. The aggregate — `meta.udom` replaces `urating`/`ureviews`

`refreshReviewMeta` recomputes on every write, delete, moderation toggle
and GDPR erase (all four call sites already exist):

```js
meta.udom = {
  n,                                  // visible reviews
  c: { worth: [y, n, u], durable: [y, n, u], described: [y, n, u] },
  t: [[trait, count, 1|0], …],        // top 6 by count, 1 = plus
  p: [lo, hi, count],                 // omitted unless count >= 3
}
delete meta.urating; delete meta.ureviews;   // migration is the next write
```

- `t` capped at 6: upstream shows 3 plus + 2 minus on the PDP and 1–2 on a
  row. Six covers both with slack.
- **`p` requires ≥ 3 reporters and both ends rounded to the nearest 10 kr**
  (`lo` down, `hi` up). Upstream renders `lo === hi` as a single amount —
  with one reporter that is a named person's exact receipt, hidden toggle
  or not. Rounding + a floor of 3 is what makes "alltid spennet, aldri
  enkeltkjøp" true instead of a caption.
- `shapeRows` serves it as `dom` (and `reviews: m.udom.n`, which upstream's
  `reviews` sort field still reads). Demo `rating`/`reviews` keep being
  stripped exactly as today.

Payload: ~150 B/row, ~60 KB on a full 400-row page.
<!-- ponytail: full blob on every list row; serve {n, c} only for list
     queries and the rest on ids= if the page ever gets tight -->

### 7. Server-side sort and filter

`worker/index.js` must mirror upstream's comparator and predicate line for
line — the CLAUDE.md rule about `failGroups`/`sortRows` drifting applies
here exactly as it does to facets.

- `domScore(m)` helper: mean of `y/(y+n)` per claim, **`0.5` when a claim
  has no decided answers**, `undefined` when there is no `udom`.
- `SORT_VAL.rating` → `r => domScore(r.m)` (upstream kept the field id
  `rating`; only its label and value changed). `SORT_VAL.reviews` →
  `r => r.m.udom?.n`.
- `failGroups`: drop `f.rating`, add
  `f.dom && (tier == null || tier < f.dom)` where tier comes from the
  `.85/.6/.4` cuts. A row with no reviews has no tier and **is excluded** —
  that is upstream's behaviour (`domTier(p) == null` fails the test), not
  an accident to be softened.
- `boot.jsx` `listQuery`: `f.rating → f.dom`, param `rating= → dom=`.
- Parse `dom=` as an integer 1–3 in the route.

### 8. boot.jsx bridge

- `applyReviews` maps the new columns onto store rows (`claims` string →
  `{worth,durable,described}`, `plus`/`minus`, `shop`, `paid`, `showPaid`,
  `edited`, `author: mine ? 'Du' : author` unchanged).
- Wrap `ReviewStore.update` and `ReviewStore.remove` the same way `add` and
  `vote` are wrapped: optimistic locally, POST/DELETE, then replace the
  product's rows with the refetched canonical set. `update` posts to the
  same create-or-edit endpoint.
- Numeric-id check stays the demo/server discriminator.
- `hydrateCatalog`'s demo purge is unchanged and still correct: it drops
  string-id `PRODUCT_REVIEWS` rows and empties `SHOP_META`. With `rating`
  stripped and no `udom`, `reviewStats` returns `null` → "Ingen omtaler
  ennå" everywhere. That is the honest cold-start, same rule as before.

### 9. GDPR

Export: add the new columns to the `reviews` dump. Delete: unchanged —
it already collects affected `product_id`s and re-runs `refreshReviewMeta`
after the rows die.

### 10. Tests

`test/api.test.js` — rewrite the two review tests around claims, and add:
delete (own only), the `paid` privacy rule (other users never see a hidden
amount, the author does), the ≥3 + rounding floor on `udom.p`, `?mine=1`,
and one case pinning `dom=`/`sort=rating` server results to what
`reviewStats`/`domTier` compute for the same rows.

`test/ui.test.js` — the `/api/reviews` POST stub (~line 107) still builds a
`rating` row; the two reviews-layer tests; and the `onQuery` param tests
(~770/791) still pass `rating: 4` and assert `rating=4`.

## Not in scope

- **Shop ratings.** SHOP_META went from numbers to invented *quotes*
  ("«Kommer når lovet»") — we have no more source for those than we had for
  4.5 stars, so boot keeps emptying it and ShopChip keeps rendering
  nothing (`if (!meta) return null`). `meta.shopStats` (offers + freshness)
  remains the only honest shop data. `plans/reviews-layer.md` v1 stands.
  The claim model does make shop UGC v2 much more tractable — Levering /
  Kundeservice / Retur are three claims with an agreement verdict, i.e.
  this exact table with `shop` as the target. Still not now.
- `TRAIT_POOL` only covers 9 of 31 categories; the rest get the `_`
  fallback. Suggestions, not data — no backend involvement either way.
- EAN→brick classification, still parked.

## Upstream prompt (paste into the prototype project — two fixes)

> **1. Crash in the filter rail.** `FiltersBody` in `Results.jsx` renames
> `pRating` to `pDom`, but line ~399 still reads
> `const anyVisible = pCat || pBrand || pPrice || pRating || pShow || …`.
> Typing anything into the "Find a filter" box throws `ReferenceError:
> pRating is not defined` and unmounts the whole results screen. Change
> `pRating` → `pDom`.
>
> **2. `reviewStats` must be able to read a served aggregate.** The
> production host has real reviews but only ships the full review rows for
> the product page you are on — every result row, card and Compare cell
> therefore falls through to the `p.rating` synth path, and the host serves
> no `rating` (demo star ratings are fake trust signals and never ship). So
> in production every list row reads "Ingen omtaler ennå" even for products
> people have reviewed.
>
> Give `_calcStats` a third branch, tried after real rows and **before** the
> `p.rating` synth: when `p.dom` is present, build `claims`, `traits` and
> `paid` from it instead of synthesising.
>
> ```
> p.dom = {
>   n: 42,
>   c: { worth: [y, n, u], durable: [y, n, u], described: [y, n, u] },
>   t: [['God lyd', 18, 1], ['Blir varm', 5, 0], …],   // 1 = plus
>   p: [2790, 3290, 7],                                 // optional: lo, hi, count
> }
> ```
>
> `traits` from `t` as `{t, pos: !!flag, c, share: c / n}`, `paid` from `p`
> as `{lo, hi, n}`, `n` from `dom.n`. Score, tiers and every label stay
> exactly as they are. Keep the `p.rating` synth as the last branch so the
> preview keeps working.
