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

// combinations no shop stocks right now — greyed out in the picker, and every
// "cheapest" shortcut skips them. Hand-picked so each single option is still
// buyable in some other combination (and the default combo always is).
const VARIANT_OUT = {
  pixel8: ['256-rose'],
  iphone: ['512-yellow', '256-green'],
  s24: ['512-amber'],
  mba: ['512-grey'],
};

function _vhash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return h; }
function variantOpts(p, sel) { return p.variants.axes.map(ax => ax.options.find(o => o.id === sel[ax.id]) || ax.options[0]); }
function defaultSel(p) { const s = {}; if (p.variants) p.variants.axes.forEach(ax => { s[ax.id] = ax.options[0].id; }); return s; }
function variantLabel(p, sel) { return p.variants ? variantOpts(p, sel).map(o => o.label).join(' · ') : ''; }
function comboKey(p, sel) { return variantOpts(p, sel).map(o => o.id).join('-'); }
// does any shop sell this combination?
function comboAvail(p, sel) { if (!p.variants) return true; const out = VARIANT_OUT[p.id]; return !out || out.indexOf(comboKey(p, sel)) < 0; }
function allCombos(p) { let c = [{}]; p.variants.axes.forEach(ax => { c = c.flatMap(x => ax.options.map(o => ({ ...x, [ax.id]: o.id }))); }); return c; }

// price-only lookup for a combo (no offer/history generation) — null = unsold
function variantBest(p, sel) {
  if (!p.variants) return p.best;
  if (!comboAvail(p, sel)) return null;
  const opts = variantOpts(p, sel);
  const key = opts.map(o => o.id).join('-');
  if (p.listings && p.listings[key]) return p.listings[key].best;
  if (opts.every((o, i) => o.id === p.variants.axes[i].options[0].id)) return p.best;
  const delta = opts.reduce((n, o) => n + (o.delta || 0), 0);
  const h = _vhash(p.id + ':' + key);
  return p.best + delta + (h % 5) * 30; // small per-combo market variance
}
// cheapest *sold* option on one axis, holding the other selections. null = none sold
function cheapestOn(p, sel, axisId) {
  const ax = p.variants.axes.find(a => a.id === axisId);
  let id = null, price = Infinity;
  ax.options.forEach(o => { const b = variantBest(p, { ...sel, [axisId]: o.id }); if (b != null && b < price) { price = b; id = o.id; } });
  return id ? { id, price } : null;
}
// cheapest combination a shop actually sells. null = none sold
function cheapestCombo(p) {
  let sel = null, price = Infinity;
  allCombos(p).forEach(c => { const b = variantBest(p, c); if (b != null && b < price) { price = b; sel = c; } });
  return sel ? { sel, price } : null;
}

// derived listing for a selected combination — same product id,
// variant-specific price/offers/history (deterministic per combo)
function variantListing(p, sel) {
  if (!p.variants) return p;
  const opts = variantOpts(p, sel);
  const vlabel = opts.map(o => o.label).join(' · ');
  const key = opts.map(o => o.id).join('-');
  if (!comboAvail(p, sel)) return { ...p, vlabel, unavailable: true, best: null, was: null, drop: 0, shops: 0, offers: [], history: [] };
  if (p.listings && p.listings[key]) return { ...p.listings[key], vlabel };
  if (opts.every((o, i) => o.id === p.variants.axes[i].options[0].id)) return { ...p, vlabel }; // default combo = base listing
  const delta = opts.reduce((n, o) => n + (o.delta || 0), 0);
  const h = _vhash(p.id + ':' + opts.map(o => o.id).join('-'));
  const best = variantBest(p, sel), was = p.was + delta;
  const v = { ...p, vlabel, best, was, drop: Math.round(((was - best) / was) * 100), shops: Math.max(3, p.shops - (h % 4)), idn: (p.idn || _vhash(p.id)) + h };
  v.offers = window.genOffers(v);
  v.history = window.genHist(v.idn, best);
  if (window.applyTotals) applyTotals(v);
  return v;
}

// resolve a hydrated variant id "<productId>~<comboKey>" (e.g. iphone~256-blue)
// into { p, sel } — the head product plus the combo's selection. null on any miss.
function resolveVariantId(id) {
  if (typeof id !== 'string') return null;
  const i = id.indexOf('~'); if (i < 0) return null;
  const p = window.getListing && getListing(id.slice(0, i));
  if (!p || !p.variants) return null;
  const parts = id.slice(i + 1).split('-');
  if (parts.length !== p.variants.axes.length) return null;
  const sel = {};
  for (let k = 0; k < parts.length; k++) {
    const ax = p.variants.axes[k];
    if (!ax.options.some(o => o.id === parts[k])) return null;
    sel[ax.id] = parts[k];
  }
  return { p, sel };
}

// ---- picker (PDP) -----------------------------------------
function VariantPicker({ p, sel, onSel, onSelAll }) {
  if (!p.variants) return null;
  const avail = comboAvail(p, sel);
  const curBest = variantBest(p, sel);
  const cc = cheapestCombo(p);
  return (
    <div className="vpick">
      {p.variants.axes.map(ax => {
        const cur = ax.options.find(o => o.id === sel[ax.id]) || ax.options[0];
        const cheap = cheapestOn(p, sel, ax.id);
        const save = (avail && curBest != null && cheap) ? curBest - cheap.price : 0;
        return (
          <div key={ax.id}>
            <div className="vpick__lbl">
              <span>{ax.label} — <b>{cur.label}</b>{cur.delta > 0 && <span className="vpick__d">+kr {fmt(cur.delta)}</span>}</span>
              {save > 0 && <button type="button" className="vpick__cheap" title={'Switch to ' + (ax.options.find(o => o.id === cheap.id) || {}).label + ' — kr ' + fmt(cheap.price)} onClick={() => onSel(ax.id, cheap.id)}>▼ Cheapest · save kr {fmt(save)}</button>}
            </div>
            <div className="vpick__opts">
              {ax.options.map(o => {
                const na = !comboAvail(p, { ...sel, [ax.id]: o.id });
                const t = o.label + (o.delta > 0 ? ' (+kr ' + fmt(o.delta) + ')' : '') + (na ? ' — no shop sells this combination' : '');
                return ax.type === 'swatch'
                  ? <button key={o.id} type="button" className={'vswatch' + (cur.id === o.id ? ' is-on' : '') + (na ? ' is-na' : '')} style={{ background: o.swatch }} title={t} aria-label={t} onClick={() => onSel(ax.id, o.id)}></button>
                  : <button key={o.id} type="button" className={'vopt' + (cur.id === o.id ? ' is-on' : '') + (na ? ' is-na' : '')} title={na ? t : undefined} onClick={() => onSel(ax.id, o.id)}>{o.label}{o.delta > 0 && <span className="vopt__d">+{fmt(o.delta)}</span>}</button>;
              })}
            </div>
          </div>
        );
      })}
      <div className="vpick__foot">
        {!avail && <span className="vpick__na">No shop sells this combination</span>}
        {cc && (!avail || curBest > cc.price)
          ? <button type="button" className="vpick__combo" title={variantLabel(p, cc.sel)} onClick={() => onSelAll && onSelAll(cc.sel)}>▼ {avail ? 'Cheapest combination' : 'Cheapest available'} · kr {fmt(cc.price)}</button>
          : avail && <span className="vpick__done">✓ Cheapest combination</span>}
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

Object.assign(window, { VARIANT_DEFS, VARIANT_OUT, defaultSel, variantLabel, comboKey, comboAvail, allCombos, variantListing, variantBest, cheapestOn, cheapestCombo, resolveVariantId, VariantPicker, VariantHint });
