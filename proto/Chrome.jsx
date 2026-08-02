// ===========================================================
// Pricy.no Web Kit — Header & Footer
// ===========================================================

// (legacy Header component removed — AppHeader / LandingHeader are the live headers)

// --- Install app (PWA) bar -----------------------------------
// Shown under the signed-in header. Chrome/Android: real beforeinstallprompt.
// iOS Safari: static Share → Add to Home Screen instructions. Anything else: nothing.
const INSTALL_FLAG = 'pricy_install_dismissed';

function InstallPrompt() {
  const preview = (typeof window !== 'undefined' && window.INSTALL_PREVIEW) || 'auto';
  const forced = preview !== 'auto';
  const evtRef = useRef(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onBIP = (e) => { e.preventDefault(); evtRef.current = e; setCanPrompt(true); };
    const onInstalled = () => { evtRef.current = null; setCanPrompt(false); setHidden(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  useEffect(() => { setHidden(false); }, [preview]);

  if (hidden) return null;
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  let dismissed = false;
  try { dismissed = localStorage.getItem(INSTALL_FLAG) === '1'; } catch (e) {}
  if (!forced && (standalone || dismissed)) return null;

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const mode = forced ? preview : (canPrompt ? 'android' : (isIOS ? 'ios' : null));
  if (!mode) return null;

  const dismiss = () => {
    if (!forced) { try { localStorage.setItem(INSTALL_FLAG, '1'); } catch (e) {} }
    setHidden(true);
  };
  const install = () => {
    const e = evtRef.current;
    evtRef.current = null;
    setHidden(true);
    setCanPrompt(false);
    if (!e) return;
    try { e.prompt(); if (e.userChoice && e.userChoice.catch) e.userChoice.catch(() => {}); } catch (err) {}
  };

  return (
    <div className="instl" role="region" aria-label="Install pricy">
      <div className="page instl__row">
        <span className="instl__mark"><Mark size={20} /></span>
        <p className="instl__txt">
          {mode === 'ios' ? (
            <React.Fragment>
              <b>Install pricy.</b>
              <span className="instl__step">Tap <span className="instl__k"><Icon name="share" size={13} />Share</span>, then <b>Add to Home Screen</b>.</span>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <b>Install pricy.</b>
              <span className="instl__step">Full-screen app on your home screen — price alerts arrive as notifications.</span>
            </React.Fragment>
          )}
        </p>
        {mode === 'android' && <Btn variant="dark" size="sm" icon="download" onClick={install}>Install app</Btn>}
        <button type="button" className="instl__x" onClick={dismiss} title="Dismiss" aria-label="Dismiss install prompt"><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

function Footer({ go, authed = true }) {
  const PUB = { about: 1, landing: 1, login: 1 };
  const nav = (route, params) => go(authed || PUB[route] ? route : 'login', params);
  const col = (h, items) => (
    <div className="ftr__col">
      <h5>{h}</h5>
      {items.map(i => <a key={i.label} onClick={() => nav(i.route, i.params)}>{i.label}</a>)}
    </div>
  );
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr__row">
          <div className="ftr__col" style={{ maxWidth: 260 }}>
            <img src="assets/logo-wordmark-reversed.svg" alt="pricy.no" />
            <p style={{ color: 'var(--ink-400)', fontSize: 14, lineHeight: 1.5, marginTop: 16 }}>
              Norway's price comparison. No shop pays for placement — ever.
            </p>
          </div>
          {col('Shop', [
            { label: 'Browse categories', route: 'browse' },
            { label: 'Biggest drops', route: 'results', params: { query: '' } },
            { label: 'Price alerts', route: 'alerts' },
            { label: 'Watchlist', route: 'alerts' },
            { label: 'Lists', route: 'lists' },
          ])}
          {col('Company', [
            { label: 'About', route: 'about' },
            { label: 'How it works', route: 'about', params: { section: 'how' } },
            { label: 'Pricy Plus', route: authed ? 'account' : 'about', params: authed ? { tab: 'plan' } : undefined },
            { label: 'Privacy', route: authed ? 'account' : 'about', params: authed ? { tab: 'privacy' } : undefined },
          ])}
        </div>
      </div>
      <div className="wrap">
        <div className="ftr__bot">
          <span>© 2026 SNE Studio AS · org.nr. 925 621 900 — Oslo, Norway</span>
          <span>Prices updated {relTime((metaOf() || {}).freshest)} · {fmt((metaOf() || {}).shops || 0)} shops tracked</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Footer, InstallPrompt });
