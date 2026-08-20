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
  // compat facets must MATCH: same brick ≠ same system (lens mounts etc.)
  const defs = (main && window.brickToCat && window.FACETS && FACETS[brickToCat(main.nav.brick)]) || [];
  const need = defs.filter(d => d.compat && p.facets && p.facets[d.key] != null);
  const compatOk = x => need.every(d => x.facets && x.facets[d.key] === p.facets[d.key]);
  let pool = dedup((main && window.brickProducts) ? brickProducts(main.nav.brick) : []).filter(sameKind).filter(compatOk);
  if (!pool.length) pool = dedup((window.CAT_OF && CAT_OF[p.cat]) || []).filter(sameKind).filter(compatOk);
  const stock = x => (x.stock !== false ? 1 : 0);
  // cheaper: best-liked option below the current price (in stock first)
  const cheaper = pool.filter(x => x.best < ref)
    .sort((a, b) => (stock(b) - stock(a)) || (simScore(b) - simScore(a)) || (b.best - a.best))[0] || null;
  // step up: at least as well liked, priced above — smallest jump among the best liked
  const up = pool.filter(x => x.best > ref && simScore(x) >= simScore(p))
    .sort((a, b) => (stock(b) - stock(a)) || (simScore(b) - simScore(a)) || (a.best - b.best))[0] || null;
  // nav = the full compatible-alternatives search this section is a preview of
  const nav = main ? {
    ...main.nav,
    ...(need.length ? { facets: Object.fromEntries(need.map(d => [d.key, [p.facets[d.key]]])) } : {}),
  } : null;
  return (cheaper || up) ? { cheaper, up, ref, nav } : null;
}

// Trust score on the Folkedommen 0–1 scale: live products carry p.dom
// (read via domScore, which also folds in real reviews); demo data may
// only have a 0–5 rating — normalize that as the fallback.
function simScore(x) {
  const s = window.domScore ? domScore(x) : undefined;
  return s != null ? s : (x.rating || 0) / 5;
}
// same tier cuts as the Folkedommen sort/filter (verdictWord)
const simTier = s => s >= .85 ? 3 : s >= .6 ? 2 : s >= .4 ? 1 : 0;

function simWhy(x, p, role) {
  const xs = simScore(x), ps = simScore(p);
  if (role === 'cheap') {
    if (xs > ps) return 'Better liked by owners — for less';
    if (simTier(xs) >= simTier(ps)) return 'Nearly as well liked';
    return 'The budget pick in this category';
  }
  return xs > ps ? 'Better liked by owners' : 'Liked just as well';
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
      <div className="sec__head"><h2>Similar products</h2>
        {sim.nav
          ? <a className="simsec__note simsec__note--link" onClick={() => go('results', sim.nav)}>Same category · picked on price and folkedom · Se alle <Icon name="chevron-right" size={12} /></a>
          : <span className="simsec__note">Same category · picked on price and folkedom</span>}
      </div>
      <div className="simsec__grid">
        {sim.cheaper && <SimilarCard x={sim.cheaper} p={p} role="cheap" refPrice={sim.ref} go={go} />}
        {sim.up && <SimilarCard x={sim.up} p={p} role="up" refPrice={sim.ref} go={go} />}
      </div>
    </div>
  );
}

Object.assign(window, { pickSimilar, SimilarSection });
