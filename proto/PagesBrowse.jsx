// ===========================================================
// Pricy.no — Categories browse page (signed in)
// ===========================================================

function BrowsePage({ go }) {
  const ALL = window.CATALOG || PRODUCTS;
  const topOf = (c) => ALL.filter(p => p.cat === c).sort((a, b) => b.drop - a.drop)[0];
  const drops = ALL.slice().sort((a, b) => b.drop - a.drop).slice(0, 4);
  const m = metaOf() || {};
  return (
    <div className="screen" data-screen-label="Browse categories">
      <AppHeader go={go} active="browse" onLogout={() => go('landing')} />
      <div className="page browse">
        <div className="browse__head">
          <h1>Browse categories</h1>
          <div className="sub">{fmt(m.products || 0)} products · {fmt(m.shops || 0)} shops · prices updated {relTime(m.freshest)}</div>
        </div>

        <div className="bigcats">
          {realCats().map(c => {
            const top = topOf(c);
            return (
              <div key={c} className="bigcat" onClick={() => go('results', { cat: c })}>
                <div className="bigcat__ic"><Icon name={CAT_ICONS[c] || 'tag'} size={20} /></div>
                <h3>{c}</h3>
                <div className="bigcat__count">{catCount(c)} products</div>
                <div className="bigcat__drop">
                  {top
                    ? <React.Fragment><Delta pct={-top.drop}></Delta><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.name}</span></React.Fragment>
                    : <span style={{ color: 'var(--ink-400)' }}>No drops</span>}
                </div>
              </div>
            );
          })}
        </div>

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

Object.assign(window, { BrowsePage });
