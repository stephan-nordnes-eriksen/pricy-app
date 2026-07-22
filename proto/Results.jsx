// ===========================================================
// Pricy.no — Product Search Results + Comparison (PDP)
// Depends on: Primitives (PRODUCTS, SHOPS, fmt, Icon, Price, Tag,
//   Delta, Btn, HistoryChart), AppData (CAT_ICONS), AppHeader,
//   HomeSections (DrawSpark, PriceTag)
// ===========================================================

// ---- deterministic offer + history generators -------------
function _seed(n) { let x = Math.sin(n * 99.13) * 43758.5453; return x - Math.floor(x); }
function genOffers(p) {
  const n = Math.min(p.shops, SHOPS.length);
  const offers = SHOPS.slice(0, n).map((s, i) => ({
    shop: s,
    price: p.best + Math.round((i * (p.best * 0.035) + (i === 0 ? 0 : 40 + _seed(p.idn + i) * 120)) / 10) * 10,
    ship: i % 3 === 0 ? 'Free shipping' : 'kr 79 shipping',
    stock: i % 5 === 4 ? undefined : i % 4 !== 3, // undefined = never checked → unknown
    eta: i % 2 === 0 ? 'In stock' : '2–4 days',
    url: i % 4 !== 3 ? 'https://www.' + s.toLowerCase().replace(/[^a-z0-9]/g, '') + '.no' : undefined,
    updated_at: i % 5 === 4 ? undefined : Date.now() - Math.round(5 + _seed(p.idn + i * 7) * 170) * 60000,
  })).sort((a, b) => a.price - b.price);
  offers[0].price = p.best;
  return offers;
}
function genHist(idn, base) {
  const vol = base * 0.06, pts = [];
  let v = base * 1.32;
  for (let i = 0; i < 24; i++) { v += Math.sin(i * 0.9) * vol + (_seed(idn * 7 + i) - 0.55) * vol; v = Math.max(base, v); pts.push(Math.round(v / 10) * 10); }
  pts[pts.length - 1] = base;
  return pts;
}

// ---- expanded catalog (search corpus) ---------------------
// real PRODUCTS get reused (they already carry offers/history);
// new listings are generated. rating/stock/nc metadata for all.
const _META = {
  airpods: { rating: 4.6, reviews: 2140, nc: true },
  xm5:     { rating: 4.7, reviews: 3380, nc: true },
  switch:  { rating: 4.8, reviews: 5120, nc: false },
  dyson:   { rating: 4.5, reviews: 1890, nc: false },
  iphone:  { rating: 4.7, reviews: 6210, nc: false },
  tv:      { rating: 4.6, reviews: 940,  nc: false },
  kindle:  { rating: 4.5, reviews: 2030, nc: false },
  lego:    { rating: 4.9, reviews: 880,  nc: false },
};
const _NEW = [
  // AUDIO — the canonical results set
  { id: 'bose-ultra', name: 'Bose QuietComfort Ultra', brand: 'Bose', cat: 'Audio', icon: 'headphones', best: 3490, was: 3990, shops: 8, rating: 4.7, reviews: 1620, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling' },
  { id: 'senn-m4', name: 'Sennheiser Momentum 4', brand: 'Sennheiser', cat: 'Audio', icon: 'headphones', best: 2790, was: 3490, shops: 7, rating: 4.6, reviews: 980, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling' },
  { id: 'sonos-ace', name: 'Sonos Ace', brand: 'Sonos', cat: 'Audio', icon: 'headphones', best: 4290, was: 4990, shops: 5, rating: 4.5, reviews: 410, stock: false, nc: true, kw: 'headphones wireless over-ear noise cancelling' },
  { id: 'jbl-tour2', name: 'JBL Tour One M2', brand: 'JBL', cat: 'Audio', icon: 'headphones', best: 1990, was: 2790, shops: 6, rating: 4.3, reviews: 720, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling' },
  { id: 'airpods4', name: 'AirPods 4 (ANC)', brand: 'Apple', cat: 'Audio', icon: 'headphones', best: 1690, was: 1990, shops: 10, rating: 4.6, reviews: 1340, stock: true, nc: true, kw: 'headphones wireless earbuds noise cancelling' },
  { id: 'beats-pro', name: 'Beats Studio Pro', brand: 'Beats', cat: 'Audio', icon: 'headphones', best: 2290, was: 2990, shops: 7, rating: 4.2, reviews: 560, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling' },
  // GAMING
  { id: 'ps5', name: 'PlayStation 5 Slim', brand: 'Sony', cat: 'Gaming', icon: 'gamepad-2', best: 5990, was: 6990, shops: 9, rating: 4.8, reviews: 4100, stock: true, nc: false, kw: 'console gaming ps5' },
  { id: 'xbox', name: 'Xbox Series X', brand: 'Microsoft', cat: 'Gaming', icon: 'gamepad-2', best: 5490, was: 6490, shops: 7, rating: 4.7, reviews: 2300, stock: true, nc: false, kw: 'console gaming xbox' },
  { id: 'steamdeck', name: 'Steam Deck OLED', brand: 'Valve', cat: 'Gaming', icon: 'gamepad-2', best: 6490, was: 6990, shops: 4, rating: 4.6, reviews: 880, stock: false, nc: false, kw: 'handheld gaming steam deck 512gb 1tb' },
  // PHONES
  { id: 's24', name: 'Samsung Galaxy S24', brand: 'Samsung', cat: 'Phones', icon: 'smartphone', best: 8490, was: 10990, shops: 11, rating: 4.6, reviews: 1980, stock: true, nc: false, kw: 'phone android samsung 128gb 256gb 512gb' },
  { id: 'pixel8', name: 'Google Pixel 8', brand: 'Google', cat: 'Phones', icon: 'smartphone', best: 6490, was: 7990, shops: 7, rating: 4.5, reviews: 1120, stock: true, nc: false, kw: 'phone android pixel 128gb 256gb' },
  // TV
  { id: 'lgc3', name: 'LG OLED C3 65"', brand: 'LG', cat: 'TV', icon: 'tv', best: 13990, was: 18990, shops: 6, rating: 4.8, reviews: 760, stock: true, nc: false, kw: 'tv oled lg' },
  { id: 'bravia', name: 'Sony Bravia 9 65"', brand: 'Sony', cat: 'TV', icon: 'tv', best: 19990, was: 23990, shops: 5, rating: 4.7, reviews: 230, stock: true, nc: false, kw: 'tv mini-led sony' },
  // HOME
  { id: 'roborock', name: 'Roborock S8 Pro Ultra', brand: 'Roborock', cat: 'Home', icon: 'wind', best: 7990, was: 9990, shops: 6, rating: 4.6, reviews: 540, stock: true, nc: false, kw: 'robot vacuum home' },
  { id: 'hue', name: 'Philips Hue Starter Kit', brand: 'Philips', cat: 'Home', icon: 'wind', best: 1290, was: 1690, shops: 8, rating: 4.4, reviews: 1310, stock: true, nc: false, kw: 'smart home lighting' },
  // COMPUTERS
  { id: 'mba', name: 'MacBook Air 13" M3', brand: 'Apple', cat: 'Computers', icon: 'laptop', best: 12990, was: 14990, shops: 9, rating: 4.8, reviews: 1640, stock: true, nc: false, kw: 'laptop computer apple macbook' },
];

let _idn = 1;
const CATALOG = [
  // reused real products, enriched
  ...PRODUCTS.filter(p => _META[p.id]).map(p => ({ ...p, ...(_META[p.id]), stock: true, kw: (p.cat + ' ' + p.brand).toLowerCase() })),
  // new generated listings
  ..._NEW.map(p => {
    const drop = Math.round(((p.was - p.best) / p.was) * 100);
    const o = { ...p, drop, idn: _idn++ };
    o.offers = genOffers(o);
    o.history = genHist(o.idn, o.best);
    return o;
  }),
];
// attach variation axes (same product page, selectable variants)
if (window.VARIANT_DEFS) CATALOG.forEach(p => { if (VARIANT_DEFS[p.id]) p.variants = VARIANT_DEFS[p.id]; });
const CAT_OF = {};
CATALOG.forEach(p => { (CAT_OF[p.cat] = CAT_OF[p.cat] || []).push(p); });
// real, derived counts — all "N products / M shops" copy reads from this
CATALOG.meta = { products: CATALOG.length, shops: [...new Set(CATALOG.flatMap(p => (p.offers || []).map(o => o.shop)))].length, freshest: Date.now() - 14 * 60 * 1000 };
const ALL_BRANDS = (cat) => [...new Set(CATALOG.filter(p => !cat || p.cat === cat).map(p => p.brand))].sort();
function getListing(id) { return CATALOG.find(p => p.id === id); }

function searchCatalog({ query, cat }) {
  if (cat) return CATALOG.filter(p => p.cat === cat);
  const q = (query || '').toLowerCase().trim();
  if (!q) return CATALOG.slice();
  const toks = q.split(/\s+/).filter(t => t.length >= 2);
  return CATALOG.filter(p => {
    const hay = (p.name + ' ' + p.brand + ' ' + p.cat + ' ' + (p.kw || '')).toLowerCase();
    return toks.some(t => hay.includes(t));
  });
}

// ---- small UI bits ----------------------------------------
function Stars({ rating, reviews }) {
  if (!rating) return <span className="stars"><span className="stars__n">No reviews yet</span></span>;
  const full = Math.round(rating);
  return (
    <span className="stars" title={rating + ' / 5'}>
      <span className="stars__ic">{'★★★★★'.slice(0, full)}<span className="stars__off">{'★★★★★'.slice(full)}</span></span>
      <b>{rating.toFixed(1)}</b>{reviews != null && <span className="stars__n">({fmt(reviews)})</span>}
    </span>
  );
}
function Spark({ points, hit }) {
  const D = window.DrawSpark;
  return D
    ? <D points={points} w={132} h={36} color={hit ? 'var(--green-500)' : 'var(--ink-900)'} draw={false} />
    : <Sparkline points={points} w={132} h={36} color={hit ? 'var(--green-500)' : 'var(--ink-900)'} />;
}

// ---- result row (details view) ----------------------------
function ResultRow({ p, go, spark, saved, onSave }) {
  return (
    <div className="rrow" onClick={() => go('product', { id: p.id })}>
      <div className="rrow__img"><ProdImg p={p} fill size={34} /></div>
      <div className="rrow__main">
        <div className="rrow__brand">{p.brand}</div>
        <div className="rrow__name">{p.name}</div>
        <div className="rrow__metarow">
          <Stars rating={p.rating} reviews={p.reviews} />
          {p.nc && <span className="rrow__feat">Noise cancelling</span>}
          <StockBadge state={p.stock ? 'in' : 'back'} />
          <VariantHint p={p} />
        </div>
      </div>
      {spark && <div className="rrow__spark">{p.history && p.history.length ? <Spark points={p.history} /> : null}</div>}
      <div className="rrow__price">
        {p.best != null ? (<>
          {p.drop >= 12 && <span className="rrow__drop"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
          <div className="rrow__from">from</div>
          <Price value={p.best} size={24} />
          <div className="rrow__shops">{p.shops} shops →</div>
        </>) : <div className="no-offers">No offers yet</div>}
      </div>
      <div className="rrow__acts">
        <button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}>
          <Icon name="bookmark" size={17} />
        </button>
        <CompareBtn p={p} />
      </div>
    </div>
  );
}

// ---- result row (compact view) ----------------------------
function ResultRowCompact({ p, go, saved, onSave }) {
  return (
    <div className="crow" onClick={() => go('product', { id: p.id })}>
      <div className="crow__img"><ProdImg p={p} fill size={18} /></div>
      <span className="crow__brand">{p.brand}</span>
      <span className="crow__name">{p.name}</span>
      <span className="crow__drop">{p.drop >= 12 ? <>▼ −{p.drop}%</> : null}</span>
      <span className="crow__meta">{p.rating ? '★ ' + p.rating.toFixed(1) : 'No reviews yet'}</span>
      <span className="crow__meta">{p.shops} shops</span>
      <span className="crow__price"><Price value={p.best} size={15} /></span>
      <button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}><Icon name="bookmark" size={14} /></button>
      <CompareBtn p={p} className="crow__cmp" />
    </div>
  );
}

// ---- result card (grid view) ------------------------------
function ResultCard({ p, go }) {
  return (
    <div className="pcard" onClick={() => go('product', { id: p.id })}>
      {p.drop >= 12 && <span className="pcard__tag"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
      <CompareBtn p={p} className="pcard__cmp" />
      <div className="pcard__img"><ProdImg p={p} fill size={42} /></div>
      <div className="pcard__name">{p.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px', flexWrap: 'wrap' }}><Stars rating={p.rating} /><VariantHint p={p} /></div>
      <div className="pcard__foot">
        <div>
          {p.best != null ? (<><div className="pcard__from">from</div><Price value={p.best} size={20} /></>) : <div className="no-offers">No offers yet</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pcard__meta">{p.shops} shops</div>
        </div>
      </div>
    </div>
  );
}


// ---- filters rail -----------------------------------------
function Check({ on, label, count, onClick }) {
  return (
    <div className={'check' + (on ? ' is-on' : '')} onClick={onClick}>
      <span className="box"><Icon name="check" size={13} /></span>
      <span>{label}</span>
      {count != null && <span className="ct">{count}</span>}
    </div>
  );
}

function FiltersBody({ f, set, base, go, facetDefs, facetBase, setFacet, setBoolFacet }) {
  const brands = base.brands; // brands present in the active result set
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  return (
    <>
      <div className="filters__grp">
        <h4>Category</h4>
        <div className="catlist">
          {CATEGORIES.filter(c => metaOf()?.cats ? metaOf().cats[c] : CAT_OF[c]).map(c => (
            <div key={c} className={'catlink' + (base.cat === c ? ' is-on' : '')} onClick={() => go('results', { cat: c })}>
              <span className="catlink__ic"><Icon name={CAT_ICONS[c] || 'tag'} size={15} /></span>
              <span>{c}</span><span className="ct">{(metaOf()?.cats?.[c]) ?? CAT_OF[c].length}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="filters__grp">
        <h4>Brand</h4>
        {brands.map(b => <Check key={b} on={f.brands.includes(b)} label={b} count={base.byBrand[b] || 0} onClick={() => setBrand(b)} />)}
      </div>
      {facetDefs.filter(d => d.type === 'options' && ((facetBase[d.key] || {}).vals || []).length >= 2).map(def => (
        <div key={def.key} className="filters__grp">
          <h4>{def.label}</h4>
          {facetBase[def.key].vals.map(v => <Check key={String(v)} on={(f.facets[def.key] || []).includes(v)} label={fdisp(v, def)} count={facetBase[def.key].counts.get(v)} onClick={() => setFacet(def.key, v)} />)}
        </div>
      ))}
      <div className="filters__grp">
        <h4>Price (kr)</h4>
        <div className="pricefields">
          <input type="number" placeholder={String(base.min)} value={f.min} onChange={e => set('min', e.target.value)} />
          <span className="pricefields__d">–</span>
          <input type="number" placeholder={String(base.max)} value={f.max} onChange={e => set('max', e.target.value)} />
        </div>
        <input className="range" type="range" min={base.min} max={base.max} value={f.max || base.max} onChange={e => set('max', e.target.value)} />
        <div className="pricefields__lbl"><span>kr {fmt(base.min)}</span><span>kr {fmt(base.max)}</span></div>
      </div>
      <div className="filters__grp">
        <h4>Rating</h4>
        {[4.5, 4, 3.5].map(r => (
          <div key={r} className={'ropt' + (f.rating === r ? ' is-on' : '')} onClick={() => set('rating', f.rating === r ? 0 : r)}>
            <span className="ropt__stars">{'★★★★★'.slice(0, Math.round(r))}<span className="stars__off">{'★★★★★'.slice(Math.round(r))}</span></span>
            <span>{r.toFixed(1)} & up</span>
          </div>
        ))}
      </div>
      <div className="filters__grp">
        <h4>Show only</h4>
        <Check on={f.sale} label="On sale" onClick={() => set('sale', !f.sale)} />
        <Check on={f.instock} label="In stock" onClick={() => set('instock', !f.instock)} />
        {facetDefs.filter(d => d.type === 'bool').map(def => <Check key={def.key} on={!!f.facets[def.key]} label={def.label} onClick={() => setBoolFacet(def.key)} />)}
      </div>
    </>
  );
}

// ---- top filter bar (dropdown variant) --------------------
function Dropdown({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="fdrop" ref={ref}>
      <button className={'fdrop__btn' + (active ? ' is-on' : '') + (open ? ' is-open' : '')} onClick={() => setOpen(o => !o)}>
        {label}<Icon name="chevron-down" size={14} />
      </button>
      {open && <div className="fdrop__menu">{children}</div>}
    </div>
  );
}

function FilterBar({ f, set, base, go, baseSel, facetDefs, facetBase, setFacet, setBoolFacet }) {
  const brands = base.brands;
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  return (
    <div className="filterbar">
      <Dropdown label={baseSel.cat ? 'Category · ' + baseSel.cat : 'Category'} active={!!baseSel.cat}>
        {CATEGORIES.filter(c => metaOf()?.cats ? metaOf().cats[c] : CAT_OF[c]).map(c => (
          <div key={c} className={'fmenu__item' + (baseSel.cat === c ? ' is-on' : '')} onClick={() => go('results', { cat: c })}>
            <Icon name={CAT_ICONS[c] || 'tag'} size={15} /><span>{c}</span><span className="ct">{(metaOf()?.cats?.[c]) ?? CAT_OF[c].length}</span>
          </div>
        ))}
      </Dropdown>
      <Dropdown label={f.brands.length ? 'Brand · ' + f.brands.length : 'Brand'} active={!!f.brands.length}>
        {brands.map(b => <Check key={b} on={f.brands.includes(b)} label={b} count={base.byBrand[b] || 0} onClick={() => setBrand(b)} />)}
      </Dropdown>
      <Dropdown label={(f.min || f.max) ? 'Price · set' : 'Price'} active={!!(f.min || f.max)}>
        <div style={{ padding: '4px 2px', minWidth: 200 }}>
          <div className="pricefields">
            <input type="number" placeholder={String(base.min)} value={f.min} onChange={e => set('min', e.target.value)} />
            <span className="pricefields__d">–</span>
            <input type="number" placeholder={String(base.max)} value={f.max} onChange={e => set('max', e.target.value)} />
          </div>
          <input className="range" type="range" min={base.min} max={base.max} value={f.max || base.max} onChange={e => set('max', e.target.value)} />
        </div>
      </Dropdown>
      <Dropdown label={f.rating ? 'Rating · ' + f.rating + '+' : 'Rating'} active={!!f.rating}>
        {[4.5, 4, 3.5].map(r => (
          <div key={r} className={'fmenu__item' + (f.rating === r ? ' is-on' : '')} onClick={() => set('rating', f.rating === r ? 0 : r)}>
            <span className="ropt__stars">{'★★★★★'.slice(0, Math.round(r))}<span className="stars__off">{'★★★★★'.slice(Math.round(r))}</span></span><span>{r.toFixed(1)} & up</span>
          </div>
        ))}
      </Dropdown>
      {facetDefs.filter(d => d.type === 'options' && ((facetBase[d.key] || {}).vals || []).length >= 2).map(def => {
        const sel = f.facets[def.key] || [];
        return (
          <Dropdown key={def.key} label={sel.length ? def.label + ' \u00b7 ' + sel.length : def.label} active={!!sel.length}>
            {facetBase[def.key].vals.map(v => <Check key={String(v)} on={sel.includes(v)} label={fdisp(v, def)} count={facetBase[def.key].counts.get(v)} onClick={() => setFacet(def.key, v)} />)}
          </Dropdown>
        );
      })}
      <span className="filterbar__sep" />
      <button className={'fpill' + (f.sale ? ' is-on' : '')} onClick={() => set('sale', !f.sale)}>On sale</button>
      <button className={'fpill' + (f.instock ? ' is-on' : '')} onClick={() => set('instock', !f.instock)}>In stock</button>
      {facetDefs.filter(d => d.type === 'bool').map(def => <button key={def.key} className={'fpill' + (f.facets[def.key] ? ' is-on' : '')} onClick={() => setBoolFacet(def.key)}>{def.label}</button>)}
    </div>
  );
}

const VIEWS = [
  { id: 'grid', icon: 'layout-grid', label: 'Grid' },
  { id: 'details', icon: 'layout-list', label: 'Details' },
  { id: 'compact', icon: 'align-justify', label: 'Compact' },
];

const SORTS = [
  { id: 'best', label: 'Best price', fn: (a, b) => (a.best || 9e15) - (b.best || 9e15) },
  { id: 'drop', label: 'Biggest drop', fn: (a, b) => (b.drop || 0) - (a.drop || 0) },
  { id: 'shops', label: 'Most shops', fn: (a, b) => b.shops - a.shops },
  { id: 'rating', label: 'Top rated', fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
];

// ===========================================================
// RESULTS SCREEN
// ===========================================================
const emptyFilters = () => ({ brands: [], min: '', max: '', rating: 0, sale: false, instock: false, facets: {} });
function Results({ go, query, cat, filterLayout = 'rail', density = 'comfy', sparklines = true }) {
  const [view, _setView] = useState(() => { try { const v = localStorage.getItem('pricy.view'); return v && v !== 'list' ? v : 'details'; } catch (e) { return 'details'; } });
  const setView = (v) => { _setView(v); try { localStorage.setItem('pricy.view', v); } catch (e) {} window.scrollTo(0, 0); };
  const baseSel = { query, cat };
  const baseResults = useMemo(() => searchCatalog(baseSel), [query, cat]);
  const [sort, setSort] = useState('best');
  const [f, setF] = useState(emptyFilters);
  useWatchStore();
  // reset filters when the search changes
  useEffect(() => { setF(emptyFilters()); }, [query, cat]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  // data-driven per-category facets (window.FACETS is replaced by the boot layer)
  const facetDefs = cat ? ((window.FACETS || {})[cat] || []) : [];
  const facetBase = useMemo(() => {
    const m = {};
    facetDefs.forEach(def => {
      if (def.type !== 'options') return;
      const counts = new Map();
      baseResults.forEach(p => { const v = fval(p, def.key); if (v !== undefined) counts.set(v, (counts.get(v) || 0) + 1); });
      const vals = [...counts.keys()].sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'number' ? -1 : typeof b === 'number' ? 1 : String(a).localeCompare(String(b)));
      m[def.key] = { vals, counts };
    });
    return m;
  }, [baseResults, cat]);
  const setFacet = (key, v) => setF(prev => { const cur = prev.facets[key] || []; const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]; const fac = { ...prev.facets }; if (next.length) fac[key] = next; else delete fac[key]; return { ...prev, facets: fac }; });
  const setBoolFacet = (key) => setF(prev => { const fac = { ...prev.facets }; if (fac[key]) delete fac[key]; else fac[key] = true; return { ...prev, facets: fac }; });

  const prices = baseResults.map(p => p.best).filter(n => n != null && isFinite(n));
  const base = {
    min: prices.length ? Math.floor(Math.min(...prices) / 100) * 100 : 0,
    max: prices.length ? Math.ceil(Math.max(...prices) / 100) * 100 : 1000,
    cat,
    byBrand: baseResults.reduce((m, p) => ((m[p.brand] = (m[p.brand] || 0) + 1), m), {}),
  };
  base.brands = Object.keys(base.byBrand).sort();

  let list = baseResults.filter(p => {
    if (f.brands.length && !f.brands.includes(p.brand)) return false;
    if ((f.min || f.max) && p.best == null) return false;
    if (f.min && p.best < +f.min) return false;
    if (f.max && p.best > +f.max) return false;
    if (f.rating && (p.rating || 0) < f.rating) return false;
    if (f.sale && p.drop < 12) return false;
    if (f.instock && !p.stock) return false;
    for (const def of facetDefs) {
      const sel = f.facets[def.key];
      if (!sel) continue;
      const v = fval(p, def.key);
      if (def.type === 'bool') { if (v !== true) return false; }
      else if (v === undefined || !sel.includes(v)) return false;
    }
    return true;
  });
  list = list.slice().sort((SORTS.find(s => s.id === sort) || SORTS[0]).fn);

  const title = cat ? cat : query ? <>Results for <span className="q">“{query}”</span></> : 'All products';
  const activeChips = [
    ...f.brands.map(b => ({ k: 'brand:' + b, label: b, clear: () => set('brands', f.brands.filter(x => x !== b)) })),
    ...(f.min ? [{ k: 'min', label: 'min kr ' + fmt(+f.min), clear: () => set('min', '') }] : []),
    ...(f.max ? [{ k: 'max', label: 'max kr ' + fmt(+f.max), clear: () => set('max', '') }] : []),
    ...(f.rating ? [{ k: 'rating', label: f.rating + '★ & up', clear: () => set('rating', 0) }] : []),
    ...(f.sale ? [{ k: 'sale', label: 'On sale', clear: () => set('sale', false) }] : []),
    ...(f.instock ? [{ k: 'instock', label: 'In stock', clear: () => set('instock', false) }] : []),
    ...facetDefs.flatMap(def => {
      const sel = f.facets[def.key];
      if (!sel) return [];
      if (def.type === 'bool') return [{ k: 'facet:' + def.key, label: def.label, clear: () => setBoolFacet(def.key) }];
      return sel.map(v => ({ k: 'facet:' + def.key + ':' + v, label: def.label + ': ' + fdisp(v, def), clear: () => setFacet(def.key, v) }));
    }),
  ];

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} query={query || ''} />
      <div className={'page results' + (filterLayout === 'topbar' ? ' results--topbar' : '') + (density === 'compact' ? ' is-compact' : '') + (view === 'grid' ? ' is-grid' : '')}>
        {filterLayout === 'rail' && (
          <aside className="filterscol">
            <div className="filters">
              <FiltersBody f={f} set={set} base={base} go={go} facetDefs={facetDefs} facetBase={facetBase} setFacet={setFacet} setBoolFacet={setBoolFacet} />
            </div>
          </aside>
        )}
        <main className="results__main">
          {filterLayout === 'topbar' && <FilterBar f={f} set={set} base={base} go={go} baseSel={baseSel} facetDefs={facetDefs} facetBase={facetBase} setFacet={setFacet} setBoolFacet={setBoolFacet} />}
          <div className="results__title">
            <h1>{title}</h1>
          </div>
          <div className="results__bar">
            <div className="count">{list.length} {list.length === 1 ? 'product' : 'products'} · {list.reduce((n, p) => n + p.shops, 0)} offers tracked</div>
            <div className="results__sort">
              <span className="results__sortlbl">Sort</span>
              <div className="sortbar">
                {SORTS.map(s => <button key={s.id} className={sort === s.id ? 'is-on' : ''} onClick={() => setSort(s.id)}>{s.label}</button>)}
              </div>
              <span className="results__sortlbl" style={{ marginLeft: 'var(--s-3)' }}>View</span>
              <div className="sortbar viewbar" role="group" aria-label="View mode">
                {VIEWS.map(v => <button key={v.id} className={view === v.id ? 'is-on' : ''} title={v.label} aria-label={v.label + ' view'} aria-pressed={view === v.id} onClick={() => setView(v.id)}><Icon name={v.icon} size={15} /></button>)}
              </div>
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="activechips">
              {activeChips.map(c => (
                <button key={c.k} className="fchip" onClick={c.clear}>{c.label}<Icon name="x" size={12} /></button>
              ))}
              <button className="fchip fchip--clear" onClick={() => setF(emptyFilters())}>Clear all</button>
            </div>
          )}

          {list.length === 0 ? (
            <div className="empty">
              <div className="empty__ic"><Icon name="search-x" size={40} /></div>
              <h2>No products match those filters</h2>
              <p>Try widening your price range or clearing a filter.</p>
              <Btn variant="primary" onClick={() => setF(emptyFilters())}>Clear filters</Btn>
            </div>
          ) : view === 'grid' ? (
            <div className="pgrid">
              {list.map(p => <ResultCard key={p.id} p={p} go={go} />)}
            </div>
          ) : view === 'compact' ? (
            <div className="rlist rlist--compact">
              {list.map(p => <ResultRowCompact key={p.id} p={p} go={go} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round((p.best || 0) * 0.92 / 10) * 10)} />)}
            </div>
          ) : (
            <div className="rlist">
              {list.map(p => <ResultRow key={p.id} p={p} go={go} spark={sparklines} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round((p.best || 0) * 0.92 / 10) * 10)} />)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// --- Report a problem ---------------------------------------
const REPORT_REASONS = ['Wrong price', 'Out of stock', 'Wrong product info', 'Other'];
function ReportProblemModal({ p, onClose, onDone }) {
  const [reason, setReason] = useState(null);
  const [shop, setShop] = useState((((p.offers || [])[0]) || {}).shop || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!reason || busy) return;
    setErr('');
    if (window.reportProblem) {
      setBusy(true);
      try { await window.reportProblem(p.id, shop, reason, text); }
      catch (e) { setErr((e && e.message) || 'Could not send report'); setBusy(false); return; }
    }
    onDone('Thanks \u2014 we\u2019ll look into it.');
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal report-modal" role="dialog" aria-label="Report a problem">
        <div className="modal__head">
          <b>Report a problem</b>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="report-modal__body">
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>Shop</div>
            <select className="report-modal__shop" value={shop} onChange={e => setShop(e.target.value)}>
              {p.offers.map(o => <option key={o.shop} value={o.shop}>{o.shop}</option>)}
            </select>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>What's wrong?</div>
            <div className="report-modal__reasons" role="radiogroup" aria-label="Reason">
              {REPORT_REASONS.map(r => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} className={'report-modal__reason' + (reason === r ? ' is-on' : '')} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          </div>
          <textarea className="report-modal__text" rows={3} placeholder="Anything else we should know? (optional)" value={text} onChange={e => setText(e.target.value)}></textarea>
          {err && <div className="report-modal__err"><Icon name="alert-triangle" size={14} /> {err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={!reason || busy} onClick={submit}>{busy ? 'Sending\u2026' : 'Send report'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// PRODUCT COMPARISON PAGE (PDP)
// ===========================================================
function ProductPage({ go, id }) {
  const rv = getListing(id) ? null : resolveVariantId(id);
  const p = getListing(id) || (rv && rv.p) || CATALOG[0];
  const [sel, setSel] = useState(() => rv ? rv.sel : defaultSel(p));
  useEffect(() => { setSel(rv ? rv.sel : defaultSel(p)); }, [id]);
  const v = useMemo(() => variantListing(p, sel), [p, sel]);
  useWatchStore();
  const w = WatchStore.get(v.id);
  const [target, setTarget] = useState(w ? w.target : (v.best ? Math.round(v.best * 0.92 / 10) * 10 : ''));
  const watching = !!w;
  useEffect(() => { if (!watching) setTarget(v.best ? Math.round(v.best * 0.92 / 10) * 10 : ''); }, [v.best]);
  const dirty = watching && +target !== w.target;
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2400); };
  const [weeks, setWeeks] = useState(24);
  const RANGES = [{ w: 6, label: '6W' }, { w: 12, label: '12W' }, { w: 24, label: '24W' }];
  const histAll = v.history || [];
  const histView = histAll.slice(-weeks);
  const low = histAll.length ? Math.min(...histAll) : null;
  const best = (v.offers && v.offers.length) ? v.offers[0] : null;
  const shopUrl = (best && best.url) || ((v.offers || []).find(o => o.url) || {}).url;
  const [buyNow, setBuyNow] = useState(false);
  const [report, setReport] = useState(false);
  const more = (CAT_OF[p.cat] || []).filter(x => x.id !== p.id).slice(0, 4);

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page pdp">
        <div className="pdp__crumb">
          <a onClick={() => go('home')}>Home</a><Icon name="chevron-right" size={13} />
          <a onClick={() => go('results', { cat: p.cat })}>{p.cat}</a><Icon name="chevron-right" size={13} />
          <span style={{ color: 'var(--ink-900)' }}>{p.name}</span>
        </div>

        <div className="pdp__top">
          <ProductGallery p={p} vlabel={v.vlabel} />
          <div className="pdp__info">
            <div className="pdp__brand">{p.brand}</div>
            <h1>{p.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', margin: '0 0 var(--s-4)', flexWrap: 'wrap' }}>
              <Stars rating={p.rating} reviews={p.reviews} />
              {p.nc && <span className="rrow__feat">Noise cancelling</span>}
              <StockBadge state={p.stock ? 'in' : 'back'} />
              {specsFor(p) && <a className="pdp__speclink" onClick={scrollToSpecs}>Specifications ↓</a>}
              <CompareBtn p={p} variant="pill" />
            </div>

            <VariantPicker p={p} sel={sel} onSel={(axis, opt) => setSel(s => ({ ...s, [axis]: opt }))} onSelAll={(s) => setSel(s)} />

            <div className="bestbox">
              <div className="bestbox__top">
                <div>
                  <div className="label">{best ? 'Best price · ' + best.shop : 'Best price'}</div>
                  {best ? <div className="bestbox__price"><span className="cur">kr</span><span className="t-price-lg">{fmt(best.price)}</span></div> : <div className="no-offers" style={{ fontSize: 15, padding: '10px 0' }}>No offers yet</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', alignItems: 'stretch' }}>
                  <Btn variant="dark" icon="zap" disabled={!best} title={best ? undefined : 'No offers yet'} onClick={() => setBuyNow(true)}>Buy now</Btn>
                  <Btn variant="ghost" icon="external-link" disabled={!shopUrl} title={shopUrl ? undefined : 'No shop link available for this product'} onClick={() => shopUrl && window.open(shopUrl, '_blank', 'noopener')}>Go to shop</Btn>
                </div>
              </div>
              <div className="bestbox__bot">
                {best ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>{v.was != null && <span className="strike">was kr {fmt(v.was)}</span>}{v.drop > 0 && <span className="delta delta--down" style={{ whiteSpace: 'nowrap' }}>▼ −{v.drop}%</span>}<span className="muted">· {v.shops} shops</span></span>
                ) : <span className="muted">We’ll show prices as soon as a shop lists it</span>}
                {low != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-700)', whiteSpace: 'nowrap' }}>All-time low kr {fmt(low)}</span>}
              </div>
            </div>

            <div className="watchbox">
              <div className="watchbox__row">
                <div>
                  <div className="t-label" style={{ marginBottom: 6 }}>Alert me when price drops below</div>
                  <div className="watchbox__field">
                    <span className="cur">kr</span>
                    <input type="number" value={target} onChange={e => setTarget(+e.target.value)} />
                  </div>
                </div>
                {!watching ? (
                  <Btn variant="primary" icon="bell" onClick={() => { WatchStore.add(v.id, +target || v.best || 0); flash('Watching — we\u2019ll ping you below kr ' + fmt(+target || v.best || 0)); }}>
                    Watch price
                  </Btn>
                ) : (
                  <div className="watchbox__on">
                    {dirty ? (
                      <Btn variant="primary" icon="check" onClick={() => { WatchStore.setTarget(v.id, +target); flash('Alert updated to kr ' + fmt(+target)); }}>
                        Update alert
                      </Btn>
                    ) : (
                      <span className="watchbox__status"><Icon name="bell-ring" size={15} /> Watching</span>
                    )}
                    <button className="iconbtn danger" type="button" title="Stop watching" aria-label="Stop watching" onClick={() => { WatchStore.remove(v.id); flash('Stopped watching'); }}>
                      <Icon name="bell-off" size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {toast && <Toast>{toast}</Toast>}

            <AutobuyBox p={v}></AutobuyBox>
            {buyNow && <BuyNowModal p={v} onClose={() => setBuyNow(false)}></BuyNowModal>}
            {report && <ReportProblemModal p={v} onClose={() => setReport(false)} onDone={flash}></ReportProblemModal>}
          </div>
        </div>

        <div className="pdp__grid">
          <div className="offers">
            <div className="offers__h"><span>Shop</span><span>Delivery</span><span>Stock</span><span style={{ textAlign: 'right' }}>Price</span></div>
            {!best && <div className="offers__empty">No offers yet — we’re tracking this product</div>}
            {(v.offers || []).map((o, i) => (
              <div key={o.shop} className={'orow' + (i === 0 ? ' is-best' : '')}>
                <div className="orow__shop">{o.shop}{i === 0 && <Tag kind="best">★ Best</Tag>}</div>
                <div className="orow__ship">{o.ship}</div>
                <div className="orow__ship"><StockBadge state={o.stock === undefined ? 'unknown' : o.stock ? 'in' : 'out'} label={o.stock ? o.eta : undefined} />{o.updated_at ? <div className="orow__checked">checked {relTime(o.updated_at)}</div> : null}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
                  <Price value={o.price} size={18} />
                  <Btn variant={i === 0 ? 'primary' : 'ghost'} size="sm" disabled={!o.url} onClick={() => o.url && window.open(o.url, '_blank', 'noopener')}>Visit</Btn>
                </div>
              </div>
            ))}
            <div className="offers__foot">
              <button type="button" className="report-link" onClick={() => setReport(true)}><Icon name="flag" size={12} /> Report a problem</button>
            </div>
          </div>

          <div className="chart">
            <div className="chart__head">
              <h3 style={{ margin: 0, fontSize: 16 }}>Price history · {weeks} weeks</h3>
              <div className="chart__ranges" role="group" aria-label="Time scale">
                {RANGES.map(r => (
                  <button key={r.w} type="button" className={weeks === r.w ? 'is-active' : ''} aria-pressed={weeks === r.w} onClick={() => setWeeks(r.w)}>{r.label}</button>
                ))}
              </div>
            </div>
            {histAll.length ? <HistoryChart points={histView} low={low} /> : <div className="offers__empty">No price history yet</div>}
            {histAll.length > 0 && <div className="chart__legend">
              <span><span className="dot dot--line" /> Lowest across shops</span>
              <span><span className="dot dot--low" /> All-time low kr {fmt(low)}</span>
            </div>}
          </div>
        </div>

        <SpecsSection p={p} sel={sel} onSel={(axis, opt) => setSel(s => ({ ...s, [axis]: opt }))}></SpecsSection>

        <div className="sec" style={{ marginTop: 'var(--s-7)' }}>
          <div className="sec__head"><h2>More in {p.cat}</h2><span className="more" onClick={() => go('results', { cat: p.cat })}>See all <Icon name="arrow-right" size={14} /></span></div>
          <div className="pgrid">
            {more.map(x => <ResultCard key={x.id} p={x} go={go} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CATALOG, CAT_OF, getListing, searchCatalog, genOffers, genHist, Results, ProductPage, ResultRow, ResultRowCompact, ResultCard, Stars });
