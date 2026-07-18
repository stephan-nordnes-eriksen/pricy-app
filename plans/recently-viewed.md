# Recently viewed — track it for real

## Current state

`const RECENT` (proto/index.html:1452) is a hardcoded five-product list
(`airpods, switch, kindle, dyson…`), rendered on home (:2614). No view
tracking exists anywhere.

## Done looks like

The rail shows the products this browser actually viewed, most recent
first.

## Plan

Client-side only — localStorage in boot.jsx, no server, no schema.

1. In boot.jsx's routing, when `go('product', {id})` fires, prepend the
   id to a `pricy_recent` localStorage array (dedupe, cap at ~8).
2. Hydrate `RECENT` in place pre-render from that key (same
   mutate-in-place seam as CATALOG), filtered to ids that exist in the
   hydrated catalog.
3. Check the empty-first-visit render — if the rail looks broken empty,
   upstream fix is "hide the card when RECENT is empty".
4. One UI test: visit a product, reload, rail shows it.

ponytail: per-browser, not per-account. Move to a server-side
`views` table only if cross-device recents ever matters.
