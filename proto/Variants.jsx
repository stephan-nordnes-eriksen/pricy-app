// ===========================================================
// Pricy.no — Product variations (color / storage / size)
// Data + derived listings + picker UI. Loads before Results.jsx
// (which attaches VARIANT_DEFS to CATALOG entries and exposes
// genOffers/genHist used here at render time).
// ===========================================================

const VARIANT_DEFS = {
  iphone: { axes: [
    { id: 'storage', label: 'Storage', hint: '128–512 GB', options: [
      { id: '128', label: '128 GB', delta: 0 }, { id: '256', label: '256 GB', delta: 1000 }, { id: '512', label: '512 GB', delta: 3000 }] },
    { id: 'color', label: 'Colour', type: 'swatch', options: [
      { id: 'black', label: 'Black', swatch: '#35393b' }, { id: 'blue', label: 'Blue', swatch: '#a7b8c4' }, { id: 'pink', label: 'Pink', swatch: '#e8c8cd' }, { id: 'green', label: 'Green', swatch: '#cfd9c9' }, { id: 'yellow', label: 'Yellow', swatch: '#ece2b4' }] },
  ] },
  s24: { axes: [
    { id: 'storage', label: 'Storage', hint: '128–512 GB', options: [
      { id: '128', label: '128 GB', delta: 0 }, { id: '256', label: '256 GB', delta: 800 }, { id: '512', label: '512 GB', delta: 1800 }] },
    { id: 'color', label: 'Colour', type: 'swatch', options: [
      { id: 'onyx', label: 'Onyx Black', swatch: '#2b2b2e' }, { id: 'marble', label: 'Marble Grey', swatch: '#c8c6c1' }, { id: 'violet', label: 'Cobalt Violet', swatch: '#8f8db8' }, { id: 'amber', label: 'Amber Yellow', swatch: '#dcc389' }] },
  ] },
  pixel8: { axes: [
    { id: 'storage', label: 'Storage', hint: '128–256 GB', options: [
      { id: '128', label: '128 GB', delta: 0 }, { id: '256', label: '256 GB', delta: 700 }] },
    { id: 'color', label: 'Colour', type: 'swatch', options: [
      { id: 'obsidian', label: 'Obsidian', swatch: '#2e3134' }, { id: 'hazel', label: 'Hazel', swatch: '#9aa58f' }, { id: 'rose', label: 'Rose', swatch: '#e5c9c4' }] },
  ] },
  xm5: { axes: [
    { id: 'color', label: 'Colour', type: 'swatch', options: [
      { id: 'black', label: 'Black', swatch: '#232323' }, { id: 'silver', label: 'Silver', swatch: '#cfcac2' }, { id: 'blue', label: 'Midnight Blue', swatch: '#2e3a52', delta: 200 }] },
  ] },
  mba: { axes: [
    { id: 'storage', label: 'Storage', hint: '256–512 GB', options: [
      { id: '256', label: '256 GB', delta: 0 }, { id: '512', label: '512 GB', delta: 2000 }] },
    { id: 'color', label: 'Colour', type: 'swatch', options: [
      { id: 'midnight', label: 'Midnight', swatch: '#2e3642' }, { id: 'starlight', label: 'Starlight', swatch: '#e8e0d2' }, { id: 'silver', label: 'Silver', swatch: '#d6d8da' }, { id: 'grey', label: 'Space Grey', swatch: '#7d7e80' }] },
  ] },
  steamdeck: { axes: [
    { id: 'storage', label: 'Storage', hint: '512 GB–1 TB', options: [
      { id: '512', label: '512 GB', delta: 0 }, { id: '1tb', label: '1 TB', delta: 1500 }] },
  ] },
};

function _vhash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return h; }
function variantOpts(p, sel) { return p.variants.axes.map(ax => ax.options.find(o => o.id === sel[ax.id]) || ax.options[0]); }
function defaultSel(p) { const s = {}; if (p.variants) p.variants.axes.forEach(ax => { s[ax.id] = ax.options[0].id; }); return s; }
function variantLabel(p, sel) { return p.variants ? variantOpts(p, sel).map(o => o.label).join(' · ') : ''; }

// price-only lookup for a combo (no offer/history generation)
function variantBest(p, sel) {
  if (!p.variants) return p.best;
  const opts = variantOpts(p, sel);
  if (opts.every((o, i) => o.id === p.variants.axes[i].options[0].id)) return p.best;
  const delta = opts.reduce((n, o) => n + (o.delta || 0), 0);
  const h = _vhash(p.id + ':' + opts.map(o => o.id).join('-'));
  return p.best + delta + (h % 5) * 30; // small per-combo market variance
}
// cheapest option on one axis, holding the other selections
function cheapestOn(p, sel, axisId) {
  const ax = p.variants.axes.find(a => a.id === axisId);
  let id = ax.options[0].id, price = Infinity;
  ax.options.forEach(o => { const b = variantBest(p, { ...sel, [axisId]: o.id }); if (b < price) { price = b; id = o.id; } });
  return { id, price };
}
// cheapest combination across all axes
function cheapestCombo(p) {
  let combos = [{}];
  p.variants.axes.forEach(ax => { combos = combos.flatMap(c => ax.options.map(o => ({ ...c, [ax.id]: o.id }))); });
  let sel = combos[0], price = Infinity;
  combos.forEach(c => { const b = variantBest(p, c); if (b < price) { price = b; sel = c; } });
  return { sel, price };
}

// derived listing for a selected combination — same product id,
// variant-specific price/offers/history (deterministic per combo)
function variantListing(p, sel) {
  if (!p.variants) return p;
  const opts = variantOpts(p, sel);
  const vlabel = opts.map(o => o.label).join(' · ');
  const key = opts.map(o => o.id).join('-');
  if (p.listings && p.listings[key]) return { ...p.listings[key], vlabel };
  if (opts.every((o, i) => o.id === p.variants.axes[i].options[0].id)) return { ...p, vlabel }; // default combo = base listing
  const delta = opts.reduce((n, o) => n + (o.delta || 0), 0);
  const h = _vhash(p.id + ':' + opts.map(o => o.id).join('-'));
  const best = variantBest(p, sel), was = p.was + delta;
  const v = { ...p, vlabel, best, was, drop: Math.round(((was - best) / was) * 100), shops: Math.max(3, p.shops - (h % 4)), idn: (p.idn || _vhash(p.id)) + h };
  v.offers = window.genOffers(v);
  v.history = window.genHist(v.idn, best);
  return v;
}

// ---- picker (PDP) -----------------------------------------
function VariantPicker({ p, sel, onSel, onSelAll }) {
  if (!p.variants) return null;
  const curBest = variantBest(p, sel);
  const cc = cheapestCombo(p);
  return (
    <div className="vpick">
      {p.variants.axes.map(ax => {
        const cur = ax.options.find(o => o.id === sel[ax.id]) || ax.options[0];
        const cheap = cheapestOn(p, sel, ax.id);
        const save = curBest - cheap.price;
        return (
          <div key={ax.id}>
            <div className="vpick__lbl">
              <span>{ax.label} — <b>{cur.label}</b>{cur.delta > 0 && <span className="vpick__d">+kr {fmt(cur.delta)}</span>}</span>
              {save > 0 && <button type="button" className="vpick__cheap" title={'Switch to ' + (ax.options.find(o => o.id === cheap.id) || {}).label + ' — kr ' + fmt(cheap.price)} onClick={() => onSel(ax.id, cheap.id)}>▼ Cheapest · save kr {fmt(save)}</button>}
            </div>
            <div className="vpick__opts">
              {ax.options.map(o => ax.type === 'swatch'
                ? <button key={o.id} type="button" className={'vswatch' + (cur.id === o.id ? ' is-on' : '')} style={{ background: o.swatch }} title={o.label + (o.delta > 0 ? ' (+kr ' + fmt(o.delta) + ')' : '')} aria-label={o.label} onClick={() => onSel(ax.id, o.id)}></button>
                : <button key={o.id} type="button" className={'vopt' + (cur.id === o.id ? ' is-on' : '')} onClick={() => onSel(ax.id, o.id)}>{o.label}{o.delta > 0 && <span className="vopt__d">+{fmt(o.delta)}</span>}</button>)}
            </div>
          </div>
        );
      })}
      <div className="vpick__foot">
        {curBest > cc.price
          ? <button type="button" className="vpick__combo" title={variantLabel(p, cc.sel)} onClick={() => onSelAll && onSelAll(cc.sel)}>▼ Cheapest combination · kr {fmt(cc.price)}</button>
          : <span className="vpick__done">✓ Cheapest combination</span>}
      </div>
    </div>
  );
}

// ---- compact hint (result rows / cards) -------------------
function VariantHint({ p }) {
  if (!p.variants) return null;
  const sw = p.variants.axes.find(a => a.type === 'swatch');
  const hints = p.variants.axes.filter(a => a.hint).map(a => a.hint);
  return (
    <span className="vhint" title="Available in multiple variants">
      {sw && <span className="vhint__sw">{sw.options.slice(0, 4).map(o => <i key={o.id} style={{ background: o.swatch }}></i>)}</span>}
      {hints.length > 0 && <span className="vhint__t">{hints.join(' · ')}</span>}
    </span>
  );
}

Object.assign(window, { VARIANT_DEFS, defaultSel, variantLabel, variantListing, variantBest, cheapestOn, cheapestCombo, VariantPicker, VariantHint });
