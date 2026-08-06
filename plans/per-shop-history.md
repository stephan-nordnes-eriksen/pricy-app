# Per-shop price history (real data behind the chart's shop selector)

The 2026-08-06 sync brought the PDP chart's per-shop selector
(`chart__shops` chips, `HistoryChart` `refPoints`). Upstream synthesizes
the shop line with `genShopHist` — seeded noise on the aggregate history.
Fine for the demo, but fabricated "Price at <shop>" lines must not ship
live (same honesty rule as the purged demo reviews / SHOP_META).

## Backend (done, this repo)

- D1 `shop_prices (product_id, shop, day, price, PK(product_id, shop, day))`,
  written by ingest next to `price_points` with the same day-min upsert.
  Real observations only; accumulates from deploy day — no backfill exists.
- Served as `hist` (≤24 points, oldest→newest, the `history` window) on each
  offer of **detail (`ids=`) fetches only** — list rows stay lean, same rule
  as specs. A shop never observed carries no `hist` key at all.
- `POST /api/admin/alias` migrates `shop_prices` with the rest.
- Test: "per-shop price history: captured at ingest…" in test/api.test.js.

## Upstream fix (DONE 2026-08-06, synced same day)

Guarded by test/ui.test.js "PDP chart: per-shop line reads served o.hist".
The prompt that was pasted, for the record:

> In Results.jsx's ProductPage, the per-shop price-history line
> (`genShopHist`) is demo synthesis. Live offers now carry real data:
> `o.hist` — an array of that shop's observed daily prices,
> oldest→newest, same day-window as `v.history` but possibly much
> shorter (collection just started).
>
> - When the selected offer has `hist` with ≥2 points, plot
>   `points = selOffer.hist.slice(-weeks)` and
>   `refPoints = histView.slice(-points.length)` — both arrays the same
>   length, so HistoryChart needs no change and the window is honestly
>   just the days we observed. Never pad, extrapolate or synthesize.
> - When it has `hist` with <2 points, selecting that shop shows a short
>   "Not enough price history yet" note instead of the chart.
> - Only render a shop's chip when its offer has `hist`, EXCEPT when no
>   offer on the product has `hist` at all — then keep today's behavior
>   (all chips + genShopHist) so the demo keeps working. boot never
>   serves hist-less products once a shop has been crawled twice, so
>   live users only ever see real lines.

After pasting: re-sync, npm test, deploy.
