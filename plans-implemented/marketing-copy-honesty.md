# Marketing copy ahead of reality — one softening pass

Marketing audit 2026-07-19. Three copy-only claims, no feature work
worth doing behind any of them — one upstream pass fixes all three.
(Related but scoped elsewhere: alert claims →
[alert-notification-claims](alert-notification-claims.md), Plus claims
→ [pricy-plus](pricy-plus.md), auto-buy →
[autobuy-copy-honesty](autobuy-copy-honesty.md), per-price timestamps →
[price-verified-timestamps](price-verified-timestamps.md).)

## The claims

1. **"We re-check every shop around the clock — the most popular
   products most often."** (FAQ, proto/index.html:4941). Prod SOURCES is
   empty → the hourly cron is a no-op; prices move only when the manual
   crawl runs. And nothing anywhere weights by popularity — that isn't
   even planned in 4d. Two falsehoods in one sentence.
2. **"When you click through to a shop and buy, some shops pay us a
   small referral fee."** (FAQ, :4939). Present tense; Adtraction isn't
   live and crawled offer URLs are plain first-party links with no
   affiliate tagging. Today no shop pays anything.
3. **"Biggest drops today"** (landing, :3582). `drop` is computed
   against the static seed `was` price (worker/index.js:267) — it's
   "discount vs list price", not a daily movement. Same data feeds the
   ticker.

## Plan

One upstream pass:

1. FAQ freshness answer → claim only what's true: prices are
   re-checked regularly and each shows when it was last checked (the
   second half becomes true via price-verified-timestamps). Drop the
   popularity claim entirely — don't re-add it later either, unless
   someone actually builds popularity weighting.
2. FAQ money answer → future/conditional: "shops can pay us a small
   referral fee when you buy — that fee never affects ranking…". The
   ranking-honesty half is true (offers are ORDER BY price) and stays.
3. "Biggest drops today" → "Biggest discounts" (landing section + any
   ticker labels that say "today"). ponytail: a real 24h-drop computed
   from price_points is possible once real history accumulates — do it
   then if "today" is worth having back.

Revisit when PLAN.md 4d (cron + Adtraction) goes live: restore
"around the clock" and present-tense referral copy.

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, three marketing claims need softening to
> match reality:
> 1. About-page FAQ, "How fresh are the prices?": replace the answer
>    with "We re-check shops regularly, and every price shows when it
>    was last checked." (Remove the "around the clock" and "most
>    popular products most often" claims.)
> 2. About-page FAQ, "How does pricy make money?": change "some shops
>    pay us a small referral fee" to "some shops can pay us a small
>    referral fee". Keep the rest of the answer (ranking is never
>    affected) unchanged.
> 3. Landing page: rename the "Biggest drops today" section to
>    "Biggest discounts". If any other label says drops happened
>    "today", drop the word "today".

## Dependencies

None. Stronger claims return with PLAN.md 4d go-live.
