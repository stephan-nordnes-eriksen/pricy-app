// ===========================================================
// Pricy.no — Similar-product suggestions (gap G19)
// Prisradar pattern: exactly ONE cheaper and ONE step-up
// alternative from the same GPC brick (legacy cat fallback).
// pickSimilar is called by ProductPage (Results.jsx) so the
// "More in …" grid can exclude the picks; SimilarSection
// renders the two cards. Loads after Compare.jsx.
// ===========================================================

function pickSimilar(p, v, main) {
  const ref = (v && v.best != null) ? v.best : p.best;
  if (ref == null) return null;
  const seen = new Set([p.id]);
  const dedup = arr => arr.filter(x => x.best != null && !seen.has(x.id) && (seen.add(x.id), true));
  // same GPC brick = same product type; legacy cat only as fallback (cat 'Audio'
  // spans headphones/speakers/turntables). Never cross spec kinds.
  const sameKind = x => !window.specKindOf || specKindOf(x) === specKindOf(p);
  let pool = dedup((main && window.brickProducts) ? brickProducts(main.nav.brick) : []).filter(sameKind);
  if (!pool.length) pool = dedup((window.CAT_OF && CAT_OF[p.cat]) || []).filter(sameKind);
  const stock = x => (x.stock !== false ? 1 : 0);
  // cheaper: best-liked option below the current price (in stock first)
  const cheaper = pool.filter(x => x.best < ref)
    .sort((a, b) => (stock(b) - stock(a)) || ((b.rating || 0) - (a.rating || 0)) || (b.best - a.best))[0] || null;
  // step up: at least as well liked, priced above — smallest jump among the best liked
  const up = pool.filter(x => x.best > ref && (x.rating || 0) >= (p.rating || 0))
    .sort((a, b) => (stock(b) - stock(a)) || ((b.rating || 0) - (a.rating || 0)) || (a.best - b.best))[0] || null;
  return (cheaper || up) ? { cheaper, up, ref } : null;
}

function simWhy(x, p, role) {
  const xr = x.rating || 0, pr = p.rating || 0;
  if (role === 'cheap') {
    if (xr > pr) return 'Better liked by owners — for less';
    if (xr >= pr - 0.2) return 'Nearly as well liked';
    return 'The budget pick in this category';
  }
  return xr > pr ? 'Better liked by owners' : 'Liked just as well';
}

function SimilarCard({ x, p, role, refPrice, go }) {
  const d = Math.abs(x.best - refPrice);
  const pct = Math.round((d / refPrice) * 100);
  const cmp = (e) => {
    e.stopPropagation(); e.preventDefault();
    CompareStore.clear(); CompareStore.add(p.id); CompareStore.add(x.id);
    go('compare');
  };
  return (
    <div className="simcard" role="link" tabIndex={0} onClick={() => go('product', { id: x.id })} onKeyDown={e => { if (e.key === 'Enter') go('product', { id: x.id }); }}>
      <div className={'simcard__band simcard__band--' + role}>
        <Icon name={role === 'cheap' ? 'trending-down' : 'arrow-up-right'} size={13} />
        <span>{role === 'cheap' ? 'Cheaper alternative' : 'A step up'}</span>
        <b className="simcard__delta">{role === 'cheap' ? '\u2212 kr ' + fmt(d) + ' (' + pct + '%)' : '+ kr ' + fmt(d)}</b>
      </div>
      <div className="simcard__body">
        <div className="simcard__thumb">{x.img ? <ProdImg p={x} fill style={{ padding: 6, boxSizing: 'border-box' }} /> : <ProdImg p={x} size={30} />}</div>
        <div className="simcard__info">
          <div className="simcard__brand">{x.brand}</div>
          <div className="simcard__name">{x.name}</div>
          {window.Verdict && <div><Verdict p={x} /></div>}
        </div>
        <div className="simcard__price">
          <Price value={x.best} size={18} />
          {x.stock === false ? <StockBadge state="out" /> : <span className="simcard__shops">{x.shops} shops</span>}
        </div>
      </div>
      <div className="simcard__foot">
        <span className="simcard__why">{simWhy(x, p, role)}</span>
        <button type="button" className="simcard__cmp" onClick={cmp}><Icon name="git-compare" size={13} /> Compare these two</button>
      </div>
    </div>
  );
}

function SimilarSection({ p, sim, go }) {
  if (!sim || (!sim.cheaper && !sim.up)) return null;
  return (
    <div className="sec simsec">
      <div className="sec__head"><h2>Similar products</h2><span className="simsec__note">Same category · picked on price and folkedom</span></div>
      <div className="simsec__grid">
        {sim.cheaper && <SimilarCard x={sim.cheaper} p={p} role="cheap" refPrice={sim.ref} go={go} />}
        {sim.up && <SimilarCard x={sim.up} p={p} role="up" refPrice={sim.ref} go={go} />}
      </div>
    </div>
  );
}

Object.assign(window, { pickSimilar, SimilarSection });
