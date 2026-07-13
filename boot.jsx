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

function readSession() {
  try { return localStorage.getItem('pricy_session') === '1'; } catch (e) { return false; }
}
function writeSession(v) {
  try { v ? localStorage.setItem('pricy_session', '1') : localStorage.removeItem('pricy_session'); } catch (e) {}
}

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
  const authed = () => { setSession(true); nav('home'); };
  // Login's BankID path goes straight to onboarding — that's a signup, so it authenticates
  const loginGo = (name, params = {}) => {
    if (name === 'onboarding') { setSession(true); nav('onboarding'); return; }
    go(name, params);
  };

  useEffect(() => {
    const onPop = () => setScreen(parseUrl(readSession()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const { name, params } = screen;
  let view;
  if (name === 'login') view = <Login onAuthed={authed} go={loginGo} layout={T.loginLayout} />;
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

ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
