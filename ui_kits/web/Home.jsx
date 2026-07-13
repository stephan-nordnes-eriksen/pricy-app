// ===========================================================
// Pricy.no Web Kit — Home screen
// ===========================================================

function ProductCard({ p, go }) {
  return (
    <div className="pcard" onClick={() => go('product', { id: p.id })}>
      {p.drop >= 20 && <span className="pcard__tag"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
      <div className="pcard__img"><Icon name={p.icon} size={42} /></div>
      <div className="pcard__name">{p.name}</div>
      <div className="pcard__foot">
        <div>
          <div className="pcard__from">from</div>
          <Price value={p.best} size={20} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pcard__meta">{p.shops} shops</div>
        </div>
      </div>
    </div>
  );
}

function Home({ go }) {
  const [q, setQ] = useState('');
  const trending = PRODUCTS.slice().sort((a, b) => b.drop - a.drop).slice(0, 8);
  return (
    <div>
      <section className="hero">
        <div className="wrap">
          <div className="hero__inner">
            <h1>Never overpay.<br />Find the <span className="hl">best price</span>.</h1>
            <p className="hero__sub">Compare the exact same product across 1,400 Norwegian shops. We track price history, so you know a deal is really a deal.</p>
            <form className="hero__search" onSubmit={e => { e.preventDefault(); go('results', { query: q || 'airpods pro' }); }}>
              <div className="field">
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', color: 'var(--ink-600)' }}><Icon name="search" size={22} /></span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search any product…" autoFocus />
              </div>
              <Btn variant="primary" size="lg" style={{ borderLeft: 0 }} onClick={() => go('results', { query: q || 'airpods pro' })}>Compare</Btn>
            </form>
            <div className="hero__popular">
              <span className="lbl">Popular</span>
              {POPULAR.map(t => <a key={t} className="cchip" onClick={() => go('results', { query: t })}>{t}</a>)}
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section__head">
          <h2>Biggest price drops today</h2>
          <span className="more" onClick={() => go('deals')}>All deals <Icon name="arrow-right" size={14} /></span>
        </div>
        <div className="pgrid">
          {trending.map(p => <ProductCard key={p.id} p={p} go={go} />)}
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 64 }}>
        <div className="section__head"><h2>Browse categories</h2></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {CATEGORIES.map(c => (
            <a key={c} className="cchip" style={{ padding: '12px 18px', fontSize: 14 }} onClick={() => go('results', { query: c })}>{c}</a>
          ))}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { Home, ProductCard });
