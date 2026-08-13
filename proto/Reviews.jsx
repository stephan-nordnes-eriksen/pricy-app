// ===========================================================
// Pricy.no — Folkedommen UI (07C): Verdict/TraitChip/ClaimChips
// (rows, cards, compare), ShopChip + popover (utsagn, ikke tall),
// ReviewSection (scorekort + traits + betalt-spenn + omtaler),
// WriteReviewModal (påstander må · resten valgfritt), ShopPage.
// Depends on: Primitives, ReviewsData; uses CATALOG at render time.
// ===========================================================

function useReviewStore() { const [, tick] = useState(0); useEffect(() => ReviewStore.sub(() => tick(t => t + 1)), []); }

// ---- shared verdict bits -----------------------------------
function VerdictChip({ v, n }) {
  return <span className={'vchip vchip--' + v.tone}>{v.short}{n != null && <span className="vchip__n">· {fmt(n)}</span>}</span>;
}
function TraitChip({ t, pos, share, top, lg }) {
  const bars = share != null ? Math.max(1, Math.min(5, Math.round(share * 5))) : 0;
  return <span className={'tchip ' + (pos ? 'tchip--pos' : 'tchip--neg') + (top ? ' is-top' : '') + (lg ? ' tchip--lg' : '')}><b>{pos ? '+' : '−'}</b> {t}{bars > 0 && <span className="dfreq">{Array.from({ length: bars }).map((_, i) => <i key={i}></i>)}</span>}</span>;
}
// compact verdict for rows/cards/headers: chip + top pluss/minus
function Verdict({ p, traits = 0, count = false }) {
  useReviewStore();
  const s = reviewStats(p);
  if (!s || !s.n) return <span className="vchip vchip--none">Ingen omtaler ennå</span>;
  const tp = s.traits.find(t => t.pos), tn = s.traits.find(t => !t.pos);
  return (
    <span className="folkedom">
      <VerdictChip v={s.verdict} n={count ? s.n : null} />
      {traits > 0 && tp && <TraitChip t={tp.t} pos />}
      {traits > 1 && tn && <TraitChip t={tn.t} pos={false} />}
    </span>
  );
}
// a review's three claim answers as chips
function ClaimChips({ r }) {
  const cs = r.claims || {};
  return <React.Fragment>{CLAIMS.map(c => {
    const v = cs[c.key];
    if (v === 'y') return <span key={c.key} className="pchip pchip--pos">✓ {c.low}</span>;
    if (v === 'n') return <span key={c.key} className="pchip pchip--neg">✕ {CLAIM_NEG[c.key]}</span>;
    return <span key={c.key} className="pchip pchip--u">· {c.low} — vet ikke</span>;
  })}</React.Fragment>;
}
// aggregated claim row: label · marks · verdict
function Marks({ y, n, u }) {
  const tot = y + n + u || 1;
  let a = Math.round(y / tot * 5), b = Math.round(n / tot * 5);
  if (a + b > 5) b = 5 - a;
  const c = 5 - a - b;
  return <span className="dmarks">{Array.from({ length: a }).map((_, i) => <i key={'y' + i} className="y">✓</i>)}{Array.from({ length: b }).map((_, i) => <i key={'n' + i} className="nn">✕</i>)}{Array.from({ length: c }).map((_, i) => <i key={'u' + i} className="u">·</i>)}</span>;
}
function ClaimRow({ c }) {
  return (
    <div className="clm">
      <span className="clm__q">{c.label}</span>
      <Marks y={c.y} n={c.n} u={c.u} />
      <span className={'clm__v vtx--' + c.verdict.tone}>{c.verdict.label}</span>
    </div>
  );
}
function BuyChip({ r, best }) {
  const show = r.showPaid && r.paid > 0;
  const ctx = show && best ? (r.paid < best * .98 ? 'under dagens pris' : r.paid > best * 1.02 ? 'over dagens pris' : 'rundt dagens pris') : null;
  return <span className="buychip">Kjøpt hos {r.shop}{show && <React.Fragment> · {fmtNok(r.paid)}</React.Fragment>}{ctx && <React.Fragment> · {ctx}</React.Fragment>}</span>;
}

// ---- shop trust chip + popover (PDP offer rows) ------------
function ShopPopover({ shop, meta, go }) {
  return (
    <div className="shoppop">
      <div className="shoppop__head"><b>{shop}</b><span className={'vchip vchip--' + meta.tone}>{meta.word}</span></div>
      <div className="shoppop__asps">
        {meta.aspects.map(a => <div key={a.q} className="sasp"><span className="sasp__q">{a.q}</span><span className="sasp__quote">«{a.quote}»</span><span className={'sasp__v vtx--' + a.tone}>{a.v}</span></div>)}
      </div>
      <div className="shoppop__n">{fmt(meta.count)} kundevurderinger</div>
      {meta.tone === 'neg' && <div className="shoppop__warn"><Icon name="alert-triangle" size={13} /> Folk advarer — sjekk vilkår før kjøp</div>}
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
  return (
    <span className="shopchip-wrap" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" className={'shopchip shopchip--' + meta.tone + (meta.tone === 'neg' ? ' is-warn' : '') + (open ? ' is-open' : '')} title={'Kundene sier: ' + meta.word} aria-expanded={open} onClick={() => setOpen(o => !o)}>{meta.word}</button>
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

function RevStep({ n, t, req }) {
  return <div className="revstep"><b>{n} · {t}</b><span className={'rtag ' + (req ? 'rtag--req' : 'rtag--opt')}>{req ? 'må besvares' : 'valgfritt'}</span></div>;
}

function WriteReviewModal({ p, review, onClose, onDone }) {
  const [claims, setClaims] = useState(() => ({ worth: null, durable: null, described: null, ...(review ? review.claims : null) }));
  const [plus, setPlus] = useState(() => new Set(review ? review.plus || [] : []));
  const [minus, setMinus] = useState(() => new Set(review ? review.minus || [] : []));
  const [shop, setShop] = useState(review ? review.shop || null : null);
  const [otherOn, setOtherOn] = useState(false);
  const [paid, setPaid] = useState(review && review.paid ? String(review.paid) : '');
  const [showPaid, setShowPaid] = useState(review ? !!review.showPaid : false);
  const [title, setTitle] = useState(review ? review.title || '' : '');
  const [body, setBody] = useState(review ? review.body || '' : '');
  const [csign, setCsign] = useState(true);
  const [ctext, setCtext] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const pool = TRAIT_POOL[p.cat] || TRAIT_POOL._;
  const sugP = [...new Set([...pool.plus, ...plus])];
  const sugM = [...new Set([...pool.minus, ...minus])];
  const shops = [...new Set([...(review && review.shop ? [review.shop] : []), ...((p.offers || []).map(o => o.shop))])].slice(0, 4);
  const toggle = (setter) => (t) => setter(s => { const x = new Set(s); x.has(t) ? x.delete(t) : x.add(t); return x; });
  const togglePlus = toggle(setPlus), toggleMinus = toggle(setMinus);
  const addCustom = () => { const t = ctext.trim(); if (!t) return; (csign ? togglePlus : toggleMinus)(t); setCtext(''); };
  const submit = async () => {
    if (CLAIMS.some(c => !claims[c.key])) { setErr('Ta stilling til de tre påstandene først — «Vet ikke» er også et svar.'); return; }
    const payload = { claims, plus: [...plus], minus: [...minus], shop, paid: +paid > 0 ? Math.min(1_000_000, Math.round(+paid)) : null, showPaid: +paid > 0 ? showPaid : false, title: title.trim(), body: body.trim() };
    setBusy(true); setErr(null);
    try {
      const res = review ? ReviewStore.update(review.id, payload) : ReviewStore.add({ prodId: p.id, author: 'Du', ...payload });
      await Promise.resolve(res);
      onDone();
    } catch (e) {
      const m = e && typeof e.message === 'string' && e.message.trim() && e.message.length <= 120 ? e.message : 'Kunne ikke lagre omtalen — prøv igjen.';
      setErr(m);
      setBusy(false);
    }
  };
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal revmodal" role="dialog" aria-label={review ? 'Rediger omtale' : 'Skriv omtale'}>
        <div className="modal__head"><b>{review ? 'Rediger omtale' : 'Din dom'}</b><button className="iconbtn" onClick={onClose} aria-label="Lukk"><Icon name="x" size={16} /></button></div>
        <div className="revmodal__body">
          <div className="revmodal__prod"><span className="im"><ProdImg p={p} fill size={20} /></span><span>{p.brand} · {p.name}</span></div>
          <div>
            <RevStep n="1" t="Ta stilling til tre påstander" req />
            {CLAIMS.map(c => (
              <div className="revq" key={c.key}>
                <span className="revq__l">{c.label}</span>
                <span className="revseg">
                  {[['y', 'Enig'], ['n', 'Uenig'], ['u', 'Vet ikke']].map(([v, l]) => <button key={v} type="button" className={claims[c.key] === v ? 'is-on is-' + v : ''} onClick={() => { setClaims(s => ({ ...s, [c.key]: v })); setErr(null); }}>{l}</button>)}
                </span>
              </div>
            ))}
          </div>
          <div>
            <RevStep n="2" t="Sett farge på det" />
            <div className="traitpick">
              {sugP.map(t => <button key={'+' + t} type="button" className={'tchip tchip--pos' + (plus.has(t) ? ' is-top' : '')} onClick={() => togglePlus(t)}><b>+</b> {t}</button>)}
              {sugM.map(t => <button key={'-' + t} type="button" className={'tchip tchip--neg' + (minus.has(t) ? ' is-top' : '')} onClick={() => toggleMinus(t)}><b>−</b> {t}</button>)}
            </div>
            <div className="custrait">
              <button type="button" className="custrait__sign" title="Bytt mellom pluss og minus" onClick={() => setCsign(v => !v)}>{csign ? '+' : '−'}</button>
              <input placeholder="eget punkt…" value={ctext} onChange={e => setCtext(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              {ctext.trim() !== '' && <Btn size="sm" onClick={addCustom}>Legg til</Btn>}
            </div>
          </div>
          <div>
            <RevStep n="3" t="Hvor og til hvilken pris?" />
            <div className="revseg revseg--wrap">
              {shops.map(s => <button key={s} type="button" className={shop === s ? 'is-on is-y' : ''} onClick={() => { setOtherOn(false); setShop(shop === s ? null : s); }}>{s}</button>)}
              {otherOn ? <input className="othershop" autoFocus placeholder="butikknavn" defaultValue={shops.includes(shop) ? '' : shop || ''} maxLength={60} onChange={e => setShop(e.target.value.trim() || null)} /> : <button type="button" className="is-dash" onClick={() => { setShop(null); setOtherOn(true); }}>annen butikk…</button>}
            </div>
            <div className="paidrow">
              <span className="paidin">kr <input type="number" min="0" placeholder="—" value={paid} onChange={e => setPaid(e.target.value)} /></span>
              {+paid > 0 && <label className="tgllbl"><button type="button" className={'tgl' + (showPaid ? ' is-on' : '')} aria-pressed={showPaid} onClick={() => setShowPaid(v => !v)}></button>Vis hva jeg betalte i omtalen</label>}
            </div>
            {+paid > 0 && !showPaid && <p className="revhint" style={{ margin: '8px 0 0' }}>Beløpet holdes skjult — det teller bare i «hva folk betalte»-spennet.</p>}
          </div>
          <div>
            <RevStep n="4" t="Fortell mer" />
            <div className="revmodal__field" style={{ marginBottom: 'var(--s-3)' }}>
              <input value={title} maxLength={80} placeholder="Oppsummer med én setning" onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="revmodal__field">
              <textarea rows={3} value={body} maxLength={2000} placeholder="Hva bør andre vite? Hold det konkret." onChange={e => setBody(e.target.value)}></textarea>
            </div>
          </div>
          {err && <div className="revmodal__err"><Icon name="alert-triangle" size={14} /> {err}</div>}
          <div className="revfoot">
            <span className="revhint">Bare steg 1 kreves — resten gjør omtalen rikere.</span>
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <Btn variant="ghost" onClick={onClose}>Avbryt</Btn>
              <Btn variant="primary" icon="check" disabled={busy} onClick={submit}>{review ? 'Lagre endringer' : 'Send omtalen'}</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ r, best, onEdit, onDelete }) {
  const own = r.author === 'Du';
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="revcard">
      <div className="revcard__top">
        <span className="revcard__author">{r.author}</span>
        {own && <span className="revcard__own">Din omtale</span>}
        {r.verified && <span className="revcard__verif"><Icon name="badge-check" size={13} /> Verifisert kjøp</span>}
        <span className="revcard__date">{r.date}{r.edited ? ' · redigert' : ''}</span>
      </div>
      <div className="revcard__chips"><ClaimChips r={r} /></div>
      {((r.plus || []).length > 0 || (r.minus || []).length > 0) && <div className="revcard__traits">{(r.plus || []).map(t => <TraitChip key={'+' + t} t={t} pos />)}{(r.minus || []).map(t => <TraitChip key={'-' + t} t={t} pos={false} />)}</div>}
      {r.title && <b className="revcard__title">{r.title}</b>}
      {r.body && <p className="revcard__body">{r.body}</p>}
      {r.shop && <div className="revcard__buy"><BuyChip r={r} best={best} /></div>}
      <div className="revcard__foot">
        <button type="button" className={'rev-helpful' + (ReviewStore.voted.has(r.id) ? ' is-on' : '')} onClick={() => ReviewStore.vote(r.id)}>
          <Icon name="thumbs-up" size={13} /> Nyttig ({r.helpful})
        </button>
        {own && onEdit && (confirm ? (
          <div className="revcard__acts"><span className="rev-confirm">Slette omtalen?</span><button type="button" className="rev-act" onClick={() => setConfirm(false)}>Behold</button><button type="button" className="rev-act rev-act--del" onClick={() => onDelete(r)}>Ja, slett</button></div>
        ) : (
          <div className="revcard__acts"><button type="button" className="rev-act" onClick={() => onEdit(r)}><Icon name="pencil-line" size={13} /> Rediger</button><button type="button" className="rev-act rev-act--del" onClick={() => setConfirm(true)}><Icon name="trash-2" size={13} /> Slett</button></div>
        ))}
      </div>
    </div>
  );
}

function ReviewSection({ p }) {
  useReviewStore();
  const s = reviewStats(p);
  const [write, setWrite] = useState(false);
  const [edit, setEdit] = useState(null);
  const mine = (s ? s.real : []).find(r => r.author === 'Du');
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const flash = (m) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2400); };
  const onDelete = (r) => { ReviewStore.remove(r.id); flash('Omtalen er slettet.'); };
  const topP = s ? s.traits.filter(t => t.pos).slice(0, 3) : [];
  const topM = s ? s.traits.filter(t => !t.pos).slice(0, 2) : [];
  return (
    <div className="sec revsec" id="pdp-reviews" style={{ marginTop: 'var(--s-7)' }}>
      <div className="sec__head"><h2>Folkedommen{s && <span className="revsec__n"> · {fmt(s.n)} har tatt stilling</span>}</h2><Btn variant="ghost" size="sm" icon="pencil-line" onClick={() => mine ? setEdit(mine) : setWrite(true)}>{mine ? 'Rediger din omtale' : 'Skriv omtale'}</Btn></div>
      {!s ? (
        <div className="rev-empty">Ingen har dømt denne ennå — kjøpt den? <a onClick={() => setWrite(true)}>Vær førstemann.</a></div>
      ) : (
        <React.Fragment>
          <div className="revsum">
            <div>
              <p className="revsum__head">{s.verdict.head}</p>
              {s.claims.map(c => <ClaimRow key={c.key} c={c} />)}
            </div>
            <div className="revsum__col">
              <div className="t-label" style={{ marginBottom: 10 }}>Det folk trekker frem</div>
              {(topP.length || topM.length) ? (
                <div className="revsum__traits">
                  {topP.map((t, i) => <TraitChip key={'+' + t.t} t={t.t} pos share={t.share} top={i === 0} lg />)}
                  {topM.map((t, i) => <TraitChip key={'-' + t.t} t={t.t} pos={false} share={t.share} top={i === 0} lg />)}
                </div>
              ) : <p className="revhint" style={{ margin: 0 }}>Ingen har satt farge på dommen ennå.</p>}
              {s.paid && (
                <div style={{ marginTop: 'var(--s-4)' }}>
                  <span className="buychip">Typisk betalt {s.paid.lo === s.paid.hi ? fmtNok(s.paid.lo) : fmtNok(s.paid.lo) + ' – ' + fmtNok(s.paid.hi)}</span>
                  <p className="revhint" style={{ margin: '6px 0 0' }}>Fra det kjøpere oppgir at de betalte. Alltid spennet, aldri enkeltkjøp.</p>
                </div>
              )}
            </div>
          </div>
          {s.nReal === 0 ? (
            <div className="revnote">Dommen bygger på {fmt(s.n)} hurtigvurderinger fra kjøpere. Ingen har skrevet en full omtale ennå — <a onClick={() => setWrite(true)}>vær førstemann.</a></div>
          ) : (
            <div className="revlist">{s.real.map(r => <ReviewCard key={r.id} r={r} best={p.best} onEdit={setEdit} onDelete={onDelete} />)}</div>
          )}
        </React.Fragment>
      )}
      {(write || edit) && <WriteReviewModal p={p} review={edit} onClose={() => { setWrite(false); setEdit(null); }} onDone={() => { flash(edit ? 'Omtalen er oppdatert.' : 'Takk! Dommen din er med i regnskapet.'); setWrite(false); setEdit(null); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

// ---- shop profile route ------------------------------------
function relTimeNo(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'nå nettopp';
  if (m < 60) return 'for ' + m + ' min siden';
  const h = Math.round(m / 60);
  if (h < 24) return 'for ' + h + (h === 1 ? ' time' : ' timer') + ' siden';
  const d = Math.round(h / 24);
  return d === 1 ? 'i går' : 'for ' + d + ' dager siden';
}

function ShopPage({ go, shop }) {
  const meta = SHOP_META[shop];
  const stats = !meta && window.SHOP_STATS ? window.SHOP_STATS[shop] : null;
  const rows = useMemo(() => {
    const out = [];
    (window.CATALOG || []).forEach(p => {
      const o = (p.offers || []).find(x => x.shop === shop);
      if (o) out.push({ p, o, best: !!p.offers[0] && p.offers[0].shop === shop, diff: o.price - (p.offers[0] ? p.offers[0].price : o.price) });
    });
    out.sort((a, b) => (b.best - a.best) || ((b.p.drop || 0) - (a.p.drop || 0)));
    return out;
  }, [shop]);
  if (!meta && !stats) return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page"><div className="offers__empty" style={{ marginTop: 'var(--s-6)' }}>Fant ikke butikken «{shop}»</div></div>
    </div>
  );
  const bestCount = rows.filter(r => r.best).length;
  return (
    <div className="screen" data-screen-label={'Shop · ' + shop}>
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page shoppage">
        <div className="pdp__crumb"><a onClick={() => go('home')}>Home</a><Icon name="chevron-right" size={13} /><span style={{ color: 'var(--ink-900)' }}>{shop}</span></div>
        <div className="shop-hero" style={meta ? undefined : { gridTemplateColumns: '1fr' }}>
          <div>
            <div className="t-label">Butikkprofil</div>
            <h1 className="shop-hero__name">{shop}</h1>
            {meta && <div className="shopdom"><span className={'vchip vchip--' + meta.tone}>{meta.word}</span><span className="shopdom__n">{fmt(meta.count)} kundevurderinger</span></div>}
            {meta ? (
              <div className="shop-hero__meta">Hos Pricy siden {meta.since} · {meta.physical ? 'Fysiske butikker + nettbutikk' : 'Kun nettbutikk'}</div>
            ) : (
              <div className="shop-hero__meta">{fmt(stats.offers)} priser fulgt · Sist oppdatert {relTimeNo(stats.updated)}</div>
            )}
            {meta && meta.tone === 'neg' && <div className="shop-flag"><Icon name="alert-triangle" size={14} /> Folk advarer — sjekk leverings- og returvilkår før kjøp</div>}
          </div>
          {meta && <div className="shopbars">
            <div className="t-label" style={{ marginBottom: 4 }}>Hva kundene sier · {fmt(meta.count)}</div>
            {meta.aspects.map(a => <div key={a.q} className="sasp"><span className="sasp__q">{a.q}</span><span className="sasp__quote">«{a.quote}»</span><span className={'sasp__v vtx--' + a.tone}>{a.v}</span></div>)}
          </div>}
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

Object.assign(window, { Verdict, VerdictChip, TraitChip, ClaimChips, Marks, ClaimRow, BuyChip, ShopChip, ShopPopover, ReviewSection, ReviewCard, WriteReviewModal, ShopPage, scrollToReviews, useReviewStore });
