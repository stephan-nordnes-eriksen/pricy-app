# Shop onboarding — zero-integration tiers

Goal: a shop joins by replying to one email. We do everything. Three tiers,
pick whichever the shop finds easiest (plans/shop-partnership-ideas.md #3).

## The full loop, start to finish

One webshop, from cold contact to "you're live". Every step is manual today
(no SEND_EMAIL binding); the commands assume `tools/.ingest-token` exists.

1. **Pull the shop's numbers.** They personalize the pitch and, later, the
   live email:

   ```
   curl -s -H "Authorization: Bearer $(cat tools/.ingest-token)" \
     'https://pricy.no/api/admin/outreach?shop=<Shop>'
   ```

   → `{shop, products, watchers, slug}`. A shop we don't carry yet returns
   404 — fine, the pitch works without numbers.

2. **Send the pitch.** `emails/email_onboarding.html`: fill `{butikk}` (shop
   name) and `{domene}` (their domain, it prefills the /bli-med form), swap
   the logo `src` for its `data-hosted-src` value (see
   `emails/assets-email/README-server.md`), send from kontakt@pricy.no.
   The email offers the three tiers below and a CTA to
   `https://pricy.no/bli-med?domene=<domain>` — the self-service form.

3. **No answer after ~a week?** Send `emails/email_followup.html` once
   (same placeholders). The template promises it's the only reminder —
   keep that promise.

4. **The shop responds through one of two doors:**
   - **Reply email** — they answer "ja" / paste a feed URL / mention
     Adtraction.
   - **The /bli-med form** — lands in the D1 backlog; check it when
     expecting answers (nothing notifies you yet):

     ```
     curl -s -H "Authorization: Bearer $(cat tools/.ingest-token)" \
       'https://pricy.no/api/admin/joins'
     ```

     → rows of `{domain, method: crawl|feed|adtraction, feed?, email}`.

5. **Wire their choice** — Tier A (crawl), B (feed) or C (Adtraction)
   below. Feed and Adtraction are a `SOURCES` edit + `npm run deploy`;
   crawl is an `approved:` stamp + `node tools/crawl.mjs --shop <Shop>`.

6. **Verify they're actually in.** Re-run the step-1 curl: `products` should
   now be their catalog size. Spot-check a product page on pricy.no (add
   `?cb=1` — anonymous API GETs are edge-cached ≤5 min) and confirm
   `https://pricy.no/butikk/<slug>` redirects to their shop page.

7. **Tell them they're live.** `emails/email_live.html`: `{shop}`,
   `{antall produkter}` (= `products`), `{n}` (= `watchers`) and
   `{shop_slug}` (= `slug`) all come from the step-1 curl. This is the
   payoff email — "N users already watch products you sell".

8. **Nothing else.** Feeds and Adtraction refresh on the hourly cron;
   crawled shops ride the manual crawl cadence. If their source breaks,
   prices freeze at the last value (never guessed) — a reply to any of
   the emails reaches kontakt@pricy.no and a human.

## Tier A — approve our crawl (shop does nothing)

The shop replies "yes" to crawling their full catalog.

1. In `tools/crawl-urls.json`, set on the shop's `$discover` block:
   `"approved": "<name/email>, <date>, <how they agreed>"` — this lifts
   `SAMPLE_LIMIT` (400 pages) to the whole sitemap.
2. `node tools/crawl.mjs --shop <Shop>` for the first full pass (prices +
   images), then the normal cadence covers them.

## Tier B — feed they already have (shop pastes a URL)

Every Norwegian platform exports a Google Shopping feed out of the box:
Shopify ("Google & YouTube" channel), WooCommerce (Google for WooCommerce),
Mystore (Google Shopping app), 24Nettbutikk (prisfil, built into all plans).
The shop sends us its feed URL — nothing else.

1. Add to the `SOURCES` var in `wrangler.jsonc`:
   `"<Shop>": { "type": "feed", "url": "https://…" }`
   (`"ua": "browser"` if their CDN blocks honest UAs).
2. `npm run deploy`. The hourly cron ingests it: gtin-keyed (unknown EANs
   auto-create `ean-*` rows, live in Ukategorisert until the resolver files
   them), `g:sale_price` honored inside its window, non-NOK rows refused,
   images queued for the drain.

## Tier C — Adtraction (shop is already there)

If they run an Adtraction program: approve our channel in their program,
add the feed URL to the `ADTRACTION_FEEDS` secret and
`"<Shop>": { "type": "adtraction" }` to `SOURCES`. CPA, no work for them.

## Mail-merge (HTML templates in `emails/`)

`GET /api/admin/outreach[?shop=X]` (bearer = INGEST_TOKEN) serves the
numbers the templates need: `{shop, products, watchers, slug}` per shop —
`{antall produkter}`, `{n}` and `{shop_slug}` in `email_live.html`. The
CTA `https://pricy.no/butikk/<slug>` 302s onto the SPA's `/shop` route.
Swap the logo `src` for `data-hosted-src` when sending
(`emails/assets-email/README-server.md`).

```
curl -s -H "Authorization: Bearer $(cat tools/.ingest-token)" \
  'https://pricy.no/api/admin/outreach?shop=Komplett'
```

## Self-service signups (`/bli-med`)

The emailed CTA lands on `https://pricy.no/bli-med?domene=<domain>` — the
MerchantJoin screen (public, no login). A submission stores
`{domain, method: crawl|feed|adtraction, feed?, email}`; check the backlog:

```
curl -s -H "Authorization: Bearer $(cat tools/.ingest-token)" \
  'https://pricy.no/api/admin/joins'
```

Acting on a lead is manual: `feed` → add `{type: "feed", url}` to `SOURCES`;
`crawl` → wire the shop in `tools/crawl-urls.json` (approval before a full
crawl, see CLAUDE.md); `adtraction` → approve/attach the feed per the
Adtraction section above. Then send `email_live.html` with the outreach
numbers.

## Email template (Norwegian)

> Hei!
>
> Vi driver pricy.no — en uavhengig norsk prissammenligningstjeneste.
> Oppføring er gratis, rangeringen er nøytral (laveste pris først, alltid),
> og vi tar aldri betalt per klikk.
>
> Vi vil gjerne vise hele katalogen deres med ferske priser og bilder.
> Det krever ingenting fra dere — velg det som passer:
>
> 1. **Svar "ja"** på at vi kan lese produktsidene deres (vi henter priser
>    skånsomt fra deres egen sitemap, med tydelig user-agent).
> 2. **Send oss URL-en** til Google Shopping-feeden dere allerede har
>    (Shopify/WooCommerce/Mystore/24Nettbutikk lager den automatisk).
> 3. Er dere på **Adtraction**? Godkjenn kanalen vår der, så er alt i gang.
>
> Uansett valg: produktene deres får prishistorikk, og kunder med prisvarsel
> på varene deres får beskjed når dere setter ned prisen.
>
> Mvh, pricy.no — kontakt@pricy.no

Every offer answers "frozen price / missing image" complaints too: approval
or a feed is the fix, and it's their listing that improves.
