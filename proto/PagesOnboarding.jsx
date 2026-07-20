// ===========================================================
// Pricy.no — Onboarding (first run after signup)
// 4 steps: categories → first watches → auto-buy fullmakt → notifications
// ===========================================================

function Onboarding({ go, onFinish }) {
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState(['Audio', 'TV']);
  const [picks, setPicks] = useState({}); // id -> target
  const [notif, setNotif] = useState({ email: true, push: false });
  const [fmSigned, setFmSigned] = useState(false);
  const [pay, setPay] = useState('vipps');

  const toggleCat = (c) => setCats(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]);
  const togglePick = (p) => setPicks(s => {
    const n = { ...s };
    if (n[p.id] != null) delete n[p.id];
    else n[p.id] = Math.round(p.best * 0.95 / 10) * 10;
    return n;
  });
  const setPickTarget = (id, v) => setPicks(s => ({ ...s, [id]: v }));

  const suggested = PRODUCTS.slice().sort((a, b) => {
    const ac = cats.includes(a.cat) ? 0 : 1, bc = cats.includes(b.cat) ? 0 : 1;
    return ac - bc || b.drop - a.drop;
  }).slice(0, 6);

  const finish = () => {
    Object.entries(picks).forEach(([id, t]) => WatchStore.add(id, t));
    onFinish?.({ notif });
    go('home');
  };
  const nPicks = Object.keys(picks).length;

  return (
    <div className="ob" data-screen-label="Onboarding">
      <div className="ob__hdr">
        <Wordmark height={24}></Wordmark>
        <span className="ob__skip" onClick={() => go('home')}>Skip for now</span>
      </div>
      <div className="ob__bar">
        {[0, 1, 2, 3].map(i => <i key={i} className={i <= step ? 'done' : ''}></i>)}
      </div>

      <div className="ob__body">
        {step === 0 && (
          <div className="pop-in">
            <div className="ob__step-n">Step 1 of 4</div>
            <h1>Welcome, {USER.name}. What do you <span className="hl">shop for</span>?</h1>
            <p className="ob__sub">Pick a few categories — we'll surface the right deals. You can change this anytime.</p>
            <div className="ob-cats">
              {realCats().map(c => (
                <button key={c} type="button" className={'ob-cat' + (cats.includes(c) ? ' is-on' : '')} onClick={() => toggleCat(c)}>
                  <span className="ob-cat__chk">{cats.includes(c) && <Icon name="check" size={12} />}</span>
                  <span className="ob-cat__ic"><Icon name={CAT_ICONS[c] || 'tag'} size={22} /></span>
                  <b>{c}</b>
                  <span>{catCount(c)} products</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pop-in">
            <div className="ob__step-n">Step 2 of 4</div>
            <h1>Watch your <span className="hl">first products</span></h1>
            <p className="ob__sub">We suggest a target 5% under today's best price. We'll alert you the moment any shop goes below it.</p>
            <div className="ob-prods">
              {suggested.map(p => {
                const on = picks[p.id] != null;
                return (
                  <div key={p.id} className={'ob-prod' + (on ? ' is-on' : '')}>
                    <div className="ob-prod__img"><ProdImg p={p} fill size={22} /></div>
                    <div style={{ minWidth: 0 }}>
                      <b>{p.name}</b>
                      <div className="meta">{p.cat} · best kr {fmt(p.best)} · ▼ −{p.drop}%</div>
                    </div>
                    <div>
                      {on ? (
                        <span className="tgt-edit">
                          <span className="cur">kr</span>
                          <input type="number" value={picks[p.id]} onChange={e => setPickTarget(p.id, +e.target.value)} />
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-400)' }}>target kr {fmt(Math.round(p.best * 0.95 / 10) * 10)}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Btn size="sm" variant={on ? '' : 'primary'} icon={on ? 'check' : 'bell'} onClick={() => togglePick(p)}>{on ? 'Watching' : 'Watch'}</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pop-in">
            <div className="ob__step-n">Step 3 of 4 · optional</div>
            <h1>Let pricy <span className="hl">buy it</span> for you</h1>
            <p className="ob__sub">Give pricy a limited power of attorney (fullmakt), and when a shop drops below your max price we place the order in your name — at that exact second, even at 3 am. You can skip this and turn it on later.</p>
            <div className="ob-ab-how">
              <div><Icon name="file-signature" size={20} /><b>You sign a fullmakt</b><span>With BankID. Limited to products you choose, prices you set.</span></div>
              <div><Icon name="zap" size={20} /><b>We buy at the drop</b><span>Only below your max price, within your monthly spending cap.</span></div>
              <div><Icon name="undo-2" size={20} /><b>You stay in control</b><span>14-day angrerett on every purchase. Revoke anytime, instantly.</span></div>
            </div>
            <FullmaktCeremony onSigned={() => setFmSigned(true)}></FullmaktCeremony>
            {fmSigned && (
              <div className="ob-ab-pay pop-in">
                <div className="t-label">Charge purchases to</div>
                <PaymentPicker value={pay} onChange={setPay}></PaymentPicker>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="pop-in">
            <div className="ob__step-n">Step 4 of 4</div>
            <h1>How should we <span className="hl">reach you</span>?</h1>
            <p className="ob__sub">Only when something actually happens. No newsletters, no shop spam.</p>
            <div className="asec" style={{ background: 'var(--paper)' }}>
              <div className="arow">
                <div className="arow__txt"><b>Email alerts</b><p>Sent to {USER.email}</p></div>
                <Toggle on={notif.email} onChange={v => setNotif(s => ({ ...s, email: v }))}></Toggle>
              </div>
              <div className="arow">
                <div className="arow__txt"><b>Push notifications</b><p>Instant, in your browser</p></div>
                <Toggle on={notif.push} onChange={v => setNotif(s => ({ ...s, push: v }))}></Toggle>
              </div>
            </div>
            <div style={{ marginTop: 'var(--s-4)' }}>
              <div className="lockcard" style={{ cursor: 'default' }}>
                <div className="lockcard__ic"><Icon name="sparkles" size={20} /></div>
                <div>
                  <b>Pricy Plus <PlusTag></PlusTag> <SoonTag></SoonTag></b>
                  <p>AI deal digest, price forecasts and plain-language search — coming soon.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ob__foot">
        <div className="ob__foot-row">
          {step > 0
            ? <Btn variant="ghost" icon="arrow-left" onClick={() => setStep(s => s - 1)}>Back</Btn>
            : <span className="ob__count">{cats.length} categories selected</span>}
          {step === 1 && <span className="ob__count"><b>{nPicks}</b> product{nPicks === 1 ? '' : 's'} watched</span>}
          {step === 2 && <span className="ob__count">{fmSigned ? 'Fullmakt signed ✓' : 'Optional — skip if unsure'}</span>}
          {step < 3
            ? <Btn variant="primary" icon="arrow-right" onClick={() => setStep(s => s + 1)}>{step === 2 && !fmSigned ? 'Skip for now' : 'Continue'}</Btn>
            : <Btn variant="primary" icon="check" onClick={finish}>Start saving</Btn>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding });
