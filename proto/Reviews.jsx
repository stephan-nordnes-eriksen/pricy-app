// ===========================================================
// Pricy.no — Reviews layer UI: ShopChip + popover (offer rows),
// ReviewSection (PDP), ShopPage (profile route)
// Depends on: Primitives, ReviewsData; uses window.Stars,
// CATALOG (Results.jsx) at render time only.
// ===========================================================

function useReviewStore() { const [, tick] = useState(0); useEffect(() => ReviewStore.sub(() => tick(t => t + 1)), []); }

function RatingBar({ label, v }) {
  return (
    <div className="rbar">
      <span>{label}</span>
      <span className="rbar__track"><span className="rbar__fill" style={{ width: (v / 5 * 100) + '%' }}></span></span>
      <b>{v.toFixed(1)}</b>
    </div>
  );
}

// ---- shop trust chip + popover (PDP offer rows) ------------
function ShopPopover({ shop, meta, go }) {
  return (
    <div className="shoppop">
      <div className="shoppop__head">
        <b>{shop}</b>
        <span className="shoppop__score">★ {meta.rating.toFixed(1)}<span> · {fmt(meta.count)} vurderinger</span></span>
      </div>
      <div className="shoppop__bars">
        <RatingBar label="Levering" v={meta.delivery} />
        <RatingBar label="Service" v={meta.service} />
        <RatingBar label="Retur" v={meta.returns} />
      </div>
      {meta.rating < 3.8 && <div className="shoppop__warn"><Icon name="alert-triangle" size={13} /> Under snittet — sjekk vilkår før kjøp</div>}
      <a className="shoppop__link" onClick={() => go && go('shop', { shop })}>Se butikkprofil <Icon name="arrow-right" size={13} /></a>
    </div>
  );
}

function ShopChip({ shop, go }) {
  const meta = SHOP_META[shop];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!meta) return null;
  const warn = meta.rating < 3.8;
  return (
    <span className="shopchip-wrap" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" className={'shopchip' + (warn ? ' is-warn' : '') + (open ? ' is-open' : '')} title={'Butikkvurdering ' + meta.rating.toFixed(1) + ' av 5'} aria-expanded={open} onClick={() => setOpen(o => !o)}>★ {meta.rating.toFixed(1)}</button>
      {open && <ShopPopover shop={shop} meta={meta} go={go} />}
    </span>
  );
}

// ---- PDP review section ------------------------------------
function scrollToReviews() {
  requestAnimationFrame(() => {
    const el = document.getElementById('pdp-reviews');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
  });
}

function WriteReviewModal({ p, onClose, onDone }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState(null);
  const submit = () => {
    if (!(rating > 0)) { setErr('Velg antall stjerner først.'); return; }
    if (!title.trim() || !body.trim()) { setErr('Fyll inn både tittel og omtale.'); return; }
    ReviewStore.add({ prodId: p.id, author: 'Du', rating, title: title.trim(), body: body.trim() });
    onDone();
  };
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal revmodal" role="dialog" aria-label="Skriv omtale">
        <div className="modal__head"><b>Skriv omtale</b><button className="iconbtn" onClick={onClose} aria-label="Lukk"><Icon name="x" size={16} /></button></div>
        <div className="revmodal__body">
          <div className="revmodal__prod"><span className="im"><ProdImg p={p} fill size={20} /></span><span>{p.brand} · {p.name}</span></div>
          <div className="revmodal__field">
            <span className="t-label">Din vurdering</span>
            <div className="rate-pick" role="radiogroup" aria-label="Antall stjerner">
              {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={n <= rating ? 'is-on' : ''} aria-label={n + ' stjerner'} onClick={() => { setRating(n); setErr(null); }}>{n <= rating ? '★' : '☆'}</button>)}
            </div>
          </div>
          <div className="revmodal__field">
            <span className="t-label">Tittel</span>
            <input value={title} maxLength={80} placeholder="Oppsummer med én setning" onChange={e => { setTitle(e.target.value); setErr(null); }} />
          </div>
          <div className="revmodal__field">
            <span className="t-label">Omtale</span>
            <textarea rows={4} value={body} placeholder="Hva bør andre vite? Hold det konkret." onChange={e => { setBody(e.target.value); setErr(null); }}></textarea>
          </div>
          {err && <div className="revmodal__err"><Icon name="alert-triangle" size={14} /> {err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
            <Btn variant="ghost" onClick={onClose}>Avbryt</Btn>
            <Btn variant="primary" icon="check" onClick={submit}>Publiser omtale</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ r }) {
  return (
    <div className="revcard">
      <div className="revcard__top">
        <span className="revcard__author">{r.author}</span>
        {r.verified && <span className="revcard__verif"><Icon name="badge-check" size={13} /> Verifisert kjøp</span>}
        <span className="revcard__date">{r.date}</span>
      </div>
      <div className="revcard__rate"><Stars rating={r.rating} /><b className="revcard__title">{r.title}</b></div>
      <p className="revcard__body">{r.body}</p>
      <button type="button" className={'rev-helpful' + (ReviewStore.voted.has(r.id) ? ' is-on' : '')} onClick={() => ReviewStore.vote(r.id)}>
        <Icon name="thumbs-up" size={13} /> Nyttig ({r.helpful})
      </button>
    </div>
  );
}

function ReviewSection({ p }) {
  useReviewStore();
  const list = ReviewStore.list(p.id);
  const [write, setWrite] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const flash = (m) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2400); };
  const n = list.length;
  const avg = n ? list.reduce((s, r) => s + r.rating, 0) / n : 0;
  const hist = [5, 4, 3, 2, 1].map(s => list.filter(r => r.rating === s).length);
  const verif = n ? Math.round(list.filter(r => r.verified).length / n * 100) : 0;
  return (
    <div className="sec revsec" id="pdp-reviews" style={{ marginTop: 'var(--s-7)' }}>
      <div className="sec__head"><h2>Omtaler{n > 0 && <span className="revsec__n"> ({n})</span>}</h2><Btn variant="ghost" size="sm" icon="pencil-line" onClick={() => setWrite(true)}>Skriv omtale</Btn></div>
      {n === 0 ? (
        <div className="rev-empty">Ingen omtaler ennå — kjøpt denne? <a onClick={() => setWrite(true)}>Vær førstemann.</a></div>
      ) : (
        <React.Fragment>
          <div className="revsum">
            <div className="revsum__avg">
              <div className="revsum__big">{avg.toFixed(1)}</div>
              <Stars rating={Math.round(avg * 10) / 10} />
              <div className="revsum__meta">{n} omtaler på Pricy · {verif} % verifiserte kjøp</div>
            </div>
            <div className="revsum__hist">
              {hist.map((c, i) => (
                <div key={i} className="histrow">
                  <span>{5 - i}★</span>
                  <span className="histrow__track"><span className="histrow__fill" style={{ width: (n ? c / n * 100 : 0) + '%' }}></span></span>
                  <b>{c}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="revlist">{list.map(r => <ReviewCard key={r.id} r={r} />)}</div>
        </React.Fragment>
      )}
      {write && <WriteReviewModal p={p} onClose={() => setWrite(false)} onDone={() => { setWrite(false); flash('Takk! Omtalen er publisert.'); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

// ---- shop profile route ------------------------------------
function ShopPage({ go, shop }) {
  const meta = SHOP_META[shop];
  const rows = useMemo(() => {
    const out = [];
    (window.CATALOG || []).forEach(p => {
      const o = (p.offers || []).find(x => x.shop === shop);
      if (o) out.push({ p, o, best: !!p.offers[0] && p.offers[0].shop === shop, diff: o.price - (p.offers[0] ? p.offers[0].price : o.price) });
    });
    out.sort((a, b) => (b.best - a.best) || ((b.p.drop || 0) - (a.p.drop || 0)));
    return out;
  }, [shop]);
  if (!meta) return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page"><div className="offers__empty" style={{ marginTop: 'var(--s-6)' }}>Fant ikke butikken «{shop}»</div></div>
    </div>
  );
  const warn = meta.rating < 3.8;
  const bestCount = rows.filter(r => r.best).length;
  return (
    <div className="screen" data-screen-label={'Shop · ' + shop}>
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page shoppage">
        <div className="pdp__crumb"><a onClick={() => go('home')}>Home</a><Icon name="chevron-right" size={13} /><span style={{ color: 'var(--ink-900)' }}>{shop}</span></div>
        <div className="shop-hero">
          <div>
            <div className="t-label">Butikkprofil</div>
            <h1 className="shop-hero__name">{shop}</h1>
            <div className="shop-hero__stars"><Stars rating={meta.rating} reviews={meta.count} /></div>
            <div className="shop-hero__meta">Hos Pricy siden {meta.since} · {meta.physical ? 'Fysiske butikker + nettbutikk' : 'Kun nettbutikk'}</div>
            {warn && <div className="shop-flag"><Icon name="alert-triangle" size={14} /> Vurdert under snittet av kundene — sjekk leverings- og returvilkår før kjøp</div>}
          </div>
          <div className="shopbars">
            <div className="t-label" style={{ marginBottom: 4 }}>Kundevurderinger · {fmt(meta.count)}</div>
            <RatingBar label="Levering" v={meta.delivery} />
            <RatingBar label="Service" v={meta.service} />
            <RatingBar label="Retur" v={meta.returns} />
          </div>
        </div>
        <div className="sec">
          <div className="sec__head"><h2>Beste priser hos {shop} nå</h2><span className="shop-hero__count">Billigst på {bestCount} av {rows.length} produkter</span></div>
          <div className="shoplist">
            {rows.slice(0, 12).map(({ p, o, best, diff }) => (
              <div key={p.id} className="shoprow" onClick={() => go('product', { id: p.id })}>
                <div className="shoprow__img"><ProdImg p={p} fill size={26} /></div>
                <div className="shoprow__main">
                  <div className="shoprow__brand">{p.brand}</div>
                  <div className="shoprow__name">{p.name}</div>
                </div>
                <div className="shoprow__ship">{o.ship} · {o.eta}</div>
                <div className="shoprow__price">
                  <Price value={o.price} size={16} />
                  {best ? <Tag kind="best">★ Billigst</Tag> : <span className="shoprow__diff">+{fmt(diff)} kr over billigst</span>}
                </div>
                <Icon name="chevron-right" size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RatingBar, ShopChip, ShopPopover, ReviewSection, WriteReviewModal, ShopPage, scrollToReviews, useReviewStore });
