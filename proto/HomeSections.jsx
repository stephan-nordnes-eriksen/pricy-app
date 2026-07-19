// ===========================================================
// Pricy.no — Signed-in home: reusable sections
// ===========================================================

// Animated sparkline (draws in on mount)
function DrawSpark({ points, w = 120, h = 36, color = 'var(--ink-900)', draw = true }) {
  const max = Math.max(...points), min = Math.min(...points), r = max - min || 1;
  const step = w / (points.length - 1);
  let d = '';
  points.forEach((p, i) => {
    const px = (i * step).toFixed(1), py = (h - ((p - min) / r) * (h - 6) - 3).toFixed(1);
    d += (i === 0 ? `M ${px} ${py}` : ` H ${px} V ${py}`);
  });
  const lastY = h - ((points[points.length - 1] - min) / r) * (h - 6) - 3;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" preserveAspectRatio="none" className={draw ? 'draw' : ''}>
      <path className={draw ? 'draw-line' : ''} d={d} stroke={color} strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x={w - 3} y={lastY - 3} width="6" height="6" fill={color} />
    </svg>
  );
}

function PriceTag({ value, size = 22, color }) {
  return (
    <span className="price" style={{ color }}>
      <span className="cur" style={{ fontSize: Math.round(size * 0.62), color: color || 'var(--ink-600)' }}>kr</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: size, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{fmt(value)}</span>
    </span>
  );
}

// ---- METRIC STRIP -----------------------------------------
function MetricStrip() {
  const items = useWatchStore();
  const saved = useCountTo(WatchStore.saved(), true, 1000);
  return (
    <div className="metrics">
      <div className="metric">
        <div className="metric__k"><Icon name="bookmark" size={12} /> Watching</div>
        <div className="metric__v">{items.length}</div>
        <div className="metric__sub">products tracked</div>
      </div>
      <div className="metric">
        <div className="metric__k"><Icon name="bell-ring" size={12} /> Active alerts</div>
        <div className="metric__v green">{WatchStore.hits()}</div>
        <div className="metric__sub">below target now</div>
      </div>
      <div className="metric">
        <div className="metric__k"><Icon name="trending-down" size={12} /> Potential savings</div>
        <div className="metric__v green">kr {fmt(saved)}</div>
        <div className="metric__sub">on your watchlist</div>
      </div>
      <div className="metric">
        <div className="metric__k"><Icon name="store" size={12} /> Coverage</div>
        <div className="metric__v">{fmt((metaOf() || {}).shops || 0)}</div>
        <div className="metric__sub">shops tracked live</div>
      </div>
    </div>
  );
}

// ---- WATCHED LIST -----------------------------------------
function WatchRow({ w, go, draw }) {
  return (
    <div className={'wrow' + (w.hit ? ' is-hit' : '')} onClick={() => go('product', { id: w.id })}>
      {w.hit && <span className="wrow__flag" />}
      <div className="wrow__img"><Icon name={w.icon} size={26} /></div>
      <div>
        <div className="wrow__name">{w.name}</div>
        <div className="wrow__meta">
          <span>{w.brand}</span><span>·</span><span>{w.shops} shops</span>
          {w.hit
            ? <Tag kind="best">▼ Target hit</Tag>
            : <span className="muted">Best at {w.offers[0].shop}</span>}
        </div>
      </div>
      <div className="wrow__spark">
        <DrawSpark points={w.spark} w={140} h={38} color={w.hit ? 'var(--green-500)' : 'var(--ink-900)'} draw={draw} />
      </div>
      <div className="wrow__target">
        <div className="wrow__from">Target</div>
        <div><b>kr {fmt(w.target)}</b></div>
      </div>
      <div className="wrow__price">
        <div className="wrow__from">Now · best</div>
        <PriceTag value={w.best} size={20} color={w.hit ? 'var(--green-700)' : undefined} />
      </div>
    </div>
  );
}

function WatchedList({ go, draw = true }) {
  return (
    <div className="watchlist">
      {WATCHED.map(w => <WatchRow key={w.id} w={w} go={go} draw={draw} />)}
    </div>
  );
}

// ---- RECENTLY VIEWED RAIL ---------------------------------
function RecentRail({ go }) {
  return (
    <div className="rail">
      {RECENT.map(p => (
        <div key={p.id} className="rcard" onClick={() => go('product', { id: p.id })}>
          <div className="rcard__img"><Icon name={p.icon} size={32} /></div>
          <div className="rcard__name">{p.name}</div>
          <div className="rcard__price">
            <PriceTag value={p.best} size={15} />
            {p.drop >= 15 && <Delta pct={-p.drop} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- CATEGORY GRID ----------------------------------------
function CategoryGrid({ go }) {
  return (
    <div className="catgrid">
      {realCats().map(c => (
        <div key={c} className="cat" onClick={() => go('results', { cat: c })}>
          <div className="cat__ic"><Icon name={CAT_ICONS[c] || 'tag'} size={19} /></div>
          <div>
            <div className="cat__name">{c}</div>
            <div className="cat__ct">{catCount(c)} products</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- ALERT FEED (sidecard) --------------------------------
function AlertFeedCard({ go }) {
  return (
    <div className="sidecard">
      <div className="sidecard__head">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="bell-ring" size={13} className="ic" /> Recent alerts</span>
        <span style={{ color: 'var(--green-700)', cursor: 'pointer' }} onClick={() => go('home')}>All</span>
      </div>
      <div className="afeed">
        {FEED.length === 0 ? (
          <div style={{ padding: 'var(--s-5) var(--s-4)', textAlign: 'center', color: 'var(--ink-600)', fontSize: 13, lineHeight: 1.5 }}>
            <Icon name="bell-off" size={22} className="ic" style={{ color: 'var(--ink-400)', marginBottom: 8 }} />
            <div>No alerts yet — set a target price on a watched product and we'll notify you here.</div>
          </div>
        ) : FEED.map((f, i) => (
          <div key={i} className="afeed__item" onClick={() => go('product', { id: f.id })}>
            <div className={'afeed__dot ' + f.kind}>
              <Icon name={f.kind === 'up' ? 'trending-up' : f.kind === 'watch' ? 'eye' : 'trending-down'} size={15} />
            </div>
            <div>
              <div className="afeed__txt"><b>{f.title}</b> {f.text}</div>
              <div className="afeed__time">{f.time} · kr {fmt(f.to)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { DrawSpark, PriceTag, MetricStrip, WatchedList, WatchRow, RecentRail, CategoryGrid, AlertFeedCard });
