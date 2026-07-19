# Honest metrics — kill the fabricated numbers

The UI is full of invented stats presented as live data. Real catalog:
~24 products, 8 shops. Fix = expose the few real aggregates the worker
already has, and one upstream copy pass for the rest.

## The inventory (proto/index.html unless noted)

| What | Where | Truth |
|---|---|---|
| "1.4M products · 1,412 shops" | :1538, :1598, :2366, :2384, :3510, :3518–3520, :4381 | ~24 / 8 |
| "Coverage 1 412" metric | :2565 | hardcoded |
| About metrics: 1,412 / 1.4M / "30 min" / "kr 212M saved since 2024" | :4945–4948 | all hardcoded |
| "Prices updated every 30 min" | :1598 | no freshness data exposed |
| "Saved YTD" / "saved since March" | `WatchStore.saved()` :3587, shown :2545, :2834, :4304 | Σ(was−best) over demo `was` field; no time basis — hypothetical, not realized |
| "Active alerts" metric | :2555 | seed `hit` flags (fixed by [[price-drop-alerts]]) |
| `CAT_COUNTS` fake category counts | :1470–1473, used :2637, browse, onboarding | real fallback already exists when `window.CAT_OF[c]` present (:2428) |
| "Member since March 2026" | :4497 | hardcoded; `users.created_at` exists but isn't in `meBody` |
| Landing/login animated counters (`useCountTo(6000)`, `useCountTo(1291)`) | :3425, :2185 | scripted demos — fine as *demos*, but labeled "you'd save" |
| `offers.updated_at` | worker/index.js:15, written :174, **omitted** from `catalogBody` :184 and MCP `get_product` :274 | stored, never exposed |

## Plan

1. **Worker: expose real aggregates.**
   - `catalogBody`: add `updated_at` per offer (or `MAX(updated_at)`
     per product) and a top-level `meta: {products, shops, freshest}`.
     Include it in MCP `get_product` too.
   - `meBody`: add `createdAt` from `users.created_at`.
2. **Upstream copy pass (one Claude Design prompt, below):** swap
   hardcoded numbers for the real ones where the data now exists, and
   soften the rest. "Saved" figures get retitled to what they are
   ("potential savings on your watchlist") until realized savings are
   actually tracked (future feature, not this plan).
3. **boot.jsx**: nothing new if upstream reads `window.CATALOG` meta and
   `USER.createdAt` — verify the seam during sync.
4. Test: catalog API carries meta + updated_at; me carries createdAt.

## Upstream (Claude Design) prompt — paste-ready

> Honesty pass on the pricy prototype's numbers:
> 1. Everywhere the copy says "1.4M products" / "1,412 shops" (landing
>    trust bar, search placeholders, MetricStrip coverage, About page),
>    read the real counts from `window.CATALOG` meta if present
>    (`CATALOG.meta = {products, shops, freshest}`) and phrase the copy
>    to scale ("Tracking N products across M shops"). Drop "kr 212M
>    saved since 2024".
> 2. "Prices updated every 30 min" → derive from `meta.freshest`
>    ("Prices updated <relative time>").
> 3. Retitle "Saved YTD" and "kr X saved since March" to "Potential
>    savings on your watchlist" (same computation, honest label). Drop
>    the "since March" suffix.
> 4. Profile "Member since March 2026" → format `USER.createdAt` when
>    present.
> 5. `CAT_COUNTS`: remove the fake fallback strings — always compute
>    from `CAT_OF` (already the behavior when `window.CAT_OF` exists).
> Keep the landing HeroDemo / BrandDemo animations, but make their
> savings figures read as illustrative ("e.g. save kr 1 291").
