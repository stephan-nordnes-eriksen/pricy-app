// ===========================================================
// Pricy.no ADMIN — Overview + Product catalog
// ===========================================================
function AdminOverview({ go }) {
  const A = useAdmin(); const S = A.stats;
  const issues = S.issues || [];
  return (<div className="adm-main" data-screen-label="Admin — Overview">
    <div className="adm-row adm-row--stat">{S.kpi.map(s => <Stat key={s.l} {...s} />)}</div>
    <div className="adm-row adm-row--2">
      <Panel title="Clicks out to shops — 14 days" hint={S.clicksHint}>
        {S.clicks14 && S.clicks14.length > 1 ? <Cols points={S.clicks14} unit="k" x0="8 Aug" x1="Today" /> : <div className="adm-empty">No analytics yet</div>}
      </Panel>
      <Panel title="Needs attention" hint={issues.length + ' open'} flush>
        <div className="ilist">{issues.map((i, n) => (<div key={n} className="ilist__r" onClick={() => go(i.tab)}>
          <span className={'ilist__ic' + (i.k === 'fail' ? ' ilist__ic--fail' : i.k === 'warn' ? ' ilist__ic--warn' : '')}><Icon name={i.ic} size={15} /></span>
          <span className="ilist__t"><b>{i.t}</b><span>{i.d}</span></span>
          <Icon name="chevron-right" size={15} style={{ color: 'var(--ink-400)' }} />
        </div>))}
        {!issues.length && <div className="ilist__r" style={{ color: 'var(--ink-400)', cursor: 'default' }}>Nothing needs attention</div>}</div>
      </Panel>
    </div>
    <div className="adm-row adm-row--2">
      <Panel title="Top searches — 7 days" hint={S.searchesHint}>
        {S.searches && S.searches.length ? <Bars rows={S.searches.map(s => ({ l: s.q + (s.zero ? '  ⌀' : ''), v: s.n, k: s.zero ? 'bad' : null }))} disp={fmt} /> : <div className="adm-empty">No analytics yet</div>}
      </Panel>
      <Panel title="Data health" hint={S.healthHint}>
        <Bars rows={S.health.map(h => ({ l: h.l, v: h.v, k: h.k === 'ok' ? null : h.k }))} max={100} disp={v => v + '%'} />
      </Panel>
    </div>
  </div>);
}

// ---- Products ---------------------------------------------
const P_STATUS = [['all', 'All'], ['live', 'Live'], ['flagged', 'Flagged'], ['dupe', 'Duplicate'], ['draft', 'Draft'], ['hidden', 'Hidden']];
function AdminProducts() {
  const A = useAdmin();
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all'); const [st, setSt] = useState('all'); const [edit, setEdit] = useState(null);
  // server-driven mode: host supplies rows/total/counts; local filtering is bypassed
  const srv = !!window.onAdminProducts;
  const [page, setPage] = useState(0);
  const [sv, setSv] = useState({ rows: [], total: 0, counts: null });
  const seq = useRef(0); const pq = useRef(q);
  const flt = (setter) => v => { setter(v); if (srv) setPage(0); };
  useEffect(() => {
    if (!srv) return;
    const my = ++seq.current;
    const delay = pq.current !== q ? 250 : 0;
    const t = setTimeout(async () => {
      pq.current = q;
      const res = await window.onAdminProducts({ q, cat, status: st, page });
      if (!res || my !== seq.current) return; // superseded
      setSv(s => ({ rows: page > 0 ? s.rows.concat(res.rows) : res.rows, total: res.total, counts: res.counts || null }));
    }, delay);
    return () => clearTimeout(t);
  }, [q, cat, st, page]);
  const cats = Array.from(new Set(A.catalog.map(r => r.cat)));
  const rows = srv ? sv.rows : A.catalog.filter(r => (st === 'all' || r.status === st) && (cat === 'all' || r.cat === cat) && (!q || (r.name + ' ' + r.brand + ' ' + r.gtin).toLowerCase().includes(q.toLowerCase())));
  const n = s => srv ? (sv.counts ? sv.counts[s] : null) : A.catalog.filter(r => s === 'all' || r.status === s).length;
  const sel = edit && (rows.find(r => r.id === edit) || A.catalog.find(r => r.id === edit));
  return (<div className="adm-main" data-screen-label="Admin — Products">
    <div className="adm-bar">
      <div className="field"><Icon name="search" size={16} style={{ color: 'var(--ink-400)', marginLeft: 12 }} /><input placeholder="Search name, brand or GTIN…" value={q} onChange={e => flt(setQ)(e.target.value)} /></div>
      <select className="adm-sel" value={cat} onChange={e => flt(setCat)(e.target.value)}><option value="all">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
      <Seg value={st} options={P_STATUS.map(([v, l]) => ({ v, l, n: n(v) }))} onChange={flt(setSt)} />
      {srv ? <span className="adm-bar__count">{fmt(sv.total)} matching — showing {rows.length}</span>
        : A.stats.totals.products != null && <span className="adm-bar__count">{fmt(A.stats.totals.products)} in catalog — showing {rows.length}</span>}
    </div>
    <Panel flush>
      <table className="atbl">
        <thead><tr><th>Product</th><th>Category</th><th>GTIN</th><th className="num">Offers</th><th className="num">Best price</th><th>Updated</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map(r => (<tr key={r.id} className="is-click" onClick={() => setEdit(r.id)}>
          <td><span className="acell"><span className="acell__ic"><Icon name={r.icon} size={15} /></span><span className="acell__t"><b>{r.name}</b><span>{r.brand}{r.src ? ' · from ' + r.src : ''}</span></span></span></td>
          <td className="mono">{r.cat}</td><td className="mono dim">{r.gtin}</td>
          <td className="num">{r.offers}</td><td className="num">kr {fmt(r.best)}</td>
          <td className="mono dim">{agoM(r.upd)}</td>
          <td><Pill kind={r.status} dot>{r.status}</Pill></td>
          <td><span className="arow-acts"><IBtn icon="pencil" title="Edit" onClick={e => { e.stopPropagation(); setEdit(r.id); }} /></span></td>
        </tr>))}</tbody>
      </table>
      {!rows.length && <div className="adm-empty">No products match this filter</div>}
      {srv && rows.length > 0 && rows.length < sv.total && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Btn size="sm" variant="ghost" icon="chevron-down" onClick={() => setPage(p => p + 1)}>Show more</Btn></div>}
    </Panel>
    {sel && <ProductDrawer key={sel.id} row={sel} onClose={() => setEdit(null)} />}
  </div>);
}

function ProductDrawer({ row, onClose }) {
  const [f, setF] = useState({ name: row.name, brand: row.brand, cat: row.cat, gtin: row.gtin, status: row.status });
  const [specs, setSpecs] = useState(Object.entries(row.specs || {}));
  const p = A_PROD[row.id];
  const offers = row.offerRows || (p && p.offers) || null;
  const up = (k, v) => setF({ ...f, [k]: v });
  const save = () => { const sp = Object.fromEntries(specs.filter(([k]) => k.trim())); admAct('product.save', { row, fields: f, specs: sp }, () => { Object.assign(row, f, { specs: sp }); AdminStore.say('Product saved', 'Product updated', f.name); onClose(); }); };
  const merge = () => { const t = ADMIN.catalog.find(r => r.id === row.dupeOf); admAct('product.merge', { row, into: t || row.dupeOf }, () => { const i = ADMIN.catalog.indexOf(row); if (i > -1) ADMIN.catalog.splice(i, 1); if (t) t.offers += row.offers; AdminStore.say('Merged into ' + (t ? t.name : 'canonical'), 'Products merged', row.name + ' → ' + (t ? t.name : row.dupeOf)); onClose(); }); };
  const publish = () => admAct('product.publish', { row }, () => { row.status = 'live'; row.missing = null; AdminStore.say('Product published', 'Product published', row.name); onClose(); });
  const resolve = () => admAct('product.resolve', { row }, () => { row.status = 'live'; row.issue = null; AdminStore.say('Report resolved', 'Price report resolved', row.name); });
  const dupeOf = row.dupeOf && ADMIN.catalog.find(r => r.id === row.dupeOf);
  const cats = Array.from(new Set(ADMIN.catalog.map(r => r.cat)));
  return (<Drawer title="Edit product" sub={<React.Fragment><span>id: {row.id}</span><span>·</span><span>updated {agoM(row.upd)}</span></React.Fragment>} onClose={onClose}
    foot={<React.Fragment>
      <Btn variant="ghost" size="sm" icon="external-link" href="index.html" target="_blank">View on site</Btn>
      <span style={{ flex: 1 }}></span>
      <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon="check" onClick={save}>Save changes</Btn>
    </React.Fragment>}>
    {row.issue && (<div className="notebox notebox--bad"><Icon name="flag" size={15} /><span><b>Flagged:</b> {row.issue}.<br /><Btn size="sm" variant="ghost" style={{ marginTop: 8 }} onClick={resolve}>Mark resolved</Btn></span></div>)}
    {dupeOf && (<div className="notebox notebox--warn"><Icon name="git-merge" size={15} /><span><b>Likely duplicate</b> of “{dupeOf.name}” (same brand, matching model tokens).<br /><Btn size="sm" variant="dark" icon="git-merge" style={{ marginTop: 8 }} onClick={merge}>Merge into canonical</Btn></span></div>)}
    {row.missing && (<div className="notebox notebox--warn"><Icon name="circle-alert" size={15} /><span><b>Draft from {row.src}.</b> Missing: {row.missing.join(', ')}.<br /><Btn size="sm" variant="dark" icon="check" style={{ marginTop: 8 }} onClick={publish}>Publish anyway</Btn></span></div>)}
    <div className="drw-sec"><h4>Details</h4>
      <div className="fgrid">
        <F label="Product name" wide><input value={f.name} onChange={e => up('name', e.target.value)} /></F>
        <F label="Brand"><input value={f.brand} onChange={e => up('brand', e.target.value)} /></F>
        <F label="Category"><select value={f.cat} onChange={e => up('cat', e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></F>
        <F label="GTIN / EAN" mono><input value={f.gtin} onChange={e => up('gtin', e.target.value)} /></F>
        <F label="Status"><select value={f.status} onChange={e => up('status', e.target.value)}>{['live', 'flagged', 'dupe', 'draft', 'hidden'].map(s => <option key={s}>{s}</option>)}</select></F>
      </div>
    </div>
    <div className="drw-sec"><h4>Specifications</h4>
      {specs.map(([k, v], i) => (<div className="kvrow" key={i}>
        <input value={k} placeholder="Key" onChange={e => setSpecs(specs.map((s, j) => j === i ? [e.target.value, s[1]] : s))} />
        <input value={v} placeholder="Value" onChange={e => setSpecs(specs.map((s, j) => j === i ? [s[0], e.target.value] : s))} />
        <IBtn icon="x" title="Remove" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} />
      </div>))}
      <button className="addrow" onClick={() => setSpecs([...specs, ['', '']])}>+ Add spec row</button>
    </div>
    {offers && offers.length > 0 && (<div className="drw-sec"><h4>Matched offers ({offers.length})</h4>
      <div className="olist">{offers.slice(0, 6).map((o, i) => (<div className="olist__r" key={i}>
        <span className="shop">{o.shop}</span><span className="mono">{o.updated_at ? relTime(o.updated_at) : 'never checked'}</span>
        <span className="sp">kr {fmt(o.price)}</span>
        <IBtn icon="unlink" title="Unlink offer — wrong product match" onClick={() => admAct('offer.unlink', { row, shop: o.shop, price: o.price }, () => { offers.splice(i, 1); row.offers--; AdminStore.say('Offer unlinked', 'Offer unlinked', o.shop + ' → ' + row.name); })} />
      </div>))}</div>
    </div>)}
  </Drawer>);
}
Object.assign(window, { AdminOverview, AdminProducts });
