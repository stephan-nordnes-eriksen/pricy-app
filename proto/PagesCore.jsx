// ===========================================================
// Pricy.no — Shared page infrastructure
// WatchStore (shared watch/alert state) + Plus paywall bits
// Loaded before the page scripts; exports to window.
// ===========================================================

// --- WatchStore: single source of truth for watched products
const WatchStore = {
  items: WATCHED.map(w => ({ id: w.id, target: w.target, paused: false, hit: w.hit })),
  ls: new Set(),
  emit() { this.items = [...this.items]; this.ls.forEach(f => f()); },
  sub(f) { this.ls.add(f); return () => this.ls.delete(f); },
  prod(id) {
    const p = (window.byId && byId[id]) || (window.CATALOG || []).find(x => x.id === id) || (window.PRODUCTS || []).find(x => x.id === id);
    if (p) return p;
    const rv = window.resolveVariantId && resolveVariantId(id);
    if (!rv) return undefined;
    const v = variantListing(rv.p, rv.sel);
    return { ...v, id, name: rv.p.name + ' — ' + v.vlabel };
  },
  get(id) { return this.items.find(w => w.id === id); },
  has(id) { return this.items.some(w => w.id === id); },
  hits() { return this.items.filter(w => w.hit && !w.paused).length; },
  saved() { return this.items.reduce((s, w) => { const p = this.prod(w.id); return s + (p && p.was > p.best ? p.was - p.best : 0); }, 0); },
  add(id, target) {
    if (this.has(id)) return;
    const p = this.prod(id);
    this.items = [{ id, target, paused: false, hit: p ? p.best <= target : false }, ...this.items];
    this.emit();
  },
  remove(id) { this.items = this.items.filter(w => w.id !== id); this.emit(); },
  toggle(id, target) { this.has(id) ? this.remove(id) : this.add(id, target); },
  setTarget(id, target) {
    const w = this.get(id); if (!w) return;
    const p = this.prod(id);
    w.target = target; w.hit = p ? p.best <= target : false;
    this.emit();
  },
  setPaused(id, v) { const w = this.get(id); if (!w) return; w.paused = v; this.emit(); },
};

function useWatchStore() {
  const [, tick] = useState(0);
  useEffect(() => WatchStore.sub(() => tick(t => t + 1)), []);
  return WatchStore.items;
}

// --- Plan helpers (window.PLAN set by router / Tweaks) ------
function usePlan() { return window.PLAN || 'free'; }

const PLUS_FEATURES = [
  { icon: 'sparkles',   name: 'AI deal digest',        desc: 'A daily summary, written for you: what dropped, what to wait for, what to grab now.' },
  { icon: 'trending-down', name: 'Price forecasts',    desc: 'Prediction of where a price is heading, based on price history per shop.' },
  { icon: 'message-square', name: 'Ask pricy',         desc: 'Search in plain Norwegian — «best robotstøvsuger under 4 000 med mopp».' },
  { icon: 'infinity',   name: 'Unlimited watchlist',   desc: 'Watch as many products as you want.' },
];

// --- Plus tag ------------------------------------------------
function PlusTag() { return <span className="plus-tag">Plus</span>; }
function SoonTag() { return <span className="soon-tag">Coming soon</span>; }

// --- Plus paywall modal --------------------------------------
function PlusModal({ onClose, go }) {
  const start = () => {
    if (window.setPlan) window.setPlan('plus');
    onClose && onClose();
  };
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="pmodal" role="dialog" aria-label="Pricy Plus">
        <div className="pmodal__head">
          <div>
            <PlusTag></PlusTag> <SoonTag></SoonTag>
            <h2>Let the machine shop around.</h2>
          </div>
          <button className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <div className="pmodal__body">
          {PLUS_FEATURES.map(f => (
            <div key={f.name} className="pmodal__feat">
              <span className="ic"><Icon name={f.icon} size={18} /></span>
              <div><b>{f.name}</b><span>{f.desc}</span></div>
            </div>
          ))}
          <div className="pmodal__price">
            <span className="amt">kr 49</span><span className="per">/ month (planned) · subject to change</span>
          </div>
          <Btn variant="primary" icon="arrow-right" style={{ width: '100%', justifyContent: 'center', height: 50 }} onClick={start}>Preview Plus features</Btn>
          <div className="pmodal__fine">Pricy Plus hasn't launched yet — this is a preview. Features and pricing are subject to change.</div>
        </div>
      </div>
    </div>
  );
}

// --- Locked feature row (opens paywall) ----------------------
function LockedCard({ icon, title, desc, onOpen }) {
  return (
    <div className="lockcard" onClick={onOpen}>
      <div className="lockcard__ic"><Icon name={icon} size={20} /></div>
      <div>
        <b>{title} <PlusTag></PlusTag> <SoonTag></SoonTag></b>
        <p>{desc}</p>
      </div>
      <span className="go"><Icon name="lock" size={16} /></span>
    </div>
  );
}

// --- Square toggle -------------------------------------------
function Toggle({ on, onChange }) {
  return <button type="button" className={'tgl' + (on ? ' is-on' : '')} role="switch" aria-checked={on} onClick={() => onChange(!on)}></button>;
}

// --- Saved toast ---------------------------------------------
function Toast({ children }) {
  return <div className="toast"><Icon name="check" size={16} /> {children}</div>;
}

Object.assign(window, { WatchStore, useWatchStore, usePlan, PLUS_FEATURES, PlusTag, SoonTag, PlusModal, LockedCard, Toggle, Toast });
