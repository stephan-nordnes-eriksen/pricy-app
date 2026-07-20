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
    stock: i % 4 !== 3,
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
  { id: 'steamdeck', name: 'Steam Deck OLED 512GB', brand: 'Valve', cat: 'Gaming', icon: 'gamepad-2', best: 6490, was: 6990, shops: 4, rating: 4.6, reviews: 880, stock: false, nc: false, kw: 'handheld gaming steam deck' },
  // PHONES
  { id: 's24', name: 'Samsung Galaxy S24 256GB', brand: 'Samsung', cat: 'Phones', icon: 'smartphone', best: 8490, was: 10990, shops: 11, rating: 4.6, reviews: 1980, stock: true, nc: false, kw: 'phone android samsung' },
  { id: 'pixel8', name: 'Google Pixel 8 128GB', brand: 'Google', cat: 'Phones', icon: 'smartphone', best: 6490, was: 7990, shops: 7, rating: 4.5, reviews: 1120, stock: true, nc: false, kw: 'phone android pixel' },
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

// ---- result row (list view) -------------------------------
function ResultRow({ p, go, spark, saved, onSave }) {
  return (
    <div className="rrow" onClick={() => go('product', { id: p.id })}>
      <div className="rrow__img"><Icon name={p.icon} size={34} /></div>
      <div className="rrow__main">
        <div className="rrow__brand">{p.brand}</div>
        <div className="rrow__name">{p.name}</div>
        <div className="rrow__metarow">
          <Stars rating={p.rating} reviews={p.reviews} />
          {p.nc && <span className="rrow__feat">Noise cancelling</span>}
          <span className={'rrow__stock ' + (p.stock ? 'ok' : 'no')}>{p.stock ? 'In stock' : 'Backorder'}</span>
        </div>
      </div>
      {spark && <div className="rrow__spark"><Spark points={p.history} /></div>}
      <div className="rrow__price">
        {p.drop >= 12 && <span className="rrow__drop"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
        <div className="rrow__from">from</div>
        <Price value={p.best} size={24} />
        <div className="rrow__shops">{p.shops} shops →</div>
      </div>
      <button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}>
        <Icon name="bookmark" size={17} />
      </button>
    </div>
  );
}

// ---- result card (grid view) ------------------------------
function ResultCard({ p, go }) {
  return (
    <div className="pcard" onClick={() => go('product', { id: p.id })}>
      {p.drop >= 12 && <span className="pcard__tag"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
      <div className="pcard__img"><Icon name={p.icon} size={42} /></div>
      <div className="pcard__name">{p.name}</div>
      <div style={{ margin: '6px 0 10px' }}><Stars rating={p.rating} /></div>
      <div className="pcard__foot">
        <div>
          <div className="pcard__from">from</div>
          <Price value={p.best} size={20} />
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

function FiltersBody({ f, set, base, go }) {
  const brands = base.brands; // brands present in the active result set
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  return (
    <>
      <div className="filters__grp">
        <h4>Category</h4>
        <div className="catlist">
          {CATEGORIES.filter(c => CAT_OF[c]).map(c => (
            <div key={c} className={'catlink' + (base.cat === c ? ' is-on' : '')} onClick={() => go('results', { cat: c })}>
              <span className="catlink__ic"><Icon name={CAT_ICONS[c] || 'tag'} size={15} /></span>
              <span>{c}</span><span className="ct">{CAT_OF[c].length}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="filters__grp">
        <h4>Brand</h4>
        {brands.map(b => <Check key={b} on={f.brands.includes(b)} label={b} count={base.byBrand[b] || 0} onClick={() => setBrand(b)} />)}
      </div>
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
        <Check on={f.nc} label="Noise cancelling" onClick={() => set('nc', !f.nc)} />
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

function FilterBar({ f, set, base, go, baseSel }) {
  const brands = base.brands;
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  return (
    <div className="filterbar">
      <Dropdown label={baseSel.cat ? 'Category · ' + baseSel.cat : 'Category'} active={!!baseSel.cat}>
        {CATEGORIES.filter(c => CAT_OF[c]).map(c => (
          <div key={c} className={'fmenu__item' + (baseSel.cat === c ? ' is-on' : '')} onClick={() => go('results', { cat: c })}>
            <Icon name={CAT_ICONS[c] || 'tag'} size={15} /><span>{c}</span><span className="ct">{CAT_OF[c].length}</span>
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
      <span className="filterbar__sep" />
      <button className={'fpill' + (f.sale ? ' is-on' : '')} onClick={() => set('sale', !f.sale)}>On sale</button>
      <button className={'fpill' + (f.instock ? ' is-on' : '')} onClick={() => set('instock', !f.instock)}>In stock</button>
      <button className={'fpill' + (f.nc ? ' is-on' : '')} onClick={() => set('nc', !f.nc)}>Noise cancelling</button>
    </div>
  );
}

const SORTS = [
  { id: 'best', label: 'Best price', fn: (a, b) => a.best - b.best },
  { id: 'drop', label: 'Biggest drop', fn: (a, b) => b.drop - a.drop },
  { id: 'shops', label: 'Most shops', fn: (a, b) => b.shops - a.shops },
  { id: 'rating', label: 'Top rated', fn: (a, b) => b.rating - a.rating },
];

// ===========================================================
// RESULTS SCREEN
// ===========================================================
function Results({ go, query, cat, view = 'list', filterLayout = 'rail', density = 'comfy', sparklines = true }) {
  const baseSel = { query, cat };
  const baseResults = useMemo(() => searchCatalog(baseSel), [query, cat]);
  const [sort, setSort] = useState('best');
  const [f, setF] = useState({ brands: [], min: '', max: '', rating: 0, sale: false, instock: false, nc: false });
  useWatchStore();
  // reset filters when the search changes
  useEffect(() => { setF({ brands: [], min: '', max: '', rating: 0, sale: false, instock: false, nc: false }); }, [query, cat]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const prices = baseResults.map(p => p.best);
  const base = {
    min: prices.length ? Math.floor(Math.min(...prices) / 100) * 100 : 0,
    max: prices.length ? Math.ceil(Math.max(...prices) / 100) * 100 : 1000,
    cat,
    byBrand: baseResults.reduce((m, p) => ((m[p.brand] = (m[p.brand] || 0) + 1), m), {}),
  };
  base.brands = Object.keys(base.byBrand).sort();

  let list = baseResults.filter(p => {
    if (f.brands.length && !f.brands.includes(p.brand)) return false;
    if (f.min && p.best < +f.min) return false;
    if (f.max && p.best > +f.max) return false;
    if (f.rating && p.rating < f.rating) return false;
    if (f.sale && p.drop < 12) return false;
    if (f.instock && !p.stock) return false;
    if (f.nc && !p.nc) return false;
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
    ...(f.nc ? [{ k: 'nc', label: 'Noise cancelling', clear: () => set('nc', false) }] : []),
  ];

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} query={query || ''} />
      <div className={'page results' + (filterLayout === 'topbar' ? ' results--topbar' : '') + (density === 'compact' ? ' is-compact' : '') + (view === 'grid' ? ' is-grid' : '')}>
        {filterLayout === 'rail' && (
          <aside className="filters">
            <FiltersBody f={f} set={set} base={base} go={go} />
          </aside>
        )}
        <main className="results__main">
          {filterLayout === 'topbar' && <FilterBar f={f} set={set} base={base} go={go} baseSel={baseSel} />}
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
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="activechips">
              {activeChips.map(c => (
                <button key={c.k} className="fchip" onClick={c.clear}>{c.label}<Icon name="x" size={12} /></button>
              ))}
              <button className="fchip fchip--clear" onClick={() => setF({ brands: [], min: '', max: '', rating: 0, sale: false, instock: false, nc: false })}>Clear all</button>
            </div>
          )}

          {list.length === 0 ? (
            <div className="empty">
              <div className="empty__ic"><Icon name="search-x" size={40} /></div>
              <h2>No products match those filters</h2>
              <p>Try widening your price range or clearing a filter.</p>
              <Btn variant="primary" onClick={() => setF({ brands: [], min: '', max: '', rating: 0, sale: false, instock: false, nc: false })}>Clear filters</Btn>
            </div>
          ) : view === 'grid' ? (
            <div className="pgrid">
              {list.map(p => <ResultCard key={p.id} p={p} go={go} />)}
            </div>
          ) : (
            <div className="rlist">
              {list.map(p => <ResultRow key={p.id} p={p} go={go} spark={sparklines} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round(p.best * 0.92 / 10) * 10)} />)}
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
  const [shop, setShop] = useState(p.offers[0].shop);
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
  const p = getListing(id) || CATALOG[0];
  useWatchStore();
  const w = WatchStore.get(p.id);
  const [target, setTarget] = useState(w ? w.target : Math.round(p.best * 0.92 / 10) * 10);
  const watching = !!w;
  const dirty = watching && +target !== w.target;
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2400); };
  const [weeks, setWeeks] = useState(24);
  const RANGES = [{ w: 6, label: '6W' }, { w: 12, label: '12W' }, { w: 24, label: '24W' }];
  const histView = p.history.slice(-weeks);
  const low = Math.min(...p.history);
  const best = p.offers[0];
  const shopUrl = best.url || (p.offers.find(o => o.url) || {}).url;
  const [buyNow, setBuyNow] = useState(false);
  const [report, setReport] = useState(false);
  const more = CAT_OF[p.cat].filter(x => x.id !== p.id).slice(0, 4);

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
          <div className="pdp__gallery"><Icon name={p.icon} size={120} /></div>
          <div className="pdp__info">
            <div className="pdp__brand">{p.brand}</div>
            <h1>{p.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', margin: '0 0 var(--s-4)', flexWrap: 'wrap' }}>
              <Stars rating={p.rating} reviews={p.reviews} />
              {p.nc && <span className="rrow__feat">Noise cancelling</span>}
              <span className={'rrow__stock ' + (p.stock ? 'ok' : 'no')}>{p.stock ? 'In stock' : 'Backorder'}</span>
            </div>

            <div className="bestbox">
              <div className="bestbox__top">
                <div>
                  <div className="label">Best price · {best.shop}</div>
                  <div className="bestbox__price"><span className="cur">kr</span><span className="t-price-lg">{fmt(best.price)}</span></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', alignItems: 'stretch' }}>
                  <Btn variant="dark" icon="zap" onClick={() => setBuyNow(true)}>Buy now</Btn>
                  <Btn variant="ghost" icon="external-link" disabled={!shopUrl} title={shopUrl ? undefined : 'No shop link available for this product'} onClick={() => shopUrl && window.open(shopUrl, '_blank', 'noopener')}>Go to shop</Btn>
                </div>
              </div>
              <div className="bestbox__bot">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}><span className="strike">was kr {fmt(p.was)}</span><span className="delta delta--down" style={{ whiteSpace: 'nowrap' }}>▼ −{p.drop}%</span><span className="muted">· {p.shops} shops</span></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-700)', whiteSpace: 'nowrap' }}>All-time low kr {fmt(low)}</span>
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
                  <Btn variant="primary" icon="bell" onClick={() => { WatchStore.add(p.id, +target || p.best); flash('Watching — we\u2019ll ping you below kr ' + fmt(+target || p.best)); }}>
                    Watch price
                  </Btn>
                ) : (
                  <div className="watchbox__on">
                    {dirty ? (
                      <Btn variant="primary" icon="check" onClick={() => { WatchStore.setTarget(p.id, +target); flash('Alert updated to kr ' + fmt(+target)); }}>
                        Update alert
                      </Btn>
                    ) : (
                      <span className="watchbox__status"><Icon name="bell-ring" size={15} /> Watching</span>
                    )}
                    <button className="iconbtn danger" type="button" title="Stop watching" aria-label="Stop watching" onClick={() => { WatchStore.remove(p.id); flash('Stopped watching'); }}>
                      <Icon name="bell-off" size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {toast && <Toast>{toast}</Toast>}

            <AutobuyBox p={p}></AutobuyBox>
            {buyNow && <BuyNowModal p={p} onClose={() => setBuyNow(false)}></BuyNowModal>}
            {report && <ReportProblemModal p={p} onClose={() => setReport(false)} onDone={flash}></ReportProblemModal>}
          </div>
        </div>

        <div className="pdp__grid">
          <div className="offers">
            <div className="offers__h"><span>Shop</span><span>Delivery</span><span>Stock</span><span style={{ textAlign: 'right' }}>Price</span></div>
            {p.offers.map((o, i) => (
              <div key={o.shop} className={'orow' + (i === 0 ? ' is-best' : '')}>
                <div className="orow__shop">{o.shop}{i === 0 && <Tag kind="best">★ Best</Tag>}</div>
                <div className="orow__ship">{o.ship}</div>
                <div className="orow__ship">{o.stock ? o.eta : 'Out of stock'}{o.updated_at ? <div className="orow__checked">checked {relTime(o.updated_at)}</div> : null}</div>
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
            <HistoryChart points={histView} low={low} />
            <div className="chart__legend">
              <span><span className="dot dot--line" /> Lowest across shops</span>
              <span><span className="dot dot--low" /> All-time low kr {fmt(low)}</span>
            </div>
          </div>
        </div>

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

Object.assign(window, { CATALOG, CAT_OF, getListing, searchCatalog, Results, ProductPage, ResultRow, ResultCard, Stars });
