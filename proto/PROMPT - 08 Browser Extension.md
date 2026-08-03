# PROMPT — 08 Browser extension (concept exploration)

Closes G3 (+ G17 coupon angle) from `Competitive Gap Analysis.html`. Pricy on every shop's product page: history, best-price check, watch button, coupon hint — meeting shoppers where they already are. This is a CONCEPT EXPLORATION, not an app feature: build it as a standalone canvas document like `Logo Explorations.html`, NOT wired into `index.html`.

**Read before writing:** `CLAUDE.md`, then `pricy/Plus Benefit Explorations.html` (the exploration-doc convention: `<meta name="design_doc_mode" content="canvas">`, absolutely-positioned `.frame` cards, local `colors_and_type.css`, lucide script, frame head with mono number chips), `pricy/colors_and_type.css` (tokens), `pricy/assets/logo-mark.svg` + `logo-wordmark.svg`, `pricy/Primitives.jsx` (Sparkline/HistoryChart shapes worth imitating in static SVG — the exploration is static HTML/CSS, no React).

## Deliverable
`pricy/Extension Explorations.html` — one canvas doc, 5 frames. Static HTML + CSS only (per CLAUDE.md, no JS beyond `lucide.createIcons()`), realistic Norwegian content, xm5/Sony WH-1000XM5 as the running example (kr 2 990 best / kr 3 490 at the host shop).

## Frames
1. **F1 · Content-script price bar (the hero).** A generic host shop PDP mock (neutral gray chrome, fake "TechShop.no" — do NOT imitate a real retailer's trade dress: generic header, product title, price kr 3 490, buy button) with the Pricy bar injected below the price: logo-mark, "kr 500 billigere hos Power — kr 2 990", 30-day static sparkline (inline SVG polyline, `--green-500`), DealBadge-style verdict chip ("Reell rabatt"), `Watch`-style button, collapse caret. Annotate placement with a `frame__note`.
2. **F2 · Toolbar popup.** 360×~480 popup: header (wordmark + gear), current-page product summary (name, host price vs best price delta), mini history chart (static stepped SVG), watch toggle row, "Åpne i Pricy →", footer with watchlist snapshot (3 rows: name + mono price + Delta arrows). This is the extension's home surface.
3. **F3 · Price-drop notification.** OS-level notification card (macOS style, neutral): logo-mark, "Prisvarsel — Sony WH-1000XM5", "kr 2 990 hos Power · under målet ditt", two actions (Se tilbud / Pause). Note: mirrors the app's push (PROMPT 04) — same voice, same anatomy.
4. **F4 · Coupon moment (G17).** Checkout-page mock (same generic shop) with a compact Pricy toast bottom-right: "Fant 1 rabattkode — PRICY10 (−10%)" with Prøv/Avvis buttons and a fine-print honesty line ("Koder testes før vi foreslår dem — døde koder foreslås aldri"). A `frame__note` should flag the trust risk from the analysis (dead codes erode trust → only verified codes).
5. **F5 · States & guardrails.** A 2×3 mini-grid of the price bar's edge states: cheapest already (bar turns confirmation: "Beste pris — slå til"), unknown product (quiet "Søk på Pricy" pill), price higher elsewhere ("Du ser laveste pris"), signed-out, collapsed chip, and a "not now" opt-out menu (per-site mute). Notes on when the bar must shut up — the anti-Honey stance.

## Layout & voice
Frames absolutely positioned in a loose 2-col arrangement (~680px wide each, F1 wider ~900px), numbered chips `01`–`05` in `.frame__head` like Plus Benefit Explorations. Copy in Norwegian, terse. All chrome brutalist: 2–3px ink borders, hard shadows, mono labels, square corners. Add the standard `a`/`a:hover` link colors. No screenshots of real sites, no real retailer names/logos.

## Verify
Open `pricy/Extension Explorations.html`: five frames render on the canvas, lucide icons resolve, sparklines/step charts are legible at 100%, no horizontal collisions between frames, copy fits without overflow. Then `ready_for_verification({path:'pricy/Extension Explorations.html'})`.
