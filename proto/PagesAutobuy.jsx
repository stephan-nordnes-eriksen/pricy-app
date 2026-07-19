// ===========================================================
// Pricy.no — Auto-buy (BankID fullmakt + purchase orders)
// AutobuyStore + fullmakt ceremony + PDP box + manage page
// ===========================================================

// --- Store ---------------------------------------------------
const AutobuyStore = {
  signed: true,
  signedAt: '11 Jul 2026, 09:12',
  payment: 'vipps', // vipps | card
  cap: 20000,
  orders: [
    { id: 'tv',    max: 12500, expires: '9 Oct 2026', shops: 'Any shop', status: 'executed',
      exec: { shop: 'NetOnNet', price: 11990, at: 'Today, 09:41', ref: 'PY-8841-2207', angrerett: '25 Jul 2026' } },
    { id: 'xm5',   max: 2800, expires: '10 Aug 2026', shops: 'Any shop', status: 'active' },
    { id: 'dyson', max: 5990, expires: '9 Sep 2026',  shops: 'Excl. marketplaces', status: 'active' },
  ],
  ls: new Set(),
  sub(fn) { this.ls.add(fn); return () => this.ls.delete(fn); },
  emit() { this.ls.forEach(fn => fn()); },
  prod(id) { return getListing(id) || byId[id]; },
  capUsed() { return this.orders.filter(o => o.status === 'executed').reduce((s, o) => s + o.exec.price, 0); },
  sign() { this.signed = true; this.signedAt = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + new Date().toTimeString().slice(0, 5); this.emit(); },
  revoke() { this.signed = false; this.orders = this.orders.filter(o => o.status === 'executed'); this.emit(); },
  add(id, max, expires, shops) {
    this.orders = [...this.orders.filter(o => !(o.id === id && o.status === 'active')), { id, max, expires, shops, status: 'active' }];
    this.emit();
  },
  cancel(id) { this.orders = this.orders.filter(o => !(o.id === id && o.status === 'active')); this.emit(); },
  has(id) { return this.orders.find(o => o.id === id && o.status === 'active'); },
  buyNow(id, shop, price) {
    const o = { id, max: price, expires: '—', shops: shop, status: 'executed',
      exec: { shop, price, at: 'Just now', ref: 'PY-' + Math.floor(1000 + Math.random() * 9000) + '-1607', angrerett: '30 Jul 2026' } };
    this.orders = [...this.orders, o];
    this.emit();
    return o;
  },
  execute(id) {
    const o = this.orders.find(x => x.id === id && x.status === 'active');
    if (!o) return null;
    o.status = 'executed';
    o.exec = { shop: 'Power', price: o.max - 190, at: 'Just now', ref: 'PY-' + Math.floor(1000 + Math.random() * 9000) + '-1107', angrerett: '25 Jul 2026' };
    this.emit();
    return o;
  },
};
function useAutobuyStore() {
  const [, tick] = useState(0);
  useEffect(() => AutobuyStore.sub(() => tick(t => t + 1)), []);
  return AutobuyStore;
}

// --- BankID mark + button ------------------------------------
function BankIDMark({ light = false }) {
  return (
    <span className="bankid-mark" style={light ? { color: '#fff' } : null}>
      Bank<b>ID</b>
    </span>
  );
}

function BankIDButton({ children, onDone, disabled, style }) {
  const [busy, setBusy] = useState(false);
  const click = () => {
    if (busy || disabled) return;
    setBusy(true);
    setTimeout(() => { setBusy(false); onDone && onDone(); }, 1400);
  };
  return (
    <button type="button" className={'bankid-btn' + (disabled ? ' is-disabled' : '')} onClick={click} disabled={disabled || busy} style={style}>
      {busy
        ? <React.Fragment><span className="spinner"></span> Waiting for BankID…</React.Fragment>
        : <React.Fragment><Icon name="fingerprint" size={18} /> {children} <BankIDMark light={true}></BankIDMark></React.Fragment>}
    </button>
  );
}

// --- Fullmakt document (Norwegian) ----------------------------
function FullmaktDoc() {
  return (
    <div className="fm-doc">
      <div className="fm-doc__head">
        <b>FULLMAKT TIL KJØP AV VARER</b>
        <span>Utkast · 11.07.2026 · nb-NO</span>
      </div>
      <p>mellom <b>{USER.name} Hansen</b> (f. 14.03.1991, «Fullmaktsgiver») og <b>Pricy AS</b>, org.nr. 923 456 789 («Fullmektig»).</p>
      <h4>§ 1 · Fullmaktens omfang</h4>
      <p>Fullmektigen gis rett til å inngå kjøpsavtaler i Fullmaktsgivers navn og for dennes regning. Fullmakten er begrenset til produkter Fullmaktsgiver selv har opprettet kjøpsordre for på pricy.no, og gjelder kun kjøp hos forhandlere tilknyttet tjenesten.</p>
      <h4>§ 2 · Beløpsgrenser</h4>
      <p>Kjøp gjennomføres kun når totalprisen (inkl. frakt) er lik eller lavere enn maksprisen angitt i den enkelte kjøpsordre. Samlet kjøpesum per kalendermåned skal ikke overstige Fullmaktsgivers valgte beløpsgrense.</p>
      <h4>§ 3 · Betaling</h4>
      <p>Kjøp belastes betalingsmiddelet Fullmaktsgiver har registrert. Pricy AS beregner ingen gebyrer eller påslag på kjøpesummen.</p>
      <h4>§ 4 · Angrerett</h4>
      <p>Angrerettloven gjelder fullt ut for alle kjøp gjennomført under denne fullmakten. Angrefristen på 14 dager løper fra levering av varen.</p>
      <h4>§ 5 · Varighet og tilbakekall</h4>
      <p>Fullmakten gjelder til den tilbakekalles. Tilbakekall kan skje når som helst med umiddelbar virkning under Konto → Auto-buy, jf. avtaleloven §§ 12–16.</p>
      <h4>§ 6 · Varsling</h4>
      <p>Fullmaktsgiver varsles umiddelbart per e-post og push ved gjennomført kjøp, med fullstendig kvittering og ordrereferanse.</p>
    </div>
  );
}

// --- Signed receipt block -------------------------------------
function FullmaktReceipt({ at, onRevoke, onView }) {
  return (
    <div className="fm-signed">
      <div className="fm-signed__ic"><Icon name="file-check-2" size={22} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <b>Fullmakt active — signed with <BankIDMark></BankIDMark></b>
        <p>{USER.name} Hansen · {at}</p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        {onView && <Btn size="sm" variant="ghost" icon="file-text" onClick={onView}>View</Btn>}
        {onRevoke && <Btn size="sm" variant="ghost" icon="x" onClick={onRevoke}>Revoke</Btn>}
      </div>
    </div>
  );
}

// --- Fullmakt ceremony (doc → agree → sign) -------------------
function FullmaktCeremony({ onSigned, signedAt }) {
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(!!signedAt);
  if (signed) return <FullmaktReceipt at={signedAt || AutobuyStore.signedAt}></FullmaktReceipt>;
  return (
    <div className="fm-cer">
      <FullmaktDoc></FullmaktDoc>
      <label className="fm-agree">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>I've read the fullmakt. Pricy may buy <b>only</b> products I set orders for, <b>only</b> below my max price, within my monthly cap.</span>
      </label>
      <BankIDButton disabled={!agreed} onDone={() => { AutobuyStore.sign(); setSigned(true); onSigned && onSigned(); }}>
        Sign with
      </BankIDButton>
      <div className="fm-foot">
        <span><Icon name="shield-check" size={13} /> Revoke anytime, instantly</span>
        <span><Icon name="undo-2" size={13} /> 14-day angrerett on every purchase</span>
        <span><Icon name="receipt" size={13} /> No fees, no markup</span>
      </div>
    </div>
  );
}

// --- Payment picker -------------------------------------------
function PaymentPicker({ value, onChange }) {
  const opt = (v, icon, title, sub) => (
    <button type="button" className={'pay-opt' + (value === v ? ' is-on' : '')} onClick={() => onChange(v)}>
      <span className="pay-opt__chk">{value === v && <Icon name="check" size={12} />}</span>
      <Icon name={icon} size={20} />
      <b>{title}</b>
      <span>{sub}</span>
    </button>
  );
  return (
    <div className="pay-opts">
      {opt('vipps', 'smartphone', 'Vipps', '+47 ••• •• 481')}
      {opt('card', 'credit-card', 'Visa', '•••• 4521 · exp 03/28')}
    </div>
  );
}

// --- Fullmakt modal (view doc / activate from PDP) ------------
function FullmaktModal({ onClose, mode = 'view' }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal fm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__head">
          <b>{mode === 'view' ? 'Your fullmakt' : 'Activate auto-buy'}</b>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="fm-modal__body">
          {mode === 'view'
            ? <React.Fragment><FullmaktReceipt at={AutobuyStore.signedAt}></FullmaktReceipt><FullmaktDoc></FullmaktDoc></React.Fragment>
            : <FullmaktCeremony onSigned={onClose}></FullmaktCeremony>}
        </div>
      </div>
    </div>
  );
}

// --- Purchase-executed receipt modal --------------------------
function PurchaseModal({ order, onClose }) {
  const p = AutobuyStore.prod(order.id);
  const e = order.exec;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal buy-modal pop-in" onClick={e2 => e2.stopPropagation()}>
        <div className="buy-modal__flag"><Icon name="zap" size={15} /> Bought for you</div>
        <div className="buy-modal__prod">
          <div className="wrow__img"><Icon name={p.icon} size={26} /></div>
          <div style={{ minWidth: 0 }}>
            <b>{p.name}</b>
            <div className="meta">{e.shop} · {e.at} · ref {e.ref}</div>
          </div>
        </div>
        <div className="buy-modal__nums">
          <div><span>Paid</span><Price value={e.price} size={24}></Price></div>
          <div><span>Your max</span><Price value={order.max} size={16}></Price></div>
          <div><span>Under max</span><b className="pos">kr {fmt(order.max - e.price)}</b></div>
        </div>
        <div className="buy-modal__rows">
          <div><Icon name="wallet" size={14} /> Charged to {AutobuyStore.payment === 'vipps' ? 'Vipps ••481' : 'Visa ••4521'}</div>
          <div><Icon name="undo-2" size={14} /> Angrerett until {e.angrerett} — one-click return</div>
          <div><Icon name="mail" size={14} /> Receipt sent to {USER.email}</div>
        </div>
        <Btn variant="primary" icon="check" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Done</Btn>
      </div>
    </div>
  );
}

// --- Buy now (instant purchase at today's best price) ---------
function BuyNowModal({ p, onClose }) {
  const store = useAutobuyStore();
  const best = p.offers[0];
  const [phase, setPhase] = useState(store.signed ? 'confirm' : 'sign');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const buy = () => {
    if (busy) return;
    setBusy(true); setErr('');
    const call = window.buyNowApi; // production overrides this with the real purchase API
    const result = call ? call(p, best)
      : new Promise(res => setTimeout(() => res(store.buyNow(p.id, best.shop, best.price)), 1100));
    Promise.resolve(result)
      .then(o => { setOrder(o); setPhase('done'); })
      .catch(e => setErr((e && e.message) || 'Purchase failed — you were not charged'))
      .finally(() => setBusy(false));
  };
  return (
    <div className="overlay" onClick={onClose}>
      {phase === 'sign' ? (
        <div className="modal fm-modal" onClick={e => e.stopPropagation()}>
          <div className="modal__head"><b>Buy now — requires BankID fullmakt</b><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
          <div className="fm-modal__body"><FullmaktCeremony onSigned={() => setPhase('confirm')}></FullmaktCeremony></div>
        </div>
      ) : phase === 'done' ? (
        <div className="modal buy-modal pop-in" onClick={e => e.stopPropagation()}>
          <div className="buy-modal__flag"><Icon name="check" size={15} /> Order placed</div>
          <div className="buy-modal__prod">
            <div className="wrow__img"><Icon name={p.icon} size={26} /></div>
            <div style={{ minWidth: 0 }}>
              <b>{p.name}</b>
              <div className="meta">{best.shop} · Just now · ref {order.exec.ref}</div>
            </div>
          </div>
          <div className="buy-modal__nums">
            <div><span>Paid</span><Price value={best.price} size={24}></Price></div>
            <div><span>Delivery</span><b>{best.eta}</b></div>
            <div><span>vs. was</span><b className="pos">−kr {fmt(p.was - best.price)}</b></div>
          </div>
          <div className="buy-modal__rows">
            <div><Icon name="wallet" size={14} /> Charged to {store.payment === 'vipps' ? 'Vipps ••481' : 'Visa ••4521'}</div>
            <div><Icon name="undo-2" size={14} /> Angrerett until {order.exec.angrerett} — one-click return</div>
            <div><Icon name="mail" size={14} /> Receipt sent to {USER.email}</div>
          </div>
          <Btn variant="primary" icon="check" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Done</Btn>
        </div>
      ) : (
        <div className="modal buy-modal pop-in" onClick={e => e.stopPropagation()}>
          <div className="buy-modal__flag"><Icon name="zap" size={15} /> Buy now</div>
          <div className="buy-modal__prod">
            <div className="wrow__img"><Icon name={p.icon} size={26} /></div>
            <div style={{ minWidth: 0 }}>
              <b>{p.name}</b>
              <div className="meta">Today's best price · {best.shop} · {best.ship} · {best.eta}</div>
            </div>
          </div>
          <div className="buy-modal__nums">
            <div><span>You pay</span><Price value={best.price} size={24}></Price></div>
            <div><span>Was</span><b className="strike">kr {fmt(p.was)}</b></div>
            <div><span>Cap left</span><b>kr {fmt(store.cap - store.capUsed())}</b></div>
          </div>
          <div className="buy-modal__rows">
            <div><Icon name="wallet" size={14} /> {store.payment === 'vipps' ? 'Vipps ••481' : 'Visa ••4521'} — charged on purchase</div>
            <div><Icon name="file-check-2" size={14} /> Covered by your fullmakt · no fees, no markup</div>
            <div><Icon name="undo-2" size={14} /> 14-day angrerett from delivery</div>
          </div>
          {err && <div className="formhint err"><Icon name="alert-triangle" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{err}</div>}
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            <Btn variant="dark" icon="zap" onClick={buy} style={{ flex: 2, justifyContent: 'center' }}>{busy ? 'Placing order…' : 'Buy for kr ' + fmt(best.price)}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// --- PDP auto-buy box -----------------------------------------
function AutobuyBox({ p }) {
  const store = useAutobuyStore();
  const [max, setMax] = useState(Math.round(p.best * 0.9 / 10) * 10);
  const [exp, setExp] = useState('60');
  const [shops, setShops] = useState('any');
  const [activate, setActivate] = useState(false);
  const [toast, setToast] = useState(false);
  const order = store.has(p.id);

  const arm = () => {
    const days = { '30': '10 Aug 2026', '60': '9 Sep 2026', '90': '9 Oct 2026' }[exp];
    store.add(p.id, max, days, shops === 'any' ? 'Any shop' : 'Excl. marketplaces');
    setToast(true); setTimeout(() => setToast(false), 2600);
  };

  return (
    <div className="abox">
      <div className="abox__head">
        <span className="abox__title"><Icon name="zap" size={15} /> Auto-buy</span>
        {store.signed
          ? <span className="abox__cov"><Icon name="file-check-2" size={12} /> Covered by your fullmakt</span>
          : <span className="abox__cov off">Requires BankID fullmakt</span>}
      </div>
      {order ? (
        <div className="abox__armed">
          <div>
            <b><Icon name="check" size={14} /><span>Armed — we buy the moment any shop goes below kr {fmt(order.max)}</span></b>
            <div className="meta">Best now kr {fmt(p.best)} · kr {fmt(p.best - order.max)} above trigger · expires {order.expires} · {order.shops}</div>
          </div>
          <Btn size="sm" variant="ghost" icon="x" onClick={() => store.cancel(p.id)}>Cancel</Btn>
        </div>
      ) : !store.signed ? (
        <div className="abox__row">
          <p className="abox__pitch">Set a max price and pricy buys it in your name the second a shop drops below — even at 3 am.</p>
          <Btn variant="dark" icon="fingerprint" onClick={() => setActivate(true)}>Activate with BankID</Btn>
        </div>
      ) : (
        <div className="abox__form">
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>Buy for me below</div>
            <div className="watchbox__field"><span className="cur">kr</span><input type="number" value={max} onChange={e => setMax(+e.target.value)} /></div>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>Expires</div>
            <select className="abox__sel" value={exp} onChange={e => setExp(e.target.value)}>
              <option value="30">In 30 days</option>
              <option value="60">In 60 days</option>
              <option value="90">In 90 days</option>
            </select>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>Shops</div>
            <select className="abox__sel" value={shops} onChange={e => setShops(e.target.value)}>
              <option value="any">Any of {p.shops} shops</option>
              <option value="excl">Excl. marketplaces</option>
            </select>
          </div>
          <Btn variant="dark" icon="zap" onClick={arm}>Arm auto-buy</Btn>
        </div>
      )}
      {activate && <FullmaktModal mode="sign" onClose={() => setActivate(false)}></FullmaktModal>}
      {toast && <Toast>Auto-buy armed — max kr {fmt(max)}</Toast>}
    </div>
  );
}

// --- Manage page ----------------------------------------------
function AutobuyOrderRow({ o, go }) {
  const p = AutobuyStore.prod(o.id);
  const gap = p.best - o.max;
  return (
    <div className="abrow">
      <div className="wrow__img"><Icon name={p.icon} size={24} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="alrow__name" onClick={() => go('product', { id: o.id })}>{p.name}</div>
        <div className="alrow__meta"><span>{o.shops}</span><span>expires {o.expires}</span></div>
      </div>
      <div>
        <div className="alrow__lbl">Buys below</div>
        <Price value={o.max} size={17}></Price>
      </div>
      <div>
        <div className="alrow__lbl">Best now</div>
        <Price value={p.best} size={17}></Price>
      </div>
      <div className="abrow__gap">
        {gap > 0
          ? <span className="waiting">kr {fmt(gap)} above trigger</span>
          : <span className="firing"><Icon name="zap" size={12} /> triggering…</span>}
      </div>
      <div className="alrow__act">
        <button className="iconbtn danger" title="Cancel order" onClick={() => AutobuyStore.cancel(o.id)}><Icon name="trash-2" size={16} /></button>
      </div>
    </div>
  );
}

function AutobuyExecCard({ o, onReceipt }) {
  const p = AutobuyStore.prod(o.id);
  return (
    <div className="ab-exec">
      <span className="ab-exec__flag"><Icon name="zap" size={12} /> Bought for you</span>
      <div className="wrow__img" style={{ background: 'var(--paper)' }}><Icon name={p.icon} size={24} /></div>
      <div style={{ minWidth: 0 }}>
        <b>{p.name}</b>
        <div className="meta">{o.exec.shop} · {o.exec.at} · angrerett until {o.exec.angrerett}</div>
      </div>
      <div>
        <div className="alrow__lbl">Paid</div>
        <Price value={o.exec.price} size={18}></Price>
      </div>
      <div>
        <div className="alrow__lbl">Under max</div>
        <b className="pos" style={{ fontFamily: 'var(--font-mono)' }}>−kr {fmt(o.max - o.exec.price)}</b>
      </div>
      <Btn size="sm" icon="receipt" onClick={onReceipt}>Receipt</Btn>
    </div>
  );
}

function AutobuyPage({ go }) {
  const store = useAutobuyStore();
  const [receipt, setReceipt] = useState(null);
  const [viewDoc, setViewDoc] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const active = store.orders.filter(o => o.status === 'active');
  const execd = store.orders.filter(o => o.status === 'executed');
  const used = store.capUsed();

  const simulate = () => {
    const first = active[0];
    if (!first) return;
    const o = store.execute(first.id);
    if (o) setReceipt(o);
  };

  return (
    <div className="screen" data-screen-label="Auto-buy orders">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page ab">
        <div className="al__head">
          <div>
            <h1><Icon name="zap" size={26} style={{ verticalAlign: '-3px' }} /> Auto-buy</h1>
            <div className="sub">{active.length} armed · {execd.length} purchased · pricy buys in your name the moment a price crosses your max</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            {active.length > 0 && <Btn variant="ghost" icon="flask-conical" onClick={simulate}>Demo: trigger a drop</Btn>}
            <Btn variant="primary" icon="plus" onClick={() => go('browse')}>New order</Btn>
          </div>
        </div>

        {!store.signed ? (
          <div className="ab-inactive">
            <div className="ab-inactive__intro">
              <h2>Auto-buy is off</h2>
              <p>You revoked your fullmakt — no purchases can be made in your name. Sign a new one with BankID to re-arm your orders.</p>
            </div>
            <FullmaktCeremony></FullmaktCeremony>
          </div>
        ) : (
          <React.Fragment>
            <div className="ab-cap">
              <div className="ab-cap__row">
                <span>Monthly spending cap</span>
                <span><b>kr {fmt(used)}</b> of kr {fmt(store.cap)} used in July</span>
              </div>
              <div className="ab-cap__bar"><i style={{ width: Math.min(100, (used / store.cap) * 100) + '%' }}></i></div>
            </div>

            {execd.map(o => <AutobuyExecCard key={o.id + o.status} o={o} onReceipt={() => setReceipt(o)}></AutobuyExecCard>)}

            {active.length === 0 ? (
              <div className="empty" style={{ padding: 'var(--s-7) 0' }}>
                <div className="empty__ic"><Icon name="zap-off" size={40} /></div>
                <h2>No armed orders</h2>
                <p>Open any product and set a max price — we do the rest.</p>
                <Btn variant="primary" icon="search" onClick={() => go('browse')}>Browse products</Btn>
              </div>
            ) : (
              <div className="watchlist">
                {active.map(o => <AutobuyOrderRow key={o.id} o={o} go={go}></AutobuyOrderRow>)}
              </div>
            )}

            <div className="ab-admin">
              <FullmaktReceipt at={store.signedAt} onView={() => setViewDoc(true)} onRevoke={() => setConfirmRevoke(true)}></FullmaktReceipt>
              <div className="fm-signed">
                <div className="fm-signed__ic" style={{ background: 'var(--canvas-2)', color: 'var(--ink-900)' }}><Icon name={store.payment === 'vipps' ? 'smartphone' : 'credit-card'} size={20} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b>Payment method</b>
                  <p>{store.payment === 'vipps' ? 'Vipps · +47 ••• •• 481' : 'Visa •••• 4521'} · charged only on purchase</p>
                </div>
                <Btn size="sm" variant="ghost" icon="pencil" onClick={() => { store.payment = store.payment === 'vipps' ? 'card' : 'vipps'; store.emit(); }}>Change</Btn>
              </div>
            </div>
          </React.Fragment>
        )}
      </div>

      {receipt && <PurchaseModal order={receipt} onClose={() => setReceipt(null)}></PurchaseModal>}
      {viewDoc && <FullmaktModal mode="view" onClose={() => setViewDoc(false)}></FullmaktModal>}
      {confirmRevoke && (
        <div className="overlay" onClick={() => setConfirmRevoke(false)}>
          <div className="modal fm-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal__head"><b>Revoke fullmakt?</b><button className="iconbtn" onClick={() => setConfirmRevoke(false)} aria-label="Close"><Icon name="x" size={16} /></button></div>
            <div className="fm-modal__body">
              <p style={{ margin: '0 0 var(--s-4)', fontSize: 14, lineHeight: 1.55 }}>Takes effect immediately. Your {active.length} armed order{active.length === 1 ? '' : 's'} will be cancelled and pricy can no longer purchase in your name. Completed purchases are unaffected.</p>
              <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
                <Btn variant="ghost" onClick={() => setConfirmRevoke(false)}>Keep it</Btn>
                <Btn variant="dark" icon="x" onClick={() => { store.revoke(); setConfirmRevoke(false); }}>Revoke now</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  AutobuyStore, useAutobuyStore, BankIDMark, BankIDButton, FullmaktDoc, FullmaktCeremony,
  FullmaktReceipt, FullmaktModal, PaymentPicker, PurchaseModal, BuyNowModal, AutobuyBox, AutobuyPage,
});
