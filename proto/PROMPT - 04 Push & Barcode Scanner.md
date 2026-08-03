# PROMPT — 04 Push notifications + in-store barcode scanner

Closes G1 + G2 from `Competitive Gap Analysis.html`. Every competitor delivers the "price hit your target" moment on the lock screen and owns the in-store "am I being overcharged?" scan. Prototype both flows end-to-end (simulated — no real Notification API permissions, no real camera).

**Read before writing:** `CLAUDE.md`, then `pricy/PagesAccount.jsx` (Notifications section — extend, don't rebuild), `pricy/AppRouter.jsx` (installPreview tweak → install bar already exists; Tweaks wiring), `pricy/AppHeader.jsx` (where the scan button lands), `pricy/PagesAlerts.jsx` (activity feed items — the push preview should mirror one), `pricy/GpcData.jsx` (EAN→brick mapping exists — reuse for scan resolution), `pricy/PagesCore.jsx` (Toast, WatchStore), `pricy/Results.jsx` (getListing, ProductPage).

## How it works today (verified)
- PWA install bar is tweak-driven (`installPreview`: auto/android/ios). Alerts exist only as the in-app Activity tab; Account has a Notifications section (channels unknown — read it first).
- No scanner anywhere; GpcData resolves EANs to bricks, so a fake EAN can resolve to a real product.

## Tasks
1. **Push opt-in flow (PagesAccount.jsx + new `Push.jsx`).**
   - Notifications section gains a "Push på denne enheten" row: state off → `Btn` "Slå på push" → browser-permission mock modal (styled like Chrome's sheet: app origin, Tillat/Blokker) → allowed state shows device row ("Denne enheten · aktivert nå") + per-type toggles reusing existing notification rows (Prisvarsel / Tilbake på lager / Ukesdigest).
   - `PushPreview` component: a lock-screen-style notification card (dark, app icon = logo-mark.svg, title "Prisvarsel: Sony WH-1000XM5", body "kr 2 990 hos Power — under målet ditt (kr 3 200)", timestamp) with a "Send testvarsel" button that slides it in fixed top-right (CSS animation, auto-dismiss 4s). Clicking it → `go('product',{id:'xm5'})`.
   - State lives in a `PushStore` (emit/sub pattern) so Alerts can show a nudge banner when push is off: "Få varslene på låseskjermen → Slå på push" (dismissable).
2. **Barcode scanner (new file `Scanner.jsx`).**
   - Header: `scan-line` icon button (both AppHeader and, if trivial, the results toolbar) → full-screen overlay: dark backdrop, CSS viewfinder (2px ink corners, animated `--green-500` scan line — pure CSS keyframes), helper copy "Sikt på strekkoden".
   - After ~1.6s fake detection: EAN mono readout flashes → resolves to a product (rotate through 3 demo EANs → xm5, airpods4, ps5) → **in-store compare card** slides up: product name, "I butikk: kr 3 490 (Elkjøp Storo)" vs "Beste nettpris: kr {best} hos {shop}" with the delta in `Delta` styling, buttons: "Se produktet" (`go('product')`), "Overvåk" (WatchStore.toggle + Toast), "Skann neste".
   - The in-store price: `best + 300…600` deterministic per product, so the scanner always demonstrates savings honestly (label it "eksempel" in a t-small footnote — this is a prototype).
   - Escape/click-outside closes. No real getUserMedia.
3. **Tweaks.** Section "Mobile" → TweakRadio "Scanner demo result": rotate / always xm5 (helps demos); reuse the existing "Install app (PWA)" section placement.
4. **Wire in.** `index.html`: `Push.jsx` + `Scanner.jsx` script lines (after PagesCore, before AppRouter). Keep index.html a thin loader.
5. **CSS** in `pages.css`: viewfinder, scan line, notification card, permission sheet. All animation CSS-only; respect the `no-anim` root class (animations tweak).

## Verify
Account → Notifications: opt-in flow runs, device row persists across navigation (store, not local state), test notification slides in and routes to PDP. Alerts shows the nudge only when push is off. Header scan button: viewfinder animates, three consecutive scans rotate products, compare card math is right, Overvåk adds to watchlist (check Alerts). `no-anim` tweak kills the animations. No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
