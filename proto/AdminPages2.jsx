// ===========================================================
// Pricy.no ADMIN — Webstore onboarding + Crawlers
// ===========================================================
const M_NEXT = { applied: 'feed', feed: 'crawl', crawl: 'live' };
const M_ADV = { applied: 'Approve → feed check', feed: 'Start test crawl', crawl: 'Go live' };

function AdminStores({ go }) {
  const A = useAdmin(); const [sel, setSel] = useState(null);
  const m = sel && A.merchants.find(x => x.id === sel);
  return (<div className="adm-main" data-screen-label="Admin — Webstores">
    <div className="adm-bar"><span className="t-small">Onboarding pipeline — applications move left to right. Click a card to review.</span><span className="adm-bar__count">{A.merchants.length} webstores in pipeline{A.stats.totals.webstoresLive != null ? ' · ' + fmt(A.stats.totals.webstoresLive) + ' live total' : ''}</span></div>
    <div className="pipes">{MERCH_STAGES.map(([k, l]) => { const items = A.merchants.filter(x => x.stage === k); return (
      <div key={k} className={'pipe' + (k === 'live' ? ' pipe--live' : '')}>
        <div className="pipe__hd">{l}<span className="n">{items.length}</span></div>
        {items.map(x => (<div key={x.id} className="mcard" onClick={() => setSel(x.id)}>
          <span className="mcard__nm">{x.name}</span><span className="mcard__dm">{x.domain} · {fmt(x.products)} items</span>
          <span className="mcard__ft">
            {k === 'applied' && <Pill>applied {x.applied}</Pill>}
            {k === 'feed' && (x.issues.length ? <Pill kind="warn">{x.issues.length} feed issues</Pill> : <Pill kind="ok" dot>feed valid</Pill>)}
            {k === 'crawl' && (x.crawl.done ? <Pill kind="ok" dot>crawl passed</Pill> : <Pill>crawling · {x.crawl.pct}%</Pill>)}
            {k === 'live' && <Pill kind="live" dot>live {x.liveSince}</Pill>}
            <span>{x.feed}</span>
          </span>
        </div>))}
        {!items.length && <div className="pipe__empty">Empty</div>}
      </div>); })}
    </div>
    {m && <StoreDrawer key={m.id} m={m} go={go} onClose={() => setSel(null)} />}
  </div>);
}

function StoreDrawer({ m, go, onClose }) {
  const adv = () => {
    const nx = M_NEXT[m.stage];
    admAct('merchant.advance', { row: m, to: nx }, () => {
      if (nx === 'crawl') m.crawl = { done: false, pct: 4, items: 0, errs: 0 };
      if (nx === 'live') m.liveSince = 'just now';
      m.stage = nx;
      AdminStore.say(m.name + (nx === 'live' ? ' is now LIVE' : ' moved to ' + nx), 'Merchant ' + (nx === 'live' ? 'set live' : 'advanced to ' + nx), m.domain);
      if (nx === 'live') onClose();
    });
  };
  const reject = () => admAct('merchant.reject', { row: m }, () => { const i = ADMIN.merchants.indexOf(m); if (i > -1) ADMIN.merchants.splice(i, 1); AdminStore.say('Application rejected', 'Merchant application rejected', m.domain); onClose(); });
  const reval = () => admAct('merchant.revalidate', { row: m }, () => AdminStore.say('Feed re-validation queued for ' + m.domain, 'Feed re-validated', m.domain));
  return (<Drawer title={m.name} sub={<React.Fragment><a href={'https://' + m.domain} target="_blank" rel="noopener">{m.domain}</a><span>·</span><span>org {m.org}</span><span>·</span><span>applied {m.applied}</span></React.Fragment>} onClose={onClose}
    foot={<React.Fragment>
      {m.stage !== 'live' && <Btn variant="ghost" size="sm" icon="x" onClick={reject}>Reject</Btn>}
      <span style={{ flex: 1 }}></span>
      {m.stage === 'feed' && <Btn variant="ghost" size="sm" icon="rotate-cw" onClick={reval}>Re-validate</Btn>}
      {m.stage === 'live' ? <Btn variant="dark" size="sm" icon="bot" onClick={() => { onClose(); go('crawlers'); }}>View crawler</Btn>
        : <Btn variant="primary" size="sm" icon={m.stage === 'crawl' ? 'zap' : 'check'} disabled={m.stage === 'crawl' && !m.crawl.done} onClick={adv}>{m.stage === 'crawl' && !m.crawl.done ? 'Crawling… ' + m.crawl.pct + '%' : M_ADV[m.stage]}</Btn>}
    </React.Fragment>}>
    <div className="drw-sec"><h4>Contact</h4>
      <div className="fgrid">
        <F label="Contact person"><input readOnly value={m.contact} /></F>
        <F label="E-mail" mono><input readOnly value={m.email} /></F>
        <F label="Claimed catalog size" mono><input readOnly value={fmt(m.products) + ' products'} /></F>
        <F label="Feed format"><input readOnly value={m.feed} /></F>
        <F label="Feed URL" wide mono><input readOnly value={m.feedUrl} /></F>
      </div>
    </div>
    {m.issues && (<div className="drw-sec"><h4>Feed validation</h4>
      {m.issues.length ? (<div className="notebox notebox--warn"><Icon name="circle-alert" size={15} /><span><b>{m.issues.length} issues found:</b><br />{m.issues.map((i, n) => <span key={n}>— {i}<br /></span>)}Merchant has been e-mailed the report.</span></div>)
        : (<div className="notebox notebox--ok"><Icon name="check" size={15} /><span>Feed parses clean — GTIN coverage 99.2%, availability values valid. Ready for test crawl.</span></div>)}
    </div>)}
    {m.crawl && (<div className="drw-sec"><h4>Test crawl</h4>
      {m.crawl.done ? (<div className="notebox notebox--ok"><Icon name="check" size={15} /><span>Completed in {m.crawl.dur} — {fmt(m.crawl.items)} items imported, {m.crawl.errs} errors. Price spot-check: 50/50 match on merchant site.</span></div>)
        : (<div className="notebox"><Icon name="clock" size={15} /><span>Running — {m.crawl.pct}% · {fmt(m.crawl.items)} items so far · {m.crawl.errs} errors.</span></div>)}
    </div>)}
    {m.stage === 'live' && (<div className="notebox notebox--ok"><Icon name="check" size={15} /><span>Live since {m.liveSince}. {fmt(m.products)} products in catalog, offers refreshing on schedule.</span></div>)}
  </Drawer>);
}

// ---- Crawlers ---------------------------------------------
function AdminCrawlers() {
  const A = useAdmin(); const [sel, setSel] = useState(null);
  const c = sel && A.crawlers.find(x => x.id === sel);
  const n = s => A.crawlers.filter(x => x.status === s).length;
  const run = (x, e) => { if (e) e.stopPropagation(); admAct('crawler.run', { row: x }, () => { x.last = 0; AdminStore.say('Run queued — ' + x.shop, 'Crawler run queued', x.shop); }); };
  const toggle = (x, e) => { if (e) e.stopPropagation(); const paused = x.status !== 'paused'; admAct('crawler.toggle', { row: x, paused }, () => { x.status = paused ? 'paused' : 'ok'; AdminStore.say(x.shop + (paused ? ' paused' : ' resumed'), 'Crawler ' + x.status, x.shop); }); };
  return (<div className="adm-main" data-screen-label="Admin — Crawlers">
    <div className="adm-row adm-row--stat" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
      <Stat l="Sources" v={A.crawlers.length} d="feeds, APIs & crawlers" />
      <Stat l="Healthy" v={n('ok')} d="on schedule" k="ok" />
      <Stat l="Warnings" v={n('warn')} d="degraded parsing" k={n('warn') ? 'bad' : ''} />
      <Stat l="Failing" v={n('fail')} d="needs action now" k={n('fail') ? 'bad' : ''} />
      <Stat l="Paused" v={n('paused')} d="manually stopped" />
    </div>
    <Panel flush>
      <table className="atbl">
        <thead><tr><th>Source</th><th>Type</th><th>Schedule</th><th>Last run</th><th className="num">Items</th><th className="num">Changed</th><th className="num">Errors</th><th>Health · 14 runs</th><th>Status</th><th></th></tr></thead>
        <tbody>{A.crawlers.map(x => (<tr key={x.id} className="is-click" onClick={() => setSel(x.id)}>
          <td><span className="acell"><span className="acell__ic"><Icon name={x.kind === 'crawler' ? 'bot' : x.kind === 'api' ? 'plug' : 'rss'} size={14} /></span><span className="acell__t"><b>{x.shop}</b><span>{x.url.replace('https://', '').slice(0, 34)}</span></span></span></td>
          <td className="mono">{x.kind}</td><td className="mono">{x.sched}</td><td className="mono dim">{agoM(x.last)}</td>
          <td className="num">{fmt(x.items)}</td><td className="num">{fmt(x.changed)}</td>
          <td className="num" style={x.errs ? { color: 'var(--up-600)', fontWeight: 700 } : null}>{fmt(x.errs)}</td>
          <td><Sparkline points={x.ok} w={64} h={16} color={x.status === 'fail' ? 'var(--up-500)' : 'var(--green-700)'} /></td>
          <td><Pill kind={x.status} dot>{x.status}</Pill></td>
          <td><span className="arow-acts">
            <IBtn icon="rotate-cw" title="Run now" disabled={x.status === 'paused'} onClick={e => run(x, e)} />
            <IBtn icon={x.status === 'paused' ? 'play' : 'pause'} title={x.status === 'paused' ? 'Resume' : 'Pause'} onClick={e => toggle(x, e)} />
          </span></td>
        </tr>))}</tbody>
      </table>
    </Panel>
    {c && <CrawlerDrawer key={c.id} c={c} onRun={run} onToggle={toggle} onClose={() => setSel(null)} />}
  </div>);
}

function CrawlerDrawer({ c, onRun, onToggle, onClose }) {
  return (<Drawer title={c.shop + ' — ' + c.kind} sub={<React.Fragment><span>{c.url}</span></React.Fragment>} onClose={onClose}
    foot={<React.Fragment>
      <Btn variant="ghost" size="sm" icon={c.status === 'paused' ? 'play' : 'pause'} onClick={() => onToggle(c)}>{c.status === 'paused' ? 'Resume' : 'Pause'}</Btn>
      <span style={{ flex: 1 }}></span>
      <Btn variant="primary" size="sm" icon="rotate-cw" disabled={c.status === 'paused'} onClick={() => onRun(c)}>Run now</Btn>
    </React.Fragment>}>
    {c.note && (<div className={'notebox ' + (c.status === 'fail' ? 'notebox--bad' : 'notebox--warn')}><Icon name={c.status === 'fail' ? 'circle-alert' : 'triangle-alert'} size={15} /><span>{c.note}</span></div>)}
    <div className="drw-sec"><h4>Configuration</h4>
      <div className="fgrid">
        <F label="Type"><input readOnly value={c.kind} /></F>
        <F label="Schedule"><select defaultValue={c.sched} onChange={e => { const sched = e.target.value; admAct('crawler.schedule', { row: c, sched }, () => { c.sched = sched; AdminStore.say('Schedule set to ' + sched, 'Crawler schedule changed', c.shop); }); }}>{['15 min', '1 h', '6 h', '24 h'].map(s => <option key={s}>{s}</option>)}</select></F>
        <F label="Endpoint" wide mono><input readOnly value={c.url} /></F>
      </div>
    </div>
    <div className="drw-sec"><h4>Last run</h4>
      <div className="fgrid">
        <F label="Items" mono><input readOnly value={fmt(c.items)} /></F>
        <F label="Changed" mono><input readOnly value={fmt(c.changed)} /></F>
        <F label="Errors" mono><input readOnly value={fmt(c.errs)} /></F>
        <F label="Duration" mono><input readOnly value={c.dur} /></F>
      </div>
    </div>
    <div className="drw-sec"><h4>Run log</h4>
      <div className="log">{c.log.map((l, i) => (<div key={i}><span className="t">[{l[0]}]</span> <span className={l[2] === 'e' ? 'e' : ''}>{l[1]}</span></div>))}</div>
    </div>
  </Drawer>);
}
Object.assign(window, { AdminStores, AdminCrawlers });
