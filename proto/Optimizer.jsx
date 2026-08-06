// ===========================================================
// Pricy.no — Basket optimizer (Shoptimera answer, gap G10)
// optimize(items) → { cheapest, fewest, baseline, parked }
// Plan = { groups:[{shop, items:[{id,price,p}], ship, subtotal}], total, shops }
// Shipping charged ONCE per shop (max shipCost among the group's offers).
// ===========================================================

// only confirmed-in-stock offers are buyable in a plan (unknown ≠ on lager)
function optAvail(p) { return (p.offers || []).filter(o => o.stock === true); }

const shipFor = (shop, sum, fallback) => {
  const r = window.SHIPPING && window.SHIPPING[shop];
  return r ? (r.freeOver && sum >= r.freeOver ? 0 : r.flat) : fallback;
};

function optToPlan(as) { // as: [{p, o}]
  const by = {};
  as.forEach(a => { (by[a.o.shop] = by[a.o.shop] || []).push(a); });
  const groups = Object.keys(by).map(shop => {
    const its = by[shop];
    const sum = its.reduce((s, a) => s + a.o.price, 0);
    const ship = shipFor(shop, sum, Math.max(...its.map(a => a.o.shipCost || 0)));
    const items = its.map(a => ({ id: a.p.id, price: a.o.price, p: a.p, url: a.o.url }));
    return { shop, items, ship, subtotal: items.reduce((s, i) => s + i.price, 0) + ship };
  }).sort((a, b) => b.items.length - a.items.length || b.subtotal - a.subtotal);
  return { groups, total: groups.reduce((s, g) => s + g.subtotal, 0), shops: groups.length };
}

function optimize(prods) {
  const items = prods.filter(p => optAvail(p).length);
  const parked = prods.filter(p => !optAvail(p).length);
  const offerAt = (p, shop) => optAvail(p).find(o => o.shop === shop);
  const totalOf = (as) => {
    const sums = {}, maxes = {}; let t = 0;
    as.forEach(a => { t += a.o.price; sums[a.o.shop] = (sums[a.o.shop] || 0) + a.o.price; maxes[a.o.shop] = Math.max(maxes[a.o.shop] || 0, a.o.shipCost || 0); });
    return t + Object.keys(sums).reduce((s, shop) => s + shipFor(shop, sums[shop], maxes[shop]), 0);
  };
  if (!items.length) { const e = optToPlan([]); return { cheapest: e, fewest: e, baseline: null, parked }; }
  // -- cheapest total: per-item min price, then greedy moves while total drops
  const as = items.map(p => ({ p, o: optAvail(p).reduce((m, o) => o.price < m.price ? o : m) }));
  let best = totalOf(as);
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let i = 0; i < as.length; i++) {
      for (const o of optAvail(as[i].p)) {
        if (o === as[i].o) continue;
        const old = as[i].o; as[i].o = o;
        const t = totalOf(as);
        if (t < best) { best = t; improved = true; } else as[i].o = old;
      }
    }
    if (!improved) break;
  }
  let cheapest = optToPlan(as);
  // -- fewest shops: greedy set-cover, tie-break on covered price sum
  let remaining = [...items]; const fas = [];
  while (remaining.length) {
    let bShop = null, bCover = null, bSum = 0;
    SHOPS.forEach(shop => {
      const cover = remaining.filter(p => offerAt(p, shop));
      if (!cover.length) return;
      const sum = cover.reduce((s, p) => s + offerAt(p, shop).price, 0);
      if (!bShop || cover.length > bCover.length || (cover.length === bCover.length && sum < bSum)) { bShop = shop; bCover = cover; bSum = sum; }
    });
    if (!bShop) break;
    bCover.forEach(p => fas.push({ p, o: offerAt(p, bShop) }));
    remaining = remaining.filter(p => !bCover.includes(p));
  }
  let fewest = optToPlan(fas);
  // -- baseline: best single shop stocking the whole basket
  let baseline = null;
  SHOPS.forEach(shop => {
    if (!items.every(p => offerAt(p, shop))) return;
    const plan = optToPlan(items.map(p => ({ p, o: offerAt(p, shop) })));
    if (!baseline || plan.total < baseline.total) baseline = plan;
  });
  // heuristic guards: baseline is a 1-shop plan, so it bounds both strategies
  if (baseline && baseline.total < fewest.total) fewest = baseline;
  if (fewest.total < cheapest.total) cheapest = fewest;
  if (fewest.shops > cheapest.shops) fewest = cheapest;
  return { cheapest, fewest, baseline, parked };
}

const optShopUrl = (g) => (g.items.find(i => i.url) || {}).url || 'https://www.' + g.shop.toLowerCase().replace(/[^a-z0-9]/g, '') + '.no';

// --- Auto-buy handoff: confirm the whole shop basket ----------
function OptimizerBuyModal({ group, onClose }) {
  const store = useAutobuyStore();
  const [phase, setPhase] = useState(store.signed ? 'confirm' : 'sign');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState(null);
  const buy = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => { setOrders(group.items.map(i => AutobuyStore.buyNow(i.id, group.shop, i.price))); setPhase('done'); setBusy(false); }, 1100);
  };
  return (
    <div className="overlay" onClick={onClose}>
      {phase === 'sign' ? (
        <div className="modal fm-modal" onClick={e => e.stopPropagation()}>
          <div className="modal__head"><b>Auto-kjøp — requires BankID fullmakt</b><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
          <div className="fm-modal__body"><FullmaktCeremony onSigned={() => setPhase('confirm')}></FullmaktCeremony></div>
        </div>
      ) : (
        <div className="modal buy-modal pop-in" onClick={e => e.stopPropagation()}>
          <div className="buy-modal__flag"><Icon name={phase === 'done' ? 'check' : 'zap'} size={15} /> {phase === 'done' ? 'Ordre lagt inn' : 'Auto-kjøp kurven'}</div>
          <div className="buy-modal__prod">
            <div style={{ minWidth: 0 }}>
              <b>{group.shop}</b>
              <div className="meta">{group.items.length} varer · én levering · {group.ship ? 'frakt kr ' + fmt(group.ship) : 'fri frakt'}</div>
            </div>
          </div>
          <div className="opt-buylist">
            {group.items.map(i => (
              <div className="opt-buylist__row" key={i.id}>
                <div className="opt-row__img"><ProdImg p={i.p} fill size={18} /></div>
                <span className="nm">{i.p.name}</span>
                <span className="pr">kr {fmt(i.price)}</span>
              </div>
            ))}
            <div className="opt-buylist__row is-ship"><span className="nm">{group.ship ? 'Frakt' : 'Fri frakt'}</span><span className="pr">kr {fmt(group.ship)}</span></div>
            <div className="opt-buylist__row is-sum"><span className="nm">Totalt</span><span className="pr">kr {fmt(group.subtotal)}</span></div>
          </div>
          {phase === 'done' ? (
            <React.Fragment>
              <div className="buy-modal__rows">
                <div><Icon name="wallet" size={14} /> Charged to {store.payment === 'vipps' ? 'Vipps ••481' : 'Visa ••4521'}</div>
                <div><Icon name="undo-2" size={14} /> 14-day angrerett — one-click return</div>
                <div><Icon name="mail" size={14} /> Receipt sent to {USER.email} · ref {orders[0].exec.ref}</div>
              </div>
              <Btn variant="primary" icon="check" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Done</Btn>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="buy-modal__rows">
                <div><Icon name="wallet" size={14} /> {store.payment === 'vipps' ? 'Vipps ••481' : 'Visa ••4521'} — charged on purchase</div>
                <div><Icon name="file-check-2" size={14} /> Covered by your fullmakt · no fees, no markup</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
                <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
                <Btn variant="dark" icon="zap" onClick={buy} style={{ flex: 2, justifyContent: 'center' }}>{busy ? 'Placing orders…' : 'Kjøp for kr ' + fmt(group.subtotal)}</Btn>
              </div>
            </React.Fragment>
          )}
        </div>
      )}
    </div>
  );
}

// --- Page ------------------------------------------------------
function OptimizerPage({ go, list: listId0 }) {
  useWatchStore();
  const hasLists = !!window.ListStore;
  if (hasLists) useListStore();
  const [listId, setListId] = useState(listId0 || 'watch');
  const list = hasLists
    ? (ListStore.get(listId) || ListStore.watchList())
    : { id: 'watch', name: 'Overvåket', items: WatchStore.items.map(w => w.id) };
  const prods = list.items.map(id => WatchStore.prod(id)).filter(Boolean);
  const { cheapest, fewest, baseline, parked } = useMemo(() => optimize(prods), [list.id, list.items.join(',')]);
  const [strat, setStrat] = useState('cheapest');
  const [buyGroup, setBuyGroup] = useState(null);
  const plan = strat === 'cheapest' ? cheapest : fewest;
  const save = baseline ? baseline.total - plan.total : 0;
  return (
    <div className="screen" data-screen-label="Basket optimizer">
      <AppHeader go={go} active="lists" onLogout={() => go('landing')} />
      <div className="page opt">
        <div className="al__head">
          <div>
            <h1>Optimaliser kjøpet</h1>
            <div className="sub">{list.items.length} varer · frakt telles én gang per butikk</div>
          </div>
          {hasLists && (
            <label className="opt-pick">
              <span className="t-label">Liste</span>
              <select value={list.id} onChange={e => setListId(e.target.value)}>
                {ListStore.all().map(l => <option key={l.id} value={l.id}>{l.name} ({l.items.length})</option>)}
              </select>
            </label>
          )}
        </div>
        {!plan.groups.length && !parked.length ? (
          <div className="empty">
            <div className="empty__ic"><Icon name="shopping-basket" size={40} /></div>
            <h2>Ingen varer å optimalisere</h2>
            <p>Legg produkter i en liste eller overvåk dem, så finner vi den billigste kombinasjonen av butikker.</p>
            <Btn variant="primary" icon="search" onClick={() => go('browse')}>Browse categories</Btn>
          </div>
        ) : (
          <React.Fragment>
            <div className="opt-verdict">
              <div className="opt-verdict__ic"><Icon name="shopping-basket" size={26} /></div>
              <div>
                <h2>Kjøp alt fra {plan.shops} {plan.shops === 1 ? 'butikk' : 'butikker'} — <span className="t-price-lg">kr {fmt(plan.total)}</span> totalt.</h2>
                {baseline && save > 0
                  ? <p>Du sparer <b>kr {fmt(save)}</b> mot å handle alt hos {baseline.groups[0].shop}.</p>
                  : baseline
                    ? <p>Like billig som å handle alt hos {baseline.groups[0].shop} — men sjekk leveringstidene.</p>
                    : <p>Ingen enkeltbutikk har alt på lager — dette er den billigste kombinasjonen.</p>}
              </div>
            </div>
            <div className="seg opt-seg" role="tablist">
              <button className={strat === 'cheapest' ? 'is-on' : ''} onClick={() => setStrat('cheapest')}>Billigst totalt <span className="tt">kr {fmt(cheapest.total)}</span></button>
              <button className={strat === 'fewest' ? 'is-on' : ''} onClick={() => setStrat('fewest')}>Færrest butikker <span className="tt">kr {fmt(fewest.total)}</span></button>
            </div>
            <div className="opt-groups">
              {plan.groups.map(g => (
                <div className="opt-card" key={g.shop}>
                  <div className="opt-card__head"><b>{g.shop}</b><span className="t-label">{g.items.length} {g.items.length === 1 ? 'vare' : 'varer'}</span></div>
                  {g.items.map(i => (
                    <div className="opt-row" key={i.id} onClick={() => go('product', { id: i.id })}>
                      <div className="opt-row__img"><ProdImg p={i.p} fill size={22} /></div>
                      <span className="nm">{i.p.name}</span>
                      <span className="pr">kr {fmt(i.price)}</span>
                    </div>
                  ))}
                  <div className="opt-row opt-row--ship"><span className="nm">{g.ship ? 'Frakt' : 'Fri frakt'}</span><span className="pr">kr {fmt(g.ship)}</span></div>
                  <div className="opt-card__sum"><span className="t-label">Subtotal</span><span className="pr">kr {fmt(g.subtotal)}</span></div>
                  <div className="opt-card__foot">
                    <Btn icon="external-link" href={optShopUrl(g)} target="_blank" rel="noopener">Gå til butikk</Btn>
                    {!window.HIDE_AUTOBUY && <Btn variant="dark" icon="zap" onClick={() => setBuyGroup(g)}>Auto-kjøp kurven</Btn>}
                  </div>
                </div>
              ))}
            </div>
            {parked.length > 0 && (
              <div className="opt-parked">
                <div className="t-label"><Icon name="package-x" size={14} /> Ikke på lager nå</div>
                {parked.map(p => (
                  <div className="opt-parked__row" key={p.id} onClick={() => go('product', { id: p.id })}>
                    <div className="opt-row__img"><ProdImg p={p} fill size={18} /></div>
                    <span className="nm">{p.name}</span>
                    <span className="meta">Ingen butikk har den på lager — vi varsler når den er tilbake.</span>
                  </div>
                ))}
              </div>
            )}
            <div className="opt-strip">
              {[
                { label: 'Én butikk', total: baseline ? baseline.total : null },
                { label: 'Færrest butikker', total: fewest.total },
                { label: 'Billigst totalt', total: cheapest.total },
              ].map(c => (
                <div key={c.label} className={'opt-strip__col' + (c.total != null && c.total === cheapest.total ? ' is-best' : '')}>
                  <span className="t-label">{c.label}</span>
                  <span className="val">{c.total == null ? '—' : 'kr ' + fmt(c.total)}</span>
                </div>
              ))}
            </div>
          </React.Fragment>
        )}
      </div>
      {buyGroup && <OptimizerBuyModal group={buyGroup} onClose={() => setBuyGroup(null)} />}
    </div>
  );
}

Object.assign(window, { optimize, OptimizerPage });
