# Lists v2: multiple lists, sharing, gift mode (upstream PROMPT 05)

Backend evaluation for `proto/PROMPT - 05 Lists v2.md` (fetched
2026-08-03). **This one is already built — the upstream prompt was
executed earlier (ListsData.jsx / PagesLists.jsx synced 2026-08-02) and
the backend shipped the same day.**

What the prompt asks for → where it lives:

- `ListStore` persistence → `PUT /api/lists` blob on `users.lists`,
  hydrated in `hydrateMe`, "Overvåket" computed off watches (CLAUDE.md
  Rules, commit be713da/249588a).
- Sharing, members, gift-safe bought-marks → `list_shares` /
  `list_members` / `list_bought` tables, `POST /api/lists/:id/share`,
  `GET/POST /api/l/:token`, owner payload strips `by` server-side
  (commit b6d5390, plans/list-sharing-backend.md).

## Still open (tracked in list-sharing-backend.md — not here)

- The upstream member-screen sync: ShareModal still renders its demo
  link; the paste-ready prompt sits at the bottom of
  list-sharing-backend.md.
- The two parked decisions there: logged-out viewing (no, for now) and
  member "leave list".

No new backend work. This file exists so the PROMPT 01–08 set maps
1:1 to plans; the living plan is
[list-sharing-backend](list-sharing-backend.md).
