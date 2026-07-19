// ===========================================================
// Pricy.no — About / How it works (public, logged out)
// ===========================================================

const ABOUT_FAQ = [
  { q: 'How does pricy make money?', a: 'When you click through to a shop and buy, some shops pay us a small referral fee. That fee never affects ranking — the cheapest price is always on top, whether the shop pays us or not.' },
  { q: 'Do I need an account?', a: 'Yes. Searching, comparing and price alerts all require a free account. It takes 30 seconds, and the free plan stays free forever.' },
  { q: 'How fresh are the prices?', a: 'We re-check every shop around the clock — the most popular products most often. Every price shows when it was last verified.' },
  { q: 'What is Pricy Plus?', a: 'Our upcoming subscription — coming soon, planned at kr 49/month (pricing subject to change). It adds AI features: a daily deal digest, price forecasts per product, and plain-language search («best robotstøvsuger under 4 000»). Everything else is free.' },
  { q: 'How do price alerts work?', a: 'Watch any product and set a target price. The moment any of the shops we track goes below your target, you get an email or push notification — usually within minutes.' },
];

function AboutFaq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="faq">
      {ABOUT_FAQ.map((f, i) => (
        <div key={i} className={'faq__item' + (open === i ? ' is-open' : '')}>
          <button className="faq__q" onClick={() => setOpen(open === i ? -1 : i)}>
            {f.q} <Icon name="plus" size={18} />
          </button>
          {open === i && <div className="faq__a">{f.a}</div>}
        </div>
      ))}
    </div>
  );
}

function AboutPage({ go, section }) {
  const stepsRef = React.useRef(null);
  const m = metaOf() || {};
  useEffect(() => { if (section === 'how' && stepsRef.current) window.scrollTo(0, stepsRef.current.offsetTop - 24); }, [section]);
  return (
    <div className="screen" data-screen-label="About / how it works">
      <LandingHeader go={go} />

      <section className="page about-hero">
        <div className="kicker">About pricy.no</div>
        <h1>Every price.<br />Every shop.<br /><span className="hl">No favorites.</span></h1>
        <p>pricy tracks {fmt(m.products || 0)} products across {fmt(m.shops || 0)} Norwegian shops — and no shop can pay to rank higher. The cheapest price wins. Always.</p>
      </section>

      <section className="page" id="how" ref={stepsRef} style={{ paddingBottom: 'var(--s-7)' }}>
        <div className="steps">
          <div className="step">
            <span className="step__n">01</span>
            <div style={{ color: 'var(--green-700)', marginBottom: 12, display: 'flex' }}><Icon name="search" size={26} /></div>
            <h3 style={{ margin: '0 0 8px', fontSize: 19 }}>Search once</h3>
            <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.55 }}>One search covers every shop we track — no more twelve open tabs.</p>
          </div>
          <div className="step">
            <span className="step__n">02</span>
            <div style={{ color: 'var(--green-700)', marginBottom: 12, display: 'flex' }}><Icon name="scale" size={26} /></div>
            <h3 style={{ margin: '0 0 8px', fontSize: 19 }}>Compare honestly</h3>
            <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.55 }}>Price, shipping and stock side by side. Cheapest on top, no exceptions.</p>
          </div>
          <div className="step">
            <span className="step__n">03</span>
            <div style={{ color: 'var(--green-700)', marginBottom: 12, display: 'flex' }}><Icon name="bell-ring" size={26} /></div>
            <h3 style={{ margin: '0 0 8px', fontSize: 19 }}>Get the drop</h3>
            <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.55 }}>Set a target price. We watch around the clock and ping you within minutes.</p>
          </div>
        </div>
      </section>

      <section className="manifesto">
        <div className="page">
          <h2>No shop pays for placement. <span className="hl">Ever.</span></h2>
          <p>Most comparison sites sell their top spots. We don't. Our ranking is a sort function: <b>price, ascending</b>. That's the whole algorithm.</p>
          <p>We earn a small referral fee from some shops when you buy — the fee never changes what you see, and shops that pay nothing rank exactly the same.</p>
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="metric"><div className="metric__k">Shops tracked</div><div className="metric__v">{fmt(m.shops || 0)}</div><div className="metric__sub">and counting</div></div>
          <div className="metric"><div className="metric__k">Products</div><div className="metric__v">{fmt(m.products || 0)}</div><div className="metric__sub">across every shop we track</div></div>
          <div className="metric"><div className="metric__k">Prices updated</div><div className="metric__v">{relTime(m.freshest)}</div><div className="metric__sub">every price timestamped</div></div>
        </div>
      </section>

      <section className="page" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="sec__head"><h2>Questions, answered</h2></div>
        <AboutFaq></AboutFaq>
      </section>

      <section className="lcta">
        <div className="page lcta__inner">
          <h2>Stop overpaying.<br />Start watching.</h2>
          <Btn variant="primary" size="lg" icon="arrow-right" onClick={() => go('login')}>Create free account</Btn>
        </div>
      </section>

      <Footer go={go} authed={false}></Footer>
    </div>
  );
}

Object.assign(window, { AboutPage, AboutFaq });
