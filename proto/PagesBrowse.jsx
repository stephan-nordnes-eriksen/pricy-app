// ===========================================================
// Pricy.no — Browse departments (signed in) — "Departments II"
// Shopper-facing departments over the GS1 GPC standard (GpcData.jsx):
// each department is an editorial set of GPC bricks, served from the
// server in production. Card grid; the open card expands a full-width
// panel below its own row (grid-auto-flow: dense backfills the row).
// ===========================================================

// results scope for a department rule: the brick, plus the shopper-facing
// label + count when the rule slices the brick by an attribute
const navOfRule = (r) => ({ brick: r.b, ...(r.label ? { label: r.label } : {}), ...(r.n != null ? { count: r.n } : {}) });

function DeptCard({ d, open, onClick, go }) {
  return (
    <div className={'dcard' + (open ? ' is-x' : '')} onClick={onClick}>
      <div className="dcard__top">
        <span className="dcard__ic"><Icon name={d.icon} size={18} /></span>
        <div>
          <h3>{d.name}</h3>
          <div className="dcard__n">{fmt(d.n)} products · {d.rules.length} sub-categories</div>
        </div>
        <span className="dcard__chev"><Icon name="chevron-down" size={16} /></span>
      </div>
      <div className="dcard__chips">
        {d.rules.slice(0, 4).map((r, i) => <a key={i} className="mchip" onClick={(e) => { e.stopPropagation(); go('results', navOfRule(r)); }}>{r.label || brickBy[r.b].name}</a>)}
        {d.rules.length > 4 && <span className="mchip mchip--more">+{d.rules.length - 4}</span>}
      </div>
    </div>
  );
}

function DeptXp({ d, go }) {
  return (
    <div className="dxp">
      <div className="dxp__hd">
        <span className="dcard__ic"><Icon name={d.icon} size={18} /></span>
        <h3>{d.name}</h3>
        <span className="dcard__n">{d.rules.length} sub-categories</span>
        <Btn variant="primary" size="sm" icon="arrow-right" style={{ marginLeft: 'auto' }} onClick={() => go('results', { dept: d.id })}>All {d.name}</Btn>
      </div>
      <div className="subgrid">
        {d.rules.map((r, i) => {
          const bk = brickBy[r.b];
          return (
            <a key={i} className="subtile" onClick={() => go('results', navOfRule(r))}>
              <Icon name={bk.icon} size={16} />
              <span className="subtile__tx">
                <span className="nm">{r.label || bk.name}</span>
                <span className="sub">{r.label ? bk.name : bk.cls.name}</span>
              </span>
              <span className="ct">{fmt(r.n != null ? r.n : bk.n)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function BrowsePage({ go }) {
  const [openId, setOpenId] = useState(null);
  const ALL = window.CATALOG || PRODUCTS;
  const drops = ALL.slice().sort((a, b) => b.drop - a.drop).slice(0, 4);
  const m = metaOf() || {};
  const items = [];
  DEPTS.forEach(d => {
    const open = d.id === openId;
    items.push(<DeptCard key={d.id} d={d} open={open} go={go} onClick={() => setOpenId(open ? null : d.id)} />);
    if (open) items.push(<DeptXp key={d.id + '-xp'} d={d} go={go} />);
  });
  return (
    <div className="screen" data-screen-label="Browse categories">
      <AppHeader go={go} active="browse" onLogout={() => go('landing')} />
      <div className="page browse">
        <div className="browse__head">
          <h1>Browse categories</h1>
          <div className="sub">{fmt(m.products || 0)} products · {fmt(m.shops || 0)} shops · prices updated {relTime(m.freshest)}</div>
        </div>
        <div className="dgrid">{items}</div>
        <div className="sec">
          <div className="sec__head">
            <h2><span className="ico"><Icon name="flame" size={20} /></span>Biggest drops right now</h2>
            <span className="more" onClick={() => go('results', { query: '' })}>All products <Icon name="arrow-right" size={14} /></span>
          </div>
          <div className="pgrid">
            {drops.map(p => <ResultCard key={p.id} p={p} go={go} />)}
          </div>
        </div>
        <div className="sec">
          <div className="sec__head"><h2><span className="ico"><Icon name="search" size={20} /></span>Popular right now</h2></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {POPULAR.concat(['oled tv', 'lego icons', 'kaffekvern', 'gaming headset', 'luftfrityr', 'e-reader']).map(t => (
              <a key={t} className="cchip" onClick={() => go('results', { query: t })}>{t}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BrowsePage, navOfRule });
