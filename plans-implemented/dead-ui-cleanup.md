# Dead UI cleanup — inert buttons, misleading links, dead code

All upstream (proto/index.html is sync-owned) — one Claude Design pass,
then re-sync. No worker changes except where noted.

## The inventory (proto/index.html)

| Item | Where | Problem |
|---|---|---|
| "Go to shop" (product best-price box) | :3304 | `<Btn>` with no `onClick` — completely inert. Should open the best offer's `url` (PLAN.md 4d task 5 already wants this). |
| "Visit" per-offer button | :3359 | correct code (`disabled={!o.url}`), but prototype offers never get urls — verify it lights up post-sync where real ingested urls exist. |
| "Forgot?" password link | :2324 | `preventDefault()` only. Real reset needs the email service — until then, point it at magic-link login ("log in without a password instead"), which is the same recovery. |
| LandingHeader "Categories" nav | :3412 | labeled Categories, actually `go('login')`. Relabel or route honestly. |
| Footer links | :1575–1592 | "Biggest drops", Press, FAQ, Contact, Terms all land on the same About page. Trim to links that have destinations; Terms/Privacy pages are a separate (legal) task — don't fake them. |
| Legacy `Header` component | :1523–1553 | never rendered (router uses AppHeader/LandingHeader), dead `deals` route link, references a missing asset. Delete. |
| `useResultFilters()` stub | :3026–3028 | returns null, unused. Delete. |

## Upstream (Claude Design) prompt — paste-ready

> Cleanup pass on the pricy prototype:
> 1. Product page "Go to shop" button: wire `onClick` to open the best
>    offer's `url` in a new tab (`rel="noopener"`); disable with a
>    tooltip when no offer has a url.
> 2. Login "Forgot?" link: instead of preventDefault, switch the auth
>    card to the magic-link tab with a hint "Log in with an email link —
>    you can set a new password afterwards in Settings."
> 3. LandingHeader: the nav item labeled "Categories" routes to login —
>    relabel it "Log in to browse" or route it to the about page.
> 4. Footer: remove links that all dead-end on About (Press, FAQ,
>    Contact, Terms); keep About and How it works (routed to About's
>    relevant section).
> 5. Delete the unused legacy `Header` component (the one with the
>    `deals` link and logo-wordmark.svg) and the `useResultFilters`
>    stub — both dead code.

## After sync

`npm test`; UI test asserting "Go to shop" opens the offer url (jsdom:
assert `window.open`/anchor href) once wired.
