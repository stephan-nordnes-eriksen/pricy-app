// ===========================================================
// Production boot — replaces the prototype's final babel block
// (tweaks-panel harness + preview App). Everything above this in
// the bundle is byte-faithful synced prototype code.
//
// Adds what the design harness deliberately leaves open:
//   - real session flag (localStorage) — logged out you get Landing/
//     Login/About only; search and every app screen require login
//   - URL routing mapped onto the prototype's go(name, params)
//   - layout choices frozen to the designer's TWEAK_DEFAULTS
//     (window.TWEAK_DEFAULTS, extracted by build.js)
// ===========================================================
const T = window.TWEAK_DEFAULTS;
const PUBLIC_SCREENS = ['landing', 'login', 'about'];

// Session is real now (Phase 4b): an HttpOnly cookie the Worker owns. ME
// caches the /api/me result fetched before first render; the gating logic
// reading these two functions is unchanged from the localStorage days.
let ME = null;
function readSession() { return !!ME; }
function writeSession(v) {
  if (!v && ME) {
    ME = null;
    if (typeof fetch === 'function') fetch('/api/logout', { method: 'POST' }).catch(() => {});
  }
}

const fetchJson = (url, opts) =>
  (typeof fetch === 'function' ? fetch(url, opts) : Promise.reject(new Error('no fetch')))
    .then(r => { if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); });

function serverLogin(email, path = '/api/auth/login', password) {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(password ? { email, password } : { email }),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return data; // { error } — AuthCard shows it and stays on the form
    hydrateMe(data);
    // swap the demo FEED for this user's real alert history before landing
    // home (fetch failed → baked demo feed, same fallback as the catalog)
    return fetchJson('/api/alerts').then(hydrateFeed).then(() => true, () => true);
  }).catch(e => { console.error('login failed:', e); return false; });
}

// Hydrate the prototype's per-user module constants in place, same seam as
// the 4a catalog: USER is a const object (assign over it), WATCHED a const
// array (splice), and WatchStore.items a plain reassignable property.
// Header badge / greeting / saved numbers derive live from WatchStore
// (hits()/saved()), so setting items is enough.
const shortDate = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function hydrateMe(me) {
  ME = me;
  Object.assign(USER, me.user);
  // hit comes from the server now: a real alert fired and the price is still
  // at/below target (worker meBody) — not the old best-vs-target guess
  WatchStore.items = (me.watches || []).map(w =>
    ({ id: w.id, target: w.target, paused: !!w.paused, hit: !!w.hit }));
  WATCHED.splice(0, WATCHED.length, ...WatchStore.items.map(w => {
    const p = WatchStore.prod(w.id);
    return p && { ...p, target: w.target, hit: w.hit, spark: (p.history || []).slice(-12) };
  }).filter(Boolean));
  // Real purchase history + the persisted fullmakt/active-orders blob replace
  // the store's demo state. New users have signed nothing → signed=false and
  // /autobuy shows the real "Auto-buy is off" ceremony.
  const ab = me.autobuy || {};
  AutobuyStore.signed = !!ab.signed;
  AutobuyStore.signedAt = ab.signedAt || null;
  if (ab.cap != null) AutobuyStore.cap = ab.cap;
  if (ab.payment) AutobuyStore.payment = ab.payment;
  AutobuyStore.orders = [
    ...(ab.orders || [])
      .filter(o => AutobuyStore.prod(o.id)) // an order for a product gone from the catalog can't render
      .map(o => ({ id: o.id, max: o.max, expires: o.expires, shops: o.shops, status: 'active' })),
    ...(me.purchases || [])
      .filter(pu => AutobuyStore.prod(pu.product_id))
      .map(pu => ({
        id: pu.product_id, max: pu.price_nok, expires: '—', shops: pu.shop, status: 'executed',
        exec: {
          shop: pu.shop, price: pu.price_nok, at: shortDate(Date.parse(pu.purchased_at)),
          ref: 'PY-' + pu.order_id, angrerett: shortDate(Date.parse(pu.purchased_at) + 14 * 864e5),
        },
      })).reverse(), // server lists newest first; in-session buys append, so keep newest last
  ];
  _autobuyEmit.call(AutobuyStore); // original emit: hydration must not PUT back what it just read
}

// Real alert history replaces the baked demo FEED — same mutate-in-place seam
// as CATALOG/WATCHED: FEED is a module const array shared with the prototype
// blocks, so splicing re-points every consumer (AlertFeedCard, FeedCard,
// ActivityFeed). "ago" is computed here from created_at, in the demo's voice.
const ago = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : d + ' days ago';
};
function hydrateFeed(rows) {
  // ponytail: the server only records price-drop alerts, so every row is
  // kind 'down'; 'up'/'watch' feed events don't exist server-side yet
  FEED.splice(0, FEED.length, ...rows.map(a => {
    const prod = WatchStore.prod(a.product_id); // a product gone from the catalog can't render
    return prod && {
      id: a.product_id, kind: 'down', title: a.product || prod.name,
      text: 'dropped to your target (kr ' + fmt(a.target) + ')',
      from: a.prev_price ?? a.price, to: a.price,
      time: ago(a.created_at), tag: 'Price drop', prod,
    };
  }).filter(Boolean));
}

function saveProfile(name) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  return fetch('/api/account', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(async r => {
    if (!r.ok) throw new Error('save failed');
    const { user } = await r.json();
    Object.assign(USER, user);
    ME.user = user;
  });
}

function changePassword(currentPassword, newPassword) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  return fetch('/api/account/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'could not change password');
    ME.user.hasPassword = true;
  });
}

// Whole-object replace per save, merged onto the last known settings — same
// seam as WatchStore.emit below. Callers (NotifSection, PrivacySection) send
// either their whole sub-object or a single-key patch; merging covers both.
function saveSettings(patch) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  const next = { ...(ME.settings || {}), ...patch };
  return fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  }).then(r => { if (!r.ok) throw new Error('save failed'); ME.settings = next; });
}

// Every watch mutation funnels through WatchStore.emit — persist from there.
const _emit = WatchStore.emit;
WatchStore.emit = function () {
  _emit.call(this);
  if (ME && typeof fetch === 'function') {
    fetch('/api/watches', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.items.map(w => ({ id: w.id, target: w.target, paused: !!w.paused }))),
    }).catch(() => {});
  }
};

// Every auto-buy mutation (sign/revoke/add/cancel/payment change) funnels
// through AutobuyStore.emit — persist the fullmakt + active orders from
// there, same seam as WatchStore.emit above. Executed orders are derived
// from the purchases table, so only the active ones are sent.
const _autobuyEmit = AutobuyStore.emit;
AutobuyStore.emit = function () {
  _autobuyEmit.call(this);
  if (ME && typeof fetch === 'function') {
    fetch('/api/autobuy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signed: this.signed, signedAt: this.signedAt, cap: this.cap, payment: this.payment,
        orders: this.orders.filter(o => o.status === 'active')
          .map(o => ({ id: o.id, max: o.max, expires: o.expires, shops: o.shops })),
      }),
    }).catch(() => {});
  }
};

// Buy now persists for real: POST /api/buy hits the same purchases table as
// the MCP buy_now tool, and the server-charged price/order ref win over the
// UI's snapshot. The synced BuyNowModal awaits window.buyNowApi when present;
// until that upstream contract lands, the modal ignores this and stays local.
window.buyNowApi = (p, best) => fetch('/api/buy', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: p.id, shop: best.shop }),
}).then(async r => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'purchase failed — you were not charged');
  const order = {
    id: p.id, max: data.price_nok, expires: '—', shops: data.shop, status: 'executed',
    exec: {
      shop: data.shop, price: data.price_nok, at: 'Just now', ref: 'PY-' + data.order_id,
      angrerett: shortDate(Date.now() + 14 * 864e5),
    },
  };
  AutobuyStore.orders = [...AutobuyStore.orders, order];
  AutobuyStore.emit();
  return order;
});

function parseUrl(session) {
  const p = location.pathname;
  const q = new URLSearchParams(location.search);
  let s;
  if (p.startsWith('/product/')) s = { name: 'product', params: { id: decodeURIComponent(p.slice('/product/'.length)) } };
  else if (p === '/search') s = { name: 'results', params: { query: q.get('q') || undefined, cat: q.get('cat') || undefined } };
  else if (p === '/alerts') s = { name: 'alerts', params: { tab: q.get('tab') || undefined } };
  else if (p === '/account') s = { name: 'account', params: { tab: q.get('tab') || undefined } };
  else if (['/login', '/about', '/browse', '/autobuy', '/onboarding'].includes(p)) s = { name: p.slice(1), params: {} };
  else s = { name: session ? 'home' : 'landing', params: {} };
  if (!session && !PUBLIC_SCREENS.includes(s.name)) s = { name: 'login', params: {} };
  return s;
}

function toUrl(name, params = {}) {
  if (name === 'product') return '/product/' + encodeURIComponent(params.id);
  if (name === 'results') {
    const q = new URLSearchParams();
    if (params.query) q.set('q', params.query);
    if (params.cat) q.set('cat', params.cat);
    const s = q.toString();
    return '/search' + (s ? '?' + s : '');
  }
  if (name === 'alerts') return '/alerts' + (params.tab ? '?tab=' + encodeURIComponent(params.tab) : '');
  if (name === 'account') return '/account' + (params.tab ? '?tab=' + encodeURIComponent(params.tab) : '');
  if (name === 'home' || name === 'landing') return '/';
  return '/' + name;
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (this.state.e) return <pre style={{ padding: 24, font: '13px monospace', color: '#c0362c', whiteSpace: 'pre-wrap' }}>{String(this.state.e.stack || this.state.e)}</pre>;
    return this.props.children;
  }
}

function App() {
  const [session, setSessionState] = useState(readSession);
  const setSession = (v) => { writeSession(v); setSessionState(v); };
  const [screen, setScreen] = useState(() => parseUrl(readSession()));
  const [plan, setPlan] = useState(T.plan);
  window.PLAN = plan;
  window.setPlan = setPlan;

  // navigate without the auth gate (used right as auth state flips)
  const nav = (name, params = {}) => {
    const url = toUrl(name, params);
    if (url !== location.pathname + location.search) history.pushState(null, '', url);
    window.scrollTo(0, 0);
    setScreen({ name, params });
  };
  const go = (name, params = {}) => {
    // "log in" links act as logout; signed-in landing is only reachable via
    // the account menu's Log out / account deletion, so it ends the session
    if (name === 'login' || (name === 'landing' && session)) setSession(false);
    if (name !== 'login' && !session && !PUBLIC_SCREENS.includes(name)) { name = 'login'; params = {}; }
    nav(name, params);
  };
  // AuthCard hands us the attempt as onAuthed(email, {signup, password}) and
  // awaits the verdict: resolve strictly `true` = we set the session and
  // navigated; `false` or `{error}` = it shows its own error and stays.
  // Upserts (account creation) are: signup submits, the sent-screen "Open
  // the link" (.addr present — it simulates the emailed verify link, which
  // is an upsert), and fake BankID (null email → shared demo account, no
  // password). Password login is strict and now actually checks the
  // password server-side (worker/index.js verifyPassword).
  const onAuthed = (email, opts) => {
    const signup = !!(opts && opts.signup);
    const password = opts && opts.password;
    const upsert = signup || !email || !!document.querySelector('.authcard .addr');
    return serverLogin(email || 'demo@pricy.no', upsert ? '/api/auth/signup' : '/api/auth/login', password)
      .then(ok => {
        if (ok === true) { setSession(true); nav(signup ? 'onboarding' : 'home'); }
        return ok;
      });
  };

  useEffect(() => {
    const onPop = () => setScreen(parseUrl(readSession()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const { name, params } = screen;
  let view;
  if (name === 'login') view = <Login onAuthed={onAuthed} go={go} layout={T.loginLayout} />;
  else if (name === 'landing') view = <Landing go={go} />;
  else if (name === 'results') view = <Results go={go} query={params.query} cat={params.cat} view={T.resultsView} filterLayout={T.filterLayout} density={T.density} sparklines={T.sparklines} />;
  else if (name === 'product') view = <ProductPage go={go} id={params.id} />;
  else if (name === 'browse') view = <BrowsePage go={go} />;
  else if (name === 'alerts') view = <AlertsPage go={go} tab={params.tab} />;
  else if (name === 'account') view = <AccountPage go={go} tab={params.tab} me={ME} onSaveProfile={saveProfile} onSaveSettings={saveSettings} onChangePassword={changePassword} />;
  else if (name === 'autobuy') view = <AutobuyPage go={go} />;
  else if (name === 'onboarding') view = <Onboarding go={go} />;
  else if (name === 'about') view = <AboutPage go={go} />;
  else view = <SignedHome go={go} onLogout={() => go('landing')} layout={T.homeLayout} />;

  return <div key={name + JSON.stringify(params)}>{view}</div>;
}

// Catalog is served, not baked: fetch /api/catalog.json and hydrate the
// prototype's module constants in place before first render. This bundle
// shares one esbuild scope with the prototype blocks, so CATALOG and CAT_OF
// (the only load-time derived index) are directly in scope; getListing,
// searchCatalog and ALL_BRANDS read CATALOG live and follow automatically.
// window.CATALOG is the same array object, so it stays in sync too.
function hydrateCatalog(data) {
  CATALOG.length = 0;
  CATALOG.push(...data);
  Object.keys(CAT_OF).forEach(k => delete CAT_OF[k]);
  CATALOG.forEach(p => { (CAT_OF[p.cat] = CAT_OF[p.cat] || []).push(p); });
}

Promise.all([
  fetchJson('/api/catalog.json').then(hydrateCatalog)
    .catch(() => {}), // ponytail: fetch missing/failed → baked demo catalog (jsdom has no fetch)
  fetchJson('/api/me').catch(() => null), // 401 / static hosting → logged out
  fetchJson('/api/alerts').catch(() => null), // 401 → keep the baked demo feed
]).then(([, me, alerts]) => {
  if (me && me.user) hydrateMe(me); // after catalog: hydrateMe looks up products
  if (alerts) hydrateFeed(alerts); // after catalog too: prod lookups
  ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
});
