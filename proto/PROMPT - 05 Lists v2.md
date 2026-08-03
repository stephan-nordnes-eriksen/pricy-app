# PROMPT — 05 Lists v2: multiple lists, sharing, gift mode

Closes G8 + G9 from `Competitive Gap Analysis.html`. Pricy has exactly one list (the watchlist); Prisjakt's named lists, shared wishlists with surprise-safe check-off, and collaboration are its quiet growth engine. Build lists as a layer OVER the watchlist without breaking alerts.

**Read before writing:** `CLAUDE.md`, then `pricy/PagesCore.jsx` (WatchStore — items `{id, target, paused, hit}`, `emit/sub`, `prod(id)`; keep its API untouched), `pricy/PagesAlerts.jsx` (Watching tab rows, undo pattern), `pricy/Results.jsx` (ResultRow save/bookmark handler `WatchStore.toggle`), `pricy/AppRouter.jsx`, `pricy/HomeSections.jsx` (home teaser patterns), `pricy/AppData.jsx` (WATCHED seed).

## How it works today (verified)
- WatchStore is the single list; ResultRow/PDP toggle straight into it; PagesAlerts renders it with target-price management. No grouping, naming, sharing, or collaborators anywhere.

## Tasks
1. **`ListStore` (new file `ListsData.jsx`, load right after PagesCore.jsx).**
   - Shape: `{ id, name, icon (lucide name), items: [prodId], shared: null | { role:'owner'|'member', people:[{name,initials}], gift: bool }, createdAt }`. Same emit/sub pattern as WatchStore.
   - Seed 3: "Overvåket" (system list mirroring WatchStore ids — computed, not stored), "Hytta 2026" (4 ids, shared with 2 people, gift:false), "Julegaver" (5 ids, shared, gift:true, some items marked bought).
   - Bought state for gift lists: `bought: { [prodId]: { by:'?', at } }` — the OWNER's view must never show `by`; the member view shows names. Model both, render by role.
   - API: `create(name)`, `rename`, `remove`, `addTo(listId, prodId)`, `removeFrom`, `markBought(listId, prodId, byName)`, `share(listId)`, `setGift(listId, v)`.
2. **Route `lists` (new file `PagesLists.jsx`).**
   - Index view: list cards (icon, name, n items, total best-price sum in mono, avatar stack when shared, GIFT tag) + "Ny liste" card. The system watch-list card deep-links to `alerts` instead.
   - Detail view (`params.id`): rows reuse the Alerts row anatomy (ProdImg, name, best price, Delta) minus target-price controls; per-row ✕ remove; header actions: rename (inline input), Del (share modal), gift-mode Toggle, "Optimaliser kjøpet →" stub linking `go('optimizer')` if that route exists, else hidden.
   - **Share modal:** fake link `pricy.no/l/h7k2f` with copy button (Toast), invited-people rows, role note. **View-as toggle** (owner ⇄ "Se som mottaker") — the demo moment: owner sees "2 av 5 kjøpt" with items greyed but anonymous; recipient view shows check-off buttons and who bought what. Gift copy: "Overraskelsen er trygg — eieren ser ikke hvem som har kjøpt hva."
3. **Save-to-list popover.** Everywhere the bookmark/save action exists (ResultRow, ResultRowCompact, ResultCard, PDP watch box): first click still toggles watch (unchanged behavior), but add a small chevron/long-press affordance opening "Lagre i liste…" popover — checkboxes per list + "Ny liste". Keep the quick path identical so existing flows don't regress.
4. **Wire in.** `index.html` script lines (ListsData after PagesCore; PagesLists with the other pages). Router: route `lists` (+ `params.id`), Tweaks Screen option "Lists", Footer link. PagesAlerts header gains a quiet link "Alle lister →". HomeSections: swap or add one teaser card for "Julegaver" (n bought / total).
5. **CSS** in `pages.css`: list cards, avatar stack (initials in square chips), bought-row treatment (strike + `--canvas-2`), share modal. Brutalist kit throughout; no emoji.

## Verify
Lists index from Tweaks: 3 cards + create flow works (new list appears, rename sticks). Julegaver detail: gift toggle on → owner view anonymizes buyers; view-as-recipient shows names + check-off updates counts live. Share modal copy button fires Toast. Save-popover from a results row adds to "Hytta 2026" without touching watch state (Alerts unchanged). Watch quick-toggle still works everywhere. No console errors, then `ready_for_verification({path:'pricy/index.html'})`.
