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

function serverLogin(email, path = '/api/auth/login') {
  return fetchJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(me => { hydrateMe(me); return true; })
    .catch(e => { console.error('login failed:', e); return false; });
}

// Hydrate the prototype's per-user module constants in place, same seam as
// the 4a catalog: USER is a const object (assign over it), WATCHED a const
// array (splice), and WatchStore.items a plain reassignable property.
// Known upstream gap: WATCH_HITS / TOTAL_SAVED are const primitives computed
// at module load — they can't be rebound here and stay demo numbers.
function hydrateMe(me) {
  ME = me;
  Object.assign(USER, me.user);
  WatchStore.items = (me.watches || []).map(w => {
    const p = WatchStore.prod(w.id);
    return { id: w.id, target: w.target, paused: !!w.paused, hit: !!p && p.best <= w.target };
  });
  WATCHED.splice(0, WATCHED.length, ...WatchStore.items.map(w => {
    const p = WatchStore.prod(w.id);
    return p && { ...p, target: w.target, hit: w.hit, spark: (p.history || []).slice(-12) };
  }).filter(Boolean));
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
  // AuthCard hands us the attempt as onAuthed(email, {signup}) and awaits
  // the verdict: resolve truthy = we set the session and navigated; false =
  // it shows its own error and stays. Upserts (account creation) are:
  // signup submits, the sent-screen "Open the link" (.addr present — it
  // simulates the emailed verify link, which is an upsert), and fake
  // BankID (null email → shared demo account). Password login is strict.
  const onAuthed = (email, opts) => {
    const signup = !!(opts && opts.signup);
    const upsert = signup || !email || !!document.querySelector('.authcard .addr');
    return serverLogin(email || 'demo@pricy.no', upsert ? '/api/auth/signup' : '/api/auth/login')
      .then(ok => {
        if (ok) { setSession(true); nav(signup ? 'onboarding' : 'home'); }
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
  else if (name === 'account') view = <AccountPage go={go} tab={params.tab} />;
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
]).then(([, me]) => {
  if (me && me.user) hydrateMe(me); // after catalog: hydrateMe looks up products
  ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
});
