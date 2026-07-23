// ===========================================================
// Pricy.no — Login screen
// Methods: email + password · magic link
// Layouts: centered (default) · split (animated brand demo)
// ===========================================================

// animated count helper
function useCountTo(target, run, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    let raf, t0;
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
}

// Live mini price-demo used in the split brand panel
function BrandDemo() {
  const pts = byId.xm5.history;
  const saved = useCountTo(1291, true, 1100);
  return (
    <div className="demo">
      <div className="demo__row">
        <div className="demo__name">Sony WH-1000XM5</div>
        <div className="demo__pricewrap">
          <span className="demo__was">kr 4 290</span>
          <span className="demo__price">kr 2 999</span>
        </div>
      </div>
      <svg viewBox="0 0 280 86" preserveAspectRatio="none" className="draw">
        {(() => {
          const w = 280, h = 86, max = Math.max(...pts), min = Math.min(...pts), r = max - min || 1;
          const step = w / (pts.length - 1);
          let line = '';
          pts.forEach((p, i) => { const x = i * step, y = h - ((p - min) / r) * (h - 10) - 5; line += (i === 0 ? `M ${x} ${y}` : ` H ${x} V ${y}`); });
          const lastY = h - ((pts[pts.length - 1] - min) / r) * (h - 10) - 5;
          return (<>
            <path className="draw-line" d={line} stroke="#00B964" strokeWidth="2.5" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
            <rect x={w - 4} y={lastY - 4} width="8" height="8" fill="#00B964" stroke="#161614" strokeWidth="2" />
          </>);
        })()}
      </svg>
      <div className="demo__alert">
        <Icon name="bell-ring" size={15} /> Price-drop alert · e.g. save kr {fmt(saved)}
      </div>
    </div>
  );
}

function AuthCard({ onAuthed, go }) {
  const [method, setMethod] = useState('password'); // password | magic
  const [magicHint, setMagicHint] = useState('');
  const [mode, setMode] = useState('login'); // login | signup
  const [bidBusy, setBidBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [err, setErr] = useState('');

  // Resend cooldown ticker (only while the sent screen is showing)
  useEffect(() => {
    if (!sent || cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [sent, cooldown]);

  const validEmail = /.+@.+\..+/.test(email);

  // Hand the attempt to the parent and wait for the real answer.
  // - onAuthed returns a Promise (production shell): keep the spinner until it
  //   settles. Resolved `false`, or an object like `{ error: '…' }`, is a
  //   server-side rejection — stay on the form and show the message. A resolved
  //   truthy value means the parent is navigating; we just stop spinning.
  // - onAuthed returns undefined (the preview harness, which navigates by side
  //   effect): fall back to today's fake demo delay, then release.
  const runAuth = (setBusy, demoDelay, fallbackErr, ...args) => {
    setErr('');
    setBusy(true);
    const result = onAuthed(...args);
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).then(
        (r) => {
          setBusy(false);
          if (r === false || (r && r.error)) setErr((r && r.error) || fallbackErr);
        },
        () => { setBusy(false); setErr(fallbackErr); }
      );
    } else {
      setTimeout(() => setBusy(false), demoDelay);
    }
  };

  const bankid = () => {
    if (bidBusy) return;
    runAuth(setBidBusy, 1400, 'BankID could not verify your identity — try again.', null);
  };

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (!validEmail) { setErr('Enter a valid email address.'); return; }
    if (method === 'password' && pw.length < 1) { setErr('Enter your password.'); return; }
    if (method === 'password' && mode === 'signup' && pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (method === 'magic') {
      // Sending the link is not an auth event — show the "check your inbox" screen.
      setLoading(true);
      setTimeout(() => { setLoading(false); setSent(true); setCooldown(30); }, 850);
      return;
    }
    if (mode === 'signup') runAuth(setLoading, 850, "Couldn't create your account — try again.", email, { signup: true, password: pw });
    else runAuth(setLoading, 850, 'No account for this email — create one?', email, { password: pw });
  };

  if (sent) {
    return (
      <div className="authcard">
        <div className="sent">
          <div className="sent__icon"><Icon name="mail-check" size={34} /></div>
          <h1>Check your inbox</h1>
          <p>We sent a link to <span className="addr">{email}</span> — this page will continue automatically once you click it.</p>
          <div className="sent__wait"><span className="sent__spinner" aria-hidden="true"></span> Waiting for you to open the link…</div>
          <div className="auth-foot" style={{ marginTop: 20 }}>
            {cooldown > 0
              ? <span className="sent__cd">Resend in {cooldown}s</span>
              : <a onClick={() => setCooldown(30)}>Resend link</a>}
            <span className="sent__sep">·</span>
            Wrong address? <a onClick={() => { setSent(false); setMethod('magic'); }}>Go back</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="authcard">
      <div className="authcard__eyebrow">{mode === 'signup' ? 'Get started' : 'Welcome back'}</div>
      <h1>{mode === 'signup' ? 'Create your account' : 'Log in to pricy'}</h1>

      <button type="button" className="bankid-btn" onClick={bankid} disabled={bidBusy}>
        {bidBusy
          ? <React.Fragment><span className="spinner" style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></span> Waiting for BankID…</React.Fragment>
          : <React.Fragment><Icon name="fingerprint" size={18} /> Continue with <BankIDMark light={true}></BankIDMark></React.Fragment>}
      </button>
      {window.HIDE_AUTOBUY
        ? <div className="bankid-hint"><Icon name="shield-check" size={13} /><span>Verified instantly with BankID — no password to remember.</span></div>
        : <div className="bankid-hint"><Icon name="zap" size={13} /><span>BankID will unlock auto-buy — pricy will be able to purchase for you the moment a price drops below your max. <span className="tag tag--soon">Coming soon</span></span></div>}

      <div className="or-div"><span>or use email</span></div>

      <div className="seg" role="tablist">
        <button className={method === 'password' ? 'is-on' : ''} onClick={() => { setMethod('password'); setErr(''); setMagicHint(''); }}>
          <Icon name="lock" size={14} /> Password
        </button>
        <button className={method === 'magic' ? 'is-on' : ''} onClick={() => { setMethod('magic'); setErr(''); setMagicHint(''); }}>
          <Icon name="wand-sparkles" size={14} /> Magic link
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="formfield">
          <label htmlFor="email">Email</label>
          <div className={'field' + (err && !validEmail ? ' is-invalid' : '')}>
            <span className="lead-ic"><Icon name="mail" size={18} /></span>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.no"
              value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </div>
        </div>

        {method === 'password' && (
          <div className="formfield">
            <label htmlFor="pw">Password <span className="forgot" onClick={() => { setMethod('magic'); setErr(''); setMagicHint('Log in with an email link — you can set a new password afterwards in Settings.'); }}>Forgot?</span></label>
            <div className={'field' + (err && validEmail ? ' is-invalid' : '')}>
              <span className="lead-ic"><Icon name="lock" size={18} /></span>
              <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                value={pw} onChange={e => setPw(e.target.value)} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(s => !s)} aria-label="Toggle password">
                <Icon name={showPw ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </div>
        )}

        {method === 'magic' && (
          <div className="formhint">{magicHint || "No password needed — we'll email you a secure one-tap link that signs you in."}</div>
        )}

        {err && <div className="formhint err"><Icon name="alert-triangle" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{err}</div>}

        <button type="submit" className="btn btn--primary auth-submit" disabled={loading}>
          {loading ? <span className="spinner" /> : (<>{method === 'magic' ? 'Send magic link' : (mode === 'signup' ? 'Create account' : 'Log in')}<Icon name="arrow-right" size={16} /></>)}
        </button>
      </form>

      <div className="auth-foot">
        {mode === 'signup'
          ? <React.Fragment>Already have an account? <a onClick={() => { setMode('login'); setErr(''); }}>Log in</a></React.Fragment>
          : <React.Fragment>New to pricy? <a onClick={() => { setMode('signup'); setErr(''); }}>Create an account</a></React.Fragment>}
      </div>
    </div>
  );
}

function Login({ onAuthed, go, layout = 'centered' }) {
  if (layout === 'split') {
    return (
      <div className="screen auth">
        <div className="auth__brand">
          <div className="auth__brand-grid" />
          <div className="auth__brand-top" onClick={() => go && go('landing')} style={{ cursor: 'pointer' }}>
            <Wordmark height={30} reversed />
          </div>
          <div className="auth__pitch">
            <div className="auth__brand-line" style={{ marginBottom: 16 }}>{trustLine()}</div>
            <h2>Never overpay.<br />Watch the <span className="hl">price</span>, not the clock.</h2>
            <BrandDemo />
          </div>
        </div>
        <div className="auth__form-side">
          <AuthCard onAuthed={onAuthed} go={go} />
        </div>
      </div>
    );
  }
  // centered
  return (
    <div className="screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--s-6)', gap: 'var(--s-6)', position: 'relative' }}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => go && go('landing')} style={{ position: 'absolute', top: 'var(--s-5)', left: 'var(--s-5)' }}><Icon name="arrow-left" size={15} /> Back</button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => go && go('landing')}>
        <Wordmark height={34} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-400)' }}>
          {trustLine()}
        </div>
      </div>
      <div className="card card--raised card--pad" style={{ width: '100%', maxWidth: 440, padding: 'var(--s-6)' }}>
        <AuthCard onAuthed={onAuthed} go={go} />
      </div>
    </div>
  );
}

Object.assign(window, { Login, useCountTo, BrandDemo });
