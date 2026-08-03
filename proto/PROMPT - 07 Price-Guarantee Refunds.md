# PROMPT — 07 Price-guarantee refund helper

Closes G16 from `Competitive Gap Analysis.html`. Keep watching after purchase: if the price drops inside the shop's price-guarantee window, compute the difference and help the user claim it. No big player does this; it extends Pricy's saved-money framing past checkout and is a natural Plus benefit.

**Read before writing:** `CLAUDE.md`, then `pricy/PagesCore.jsx` (WatchStore pattern, usePlan, PLUS_FEATURES, PlusModal, LockedCard, Toast), `pricy/PagesAlerts.jsx` (tab structure — this feature becomes the third tab), `pricy/Results.jsx` (genOffers offer shape `{shop, price, url}`; ProductPage offer rows), `pricy/PagesAutobuy.jsx` (executed orders — an auto-buy execution should seed a purchase), `pricy/AppRouter.jsx` (PLAN tweak).

## How it works today (verified)
- Alerts has two tabs (Watching / Activity). Nothing models purchases; WatchStore.saved() counts hypothetical watch savings only. Plan gating exists (`usePlan`, LockedCard → PlusModal).

## Tasks
1. **`PurchaseStore` (new file `RefundsData.jsx`, load after PagesCore).** Same emit/sub pattern. Purchase: `{ id (prodId), shop, paid, boughtAt, guaranteeDays (14 | 30 per shop — put a small SHOP_GUARANTEE map here; 2 shops with none), status: 'watching'|'claimable'|'claimed'|'expired' }`.
   - Seed 4: one claimable (paid 3 490, same shop now 2 990 → 500 kr claimable, 9 days left), one watching (no drop yet), one expired, one claimed (kr 340 — feeds a "refundert totalt" stat).
   - Derived helpers: `diff(p)` = paid − current price AT THE SAME SHOP (from genOffers — the guarantee is per-shop, not market-wide; surface the market low separately as context), `daysLeft(p)`.
2. **"Etter kjøpet" tab (PagesAlerts.jsx).** Third `.seg` tab with a count badge when anything is claimable.
   - Header stat row: "kr 340 refundert · kr 500 klart til krav · 2 under oppfølging" (mono).
   - Purchase rows: ProdImg, name, "Kjøpt {relative} hos {shop} — kr {paid}", guarantee countdown (mono chip, `--warn-500` when ≤3 days), status treatment: claimable rows get the green best-price emphasis + `Btn` "Krev kr 500 tilbake".
   - **Claim modal:** 3 numbered steps (1. Ta med ordrenummer, 2. Kontakt {shop} kundeservice — lenke, 3. Vis prisdokumentasjon) + a pre-written claim text in a bordered `--canvas` block with "Kopier tekst" (Toast). Include the price evidence line: "{date}: kr {paid} → i dag kr {now} (dokumentert av Pricy)". Confirm button → status 'claimed', stats update.
   - Expired/claimed rows collapse into a quiet history section.
3. **"Jeg kjøpte denne" entry point (Results.jsx).** Each PDP offer row gets a small ghost action (icon 'shopping-bag', title "Kjøpte du denne? Følg prisgarantien") → mini-form (pris paid, prefilled with offer price; shop prefilled) → `PurchaseStore.add`, Toast "Vi følger prisen i {guaranteeDays} dager." Shops without a guarantee show "Ingen prisgaranti hos {shop}" disabled state.
4. **Plus gating.** Free plan: tab renders the seeded claimable row blurred behind `LockedCard` ("Prisgaranti-vakt", desc on the 500 kr example) → PlusModal; Plus plan: full feature. Add `{ icon:'shield-check', name:'Prisgaranti-vakt', desc:'Vi følger prisen etter kjøpet og hjelper deg kreve mellomlegget.' }` to PLUS_FEATURES (PagesCore).
5. **Auto-buy hook (PagesAutobuy.jsx).** Where an executed order renders (AutobuyExecCard), one line: "Prisgaranti-vakt aktiv i 30 dager" when Plus — executed auto-buys seed PurchaseStore automatically.
6. **Wire in.** `index.html` script line. No new route — it lives in Alerts (`go('alerts',{tab:'after'})`); support that param (tab0 handling exists).
7. **CSS** in `pages.css`: countdown chip, claim modal steps, copy block.

## Verify
Plan=free: tab shows LockedCard, PlusModal opens, switching plan via Tweaks unlocks. Plan=plus: stats math matches rows; claim flow moves the row to claimed and bumps "refundert totalt"; copy button fires Toast. PDP offer → "Jeg kjøpte denne" creates a watching row with correct guarantee window; no-guarantee shop disabled. Countdown chip turns warn at ≤3 days (check the seeded one). No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
