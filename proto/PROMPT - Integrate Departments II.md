# Prompt: integrate "Departments II" into the Pricy prototype

Copy everything below into a fresh conversation.

---

Integrate the winning category-system variation — **Departments II** — into the main Pricy prototype, replacing the current Browse categories page. The variation lives in the exploration page `pricy/Category System Explorations.html` (tab 03, `#departments2`), implemented as `DeptAccVar` in `pricy/cats/CatsVar4.jsx`.

**What the variation is:** shopper-facing departments over the GS1 GPC standard. ~9 curated departments, each a saved set of GPC bricks (cross-segment, some sliced by attribute, e.g. Gaming Headsets = Headphones where Use = Gaming). A card grid; clicking a card expands a full-width panel directly below that card's row (`grid-auto-flow: dense` backfills, the open card inverts to ink-900 with a notch pointing into its panel) listing every sub-category as tiles with counts. Every product's EAN resolves to exactly one brick; departments are an editorial mapping on top.

**Read before writing:** `CLAUDE.md`, `pricy/cats/CatsVar4.jsx`, `pricy/cats/CatsData.jsx` (GPC tree, DEPTS, brickBy, PRODMAP, INBOX, helpers), `pricy/cats/cats.css`, then the app: `pricy/index.html`, `pricy/PagesBrowse.jsx`, `pricy/AppRouter.jsx`, `pricy/AppData.jsx` (FACETS, searchSuggest, CAT_ICONS, realCats), `pricy/Results.jsx`, `pricy/Primitives.jsx` (PRODUCTS, CATEGORIES).

**Task:**
1. Move the data layer into the app: new `pricy/GpcData.jsx` (copy/adapt from `cats/CatsData.jsx` — GPC, DEPTS, brickBy, brickPath, PRODMAP, samplesOf, helpers), loaded from `index.html` after `Primitives.jsx`, before `AppData.jsx`. Keep the `Object.assign(window, …)` export pattern.
2. Rebuild `BrowsePage` in `pricy/PagesBrowse.jsx` on the Departments II layout: department card grid with quick sub-category chips + expand-below-own-row panel. This is the consumer page, so drop the exploration's ops framing: no statband, no "bricks awaiting mapping" inbox, no "Show GPC codes" toggle. Keep the existing browse subheader (products · shops · updated) and keep/retire the "Biggest drops" and "Popular" sections at your judgment — the page should not get longer than today.
3. Wire real navigation: department "All {name}" → `go('results', …)` scoped to the department; sub-category tile → results scoped to that brick. Products currently carry legacy `p.cat` strings — bridge via `PRODMAP` (EAN→brick for the 8 demo products) plus a brick→legacy-cat fallback so Results always shows something sensible (e.g. Vacuum Cleaners → Dyson V15; Televisions → the Samsung OLED). Extend Results minimally; don't rebuild it.
4. Styles: copy only the rules the new page uses from `pricy/cats/cats.css` into `pricy/pages.css` (or a new `browse.css` linked from `index.html`): `.dgrid`/`.dcard` incl. `.is-x` + notch, `.dxp`, `.subgrid`, `.subtile`, `.mchip`, `.dcard__chev`. Don't import the `cx-` exploration-shell styles.
5. Update `searchSuggest` in `AppData.jsx` so category suggestions come from departments and bricks (bricks have Norwegian/English `syn` arrays) instead of the old flat `CATEGORIES`.
6. Keep untouched: `pricy/cats/*` and `pricy/Category System Explorations.html` (reference material), all other pages, the header/nav and the `browse` route name.

**Rules (from CLAUDE.md):** `index.html` stays a thin loader — only add `<script>`/`<link>` lines in the right order; solve layout/state with HTML+CSS where possible; keep files well under 1000 lines; new components get their own split file.

**Acceptance:** signed-in → Browse shows the departments grid; expanding Kitchen reveals its sub-categories across 2 GPC segments; clicking Vacuum Cleaners lands on Results with the Dyson V15; department counts are consistent with what Results shows; search suggests "Headphones / Earphones" for "hodetelefoner"; every other page still works; no console errors.

**Caveats to preserve in code comments:** brick codes are illustrative until the real GS1 import; department mapping is editorial data that will come from the server (same pattern as CATALOG/CATEGORIES).
