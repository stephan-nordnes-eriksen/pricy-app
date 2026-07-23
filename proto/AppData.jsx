// ===========================================================
// Pricy.no — App data layer (signed-in state)
// Depends on Primitives.jsx (PRODUCTS, SHOPS, CATEGORIES, fmt)
// ===========================================================

const USER = { name: 'Mari', initials: 'MH', email: 'mari@hansen.no', createdAt: '2026-03-14' };

// pick a subset of PRODUCTS, give each a target price + alert state
const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

// WATCHED — each has a target; some have just dropped below it (hit)
const WATCHED = [
  { ...byId.xm5,    target: 3100, hit: true,  delta: -8 },   // now below target → alert
  { ...byId.dyson,  target: 6000, hit: false, delta: -3 },
  { ...byId.tv,     target: 11500, hit: true, delta: -12 },  // below target → alert
  { ...byId.iphone, target: 8900, hit: false, delta: -2 },
  { ...byId.lego,   target: 400,  hit: false, delta: -5 },
].map(w => ({ ...w, spark: w.history.slice(-12) }));

// RECENTLY VIEWED
const RECENT = ['airpods', 'switch', 'kindle', 'iphone', 'dyson'].map(id => byId[id]);

// ALERT FEED — chronological activity
const FEED = [
  { id: 'xm5',    kind: 'down',  title: 'Sony WH-1000XM5', text: 'dropped to your target', from: 3290, to: 2999, time: '14 min ago', tag: 'Price drop' },
  { id: 'tv',     kind: 'down',  title: 'Samsung 55" OLED S90C', text: 'hit a new all-time low', from: 13990, to: 11990, time: '1 hr ago', tag: 'All-time low' },
  { id: 'dyson',  kind: 'watch', title: 'Dyson V15 Detect', text: 'is close to your target (kr 6 000)', from: 6790, to: 6490, time: '3 hr ago', tag: 'Watch' },
  { id: 'lego',   kind: 'down',  title: 'LEGO Icons Orchid', text: 'dropped 25% across 10 shops', from: 599, to: 449, time: 'Yesterday', tag: 'Price drop' },
  { id: 'iphone', kind: 'up',    title: 'iPhone 15 128GB', text: 'went up kr 200 at Elkjøp', from: 8990, to: 9190, time: 'Yesterday', tag: 'Price up' },
].map(f => ({ ...f, prod: byId[f.id] }));

// FACETS — per-category attribute filters for the Results screen.
// Read as window.FACETS at render time: the production boot layer
// replaces its contents from the server (same pattern as CATALOG/CATEGORIES).
const FACETS = {
  TV:     [ { key: 'size', label: 'Screen size', type: 'options', unit: '\u2033' },
            { key: 'panel', label: 'Panel', type: 'options' },
            { key: 'refresh', label: 'Refresh rate', type: 'options', unit: 'Hz' } ],
  Audio:  [ { key: 'anc', label: 'Noise cancelling', type: 'bool' },
            { key: 'fit', label: 'Fit', type: 'options' } ],
  Phones: [ { key: 'refresh', label: 'Refresh rate', type: 'options', unit: 'Hz' } ],
  Gaming: [ { key: 'type', label: 'Type', type: 'options' } ],
  Home:   [ { key: 'type', label: 'Type', type: 'options' } ],
};
const facetNorm = (v) => v == null ? undefined : typeof v === 'boolean' ? v : isFinite(parseFloat(v)) ? parseFloat(v) : String(v).trim();
// facet value of product p for key k — explicit p.facets wins, else the spec sheet,
// else (last resort) the product's own variant axis of that key: all option ids,
// numbers where every one parses (e.g. storage ['128','256','512'] → [128,256,512])
const fval = (p, k) => {
  const v = facetNorm((p.facets || {})[k] ?? ((window.SPECS || {})[p.id] || {})[k]);
  if (v !== undefined) return v;
  const axis = p.variants && p.variants.axes && p.variants.axes.find(a => a.id === k);
  if (!axis) return undefined;
  const ids = axis.options.map(o => o.id);
  return ids.every(id => isFinite(parseFloat(id))) ? ids.map(id => parseFloat(id)) : ids;
};
const fdisp = (v, def) => String(v) + (def && def.unit ? ' ' + def.unit : '');

// SEARCH SUGGESTIONS — products + categories + properties
const PROP_SUGGEST = ['Noise cancelling', 'Wireless', 'Over-ear', 'Under kr 3 000', 'In stock'];

const CAT_ICONS = {
  Audio: 'headphones', Phones: 'smartphone', TV: 'tv', Gaming: 'gamepad-2',
  Home: 'wind', Computers: 'laptop', Toys: 'blocks', 'E-readers': 'book-open', Kitchen: 'utensils-crossed',
};
const catCount = (c) => fmt((metaOf()?.cats?.[c]) ?? ((window.CAT_OF || {})[c] || []).length);
const realCats = () => CATEGORIES.filter(c => metaOf()?.cats ? metaOf().cats[c] : (!window.CAT_OF || window.CAT_OF[c]));

function searchSuggest(q) {
  const POOL = window.CATALOG || PRODUCTS;
  const REAL_CATS = CATEGORIES.filter(c => !window.CAT_OF || window.CAT_OF[c]);
  const s = (q || '').toLowerCase().trim();
  if (!s) return { products: POOL.slice(0, 4), cats: REAL_CATS.slice(0, 4), props: [] };
  const products = POOL.filter(p => (p.name + ' ' + p.brand + ' ' + p.cat).toLowerCase().includes(s)).slice(0, 5);
  const cats = REAL_CATS.filter(c => c.toLowerCase().includes(s)).slice(0, 3);
  const props = PROP_SUGGEST.filter(p => p.toLowerCase().includes(s)).slice(0, 4);
  return { products, cats, props };
}

// On small screens, bring the search field to the top on focus so the
// suggestion dropdown stays visible above the on-screen keyboard.
function searchScrollTop(e) {
  if (!window.matchMedia('(max-width: 640px)').matches) return;
  if (e.target.closest('.app-hdr, .hdr')) { if (window.scrollY > 2) window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const f = e.target.closest('.field'); if (!f) return;
  const top = f.getBoundingClientRect().top, want = 76;
  if (top - want > 12) window.scrollBy({ top: top - want, behavior: 'smooth' });
}

Object.assign(window, {
  USER, WATCHED, RECENT, FEED,
  FACETS, fval, fdisp,
  PROP_SUGGEST, CAT_ICONS, catCount, realCats, searchSuggest, byId, searchScrollTop,
  Wordmark, Mark,
});

// Inline logo (relative img src is unreliable in preview) ----
function Wordmark({ height = 28, reversed = false }) {
  const fg = reversed ? '#FFFFFF' : '#0E0E0E';
  return (
    <svg height={height} viewBox="0 0 260 92" fill="none" style={{ display: 'block' }} aria-label="pricy.no">
      <path d="M6 12 H140 V56" stroke="#00B964" strokeWidth="4" fill="none" strokeLinecap="square"></path>
      <rect x="134" y="56" width="12" height="12" fill="#00B964"></rect>
      <text x="2" y="72" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="52" letterSpacing="-1.5" fill={fg}>pricy</text>
      <text x="154" y="72" fontFamily="'JetBrains Mono', monospace" fontWeight="800" fontSize="34" fill={fg}>no</text>
    </svg>
  );
}
function Mark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ display: 'block' }} aria-label="pricy">
      <rect x="2" y="2" width="76" height="76" fill="#0E0E0E"></rect>
      <path d="M14 20 H55 V44" stroke="#00B964" strokeWidth="6" fill="none" strokeLinecap="square"></path>
      <rect x="48" y="44" width="14" height="14" fill="#00B964"></rect>
      <text x="14" y="58" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="52" fill="#FFFFFF">p</text>
    </svg>
  );
}
