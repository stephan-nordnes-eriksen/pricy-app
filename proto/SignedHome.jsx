// ===========================================================
// Pricy.no — Signed-in Home (the index)
// Layouts: search · dashboard · feed  (switch via Tweaks)
// ===========================================================

function SectionHead({ icon, title, count, moreLabel = 'See all', onMore, go }) {
  return (
    <div className="sec__head">
      <h2>{icon && <span className="ico"><Icon name={icon} size={20} /></span>}{title}{count != null && <span className="sec__count">{count}</span>}</h2>
      <span className="more" onClick={onMore || (() => go && go('home'))}>{moreLabel} <Icon name="arrow-right" size={14} /></span>
    </div>
  );
}

function SearchHero({ go }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  return (
    <div className="searchhero">
      <div className="searchhero__inner">
        <h1>What are you <span className="hl">buying</span>?</h1>
        <form className="searchhero__bar" onSubmit={e => { e.preventDefault(); setFocus(false); go('results', { query: q.trim() || 'headphones' }); }}>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', color: 'var(--ink-600)' }}><Icon name="search" size={22} /></span>
            <input value={q} onChange={e => setQ(e.target.value)} onFocus={e => { setFocus(true); searchScrollTop(e); }} onBlur={() => setTimeout(() => setFocus(false), 120)} placeholder="Search any product, brand or category…" />
          </div>
          <button type="submit" className="btn btn--primary btn--lg" style={{ borderLeft: 0, height: 60 }}>Compare</button>
          {focus && <SearchSuggest q={q} onPick={(v) => { setFocus(false); const prod = (window.CATALOG || []).find(p => p.name === v); prod ? go('product', { id: prod.id }) : CATEGORIES.includes(v) ? go('results', { cat: v }) : go('results', { query: v }); }} />}
        </form>
        <div className="searchhero__chips">
          <span className="lbl">Trending</span>
          {POPULAR.map(t => <a key={t} className="cchip" onClick={() => go('results', { query: t })}>{t}</a>)}
        </div>
      </div>
    </div>
  );
}

// ---- LAYOUT: SEARCH-FIRST ---------------------------------
function LayoutSearch({ go }) {
  return (
    <div className="home page">
      <SearchHero go={go} />
      <MetricStrip />
      <div className="sec">
        <SectionHead icon="bookmark" title="Watching" count={WATCHED.length} moreLabel="Manage" go={go} />
        <WatchedList go={go} />
      </div>
      {RECENT.length > 0 && (
      <div className="sec">
        <SectionHead icon="history" title="Recently viewed" go={go} />
        <RecentRail go={go} />
      </div>
      )}
      <div className="sec">
        <SectionHead icon="layout-grid" title="Browse categories" go={go} />
        <CategoryGrid go={go} />
      </div>
    </div>
  );
}

// ---- LAYOUT: DASHBOARD ------------------------------------
function LayoutDashboard({ go }) {
  useWatchStore();
  return (
    <div className="home page">
      <div className="home__greet">
        <div>
          <h1>Good afternoon, {USER.name}.</h1>
          <div className="wave">{WatchStore.hits()} of your watched products are below target right now.</div>
        </div>
        <Btn variant="primary" icon="plus">Watch a product</Btn>
      </div>
      <MetricStrip />
      <div className="dash">
        <div>
          <div className="sec">
            <SectionHead icon="bookmark" title="Watching" count={WATCHED.length} moreLabel="Manage" go={go} />
            <WatchedList go={go} />
          </div>
          {RECENT.length > 0 && (
          <div className="sec">
            <SectionHead icon="history" title="Recently viewed" go={go} />
            <RecentRail go={go} />
          </div>
          )}
          <div className="sec">
            <SectionHead icon="layout-grid" title="Browse categories" go={go} />
            <CategoryGrid go={go} />
          </div>
        </div>
        <aside className="dash__side">
          <AlertFeedCard go={go} />
          <div className="sidecard">
            <div className="sidecard__head"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="flame" size={13} className="ic" /> Biggest drops today</span></div>
            <div className="sidecard__body" style={{ padding: 0 }}>
              {PRODUCTS.slice().sort((a, b) => b.drop - a.drop).slice(0, 3).map(p => (
                <div key={p.id} className="afeed__item" onClick={() => go('product', { id: p.id })} style={{ alignItems: 'center' }}>
                  <div className="wrow__img" style={{ width: 44, height: 44 }}><Icon name={p.icon} size={20} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{p.name}</div>
                    <div className="afeed__time" style={{ marginTop: 2 }}>{p.shops} shops</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <PriceTag value={p.best} size={14} />
                    <div><Delta pct={-p.drop} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---- LAYOUT: FEED -----------------------------------------
function FeedCard({ f, go }) {
  const kindLabel = { down: { t: 'Price drop', c: 'var(--green-700)' }, up: { t: 'Price up', c: 'var(--up-600)' }, watch: { t: 'Watch', c: 'var(--ink-900)' } }[f.kind];
  const pct = Math.round(((f.to - f.from) / f.from) * 100);
  return (
    <div className="feedcard">
      <div className="feedcard__head">
        <div className={'afeed__dot ' + f.kind} style={{ width: 26, height: 26 }}>
          <Icon name={f.kind === 'up' ? 'trending-up' : f.kind === 'watch' ? 'eye' : 'trending-down'} size={14} />
        </div>
        <span className="feedcard__kind" style={{ color: kindLabel.c }}>{f.tag}</span>
        <span className="feedcard__time">{f.time}</span>
      </div>
      <div className="feedcard__body" onClick={() => go('product', { id: f.id })}>
        <div className="feedcard__img"><Icon name={f.prod.icon} size={30} /></div>
        <div>
          <div className="feedcard__name">{f.title}</div>
          <div className="feedcard__sub">{f.text} · {f.prod.shops} shops tracked</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
            <span className="strike" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>kr {fmt(f.from)}</span>
            <PriceTag value={f.to} size={20} color={f.kind === 'up' ? 'var(--up-600)' : 'var(--green-700)'} />
          </div>
          <div style={{ marginTop: 4 }}><Delta pct={pct} /></div>
        </div>
      </div>
    </div>
  );
}

function LayoutFeed({ go }) {
  const items = useWatchStore();
  return (
    <div className="home page">
      <div className="feed">
        <div className="home__greet" style={{ marginBottom: 'var(--s-4)' }}>
          <div>
            <h1>Your price feed</h1>
            <div className="wave">Live updates from {items.length} watched products · {WatchStore.hits()} below target</div>
          </div>
        </div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="metric"><div className="metric__k"><Icon name="bell-ring" size={12} /> Active alerts</div><div className="metric__v green">{WatchStore.hits()}</div></div>
          <div className="metric"><div className="metric__k"><Icon name="trending-down" size={12} /> Potential savings</div><div className="metric__v green">kr {fmt(WatchStore.saved())}</div></div>
          <div className="metric"><div className="metric__k"><Icon name="bookmark" size={12} /> Watching</div><div className="metric__v">{items.length}</div></div>
        </div>
        {FEED.map((f, i) => <FeedCard key={i} f={f} go={go} />)}
        <div className="sec" style={{ marginTop: 'var(--s-7)' }}>
          <SectionHead icon="layout-grid" title="Browse categories" go={go} />
          <CategoryGrid go={go} />
        </div>
      </div>
    </div>
  );
}

function SignedHome({ go, onLogout, layout = 'dashboard' }) {
  const Body = layout === 'search' ? LayoutSearch : layout === 'feed' ? LayoutFeed : LayoutDashboard;
  return (
    <div className="screen">
      <AppHeader go={go} onLogout={onLogout} />
      <Body go={go} />
    </div>
  );
}

Object.assign(window, { SignedHome, SearchHero, SectionHead, LayoutSearch, LayoutDashboard, LayoutFeed, FeedCard });
