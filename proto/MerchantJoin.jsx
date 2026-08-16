// ===========================================================
// Pricy.no — Merchant self-service onboarding ("Bli med på pricy")
// Landed from outreach email: /bli-med?domene=example.com
// ===========================================================

const MJ_METHODS = [
  { id: 'crawl', icon: 'bot', name: 'Skånsom crawling', desc: 'Vi leser produktsidene fra deres egen sitemap, med tydelig user-agent (PricyBot). Ingenting å sette opp.', note: 'Anbefalt om dere ikke har feed' },
  { id: 'feed', icon: 'rss', name: 'Google Shopping-feed', desc: 'Lim inn URL-en til feeden dere allerede har. Shopify, WooCommerce, Mystore og 24Nettbutikk lager den automatisk.', note: 'Raskest og mest presist' },
  { id: 'adtraction', icon: 'link-2', name: 'Adtraction', desc: 'Er dere på Adtraction? Godkjenn kanalen «pricy.no» i panelet deres, så kobler vi oss på der.', note: 'Ingen endring hos dere' },
];

function MerchantJoin({ go, domain: d0 }) {
  const initial = d0 || new URLSearchParams(window.location.search).get('domene') || 'example.com';
  const [domain, setDomain] = useState(initial);
  const [method, setMethod] = useState(null);
  const [feed, setFeed] = useState('');
  const [email, setEmail] = useState('post@' + initial);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr(null);
    const payload = { domain, method, feed: method === 'feed' ? feed.trim() : undefined, email };
    const v = window.onMerchantJoin ? await window.onMerchantJoin(payload) : true;
    setBusy(false);
    if (v === true) setSent(true); else setErr(v);
  };
  const ready = method && email.includes('@') && (method !== 'feed' || feed.trim().length > 8);

  if (sent) return (
    <div className="mj" data-screen-label="Merchant join — confirmation">
      <MJHeader go={go} />
      <div className="mj__body pop-in">
        <div className="mj-done">
          <div className="mj-done__badge"><Icon name="check" size={28} /></div>
          <h1>Takk! Vi setter i gang.</h1>
          <p>Vi kobler oss på <b className="mj-mono">{domain}</b> via <b>{MJ_METHODS.find(m => m.id === method).name}</b> og sier fra på <b className="mj-mono">{email}</b> når produktene deres er søkbare — normalt innen få dager.</p>
          <div className="mj-done__next">
            <div className="t-label">Hva skjer videre</div>
            <ol>
              <li>Vi henter inn produktene og matcher dem mot katalogen vår.</li>
              <li>Dere får en e-post med lenke til butikksiden deres på pricy.no.</li>
              <li>Ser noe feil ut? Svar på den e-posten, så retter vi det.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mj" data-screen-label="Merchant join">
      <MJHeader go={go} />
      <div className="mj__body">
        <div className="t-label">For nettbutikker · gratis</div>
        <h1>Bli med på <span className="hl">pricy.no</span></h1>
        <p className="mj__sub">Uavhengig norsk prissammenligning. Nøytral rangering — laveste pris først, alltid. Vi tar aldri betalt per klikk.</p>
        <div className="mj-field">
          <label className="t-label" htmlFor="mj-domain">Butikken deres</label>
          <div className="mj-input mj-input--domain">
            <Icon name="globe" size={16} />
            <input id="mj-domain" type="text" value={domain} onChange={e => setDomain(e.target.value)} spellCheck="false" />
          </div>
        </div>
        <div className="mj-field">
          <label className="t-label">Hvordan skal vi hente produktene?</label>
          <div className="mj-methods">
            {MJ_METHODS.map(m => (
              <label key={m.id} className={'mj-method' + (method === m.id ? ' is-on' : '')}>
                <input type="radio" name="mj-method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                <span className="mj-method__radio"></span>
                <span className="mj-method__ic"><Icon name={m.icon} size={20} /></span>
                <span className="mj-method__txt">
                  <b>{m.name}</b>
                  <span>{m.desc}</span>
                  {m.id === 'feed' && method === 'feed' && (
                    <span className="mj-input mj-input--feed" onClick={e => e.preventDefault()}>
                      <Icon name="link" size={14} />
                      <input type="url" placeholder="https://…/google-shopping-feed.xml" value={feed} onChange={e => setFeed(e.target.value)} spellCheck="false" />
                    </span>
                  )}
                </span>
                <span className="mj-method__note">{m.note}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mj-field">
          <label className="t-label" htmlFor="mj-email">Hvor sier vi fra når dere er live?</label>
          <div className="mj-input">
            <Icon name="mail" size={16} />
            <input id="mj-email" type="email" value={email} onChange={e => setEmail(e.target.value)} spellCheck="false" />
          </div>
        </div>
        <div className="mj__cta">
          <Btn variant="primary" size="lg" icon="arrow-right" disabled={!ready || busy} onClick={submit}>{busy ? 'Sender…' : 'Sett i gang'}</Btn>
          {err && <span className="mj__cta-error" role="alert" style={{color:'var(--red, #C4320A)',fontSize:13,fontWeight:600}}>{err}</span>}
          <span className="mj__cta-note">Gratis. Ingen binding — si fra, så fjerner vi dere.</span>
        </div>
      </div>
    </div>
  );
}

function MJHeader({ go }) {
  return (
    <div className="mj__hdr">
      <span onClick={() => go('landing')} style={{ cursor: 'pointer' }}><Wordmark height={24} /></span>
      <a className="mj__hdr-mail" href="mailto:kontakt@pricy.no">Heller e-post? kontakt@pricy.no</a>
    </div>
  );
}

Object.assign(window, { MerchantJoin });
