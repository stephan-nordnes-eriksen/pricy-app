# PROMPT — Category-specific filters (hydrate FACETS for every category)

Most categories should have filters specific to what they sell: Televisions → screen size, Laptops → RAM, etc. Go through EACH category and add all likely filtering options, plus the product data that makes them render. No new UI — the filter rail, filter bar, chips, and sort menu are already data-driven from `FACETS`.

**Read before writing:** `CLAUDE.md`, then `pricy/AppData.jsx` (FACETS + fval/fdisp, ~lines 32–55), `pricy/Results.jsx` (CATALOG assembly ~lines 35–90; facetDefs/facetBase/filtering ~lines 590–760; FiltersBody/FilterBar), `pricy/Specs.jsx` (SPEC_KINDS, SPEC_KIND_BY_CAT, SPECS), `pricy/GpcData.jsx` (PRODMAP ~line 148, DEPTS, CLS_CAT), `pricy/Variants.jsx` (VARIANT_DEFS axes).

## How the system works (verified)
- `FACETS` (AppData.jsx) maps legacy cat → defs: `{ key, label, type: 'options'|'bool', unit? }`. Read at render as `window.FACETS`. Facet cat = `cat || brickToCat(brick)`; dept/search views show no spec facets (fine).
- `fval(p, key)`: `p.facets[key]` → `SPECS[p.id][key]` → variant axis `key` (all option ids; numeric if all parse). `facetNorm` runs `parseFloat` first — so SPECS strings like `'55″'`→55, `'120 Hz'`→120, `'8 GB unified'`→8 parse clean, but `'3840 × 2160'`→3840 (ugly) and `'6 h (30 h with case)'`→6. Prefer explicit `p.facets` with clean values (numbers, or short strings like `'OLED'`, `'iOS'`); they win over SPECS.
- **Options groups render only when the category pool has ≥2 distinct values for that key. Bool defs render UNCONDITIONALLY — a bool with no data filters everything out when clicked. Never ship a bool def without data on most rows of that cat.**
- Numeric options facets automatically become sort fields (specSorts) — a bonus, no work needed.
- Multi-value facets are allowed (arrays, e.g. storage [128,256,512] via variant axis fallback for iphone/s24/pixel8/mba/steamdeck — don't duplicate those in p.facets).

## Current state
- Categories (`CATEGORIES`, Primitives.jsx): Audio, Phones, TV, Gaming, Home, Computers, Toys, E-readers, Kitchen.
- Pools: Audio 8 (airpods, airpods4, xm5, bose-ultra, senn-m4, sonos-ace, jbl-tour2, beats-pro), Gaming 4 (switch, ps5, xbox, steamdeck), Phones 3 (iphone, s24, pixel8), TV 3 (tv=Samsung S90C 55″, lgc3 65″, bravia 65″), Home 3 (dyson stick, roborock robot, hue lighting), Computers 1 (mba), Toys 1 (lego), E-readers 1 (kindle), Kitchen 0 (cat hidden from browse until it has rows — `realCats()` filters on CAT_OF).
- Existing FACETS (replace wholesale): TV size/panel/refresh; Audio anc(bool)/fit; Phones refresh; Gaming type; Home type.
- CATALOG (Results.jsx) = 8 reused PRODUCTS (Primitives.jsx, merged with `_META[id]`) + `_NEW` rows. `_NEW` row shape: `{ id, name, brand, cat, icon, best, was, shops, rating, reviews, stock, nc, kw }` — offers/history generated. Add `facets:{}` to `_META` entries and `_NEW` rows.

## Tasks
1. **AppData.jsx — replace FACETS** with per-category defs (options unless noted):
   - TV: Screen size (unit '″'), Panel (OLED/QD-OLED/Mini-LED/LED), Refresh rate (Hz), Smart TV (webOS/Tizen/Google TV), Resolution (4K/8K); bool: Dolby Vision (key `dv`).
   - Audio: Type (key `fit`: Over-ear/In-ear/Speaker), Battery (h, key `battery`); bools: Noise cancelling (`anc`), Multipoint (`multi` — SPECS already has it), Wireless (`wireless`).
   - Phones: Storage (GB — variant axis gives it), Screen size (″, key `scr` — SPECS `size` parses to 6.1/6.2, usable), Refresh rate (Hz), RAM (GB), OS (iOS/Android); bool: 5G (`g5`, in SPECS).
   - Gaming: Type (Home console/Hybrid console/Handheld), Storage (GB), Max output (key `maxres`: 4K/1080p/800p); bool: Disc drive (`disc`, in SPECS).
   - Home: Type (Robot vacuum/Stick vacuum/Smart lighting/Air purifier), Runtime (min); bool: Mopping (`mop`).
   - Computers: RAM (GB), Storage (GB — axis for mba), Screen size (″), Chip (Apple M3/M4, Intel Core Ultra, AMD Ryzen, Snapdragon X), Type (Laptop/2-in-1/Gaming laptop).
   - Toys: Age (3+/6+/9+/18+ — keep strings), Pieces (numeric), Theme (Icons/Technic/City/Star Wars…).
   - E-readers: Screen size (″), Storage (GB); bools: Waterproof (`ipx`), Stylus support (`pen`).
   - Kitchen: Type (Espresso machine/Filter coffee/Air fryer/Kettle/Blender/Stand mixer), Capacity (L), Power (W).
   Note: `type`/`size` keys collide with SPECS strings like 'Hybrid console' (fine) and phone `size` '6.1″ OLED'→6.1 (fine) — but TV `size` '55″'→55 ✓. Where SPECS value is messy, override in p.facets.
2. **Results.jsx — facets on existing rows.** `_META` gains `facets` per id (tv: {size:55,panel:'QD-OLED',refresh:144,os:'Tizen',res:'4K',dv:false}, iphone: {scr:6.1,refresh:60,ram:6,os:'iOS',g5:true}, switch: {type:'Hybrid console',storage:64,maxres:'1080p'}, dyson: {type:'Stick vacuum',runtime:60,mop:false}, kindle: {scr:6.8,storage:16,ipx:true,pen:false}, lego: {age:'18+',pieces:608,theme:'Icons'}, airpods/xm5: {battery:.., wireless:true}). `_NEW` rows likewise (audio: battery 24/30/60/24 + wireless:true; ps5/xbox {type:'Home console',storage:1000,maxres:'4K',disc:true}; steamdeck {type:'Handheld',maxres:'800p',disc:false}; s24/pixel8 {scr:6.2,refresh:120,ram:8,os:'Android',g5:true}; lgc3/bravia panel OLED/Mini-LED, res '4K', dv:true, os webOS/Google TV; roborock {type:'Robot vacuum',runtime:180,mop:true}; hue {type:'Smart lighting'}; mba {ram:8,scr:13.6,chip:'Apple M3',type:'Laptop'}).
3. **Results.jsx — new `_NEW` products** (Norwegian market, kr prices, realistic was/shops/rating/reviews; every options axis needs ≥2 distinct values, every bool needs data on all rows of its cat):
   - Computers +5: MacBook Pro 14 M4, Dell XPS 13, Lenovo Yoga Slim 7x (Snapdragon X), ASUS ROG Zephyrus G14 (Gaming laptop), HP Spectre x360 (2-in-1). Vary ram 8/16/32, storage 256–1024, scr 13.3–16, chip families. icon 'laptop'.
   - Toys +4: LEGO Technic Porsche 911 (18+, Technic), LEGO Star Wars X-Wing (9+, Star Wars), LEGO City Fire Station (6+, City), BRIO World railway set (3+, BRIO — theme 'Wooden railway'). icon 'blocks'.
   - E-readers +3: Kobo Libra Colour (7″, 32GB, ipx:true, pen:true), Kindle Scribe (10.2″, 64GB, ipx:false, pen:true), Kobo Clara BW (6″, 16GB, ipx:true, pen:false). icon 'book-open'.
   - Kitchen +6: De'Longhi La Specialista (Espresso, 1450W), Sage Barista Express (Espresso), Moccamaster KBG 741 (Filter coffee, 1.25L, 1520W), Ninja Foodi MAX dual air fryer (Air fryer, 9.5L), Wilfa kettle (Kettle, 1.7L, 2200W), KitchenAid Artisan (Stand mixer, 4.8L, 300W). icon 'utensils-crossed'.
   - TV +3: LG OLED C4 48″ (OLED, 144Hz, webOS, dv:true), Samsung QN90D 75″ (Mini-LED aka 'Neo QLED' — use panel 'Mini-LED', Tizen, dv:false), TCL C805 55″ (Mini-LED, Google TV, dv:true, budget price). icon 'tv'.
   - Phones +2: iPhone 15 Pro Max (scr 6.7, 120Hz, ram 8, iOS), Samsung Galaxy A55 (scr 6.6, 120Hz, ram 8, Android, cheap). icon 'smartphone'. Give both `facets.storage` arrays or skip storage (no variant axes for them).
   - Gaming +2: Nintendo Switch Lite (Handheld, 32GB, maxres '720p'… use '800p' bucket? No — add '720p' value), ASUS ROG Ally X (Handheld, 1TB, '1080p', disc:false). icon 'gamepad-2'.
   - Home +3: Eufy X10 Pro Omni (Robot vacuum, mop:true, runtime 180), Samsung Jet 85 (Stick vacuum, mop:false, runtime 60), Philips 3000i (Air purifier — omit mop/runtime? No: bools must exist on all rows → mop:false, skip runtime is OK for options). icon 'wind'.
   Keep kw strings searchable (e.g. 'laptop pc windows', 'kaffemaskin espresso').
4. **GpcData.jsx — PRODMAP** entries for every new id: laptops '10001199', toys '10005120', ereaders '10001205', coffee '10002350', air fryer '10002356', kettle '10002359', blender+mixer '10002362', purifier '10002334', TVs '10001585', phones '10003269', consoles+handhelds '10005140', vacuums '10002330'. (CLS_CAT already maps 72020200→Kitchen etc.; dept pages use PRODMAP directly — without entries new rows are invisible in dept/brick views while visible in cat views.)
5. **Specs.jsx** — SPECS entries for new products using existing kinds (laptop/tv/phone/gaming/ereader/toy; vacuum via SPEC_KIND_OVERRIDE for eufy/jet85). Add a `kitchen` SPEC_KIND (groups: Format [type], Capacity [capacity, power], Body [weight]) + `SPEC_KIND_BY_CAT.Kitchen = 'kitchen'` + SPECS for the 6 kitchen rows. Philips purifier: add SPEC_KIND_OVERRIDE `'purifier'`? No — skip (specsFor returns null, panel hides; acceptable) unless cheap.
6. **Small checks:** `CAT_ICONS` already has all 9 cats incl. Kitchen ('utensils-crossed'). `PROP_SUGGEST` (AppData) could gain 'OLED', '120 Hz', 'Air fryer' — optional. Don't touch localStorage keys, filter UI components, or sort logic.

## Verify (per category)
Load `pricy/index.html`, log in / land on app, open each category's results (Audio, Phones, TV, Gaming, Home, Computers, Toys, E-readers, Kitchen — via search suggest or browse). Check: (a) the "<Cat> specs" cluster shows the new groups with counts, (b) clicking an option narrows results and a chip appears, (c) bools don't zero out any cat, (d) sort menu gained numeric spec fields (e.g. Screen size on TV, RAM on Computers), (e) Kitchen now appears in browse/categories, (f) no console errors. Then `ready_for_verification({path:'pricy/index.html'})`.
