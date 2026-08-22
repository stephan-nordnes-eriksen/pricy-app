// ===========================================================
// Pricy.no ADMIN — shared UI primitives
// ===========================================================
function Pill({ kind, dot, children }) {
  return <span className={'pill' + (kind ? ' pill--' + kind : '')}>{dot && <span className="pill__dot"></span>}{children}</span>;
}
function Stat({ l, v, d, k }) {
  return (<div className="stat"><div className="stat__l">{l}</div><div className="stat__v">{typeof v === 'number' ? fmt(v) : v}</div>{d && <div className={'stat__d' + (k === 'ok' ? ' is-ok' : k === 'bad' ? ' is-bad' : '')}>{d}</div>}</div>);
}
function Panel({ title, hint, right, flush, children, style }) {
  return (<section className="panel" style={style}>{title && <div className="panel__hd"><h3>{title}</h3>{hint && <span className="hint">{hint}</span>}{right}</div>}<div className={'panel__bd' + (flush ? ' panel__bd--flush' : '')}>{children}</div></section>);
}
function Seg({ value, options, onChange }) {
  return (<div className="seg">{options.map(o => (<button key={o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onChange(o.v)}>{o.l}{o.n != null && <span className="n">{o.n}</span>}</button>))}</div>);
}
function IBtn({ icon, title, bad, disabled, onClick, confirm }) {
  return <button className={'ibtn' + (bad ? ' ibtn--bad' : '') + (confirm ? ' confirmb' : '')} title={title} disabled={disabled} onClick={onClick}><Icon name={icon} size={14} /></button>;
}
function Switch({ on, onChange }) {
  return <button className={'sw' + (on ? ' is-on' : '')} role="switch" aria-checked={on} onClick={() => onChange(!on)}></button>;
}
function Drawer({ title, sub, foot, onClose, children }) {
  useEffect(() => { const h = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  return (<React.Fragment>
    <div className="drw-ovl" onClick={onClose}></div>
    <aside className="drw">
      <div className="drw__hd"><div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div><span className="drw__x"><IBtn icon="x" title="Close" onClick={onClose} /></span></div>
      <div className="drw__bd">{children}</div>
      {foot && <div className="drw__ft">{foot}</div>}
    </aside>
  </React.Fragment>);
}
function Cols({ points, unit, x0, x1 }) {
  if (!points || !points.length) return null;
  const max = Math.max(...points);
  return (<div>
    <div className="cols">{points.map((p, i) => <div key={i} className="cols__c" style={{ height: (p / max * 100) + '%' }} title={p + (unit || '')}></div>)}</div>
    <div className="cols-x"><span>{x0}</span><span>{x1}</span></div>
  </div>);
}
function Bars({ rows, max, disp }) {
  const m = max || Math.max(...rows.map(r => r.v));
  return (<div className="bars">{rows.map((r, i) => (<div key={i} className="bars__r">
    <span className="bars__l" title={r.l}>{r.l}</span>
    <span className="bars__t"><span className={'bars__f' + (r.k === 'warn' ? ' bars__f--warn' : r.k === 'bad' ? ' bars__f--bad' : '')} style={{ width: Math.max(1.5, r.v / m * 100) + '%' }}></span></span>
    <span className="bars__v">{disp ? disp(r.v) : r.v}</span>
  </div>))}</div>);
}
function F({ label, wide, mono, children }) {
  return <div className={'f' + (wide ? ' f--w' : '')}><label>{label}</label><span className={mono ? 'in-mono' : ''} style={{ display: 'block' }}>{children}</span></div>;
}
function ToastHost() {
  useAdmin();
  const [on, setOn] = useState(false);
  useEffect(() => { if (AdminStore.tn) { setOn(true); const t = setTimeout(() => setOn(false), 2800); return () => clearTimeout(t); } }, [AdminStore.tn]);
  if (!on || !AdminStore.toast) return null;
  return <div className="toast"><Icon name="check" size={15} />{AdminStore.toast}</div>;
}
// two-step confirm: first click arms, second fires. armKey identifies the armed button.
function useArm() {
  const [arm, setArm] = useState(null);
  useEffect(() => { if (arm == null) return; const t = setTimeout(() => setArm(null), 3000); return () => clearTimeout(t); }, [arm]);
  return [arm, setArm];
}
function agoM(min) { if (min == null) return '\u2014'; if (min < 1) return 'just now'; if (min < 60) return min + ' m ago'; if (min < 1440) return Math.round(min / 60) + ' h ago'; return Math.round(min / 1440) + ' d ago'; }

Object.assign(window, { Pill, Stat, Panel, Seg, IBtn, Switch, Drawer, Cols, Bars, F, ToastHost, useArm, agoM });
