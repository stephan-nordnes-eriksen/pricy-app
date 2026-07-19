// ===========================================================
// Pricy.no — Alerts / Watchlist page (signed in)
// Tabs: Watching (manage list) · Activity (alert feed)
// ===========================================================

function AlertRow({ r, go, onRemove }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(r.target);
  const save = () => { const n = +v; if (n > 0) WatchStore.setTarget(r.id, n); setEdit(false); };
  const p = r.p;
  const active = r.hit && !r.paused;
  return (
    <div className={'alrow' + (active ? ' is-hit' : '') + (r.paused ? ' is-paused' : '')}>
      {active && <span className="wrow__flag"></span>}
      <div className="wrow__img"><Icon name={p.icon} size={24} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="alrow__name" onClick={() => go('product', { id: p.id })}>{p.name}</div>
        <div className="alrow__meta">
          <span>{p.brand}</span><span>{p.shops} shops</span>
          {active && <span className="tag tag--best" style={{ fontSize: 9 }}>Below target</span>}
          {r.paused && <span className="tag" style={{ fontSize: 9 }}>Paused</span>}
        </div>
      </div>
      <div className="alrow__spark"><Sparkline points={p.history.slice(-12)} w={110} h={34} color={active ? 'var(--green-700)' : 'var(--ink-900)'} /></div>
      <div>
        <div className="alrow__lbl">Best now</div>
        <Price value={p.best} size={17}></Price>
      </div>
      <div className="alrow__tgtcol">
        <div className="alrow__lbl">Your target</div>
        {edit ? (
          <span className="tgt-edit">
            <span className="cur">kr</span>
            <input type="number" autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
            <button onClick={save} aria-label="Save target"><Icon name="check" size={14} /></button>
          </span>
        ) : (
          <button className="tgt-btn" onClick={() => { setV(r.target); setEdit(true); }}>
            kr {fmt(r.target)} <Icon name="pencil" size={12} />
          </button>
        )}
      </div>
      <div className="alrow__act">
        <button className="iconbtn" title={r.paused ? 'Resume alerts' : 'Pause alerts'} onClick={() => WatchStore.setPaused(r.id, !r.paused)}>
          <Icon name={r.paused ? 'play' : 'pause'} size={16} />
        </button>
        <button className="iconbtn danger" title="Stop watching" onClick={() => onRemove ? onRemove(r) : WatchStore.remove(r.id)}>
          <Icon name="trash-2" size={16} />
        </button>
      </div>
    </div>
  );
}

function ActivityFeed({ go }) {
  return (
    <div className="actfeed">
      {FEED.length === 0 ? (
        <div className="empty">
          <div className="empty__ic"><Icon name="bell-off" size={40} /></div>
          <h2>No alerts yet</h2>
          <p>Set a target price on a watched product and we'll notify you here.</p>
        </div>
      ) : FEED.map((f, i) => (
        <div key={i} className="actrow" onClick={() => go('product', { id: f.id })}>
          <div className={'actrow__dot ' + f.kind}>
            <Icon name={f.kind === 'up' ? 'trending-up' : f.kind === 'watch' ? 'eye' : 'trending-down'} size={17} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="actrow__txt"><b>{f.title}</b> {f.text}</div>
            <div className="actrow__meta">
              <Tag kind={f.kind === 'up' ? 'up' : f.kind === 'watch' ? 'watch' : 'down'}>{f.tag}</Tag>
              <span>{f.time}</span>
            </div>
          </div>
          <div className="actrow__price">
            <span className="from">kr {fmt(f.from)}</span>
            <span className="to" style={{ color: f.kind === 'up' ? 'var(--up-600)' : 'var(--green-700)' }}>kr {fmt(f.to)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertsPage({ go, tab: tab0 }) {
  const watches = useWatchStore();
  const plan = usePlan();
  const [tab, setTab] = useState(tab0 === 'activity' ? 'activity' : 'watching');
  const [removed, setRemoved] = useState(null); // {id, target} for undo
  const [paywall, setPaywall] = useState(false);
  const rows = watches.map(w => ({ ...w, p: WatchStore.prod(w.id) })).filter(r => r.p);
  const hits = rows.filter(r => r.hit && !r.paused).length;

  const remove = (r) => { setRemoved({ id: r.id, target: r.target, name: r.p.name }); WatchStore.remove(r.id); };

  return (
    <div className="screen" data-screen-label="Alerts & watchlist">
      <AppHeader go={go} active="alerts" onLogout={() => go('landing')} />
      <div className="page al">
        <div className="al__head">
          <div>
            <h1>Watchlist &amp; alerts</h1>
            <div className="sub">{rows.length} watched · {hits} below target · kr {fmt(WatchStore.saved())} potential savings</div>
          </div>
          <Btn variant="primary" icon="plus" onClick={() => go('browse')}>Watch a product</Btn>
        </div>

        <div className="seg" role="tablist">
          <button className={tab === 'watching' ? 'is-on' : ''} onClick={() => setTab('watching')}>
            <Icon name="bookmark" size={14} /> Watching {hits > 0 && <span className="n">{hits}</span>}
          </button>
          <button className={tab === 'activity' ? 'is-on' : ''} onClick={() => setTab('activity')}>
            <Icon name="bell-ring" size={14} /> Activity
          </button>
        </div>

        {tab === 'watching' ? (
          <React.Fragment>
            {removed && (
              <div className="undo-bar">
                <span>Stopped watching <b>{removed.name}</b></span>
                <a onClick={() => { WatchStore.add(removed.id, removed.target); setRemoved(null); }}>Undo</a>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="empty">
                <div className="empty__ic"><Icon name="bookmark-x" size={40} /></div>
                <h2>You're not watching anything</h2>
                <p>Find a product and set a target price — we'll ping you when it drops.</p>
                <Btn variant="primary" icon="search" onClick={() => go('browse')}>Browse categories</Btn>
              </div>
            ) : (
              <div className="watchlist">
                {rows.map(r => <AlertRow key={r.id} r={r} go={go} onRemove={remove} />)}
              </div>
            )}
            <div style={{ marginTop: 'var(--s-5)' }}>
              {plan === 'plus' ? (
                <div className="lockcard" style={{ cursor: 'default' }}>
                  <div className="lockcard__ic"><Icon name="sparkles" size={20} /></div>
                  <div>
                    <b>Price forecast <PlusTag></PlusTag> <SoonTag></SoonTag></b>
                    <p>Sony WH-1000XM5 is likely to drop another 4–6% before Black Week. Samsung OLED is at its floor — buy now.</p>
                  </div>
                </div>
              ) : (
                <LockedCard icon="sparkles" title="Price forecast" desc="Know whether to buy now or wait — AI prediction per watched product." onOpen={() => setPaywall(true)} />
              )}
            </div>
          </React.Fragment>
        ) : (
          <ActivityFeed go={go} />
        )}
      </div>
      {paywall && <PlusModal onClose={() => setPaywall(false)} go={go} />}
    </div>
  );
}

Object.assign(window, { AlertsPage, ActivityFeed });
