// ===========================================================
// Pricy.no — Public landing (logged out)
// Efficient, motion-driven. Minimal copy; features shown live.
// ===========================================================

function LandingHeader({ go }) {
  return (
    <header className="app-hdr">
      <div className="page app-hdr__row">
        <div className="app-hdr__logo" onClick={() => go('landing')}>
          <Wordmark height={26} />
        </div>
        <nav className="app-hdr__nav" style={{ marginLeft: 'auto', gap: 'var(--s-2)' }}>
          <span className="navlink" onClick={() => go('login')}>Log in to browse</span>
          <span className="navlink" onClick={() => go('about', { section: 'how' })}>How it works</span>
          <Btn variant="ghost" size="sm" onClick={() => go('login')}>Log in</Btn>
          <Btn variant="primary" size="sm" icon="arrow-right" onClick={() => go('login')}>Sign up free</Btn>
        </nav>
      </div>
    </header>
  );
}

// Live "best price found" demo card — animates a chart + alert
function HeroDemo() {
  const p = byId.tv;
  const saved = useCountTo(6000, true, 1100);
  const [stage, setStage] = useState(0); // 0 scanning, 1 found
  useEffect(() => { const t = setTimeout(() => setStage(1), 1300); return () => clearTimeout(t); }, []);
  return (
    <div className="card card--raised" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ padding: 'var(--s-4)', borderBottom: 'var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div className="wrow__img" style={{ width: 52, height: 52, flex: '0 0 auto' }}><Icon name={p.icon} size={26} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, lineHeight: 1.15 }}>{p.name}</div>
            <div className="afeed__time" style={{ marginTop: 4 }}>Tracking {p.shops} shops · live</div>
          </div>
        </div>
        <span style={{ flex: '0 0 auto' }}><Tag kind="best">▼ −{p.drop}%</Tag></span>
      </div>
      <div style={{ padding: 'var(--s-4)' }}>
        <svg viewBox="0 0 520 150" preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }} className="draw">
          {(() => {
            const pts = p.history, w = 520, h = 150, max = Math.max(...pts), min = Math.min(...pts), r = max - min || 1, step = w / (pts.length - 1);
            const xy = (v, i) => [i * step, h - ((v - min) / r) * (h - 24) - 12];
            let line = '', area = '';
            pts.forEach((v, i) => { const [x, y] = xy(v, i); line += (i === 0 ? `M ${x} ${y}` : ` H ${x} V ${y}`); });
            const [lx, ly] = xy(pts[pts.length - 1], pts.length - 1);
            area = `${line} L ${w} ${h} L 0 ${h} Z`;
            const lowY = h - ((min - min) / r) * (h - 24) - 12;
            return (<>
              <path d={area} fill="var(--green-100)" />
              <line x1="0" y1={ly} x2={w} y2={ly} stroke="var(--green-500)" strokeWidth="1.5" strokeDasharray="5 4" />
              <path className="draw-line" d={line} stroke="var(--ink-900)" strokeWidth="2.5" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
              <rect x={lx - 6} y={ly - 6} width="12" height="12" fill="var(--green-500)" stroke="var(--ink-900)" strokeWidth="2" />
            </>);
          })()}
        </svg>
      </div>
      <div style={{ padding: 'var(--s-3) var(--s-4)', borderTop: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: stage ? 'var(--green-500)' : 'var(--paper)', transition: 'background 200ms var(--ease)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
          <Icon name={stage ? 'badge-check' : 'loader'} size={16} /> {stage ? 'Best price found' : 'Scanning shops…'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="strike" style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>kr {fmt(p.was)}</span>
          <PriceTag value={p.best} size={24} />
        </div>
      </div>
    </div>
  );
}

// scrolling live ticker of price drops
function Ticker() {
  const items = PRODUCTS.slice().sort((a, b) => b.drop - a.drop);
  const row = (key) => (
    <div className="tick-row" key={key}>
      {items.map((p, i) => (
        <span className="tick-item" key={key + i}>
          <Icon name={p.icon} size={14} />
          <span className="tick-name">{p.name}</span>
          <span className="tick-drop">▼ −{p.drop}%</span>
          <span className="tick-price">kr {fmt(p.best)}</span>
        </span>
      ))}
    </div>
  );
  return <div className="ticker"><div className="ticker__track">{row('a')}{row('b')}</div></div>;
}

function StepCard({ n, icon, title, children }) {
  return (
    <div className="step">
      <div className="step__n">{n}</div>
      <div className="step__ic"><Icon name={icon} size={26} /></div>
      <div className="step__title">{title}</div>
      <div className="step__txt">{children}</div>
    </div>
  );
}

function Landing({ go }) {
  const trending = PRODUCTS.slice().sort((a, b) => b.drop - a.drop).slice(0, 8);
  const m = metaOf() || {};
  return (
    <div className="screen">
      <LandingHeader go={go} />
      <Ticker />
      <section className="lhero">
        <div className="page lhero__grid">
          <div className="lhero__copy">
            <div className="lhero__eyebrow"><span className="dot" /> Live across {fmt(m.shops || 0)} Norwegian shops</div>
            <h1>Never<br />overpay.<br /><span className="hl">Ever.</span></h1>
            <p className="lhero__sub">Track any product. We watch the price across every shop and ping you the moment it drops.</p>
            <div className="lhero__cta">
              <Btn variant="primary" size="lg" icon="arrow-right" onClick={() => go('login')}>Start watching — free</Btn>
              <Btn variant="ghost" size="lg" onClick={() => go('login')}>Log in</Btn>
            </div>
            <div className="lhero__trust">
              <span><b>{fmt(m.products || 0)}</b> products</span><span className="sep" />
              <span><b>{fmt(m.shops || 0)}</b> shops</span><span className="sep" />
              <span><b>0</b> paid placements</span>
            </div>
          </div>
          <div className="lhero__demo"><HeroDemo /></div>
        </div>
      </section>

      <section className="page" style={{ padding: 'var(--s-8) 0' }}>
        <div className="steps">
          <StepCard n="1" icon="search" title="Find it">Search all {fmt(m.products || 0)} products we track, or browse by category and spec.</StepCard>
          <StepCard n="2" icon="bookmark" title="Watch it">Set your target price. One tap, no spreadsheet.</StepCard>
          <StepCard n="3" icon="bell-ring" title="Get pinged">We alert you the second any shop drops below it.</StepCard>
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="sec__head"><h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="ico" style={{ color: 'var(--green-700)', display: 'flex' }}><Icon name="flame" size={20} /></span>Biggest discounts</h2><span className="more" onClick={() => go('login')}>See all <Icon name="arrow-right" size={14} /></span></div>
        <div className="pgrid">
          {trending.map(p => (
            <div key={p.id} className="pcard" onClick={() => go('login')}>
              {p.drop >= 20 && <span className="pcard__tag"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
              <div className="pcard__img"><Icon name={p.icon} size={42} /></div>
              <div className="pcard__name">{p.name}</div>
              <div className="pcard__foot">
                <div><div className="pcard__from">from</div><PriceTag value={p.best} size={20} /></div>
                <div style={{ textAlign: 'right' }}><div className="pcard__meta">{p.shops} shops</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lcta">
        <div className="page lcta__inner">
          <h2>Set a target.<br />We'll do the watching.</h2>
          <Btn variant="primary" size="lg" icon="arrow-right" onClick={() => go('login')}>Create free account</Btn>
        </div>
      </section>

      <Footer go={go} authed={false} />
    </div>
  );
}

Object.assign(window, { Landing, LandingHeader, HeroDemo, Ticker });
