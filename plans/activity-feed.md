# Real alert/activity feed

Every logged-in user sees the same five fabricated alert events.

## Current state

- `const FEED` (proto/index.html:1454–1461) — five hardcoded events
  ("Sony dropped to target, 14 min ago", fake from/to prices, tags).
- Rendered by `AlertFeedCard` (home sidecard, ~:2646) and
  `ActivityFeed` (Alerts → Activity tab, ~:4264).
- boot.jsx hydrates USER / WATCHED / CATALOG / WatchStore / AutobuyStore
  but never touches `FEED` — it stays baked demo data for everyone.
- The header alerts *badge* is real (`WatchStore.hits()` off hydrated
  watches) — only the feed content is fiction.

## Done looks like

The feed shows the user's actual alert history from the `alerts` table
([[price-drop-alerts]] builds it), newest first, empty for a new user.

## Plan

1. `GET /api/alerts` — the session user's alerts joined to product
   title/image, newest first, capped (say 50).
2. boot.jsx hydrates `FEED` in place pre-render, same mutate-in-place
   seam as CATALOG/WATCHED. Map rows to the feed item shape the
   components expect ("ago" strings computed client-side from
   `created_at`).
3. Empty state: check what the components render with `FEED = []` — if
   they look broken, that's an upstream Claude Design fix (empty-state
   card), prompt below.
4. Worker test: alerts endpoint scoped to session user; UI test: feed
   renders hydrated events, not the demo five.

## Depends on

[price-drop-alerts](price-drop-alerts.md) — no alerts table, no feed.

## Upstream (Claude Design) prompt — only if empty state is broken

> In the pricy prototype, `AlertFeedCard` and `ActivityFeed` render the
> hardcoded `FEED` array. Give both a proper empty state when `FEED` is
> empty (e.g. "No alerts yet — set a target price on a watched product
> and we'll notify you here"). Don't change the populated rendering.
