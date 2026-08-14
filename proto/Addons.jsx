// ===========================================================
// Addons.jsx — "What about these?" add-on sales for Buy now
// Suggestion source is swappable: production sets
//   window.addonSuggestApi(p, shop) → Promise<[{p, offer}]>
//   or Promise<{items: [{p, offer}], label}> to override the
//   header label (bare array keeps the default label).
// (async — may ping external recommendation services).
// Default: biggest price drops sold by the same shop.
// ===========================================================

function defaultAddonSuggest(p, shop) {
  return new Promise(res => setTimeout(() => {
    const pool = window.CATALOG || PRODUCTS;
    const seen = { [p.id]: true }, out = [];
    for (const c of pool) {
      if (seen[c.id]) continue; seen[c.id] = true;
      const o = (c.offers || []).find(o => o.shop === shop && o.stock !== false);
      if (o) out.push({ p: c, offer: o });
    }
    out.sort((a, b) => (b.p.drop || 0) - (a.p.drop || 0));
    res(out.slice(0, 3));
  }, 900));
}

// Renders nothing if no suggestions come back (or the call fails).
function AddonSuggest({ p, shop, added, onToggle, disabled }) {
  const [sugs, setSugs] = useState(null); // null = waiting for response
  const [label, setLabel] = useState(null); // null = default label
  useEffect(() => {
    let live = true;
    setSugs(null); setLabel(null);
    const call = window.addonSuggestApi || defaultAddonSuggest;
    Promise.resolve(call(p, shop))
      .then(s => {
        if (!live) return;
        if (s && !Array.isArray(s) && Array.isArray(s.items)) { setSugs(s.items); setLabel(s.label || null); }
        else setSugs(s || []);
      })
      .catch(() => { if (live) setSugs([]); });
    return () => { live = false; };
  }, [p.id, shop]);
  if (sugs && !sugs.length) return null;
  return (
    <div className="addon">
      <div className="addon__head"><Icon name="sparkles" size={13} /> What about these? <span>{label || 'biggest drops at ' + shop}</span></div>
      <div className="addon__rows">
        {sugs === null
          ? [0, 1, 2].map(i => <div key={i} className="addon__row addon__row--skel"><span className="skl skl--img"></span><span className="skl skl--txt"></span><span className="skl skl--num"></span></div>)
          : sugs.map(s => {
              const on = added.some(x => x.p.id === s.p.id);
              return (
                <button type="button" key={s.p.id} className={'addon__row' + (on ? ' is-on' : '')} disabled={disabled} onClick={() => onToggle(s)} aria-pressed={on}>
                  <span className="addon__img"><ProdImg p={s.p} fill size={18} /></span>
                  <span className="addon__txt"><b>{s.p.name}</b><span className="addon__meta">▼ −{s.p.drop}%{s.p.was ? ' · was kr ' + fmt(s.p.was) : ''}</span></span>
                  <span className="addon__price">kr {fmt(s.offer.price)}</span>
                  <span className="addon__tick"><Icon name={on ? 'check' : 'plus'} size={14} /></span>
                </button>
              );
            })}
      </div>
    </div>
  );
}

Object.assign(window, { AddonSuggest, defaultAddonSuggest });
