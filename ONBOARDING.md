# Shop onboarding — zero-integration tiers

Goal: a shop joins by replying to one email. We do everything. Three tiers,
pick whichever the shop finds easiest (plans/shop-partnership-ideas.md #3).

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
