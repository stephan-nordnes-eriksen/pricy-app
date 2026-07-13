// ===========================================================
// pricy.no app shell — routing + screens not yet in the design kit.
// Components/data (Home, Header, Footer, PRODUCTS, …) come from
// _ds_bundle.js (synced from claude.ai/design), which puts them on window.
// ===========================================================
const h = React.createElement;

// --- URL <-> the kit's go(route, params) convention ----------
function parseUrl() {
  const p = location.pathname;
  if (p.startsWith('/product/')) return { route: 'product', params: { id: decodeURIComponent(p.slice('/product/'.length)) } };
  if (p === '/search') return { route: 'results', params: { query: new URLSearchParams(location.search).get('q') || '' } };
  if (p === '/deals') return { route: 'deals', params: {} };
  return { route: 'home', params: {} };
}

function toUrl(route, params = {}) {
  if (route === 'product') return '/product/' + encodeURIComponent(params.id);
  if (route === 'results') return '/search?q=' + encodeURIComponent(params.query || '');
  if (route === 'deals') return '/deals';
  return '/';
}

// ===========================================================
// ponytail: the screens below are placeholders built from kit.css's
// existing styles — each gets replaced when its design lands in
// Claude Design and the kit exports a component of the same name.
// ===========================================================

function ResultRow({ p, go }) {
  return h('div', { className: 'rrow', onClick: () => go('product', { id: p.id }) },
    h('div', { className: 'rrow__img' }, h(Icon, { name: p.icon, size: 30 })),
    h('div', null,
      h('div', { className: 'rrow__name' }, p.name),
      h('div', { className: 'rrow__meta' }, h('span', null, p.brand), h('span', null, p.cat))),
    h('div', { className: 'rrow__price' },
      h('div', { className: 'rrow__from' }, 'from'),
      h(Price, { value: p.best, size: 22 }),
      h('div', { className: 'rrow__shops' }, p.shops + ' shops')));
}

function Results({ query, go }) {
  const q = (query || '').toLowerCase();
  const hits = PRODUCTS.filter(p => !q || (p.name + ' ' + p.brand + ' ' + p.cat).toLowerCase().includes(q));
  const list = hits.length ? hits : PRODUCTS;
  return h('div', { className: 'wrap', style: { padding: 'var(--s-6) var(--gutter) var(--s-9)' } },
    h('div', { className: 'results__head' },
      h('h2', { style: { margin: 0 } }, hits.length ? 'Results for “' + query + '”' : 'Nothing matched “' + query + '” — showing everything'),
      h('span', { className: 'count' }, list.length + ' products')),
    h('div', null, list.map(p => h(ResultRow, { key: p.id, p, go }))));
}

function Product({ id, go }) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) {
    return h('div', { className: 'wrap section' },
      h('h2', null, 'Product not found'),
      h(Btn, { onClick: () => go('home') }, 'Back home'));
  }
  const best = p.offers[0];
  return h('div', { className: 'wrap pdp' },
    h('div', { className: 'pdp__crumb' },
      h('a', { onClick: () => go('home') }, 'Home'), '/',
      h('a', { onClick: () => go('results', { query: p.cat }) }, p.cat), '/',
      h('span', null, p.name)),
    h('div', { className: 'pdp__top' },
      h('div', null,
        h('div', { className: 'pdp__gallery' }, h(Icon, { name: p.icon, size: 120 })),
        h('div', { className: 'chart', style: { marginTop: 'var(--s-5)' } },
          h('div', { className: 'chart__head' },
            h('span', { className: 'pdp__brand', style: { margin: 0 } }, 'Price history · 24 months'),
            h(Delta, { pct: -p.drop })),
          h(HistoryChart, { points: p.history, low: p.best }))),
      h('div', { className: 'pdp__info' },
        h('div', { className: 'pdp__brand' }, p.brand + ' · ' + p.cat),
        h('h1', null, p.name),
        p.drop >= 10 && h(Tag, { kind: 'best' }, '▼ −' + p.drop + '% vs usual price'),
        h('div', { className: 'bestbox' },
          h('div', { className: 'bestbox__top' },
            h('span', { className: 'label' }, 'Best price · ' + best.shop),
            h(Price, { value: best.price, size: 34 })),
          h('div', { className: 'bestbox__bot' },
            h('span', null, best.ship + ' · ' + best.eta),
            h(Btn, { variant: 'primary' }, 'To shop'))),
        h('div', { className: 'offers' },
          h('div', { className: 'offers__h' },
            h('span', null, 'Shop'), h('span', null, 'Price'), h('span', null, 'Shipping'), h('span', null, 'Stock')),
          p.offers.map((o, i) => h('div', { key: o.shop, className: 'orow' + (i === 0 ? ' is-best' : '') },
            h('span', { className: 'orow__shop' }, o.shop, i === 0 && h(Tag, { kind: 'best' }, 'Best')),
            h(Price, { value: o.price, size: 18 }),
            h('span', { className: 'orow__ship' }, o.ship),
            h('span', { className: 'orow__ship' }, o.eta)))))));
}

function Deals({ go }) {
  const deals = PRODUCTS.slice().sort((a, b) => b.drop - a.drop);
  return h('div', { className: 'wrap section' },
    h('div', { className: 'section__head' }, h('h2', null, "Today's biggest drops")),
    h('div', { className: 'dealgrid' }, deals.map(p =>
      h('div', { key: p.id, className: 'deal', onClick: () => go('product', { id: p.id }) },
        h('div', { className: 'deal__drop' }, '−' + p.drop + '%'),
        h('div', { className: 'deal__name' }, p.name),
        h('div', { className: 'deal__prices' },
          h(Price, { value: p.best, size: 22 }),
          h('span', { className: 'deal__was' }, 'kr ' + fmt(p.was)))))));
}

// --- App ------------------------------------------------------
function App() {
  const [nav, setNav] = useState(parseUrl());
  useEffect(() => {
    const onPop = () => setNav(parseUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (route, params = {}) => {
    const url = toUrl(route, params);
    // the kit fires both onClick and onSubmit for search (browser implicit
    // submission) — don't push a duplicate history entry
    if (url !== location.pathname + location.search) history.pushState(null, '', url);
    window.scrollTo(0, 0);
    setNav({ route, params });
  };
  const screens = {
    home: () => h(Home, { go }),
    results: () => h(Results, { query: nav.params.query, go }),
    product: () => h(Product, { id: nav.params.id, go }),
    deals: () => h(Deals, { go }),
  };
  return h(React.Fragment, null,
    h(Header, { route: nav.route, go, query: nav.params.query }),
    screens[nav.route](),
    h(Footer, { go }));
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
