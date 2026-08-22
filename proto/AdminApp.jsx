// ===========================================================
// Pricy.no ADMIN — shell (sidebar, topbar, routing)
// ===========================================================
const ADM_TABS = [
  ['overview', 'Overview', 'layout-dashboard'],
  ['products', 'Products', 'package'],
  ['webstores', 'Webstores', 'store'],
  ['crawlers', 'Crawlers', 'bot'],
  ['moderation', 'Moderation', 'shield-alert'],
  ['users', 'Users', 'users'],
  ['system', 'System', 'settings-2'],
];
const ADM_TITLES = { overview: 'Overview', products: 'Product catalog', webstores: 'Webstore onboarding', crawlers: 'Crawlers & feeds', moderation: 'Moderation queue', users: 'Users', system: 'System & flags' };

class AdminBoundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() { if (this.state.e) return <pre style={{ padding: 24, font: '13px monospace', color: '#c0362c', whiteSpace: 'pre-wrap' }}>{String(this.state.e.stack || this.state.e)}</pre>; return this.props.children; }
}

function AdminApp() {
  const A = useAdmin();
  const [tab, setTab] = useState(() => (window.history.state && window.history.state.admTab) || 'overview');
  useEffect(() => {
    try { if (!(window.history.state && window.history.state.admTab)) window.history.replaceState({ admTab: tab }, ''); } catch (e) { }
    const onPop = e => { if (e.state && e.state.admTab) setTab(e.state.admTab); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = t => { try { window.history.pushState({ admTab: t }, ''); } catch (e) { } setTab(t); window.scrollTo(0, 0); };
  const badge = {
    moderation: A.mods.filter(m => m.status === 'pending').length || null,
    webstores: A.merchants.filter(m => m.stage !== 'live').length || null,
    crawlers: A.crawlers.filter(c => c.status === 'fail' || c.status === 'warn').length || null,
  };
  const Page = { overview: AdminOverview, products: AdminProducts, webstores: AdminStores, crawlers: AdminCrawlers, moderation: AdminMods, users: AdminUsers, system: AdminSystem }[tab];
  return (<div className="adm">
    <aside className="adm-side">
      <div className="adm-side__logo"><img src="assets/logo-wordmark-reversed.svg" alt="pricy.no" /><span className="sub">Admin</span></div>
      <nav className="adm-nav">{ADM_TABS.map(([k, l, ic]) => (
        <div key={k} className={'adm-nav__i' + (tab === k ? ' is-on' : '')} onClick={() => go(k)}>
          <Icon name={ic} size={16} /><span className="lb">{l}</span>
          {badge[k] && <span className={'adm-nav__n' + (k === 'crawlers' ? ' adm-nav__n--warn' : '')}>{badge[k]}</span>}
        </div>))}
      </nav>
      <div className="adm-side__foot">
        <div className="adm-me"><span className="adm-me__av">OPS</span><span className="adm-me__who"><b>Operations</b><span>{A.me}</span></span></div>
        <a className="adm-side__link" href="index.html" target="_blank" rel="noopener"><Icon name="external-link" size={13} /><span className="lb">Open pricy.no</span></a>
      </div>
    </aside>
    <div style={{ minWidth: 0 }}>
      {A.banner.on && <div className="adm-banner"><Icon name="megaphone" size={15} />{A.banner.text}<span style={{ marginLeft: 'auto', fontWeight: 400 }}>· visible to all users — manage under System</span></div>}
      <header className="adm-top">
        <span className="adm-top__crumb">ADMIN /</span>
        <span className="adm-top__title">{ADM_TITLES[tab]}</span>
        <span className="adm-top__right">
          <span className="adm-top__date">{(d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))(new Date())}</span>
          <span className="tag tag--solid">{window.ADMIN_ENV || 'PREVIEW'}</span>
        </span>
      </header>
      <Page go={go} />
    </div>
    <ToastHost />
  </div>);
}
ReactDOM.createRoot(document.getElementById('root')).render(<AdminBoundary><AdminApp /></AdminBoundary>);
