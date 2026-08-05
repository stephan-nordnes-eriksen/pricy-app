// ===========================================================
// Pricy.no Web Kit — Primitives & shared data
// ===========================================================
const { useState, useEffect, useRef } = React;

// --- NOK formatting: "1 499" with thin spaces ----------------
function fmt(n) { return (n == null || !isFinite(n)) ? '\u2014' : n.toLocaleString('en-US').replace(/,/g, '\u00A0'); }

// --- catalog meta helpers (real counts; CATALOG.meta set where the catalog is built) ---
function metaOf() { return (window.CATALOG && window.CATALOG.meta) || null; }
function relTime(ts) { if (!ts) return 'just now'; const mm = Math.max(0, Math.round((Date.now() - ts) / 60000)); if (mm < 1) return 'just now'; if (mm < 60) return mm + ' min ago'; const h = Math.round(mm / 60); if (h < 24) return h + ' hr ago'; return Math.round(h / 24) + ' d ago'; }
function trustLine() { const m = metaOf(); return m ? fmt(m.products) + ' products · ' + fmt(m.shops) + ' shops · 0 paid placements' : '0 paid placements'; }

// --- Product image / icon tile content ----------------------
function ProdImg({ p, size = 18, fill, style }) {
  if (p && p.img) {
    const s = fill ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block', ...style } : { width: size, height: size, objectFit: 'contain', display: 'block', ...style };
    return <img src={p.img} alt={p.name} loading="lazy" decoding="async" style={s} />;
  }
  return <Icon name={p.icon} size={size} style={style} />;
}

// --- Stock status badge (availability states per Google Merchant:
//     in stock / out of stock / backorder / unknown) ----------
const STOCK_STATES = {
  in:      { icon: 'check',       cls: 'ok',   label: 'In stock' },
  out:     { icon: 'x',           cls: 'out',  label: 'Out of stock' },
  back:    { icon: 'clock',       cls: 'back', label: 'Backorder' },
  unknown: { icon: 'circle-help', cls: 'unk',  label: 'Unknown' },
};
function StockBadge({ state, label }) {
  const s = STOCK_STATES[state] || STOCK_STATES.unknown;
  return (
    <span className={'stockb stockb--' + s.cls}>
      <span className="stockb__ic"><Icon name={s.icon} size={13} /></span>
      {label || s.label}
    </span>
  );
}

// --- Lucide icon wrapper -------------------------------------
function Icon({ name, size = 18, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const i = document.createElement('i');
      i.setAttribute('data-lucide', name);
      ref.current.appendChild(i);
      window.lucide.createIcons();
    }
  }, [name]);
  return <span className="icon" ref={ref} style={{ fontSize: size, ...style }} />;
}

// --- Price (currency + tabular number) -----------------------
function Price({ value, size = 22, cur = 'kr' }) {
  if (value == null || !isFinite(value)) return <span className="no-offers">No offers yet</span>;
  return (
    <span className="price">
      <span className="cur" style={{ fontSize: Math.round(size * 0.6) }}>{cur}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: size, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{fmt(value)}</span>
    </span>
  );
}

// --- Tag / badge --------------------------------------------
function Tag({ children, kind = '' }) {
  return <span className={'tag ' + (kind ? 'tag--' + kind : '')}>{children}</span>;
}

// --- Delta (price change) -----------------------------------
function Delta({ pct }) {
  const down = pct <= 0;
  return (
    <span className={'delta ' + (down ? 'delta--down' : 'delta--up')}>
      {down ? '▼' : '▲'} {Math.abs(pct)}%
    </span>
  );
}

// --- Button -------------------------------------------------
function Btn({ children, variant = '', size = '', icon, onClick, style, disabled, title, href, target, rel }) {
  const cls = ['btn', variant && 'btn--' + variant, size && 'btn--' + size].filter(Boolean).join(' ');
  const inner = <React.Fragment>{icon && <Icon name={icon} size={16} />}{children}</React.Fragment>;
  // href + target="_blank" renders a real anchor: outbound shop links must never
  // navigate the current tab (installed PWAs have no back button).
  if (href && !disabled) {
    return (
      <a className={cls} href={href} target={target} rel={rel || (target === '_blank' ? 'noopener' : undefined)} onClick={onClick} style={style} title={title}>
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick} style={style} disabled={disabled} title={title}>
      {inner}
    </button>
  );
}

// --- Sparkline (small inline price trend) -------------------
function Sparkline({ points, w = 120, h = 40, color = 'var(--ink-900)' }) {
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  let d = '';
  points.forEach((p, i) => {
    const px = (i * step).toFixed(1), py = (h - ((p - min) / range) * h).toFixed(1);
    d += (i === 0 ? `M ${px} ${py}` : ` H ${px} V ${py}`);
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" preserveAspectRatio="none">
      <path d={d} stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

// --- Price-history step chart -------------------------------
function HistoryChart({ points, low }) {
  const w = 560, h = 180, pad = 4;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const x = i => pad + i * step;
  const y = v => pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
  let line = '';
  points.forEach((p, i) => { line += (i === 0 ? `M ${x(i)} ${y(p)}` : ` H ${x(i)} V ${y(p)}`); });
  const area = `${line} V ${h - pad} H ${x(0)} Z`;
  const lastIdx = points.length - 1;
  const [hi, setHi] = React.useState(null);
  const wrapRef = React.useRef(null);
  const track = e => {
    const r = wrapRef.current.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setHi(Math.max(0, Math.min(lastIdx, Math.round(frac * lastIdx))));
  };
  const val = hi != null ? points[hi] : null;
  const leftPct = hi != null ? (x(hi) / w) * 100 : 0;
  const topPct = hi != null ? (y(val) / h) * 100 : 0;
  const weeksAgo = hi != null ? lastIdx - hi : 0;
  const whenLabel = weeksAgo === 0 ? 'today' : weeksAgo + (weeksAgo === 1 ? ' week ago' : ' weeks ago');
  const tipMod = leftPct > 78 ? ' chart__tip--left' : leftPct < 12 ? ' chart__tip--right' : '';
  return (
    <div className="chart__plot" ref={wrapRef} onMouseMove={track} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={area} fill="var(--green-100)" />
        <path d={line} stroke="var(--ink-900)" strokeWidth="2.5" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
        <line x1={x(0)} y1={y(low)} x2={w - pad} y2={y(low)} stroke="var(--green-500)" strokeWidth="2" strokeDasharray="6 4" />
        <rect x={x(lastIdx) - 5} y={y(points[lastIdx]) - 5} width="10" height="10" fill="var(--green-500)" stroke="var(--ink-900)" strokeWidth="2" />
      </svg>
      {hi != null && (
        <React.Fragment>
          <div className="chart__cursor" style={{ left: leftPct + '%' }} />
          <div className="chart__dot" style={{ left: leftPct + '%', top: topPct + '%' }} />
          <div className={'chart__tip' + tipMod} style={{ left: leftPct + '%', top: topPct + '%' }}>
            <span className="chart__tip-price">kr {fmt(val)}</span>
            <span className="chart__tip-when">{whenLabel}</span>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// --- Dual-thumb range slider (min AND max are scrubbable) ----
// Two stacked native inputs keep keyboard + a11y for free; the wrapper adds
// click-and-drag on the bare track (moves whichever thumb is nearer).
function niceStep(span) { const raw = (span || 1) / 100; const pow = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / pow; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow; }
function RangeSlider({ min, max, step, lo, hi, onChange, label = 'value' }) {
  const wrap = useRef(null);
  const span = (max - min) || 1;
  const st = step || Math.max(1, niceStep(span));
  const clamp = v => Math.min(max, Math.max(min, isFinite(v) ? v : min));
  // While a drag is active (track or native thumb), values live in local state
  // and onChange fires exactly once on pointerup. Keyboard commits immediately.
  const [tmp, setTmp] = useState(null); // {lo, hi} during a drag, else null
  const tmpRef = useRef(null);
  const setBoth = v => { tmpRef.current = v; setTmp(v); };
  const curLo = clamp(tmp ? tmp.lo : lo), curHi = clamp(tmp ? tmp.hi : hi);
  const pct = v => ((clamp(v) - min) / span) * 100;
  const a = pct(curLo), b = pct(curHi);
  const commit = () => { const c = tmpRef.current; setBoth(null); if (c) onChange(c.lo, c.hi); };
  const drag = (e) => {
    if (e.target !== wrap.current && e.target.tagName === 'INPUT') return; // native thumb drag
    const r = wrap.current.getBoundingClientRect();
    const valAt = x => clamp(min + Math.round((((x - r.left) / r.width) * span) / st) * st);
    const v0 = valAt(e.clientX);
    const pickLo = Math.abs(v0 - lo) <= Math.abs(v0 - hi);
    setBoth({ lo: clamp(lo), hi: clamp(hi) });
    const move = (ev) => {
      const v = valAt(ev.clientX), c = tmpRef.current;
      setBoth(pickLo ? { lo: Math.min(v, c.hi), hi: c.hi } : { lo: c.lo, hi: Math.max(v, c.lo) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    move(e); e.preventDefault();
  };
  const thumbDown = () => { setBoth({ lo: curLo, hi: curHi }); window.addEventListener('pointerup', commit, { once: true }); };
  const setLo = v => { const c = tmpRef.current; if (c) setBoth({ lo: Math.min(v, c.hi), hi: c.hi }); else onChange(Math.min(v, curHi), curHi); };
  const setHi = v => { const c = tmpRef.current; if (c) setBoth({ lo: c.lo, hi: Math.max(v, c.lo) }); else onChange(curLo, Math.max(v, curLo)); };
  return (
    <div className="range2" ref={wrap} onPointerDown={drag}>
      <div className="range2__track" />
      <div className="range2__fill" style={{ left: a + '%', right: (100 - b) + '%' }} />
      <input className="range2__in" type="range" min={min} max={max} step={st} value={curLo}
        aria-label={'Minimum ' + label} style={{ zIndex: a > 55 ? 4 : 3 }}
        onPointerDown={thumbDown} onChange={e => setLo(+e.target.value)} />
      <input className="range2__in" type="range" min={min} max={max} step={st} value={curHi}
        aria-label={'Maximum ' + label}
        onPointerDown={thumbDown} onChange={e => setHi(+e.target.value)} />
    </div>
  );
}

// ===========================================================
// DATA — Norwegian shops + products
// ===========================================================
const SHOPS = ['Elkjøp', 'Power', 'Komplett', 'NetOnNet', 'Clas Ohlson', 'Proshop', 'CDON', 'Dustin'];

function hist(base, vol) {
  const pts = [];
  let v = base * 1.35;
  for (let i = 0; i < 24; i++) { v += (Math.sin(i * 0.9) * vol) + (Math.random() - 0.55) * vol; v = Math.max(base, v); pts.push(Math.round(v / 10) * 10); }
  pts[pts.length - 1] = base;
  return pts;
}

const PRODUCTS = [
  { id: 'airpods', name: 'AirPods Pro (2nd gen, USB-C)', brand: 'Apple', cat: 'Audio', icon: 'headphones', best: 2290, was: 2990, drop: 23, shops: 9 },
  { id: 'xm5', name: 'Sony WH-1000XM5 Wireless', brand: 'Sony', cat: 'Audio', icon: 'headphones', best: 2999, was: 4290, drop: 30, shops: 11 },
  { id: 'switch', name: 'Nintendo Switch OLED', brand: 'Nintendo', cat: 'Gaming', icon: 'gamepad-2', best: 3290, was: 3790, drop: 13, shops: 8 },
  { id: 'dyson', name: 'Dyson V15 Detect Absolute', brand: 'Dyson', cat: 'Home', icon: 'wind', best: 6490, was: 8990, drop: 28, shops: 7 },
  { id: 'iphone', name: 'iPhone 15', brand: 'Apple', cat: 'Phones', icon: 'smartphone', best: 9190, was: 9990, drop: 8, shops: 12 },
  { id: 'tv', name: 'Samsung 55" OLED S90C', brand: 'Samsung', cat: 'TV', icon: 'tv', best: 11990, was: 17990, drop: 33, shops: 6 },
  { id: 'kindle', name: 'Kindle Paperwhite 16GB', brand: 'Amazon', cat: 'E-readers', icon: 'book-open', best: 1690, was: 1990, drop: 15, shops: 5 },
  { id: 'lego', name: 'LEGO Icons Orchid 10311', brand: 'LEGO', cat: 'Toys', icon: 'blocks', best: 449, was: 599, drop: 25, shops: 10 },
];

// build offers + history per product
PRODUCTS.forEach(p => {
  p.offers = SHOPS.slice(0, Math.min(p.shops, SHOPS.length)).map((s, i) => ({
    shop: s,
    price: p.best + Math.round((i * (p.best * 0.04) + (i === 0 ? 0 : 50)) / 10) * 10,
    ship: i % 3 === 0 ? 'Free shipping' : 'kr 79 shipping',
    stock: i % 5 === 4 ? undefined : i % 4 !== 3, // undefined = never checked → unknown
    eta: i % 2 === 0 ? 'In stock' : '2–4 days',
    url: i % 4 !== 3 ? 'https://www.' + s.toLowerCase().replace(/[^a-z0-9]/g, '') + '.no' : undefined,
    updated_at: i % 5 === 4 ? undefined : Date.now() - (6 + i * 13 + (p.name.length * 7) % 45) * 60000,
  })).sort((a, b) => a.price - b.price);
  p.offers[0].price = p.best;
  p.history = hist(p.best, p.best * 0.06);
});

const CATEGORIES = ['Audio', 'Phones', 'TV', 'Gaming', 'Home', 'Computers', 'Toys', 'E-readers', 'Kitchen'];
const POPULAR = ['airpods pro', 'rtx 4070', 'robot vacuum', 'espresso machine', 'air fryer'];

Object.assign(window, { ProdImg, fmt, metaOf, relTime, trustLine, Icon, Price, Tag, Delta, Btn, Sparkline, HistoryChart, StockBadge, RangeSlider, SHOPS, PRODUCTS, CATEGORIES, POPULAR });
