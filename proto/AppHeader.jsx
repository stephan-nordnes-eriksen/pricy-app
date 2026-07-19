// ===========================================================
// Pricy.no — Signed-in app header (search + live suggest)
// ===========================================================

function SearchSuggest({ q, onPick, onClose }) {
  const { products, cats, props } = searchSuggest(q);
  if (!products.length && !cats.length && !props.length) return null;
  return (
    <div className="suggest" onMouseDown={e => e.preventDefault()}>
      {products.length > 0 && <>
        <div className="suggest__grp">Products</div>
        {products.map(p => (
          <div key={p.id} className="suggest__item" onClick={() => onPick(p.name)}>
            <span className="ic"><Icon name={p.icon} size={18} /></span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{p.name}</div>
              <div className="sub">{p.brand} · {p.shops} shops</div>
            </div>
            <span className="price"><span className="cur" style={{ fontSize: 12 }}>kr</span><b style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>{fmt(p.best)}</b></span>
          </div>
        ))}
      </>}
      {cats.length > 0 && <>
        <div className="suggest__grp">Categories</div>
        {cats.map(c => (
          <div key={c} className="suggest__item" onClick={() => onPick(c)}>
            <span className="ic"><Icon name={CAT_ICONS[c] || 'tag'} size={18} /></span>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{c}</div>
            <span className="sub" style={{ marginLeft: 'auto' }}>{catCount(c)} products</span>
          </div>
        ))}
      </>}
      {props.length > 0 && <>
        <div className="suggest__grp">Filter by</div>
        <div className="suggest__props">
          {props.map(p => <a key={p} className="cchip" onClick={() => onPick(p)}>{p}</a>)}
        </div>
      </>}
    </div>
  );
}

function AppHeader({ go, onLogout }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);
  useWatchStore();
  const hits = WatchStore.hits();
  const submit = (e) => { e && e.preventDefault(); const query = q.trim(); if (!query) return; setFocus(false); go('results', { query }); };
  return (
    <header className="app-hdr">
      <div className="page app-hdr__row">
        <div className="app-hdr__logo" onClick={() => go('home')}>
          <span className="logo-full"><Wordmark height={26} /></span>
          <span className="logo-min"><Mark size={30} /></span>
        </div>
        <div className="app-hdr__search">
          <form onSubmit={submit}>
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--ink-600)' }}><Icon name="search" size={18} /></span>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onFocus={e => { setFocus(true); searchScrollTop(e); }}
                onBlur={() => setTimeout(() => setFocus(false), 120)}
                placeholder="Search products, brands, categories…" />
              {q && <button type="button" className="pw-toggle" onMouseDown={() => setQ('')} aria-label="Clear"><Icon name="x" size={16} /></button>}
            </div>
          </form>
          {focus && <SearchSuggest q={q} onPick={(v) => { setFocus(false); const prod = (window.CATALOG || []).find(p => p.name === v); prod ? go('product', { id: prod.id }) : CATEGORIES.includes(v) ? go('results', { cat: v }) : go('results', { query: v }); }} />}
        </div>
        <nav className="app-hdr__nav">
          <div className="app-hdr__icon" title="Browse" onClick={() => go('home')}><Icon name="layout-grid" size={19} /></div>
          <div className="app-hdr__icon" title="Watching" onClick={() => go('alerts', { tab: 'watching' })}>
            <Icon name="bookmark" size={19} />
          </div>
          <div className="app-hdr__icon" title="Auto-buy" onClick={() => go('autobuy')}><Icon name="zap" size={19} /></div>
          <div className="app-hdr__icon" title="Alerts" onClick={() => go('alerts')}>
            <Icon name="bell" size={19} />
            {hits > 0 && <span className="badge">{hits}</span>}
          </div>
          <div className="app-hdr__acct" style={{ position: 'relative' }}>
            <div className="avatar" title={USER.name} onClick={e => { e.stopPropagation(); setMenu(m => !m); }}>{USER.initials}</div>
            {menu && (
              <div className="acctmenu">
                <div className="acctmenu__id"><b>{USER.name}</b><span>{USER.email}</span></div>
                <div className="acctmenu__item" onClick={() => go('account')}><Icon name="settings" size={16} /> Account settings</div>
                <div className="acctmenu__item" onClick={() => go('account', { tab: 'notifications' })}><Icon name="bell" size={16} /> Notifications</div>
                <div className="acctmenu__item" onClick={() => go('account', { tab: 'plan' })}><Icon name="credit-card" size={16} /> Plan &amp; billing</div>
                <div className="acctmenu__sep"></div>
                <div className="acctmenu__item" onClick={onLogout}><Icon name="log-out" size={16} /> Log out</div>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

Object.assign(window, { AppHeader, SearchSuggest });
