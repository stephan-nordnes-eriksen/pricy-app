# List sharing is demo-only — the share modal lies

(Split off the custom-lists backend, shipped 2026-08-02: lists persist
per user as the `users.lists` JSON blob via `PUT /api/lists`, CLAUDE.md
Rules. This file is the half that did NOT ship: making "Del" real.)

**Status 2026-08-02: backend + boot wiring SHIPPED (steps 1, 2, 3, 4, 6
below — tables, endpoints, meBody privacy join, share mint cached in
`shared.url`, `/l/<token>` route, `window.onSharedList`/`onSharedBought`
bridges, two API tests). What remains is step 5, the upstream sync:
ShareModal still renders its hardcoded demo link and there is no member
screen — the prompt at the bottom is paste-ready. Deviations from the
plan as written: `list_members` has no `name` column (joined from
`users` at read time instead), the blob→table bought-mark migration on
first share was skipped (only the owner's own view-as-preview marks can
exist pre-share, and they're throwaway), and the owner's payload strips
`by` on ALL shared lists, not just gift ones (the owner UI never renders
names, so there is nothing to lose and one less branch to get wrong).**

## Current state

The lists feature persists for real, but everything social in it is
demo theatre:

- `ShareModal` (proto/PagesLists.jsx:59) shows a hardcoded link
  `pricy.no/l/h7k2f` for every list, and "Kopier" copies it — the user
  shares a dead URL. Worst kind of fake: looks real, hands the user a
  link that 404s.
- `ListStore.share()` (proto/ListsData.jsx:31) returns that same
  constant; `shared.people` is whatever the demo seeded (real users
  always have `people: []` — nobody can actually join).
- "Se som mottaker" (view-as toggle) and the member check-off flow
  (`markBought(..., 'Du')`) work, but only against yourself — `by` is
  always the literal `'Du'` because there are no other members.
- The gift-mode privacy promise ("eieren ser ikke hvem som har kjøpt
  hva") is enforced by nothing: the whole `bought` map, `by` names
  included, lives in the owner's own blob and rides their `/api/me`.

## Done looks like

A list owner clicks Del, gets a real link; anyone who opens it (logged
in) sees the list with live prices, can check off purchases in gift
mode; the owner sees counts but never who-bought-what; members appear
in the modal's people list. Owner remains the only writer of the list
itself (upstream's stated contract: "Bare du kan endre listen").

## Plan

1. **Storage split.** Sharing breaks the single-user blob: members must
   read (and write bought-marks to) a list the owner owns. Move shared
   state out of `users.lists` into tables:
   - `list_shares (token_hash TEXT PRIMARY KEY, user_id INTEGER, list_id TEXT, created_at INTEGER)`
     — one active share token per (user, list); reissue = replace.
   - `list_members (owner_id INTEGER, list_id TEXT, user_id INTEGER, name TEXT, joined_at INTEGER, PRIMARY KEY (owner_id, list_id, user_id))`
   - `list_bought (owner_id INTEGER, list_id TEXT, product_id TEXT, user_id INTEGER, at INTEGER, PRIMARY KEY (owner_id, list_id, product_id))`
     — bought-marks move here (out of the blob) the moment a list is
     shared, so the owner's blob physically cannot carry `by` names.
     Unshared lists keep `bought` in the blob; migrate on first share.
2. **Endpoints.**
   - `POST /api/lists/:id/share` → `{url: "https://pricy.no/l/<token>"}`
     (mints/returns the token; same hashing scheme as sessions).
   - `GET/POST /api/l/:token` — member surface, session required:
     GET returns the list (name, icon, items hydrated the same lean
     shape as `/api/products?ids=`, members, gift flag, bought marks
     WITH `by`); POST `{product_id, bought: true|false}` toggles a
     bought-mark (only your own, unless owner). First GET by a new
     user inserts a `list_members` row.
   - Owner reads: `meBody` joins member/bought state onto the blob's
     lists — gift lists get `boughtCount` only, never the marks
     themselves (the privacy rule lives server-side, not in the UI).
3. **Routing.** `/l/<token>` is an SPA path (parseUrl → a member-view
   lists screen); the API path `/api/l/` needs `run_worker_first`
   coverage (already under `/api/*`).
4. **Boot wiring.** `ListStore.share(id)` awaits the real POST and
   returns the served URL to `ShareModal`; member view hydrates from
   `GET /api/l/:token` instead of ListStore. Upstream's `viewAs` demo
   toggle becomes real ("view as member" = render the member surface).
5. **Upstream (Claude Design).** ShareModal must await a
   `window.shareListApi` bridge when present (same pattern as
   `window.buyNowApi` / `window.reportProblem`) instead of the
   hardcoded link, and the member screen needs a real
   not-your-own-list variant. Marked prompt section when this is
   picked up.
6. **Tests.** API: token mint/reissue, member join on first GET,
   bought toggle (member vs owner vs stranger), owner payload never
   contains `by` on a gift list, GDPR delete kills shares/members/
   bought rows, export includes them.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype's lists feature (PagesLists.jsx / ListsData.jsx),
> make sharing production-wirable:
>
> 1. **ShareModal**: the link is hardcoded (`const link = 'pricy.no/l/h7k2f'`).
>    Read it from the list instead: `const link = (l.shared && l.shared.url) ||
>    'pricy.no/l/h7k2f'` (the host caches a real minted URL on `shared.url`;
>    the constant stays as the preview fallback). Same in `ListStore.share()`:
>    return `l.shared.url || 'pricy.no/l/h7k2f'`.
> 2. **Member screen**: when `ListsPage` gets `params.token` (instead of
>    `params.id`), render a shared-list member view. If `window.onSharedList`
>    exists, await `window.onSharedList(token)` → `{ list: { id, name, icon,
>    gift, role: 'owner'|'member', owner, items }, members: [{name,
>    initials}], bought: { [productId]: { at, mine, by? } }, products }`
>    (products are already in the catalog, `WatchStore.prod(id)` resolves);
>    on rejection show a "Denne lenken er død" empty state. Without the
>    hook (preview), fake it from the first shared demo list. The view is
>    ListDetail's member variant: owner name in the sub line, AvStack of
>    members, NO rename/remove/share/gift controls, gift check-off enabled —
>    a toggle calls `await window.onSharedBought(token, productId, bought)`
>    when the hook exists (it resolves the fresh payload — re-render from
>    it) and falls back to local state in preview. `bought[pid].by` may be
>    absent (the server strips it for owners) — render "Kjøpt" without a
>    name then. When `list.role === 'owner'`, show a hint linking to the
>    real editable list (`go('lists', { id: list.id })`).

## Decisions to make first

- Can a non-logged-in visitor view a shared list? (Lazy default: no —
  session required, reuses auth; public read is a separate decision
  with privacy copy implications.)
- Revoke/leave: owner deletes share token (kills the link) — is that
  enough for v1? (Member "leave list" can wait.)

## Dependencies

None hard. Email delivery (PLAN.md Phase 2) would make "invite by
email" possible, but link-sharing needs only what exists.
