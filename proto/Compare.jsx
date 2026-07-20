// ===========================================================
// Pricy.no — Product comparison
// CompareStore (marked products) + CompareBtn (row/card/PDP),
// CompareTray (bottom bar) + ComparePage (side-by-side table).
// Properties = Overview (price, rating, stock…) + the same
// per-kind schema the Specifications section uses (specsFor).
// Loads after Results.jsx, before AppRouter.jsx.
// ===========================================================

const CompareStore = {
  ids: [], max: 4, ls: new Set(), notice: null, _nt: 0,
  emit() { this.ids = [...this.ids]; this.ls.forEach(f => f()); },
  sub(f) { this.ls.add(f); return () => this.ls.delete(f); },
  prods() { return this.ids.map(id => getListing(id)).filter(Boolean); },
  has(id) { return this.ids.includes(id); },
  kind() { const p = this.prods()[0]; return p ? specKindOf(p) : null; },
  say(msg, action) {
    const t = ++this._nt;
    this.notice = { msg, action, t }; this.emit();
    setTimeout(() => { if (this.notice && this.notice.t === t) { this.notice = null; this.emit(); } }, 5200);
  },
  add(id) {
    if (this.has(id)) return;
    const p = getListing(id); if (!p) return;
    const k = this.kind();
    if (k && specKindOf(p) !== k) {
      this.say('Compare one category at a time — this comparison is ' + SPEC_KINDS[k].label + '.',
        { label: 'Start over with \u201C' + p.name + '\u201D', fn: () => { this.ids = [id]; this.notice = null; this.emit(); } });
      return;
    }
    if (this.ids.length >= this.max) { this.say('You can compare up to ' + this.max + ' products — remove one first.'); return; }
    this.ids = [...this.ids, id]; this.emit();
  },
  remove(id) { this.ids = this.ids.filter(x => x !== id); this.emit(); },
  toggle(id) { this.has(id) ? this.remove(id) : this.add(id); },
  clear() { this.ids = []; this.notice = null; this.emit(); },
  seed(ids) { if (this.ids.length < 2) { this.ids = ids.filter(id => getListing(id)); this.emit(); } },
};

function useCompareStore() {
  const [, tick] = useState(0);
  useEffect(() => CompareStore.sub(() => tick(t => t + 1)), []);
  return CompareStore.ids;
}

// ---- toggle button (list row / grid card / PDP) ------------
function CompareBtn({ p, variant = 'icon', className = '' }) {
  useCompareStore();
  const on = CompareStore.has(p.id);
  const click = (e) => { e.stopPropagation(); e.preventDefault(); CompareStore.toggle(p.id); };
  if (variant === 'pill') return (
    <button type="button" className={'cmpbtn-pill' + (on ? ' is-on' : '')} aria-pressed={on} onClick={click}>
      <Icon name={on ? 'check' : 'git-compare'} size={13} />{on ? 'In comparison' : 'Compare'}
    </button>
  );
  return (
    <button type="button" className={'cmpbtn' + (className ? ' ' + className : '') + (on ? ' is-on' : '')} aria-pressed={on} title={on ? 'Remove from comparison' : 'Add to comparison'} onClick={click}>
      <Icon name="git-compare" size={16} />
    </button>
  );
}

// ---- bottom tray (visible on app screens once ≥1 marked) ---
function CompareTray({ go, hidden }) {
  useCompareStore();
  const ps = CompareStore.prods();
  const n = CompareStore.notice;
  if (hidden || ps.length === 0) return null;
  return (
    <div className="ctray" role="region" aria-label="Compare tray">
      {n && (
        <div className="ctray__notice">
          <Icon name="info" size={14} /><span>{n.msg}</span>
          {n.action && <button type="button" onClick={n.action.fn}>{n.action.label}</button>}
        </div>
      )}
      <div className="ctray__bar">
        <span className="ctray__lbl">Compare</span>
        <div className="ctray__items">
          {ps.map(p => (
            <span key={p.id} className="ctray__item">
              <button type="button" className="ctray__tile" aria-label={p.name + ' — open product'} onClick={() => go('product', { id: p.id })}><ProdImg p={p} size={20} /></button>
              <button type="button" className="ctray__x" aria-label={'Remove ' + p.name} onClick={() => CompareStore.remove(p.id)}><Icon name="x" size={11} /></button>
              <span className="ctray__pop" role="tooltip">
                <span className="ctray__pop-brand">{p.brand}</span>
                <span className="ctray__pop-name">{p.name}</span>
                <span className="ctray__pop-price">kr {fmt(p.best)} · {p.shops} shops</span>
                <span className="ctray__pop-hint">Click to open product</span>
              </span>
            </span>
          ))}
          {Array.from({ length: Math.max(0, 2 - ps.length) }).map((_, i) => <span key={'e' + i} className="ctray__slot">+</span>)}
        </div>
        <Btn variant="primary" icon="git-compare" onClick={() => go('compare')}>Compare{ps.length > 1 ? ' (' + ps.length + ')' : ''}</Btn>
        <button type="button" className="ctray__clear" onClick={() => CompareStore.clear()}>Clear</button>
      </div>
    </div>
  );
}

// ---- compare page bits -------------------------------------
function CmpSpark({ points }) {
  const D = window.DrawSpark;
  return D ? <D points={points} w={118} h={30} color="var(--ink-900)" draw={false} /> : <Sparkline points={points} w={118} h={30} />;
}
function CmpWatch({ p }) {
  useWatchStore();
  const w = WatchStore.get(p.id);
  return w
    ? <span className="cmp__watchon"><Icon name="bell-ring" size={13} /> below kr {fmt(w.target)}</span>
    : <button type="button" className="cmp__watchbtn" onClick={() => WatchStore.add(p.id, Math.round(p.best * 0.92 / 10) * 10)}><Icon name="bell" size={13} /> Watch</button>;
}

const CMP_OVERVIEW = [
  { id: 'price', label: 'Best price', best: 'min', val: p => p.best, render: p => (<span><Price value={p.best} size={21} /><span className="cmp__sub">at {p.offers[0].shop}</span></span>) },
  { id: 'was', label: 'Before / drop', val: p => p.drop, render: p => (<span className="cmp__was"><span className="strike">kr {fmt(p.was)}</span><Delta pct={-p.drop} /></span>) },
  { id: 'low', label: 'All-time low', best: 'min', val: p => Math.min(...p.history), render: p => <span className="cmp__mono">kr {fmt(Math.min(...p.history))}</span> },
  { id: 'hist', label: 'Price history · 24w', val: p => p.history.join(), render: p => <CmpSpark points={p.history} /> },
  { id: 'shops', label: 'Shops tracking', best: 'max', val: p => p.shops, render: p => <span className="cmp__mono">{p.shops} shops</span> },
  { id: 'rating', label: 'Rating', best: 'max', val: p => p.rating, render: p => <Stars rating={p.rating} reviews={p.reviews} /> },
  { id: 'stock', label: 'Availability', val: p => String(p.stock), render: p => <StockBadge state={p.stock ? 'in' : 'back'} /> },
  { id: 'watch', label: 'Price alert', val: p => (WatchStore.has(p.id) ? 'on' : 'off'), render: p => <CmpWatch p={p} /> },
];

function CmpAdd({ ps, go }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const inRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { if (open) { setQ(''); if (inRef.current) inRef.current.focus(); } }, [open]);
  const kind = specKindOf(ps[0]);
  const s = q.toLowerCase().trim();
  const cands = CATALOG.filter(x => !CompareStore.has(x.id) && specKindOf(x) === kind)
    .filter(x => !s || (x.name + ' ' + x.brand + ' ' + (x.kw || '')).toLowerCase().includes(s))
    .sort((a, b) => b.rating - a.rating).slice(0, 6);
  const cat = ps[0].cat;
  const pick = (id) => { CompareStore.add(id); setOpen(false); };
  return (
    <div className="cmp__addc" ref={ref}>
      <button type="button" className="cmp__addbtn" onClick={() => setOpen(o => !o)}><Icon name="plus" size={18} />Add product</button>
      {open && (
        <div className="cmp__menu">
          <div className="cmp__search">
            <Icon name="search" size={14} />
            <input ref={inRef} type="text" placeholder={'Search ' + SPEC_KINDS[kind].label.toLowerCase() + '…'} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && cands.length) pick(cands[0].id); }} />
          </div>
          {cands.map(c => (
            <button key={c.id} type="button" className="cmp__cand" onClick={() => pick(c.id)}>
              <ProdImg p={c} size={16} /><span>{c.name}</span><span className="pr">kr {fmt(c.best)}</span>
            </button>
          ))}
          {cands.length === 0 && <div className="cmp__none">No {SPEC_KINDS[kind].label.toLowerCase()} match “{q}”</div>}
          <button type="button" className="cmp__cand cmp__cand--all" onClick={() => go('results', { cat })}>Browse all {cat} →</button>
        </div>
      )}
    </div>
  );
}

// ---- compare page ------------------------------------------
function ComparePage({ go }) {
  useCompareStore(); useWatchStore();
  const ps = CompareStore.prods();
  const [diffOnly, setDiffOnly] = useState(false);
  if (ps.length === 0) return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page">
        <div className="empty" style={{ marginTop: 'var(--s-7)' }}>
          <div className="empty__ic"><Icon name="git-compare" size={40} /></div>
          <h2>Nothing to compare yet</h2>
          <p>Tap the compare button on any product to line it up here — 2 to 4 products from one category, side by side.</p>
          <Btn variant="primary" onClick={() => go('browse')}>Browse categories</Btn>
        </div>
      </div>
    </div>
  );

  const sameKind = ps.every(p => specKindOf(p) === specKindOf(ps[0]));
  const kind = sameKind ? specKindOf(ps[0]) : null;
  const tables = kind ? ps.map(p => specsFor(p)) : null;
  const canAdd = ps.length < CompareStore.max;
  const tpl = 'minmax(150px,210px) ' + ps.map(() => 'minmax(185px,1fr)').join(' ') + (canAdd ? ' minmax(150px,205px)' : '');

  const mark = (row) => { row.differs = ps.length > 1 && new Set(row.vals.map(String)).size > 1; return row; };
  const overview = CMP_OVERVIEW.map(r => mark({ id: r.id, label: r.label, best: r.best, vals: ps.map(p => r.val(p)), cells: ps.map(p => ({ node: r.render(p), cls: '' })) }));
  overview.forEach(row => {
    if (!row.best || !row.differs) return;
    const nums = row.vals.map(Number);
    const t = row.best === 'min' ? Math.min(...nums) : Math.max(...nums);
    row.cells.forEach((c, i) => { if (nums[i] === t) c.cls = ' is-best'; });
  });
  const sections = [{ id: 'ov', label: 'Overview', rows: overview }];
  if (tables && tables[0]) tables[0].groups.forEach((g, gi) => {
    sections.push({ id: g.id, label: g.label, rows: g.rows.map((r, ri) => {
      const cells = tables.map(t => t.groups[gi].rows[ri]);
      return mark({ id: g.id + '-' + r.id, label: r.label, vals: cells.map(c => c.display), cells: cells.map(c => ({ node: c.display, cls: (c.display === '—' ? ' is-na' : '') + (c.type === 'bool' && c.value === true ? ' is-yes' : '') })) });
    }) });
  });
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const filtering = diffOnly && ps.length > 1;
  const visSections = sections.map(s => ({ ...s, rows: filtering ? s.rows.filter(r => r.differs) : s.rows })).filter(s => s.rows.length);

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page" data-screen-label="Compare products">
        <div className="pdp__crumb">
          <a onClick={() => go('home')}>Home</a><Icon name="chevron-right" size={13} />
          <span style={{ color: 'var(--ink-900)' }}>Compare</span>
        </div>
        <div className="cmp__titlebar">
          <div>
            <h1>Compare {kind ? SPEC_KINDS[kind].label : 'products'}</h1>
            <div className="cmp__note">{ps.length} {ps.length === 1 ? 'product' : 'products'} · {total} properties{!kind ? ' · pick one category to line up specifications' : ''}</div>
          </div>
          <div className="cmp__tools">
            <label className="cmp__difftgl"><Toggle on={diffOnly} onChange={setDiffOnly} /><span>Only differences</span></label>
            <Btn variant="ghost" icon="x" onClick={() => CompareStore.clear()}>Clear all</Btn>
          </div>
        </div>
        <div className="cmp__scroll">
          <div className="cmp__head" style={{ gridTemplateColumns: tpl }}>
            <div className="cmp__corner">
              <span className="k">{kind ? SPEC_KINDS[kind].label : 'Products'}</span>
              {ps.length < 2 && <span className="cmp__sub">add at least one more</span>}
            </div>
            {ps.map(p => (
              <div key={p.id} className="cmp__prod">
                <button type="button" className="cmp__x" title="Remove from comparison" aria-label={'Remove ' + p.name} onClick={() => CompareStore.remove(p.id)}><Icon name="x" size={14} /></button>
                <div className="cmp__img" onClick={() => go('product', { id: p.id })}><ProdImg p={p} fill size={44} /></div>
                <div className="cmp__brand">{p.brand}</div>
                <a className="cmp__pname" onClick={() => go('product', { id: p.id })}>{p.name}</a>
                <Price value={p.best} size={17} />
              </div>
            ))}
            {canAdd && <CmpAdd ps={ps} go={go} />}
          </div>
          <div className="cmp__body" style={{ gridTemplateColumns: tpl }}>
            {visSections.map(s => (
              <React.Fragment key={s.id}>
                <div className="cmp__grph">{s.label}</div>
                {s.rows.map((r, ri) => (
                  <React.Fragment key={r.id}>
                    <div className={'cmp__lbl' + (ri === 0 ? ' is-first' : '')}>{r.label}{r.differs && <span className="diffdot" title="Values differ"></span>}</div>
                    {r.cells.map((c, i) => <div key={i} className={'cmp__val' + c.cls + (ri === 0 ? ' is-first' : '')}>{c.node}</div>)}
                    {canAdd && <div className={'cmp__pad' + (ri === 0 ? ' is-first' : '')}></div>}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
            {filtering && visSections.length === 0 && <div className="cmp__grph" style={{ borderTop: 0 }}>No differences — these listings match on every property compared.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CompareStore, useCompareStore, CompareBtn, CompareTray, ComparePage });
