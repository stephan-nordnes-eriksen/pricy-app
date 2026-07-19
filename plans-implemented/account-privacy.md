# Account privacy — real data export & account deletion

Both Privacy-screen actions are theatre today. GDPR makes these real
obligations, not nice-to-haves.

## Current state

- **Export my data** (proto/index.html:4644): claims "Watchlist, alert
  history and settings as JSON" but only fires
  `onToast('Export sent to ' + USER.email)`. No endpoint, no file.
- **Delete account** (:4654): "Yes, delete" → `go('landing')`. No
  `DELETE /api/account` exists; users/sessions/watches/purchases/
  autobuy rows all survive.

## Done looks like

Export downloads a JSON file of the user's data; delete removes every
row keyed to the user, clears the session, and lands on the landing
page for real.

## Plan

1. **`GET /api/account/export`** — session-gated JSON of the user's
   row (minus password hash), settings, watches, purchases, autobuy
   blob, alerts (once [[price-drop-alerts]] exists). Direct download
   (`Content-Disposition: attachment`), no email involved.
2. **`DELETE /api/account`** — delete the user's rows across all
   tables (users, sessions, watches, purchases + the autobuy/settings
   blobs die with the users row), expire the session cookie. Purchases:
   delete too — we're not an accounting system; revisit if real money
   ever moves (FULFILLMENT-PLAN keeps us out of the money path anyway).
3. **Wire the buttons** — boot.jsx exposes `window.exportData()` /
   `window.deleteAccount()`; upstream swaps the toast/navigate for
   those handlers (falling back to today's behavior when absent, so the
   prototype still demos standalone). Same bridge pattern as
   `saveSettings`.
4. **Tests** — export scoped to session user; delete removes rows and
   kills the session; second delete 401s.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype's Privacy section:
> 1. "Export my data": if `window.exportData` exists, call it (it
>    triggers a JSON download) and toast "Export downloaded"; else keep
>    the current demo toast.
> 2. "Delete account" → "Yes, delete": if `window.deleteAccount`
>    exists, `await` it before `go('landing')`, showing a brief
>    "Deleting…" state and surfacing an error if it rejects; else keep
>    the current demo behavior.
