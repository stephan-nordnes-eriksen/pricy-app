// ===========================================================
// Pricy.no Web Kit — Header & Footer
// ===========================================================

function Header({ route, go, query, setQuery }) {
  const [val, setVal] = useState(query || '');
  useEffect(() => { setVal(query || ''); }, [query]);
  const submit = (e) => { e && e.preventDefault(); go('results', { query: val || 'airpods pro' }); };
  return (
    <header className="hdr">
      <div className="wrap hdr__row">
        <div className="hdr__logo" onClick={() => go('home')}>
          <img src="assets/logo-wordmark.svg" alt="pricy.no" />
        </div>
        <form className="hdr__search" onSubmit={submit}>
          <div className="field" style={{ height: 44 }}>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--ink-600)' }}>
              <Icon name="search" size={18} />
            </span>
            <input value={val} onChange={e => setVal(e.target.value)} placeholder="Search 1.4M products across 1,400 shops…" />
          </div>
        </form>
        <nav className="hdr__nav">
          <span className={'navlink ' + (route === 'deals' ? 'is-active' : '')} onClick={() => go('deals')}>Deals</span>
          <span className="navlink" onClick={() => go('results', { query: 'audio' })}>Categories</span>
          <span className="navlink" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Icon name="bell" size={15} /> Alerts
          </span>
          <span className="navlink" style={{ border: '2px solid var(--ink-900)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Icon name="user" size={15} /> Log in
          </span>
        </nav>
      </div>
    </header>
  );
}

function Footer({ go }) {
  const col = (h, items) => (
    <div className="ftr__col">
      <h5>{h}</h5>
      {items.map(i => <a key={i} onClick={() => go('deals')}>{i}</a>)}
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
          {col('Shop', ['Today\'s deals', 'Categories', 'Price alerts', 'New products'])}
          {col('Company', ['About', 'How it works', 'For shops', 'Press'])}
          {col('Help', ['Contact', 'FAQ', 'Privacy', 'Terms'])}
        </div>
      </div>
      <div className="wrap">
        <div className="ftr__bot">
          <span>© 2026 pricy.no — Oslo, Norway</span>
          <span>Prices updated every 30 min · 1,412 shops tracked</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Header, Footer });
