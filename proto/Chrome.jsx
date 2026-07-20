// ===========================================================
// Pricy.no Web Kit — Header & Footer
// ===========================================================

// (legacy Header component removed — AppHeader / LandingHeader are the live headers)

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

Object.assign(window, { Footer });
