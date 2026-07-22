// ===========================================================
// Pricy.no — Product specifications
// Per-kind schemas + per-product values. specsFor(p, sel) is the
// shared resolver (PDP spec sheet now, comparison tool later).
// Selectable rows (axis:) bind to the variant picker selection.
// ===========================================================

const _G = (id, label, rows) => ({ id, label, rows });
const _R = (id, label, o = {}) => ({ id, label, ...o });

const SPEC_KINDS = {
  headphones: { label: 'Headphones', groups: [
    _G('design', 'Design', [_R('fit', 'Fit'), _R('anc', 'Noise cancelling', { type: 'bool' }), _R('transp', 'Transparency mode', { type: 'bool' }), _R('color', 'Colour', { axis: 'color' }), _R('weight', 'Weight')]),
    _G('sound', 'Sound', [_R('driver', 'Driver'), _R('freq', 'Frequency range'), _R('codecs', 'Codecs')]),
    _G('battery', 'Battery', [_R('play', 'Playtime (ANC on)'), _R('quick', 'Quick charge'), _R('case', 'Charging case')]),
    _G('conn', 'Connectivity', [_R('bt', 'Bluetooth'), _R('multi', 'Multipoint', { type: 'bool' }), _R('jack', '3.5 mm jack', { type: 'bool' })]),
  ] },
  phone: { label: 'Phone', groups: [
    _G('display', 'Display', [_R('size', 'Screen size'), _R('res', 'Resolution'), _R('refresh', 'Refresh rate')]),
    _G('perf', 'Performance', [_R('chip', 'Chip'), _R('ram', 'RAM'), _R('storage', 'Storage', { axis: 'storage' })]),
    _G('camera', 'Camera', [_R('main', 'Main camera'), _R('front', 'Front camera')]),
    _G('battery', 'Battery', [_R('capacity', 'Capacity'), _R('charge', 'Wired charging')]),
    _G('body', 'Body', [_R('color', 'Colour', { axis: 'color' }), _R('weight', 'Weight'), _R('ip', 'Water resistance')]),
    _G('conn', 'Connectivity', [_R('g5', '5G', { type: 'bool' }), _R('esim', 'eSIM', { type: 'bool' }), _R('usb', 'Port')]),
  ] },
  laptop: { label: 'Laptop', groups: [
    _G('display', 'Display', [_R('size', 'Screen size'), _R('res', 'Resolution'), _R('nits', 'Brightness')]),
    _G('perf', 'Performance', [_R('chip', 'Chip'), _R('ram', 'Memory'), _R('storage', 'Storage', { axis: 'storage' })]),
    _G('battery', 'Battery', [_R('life', 'Battery life'), _R('charge', 'Charger')]),
    _G('body', 'Body', [_R('color', 'Colour', { axis: 'color' }), _R('weight', 'Weight'), _R('ports', 'Ports'), _R('wifi', 'Wi-Fi')]),
  ] },
  gaming: { label: 'Gaming', groups: [
    _G('format', 'Format', [_R('type', 'Type'), _R('disc', 'Disc drive', { type: 'bool' })]),
    _G('perf', 'Performance', [_R('res', 'Max output'), _R('storage', 'Storage', { axis: 'storage' }), _R('expand', 'Expandable storage')]),
    _G('handheld', 'Handheld', [_R('screen', 'Screen'), _R('battery', 'Battery life')]),
    _G('body', 'Body', [_R('weight', 'Weight')]),
  ] },
  tv: { label: 'TV', groups: [
    _G('picture', 'Picture', [_R('size', 'Screen size'), _R('panel', 'Panel'), _R('res', 'Resolution'), _R('refresh', 'Refresh rate'), _R('hdr', 'HDR formats')]),
    _G('smart', 'Smart TV', [_R('os', 'Operating system')]),
    _G('conn', 'Connections', [_R('hdmi', 'HDMI 2.1 ports'), _R('earc', 'eARC', { type: 'bool' })]),
    _G('body', 'Body', [_R('weight', 'Weight (no stand)')]),
  ] },
  vacuum: { label: 'Vacuum', groups: [
    _G('format', 'Format', [_R('type', 'Type'), _R('mop', 'Mopping', { type: 'bool' })]),
    _G('cleaning', 'Cleaning', [_R('suction', 'Suction power'), _R('nav', 'Navigation'), _R('bin', 'Dust bin')]),
    _G('battery', 'Battery', [_R('runtime', 'Runtime'), _R('dock', 'Dock features')]),
    _G('body', 'Body', [_R('noise', 'Noise level'), _R('weight', 'Weight')]),
  ] },
  lighting: { label: 'Smart lighting', groups: [
    _G('kit', 'In the box', [_R('contents', 'Kit contents'), _R('socket', 'Socket')]),
    _G('light', 'Light', [_R('lumen', 'Brightness'), _R('colors', 'Colour range'), _R('life', 'Lifetime')]),
    _G('smart', 'Smart home', [_R('protocol', 'Protocol'), _R('works', 'Works with'), _R('power', 'Power draw')]),
  ] },
  ereader: { label: 'E-reader', groups: [
    _G('display', 'Display', [_R('screen', 'Screen'), _R('light', 'Front light')]),
    _G('storage', 'Storage & battery', [_R('storage', 'Storage'), _R('battery', 'Battery life')]),
    _G('body', 'Body', [_R('ip', 'Waterproofing'), _R('weight', 'Weight'), _R('conn', 'Connectivity')]),
  ] },
  toy: { label: 'Building set', groups: [
    _G('set', 'Set', [_R('pieces', 'Pieces'), _R('age', 'Age'), _R('theme', 'Theme'), _R('item', 'Item number')]),
    _G('build', 'Built model', [_R('dims', 'Dimensions'), _R('released', 'Released')]),
  ] },
};

const SPEC_KIND_BY_CAT = { Audio: 'headphones', Phones: 'phone', Computers: 'laptop', Gaming: 'gaming', TV: 'tv', 'E-readers': 'ereader', Toys: 'toy' };
const SPEC_KIND_OVERRIDE = { dyson: 'vacuum', roborock: 'vacuum', hue: 'lighting' };
function specKindOf(p) { return SPEC_KIND_OVERRIDE[p.id] || SPEC_KIND_BY_CAT[p.cat] || null; }

// values are display strings; booleans typed; axis rows resolve
// from the variant selection when the product has that axis
const SPECS = {
  airpods:      { fit: 'In-ear', anc: true, transp: true, color: 'White', weight: '5.3 g per bud', driver: '11 mm custom', freq: '20 – 20 000 Hz', codecs: 'AAC, SBC', play: '6 h (30 h with case)', quick: '5 min → 1 h', case: 'MagSafe / USB-C', bt: '5.3', multi: true, jack: false },
  airpods4:     { fit: 'In-ear', anc: true, transp: true, color: 'White', weight: '4.3 g per bud', driver: '11 mm custom', freq: '20 – 20 000 Hz', codecs: 'AAC, SBC', play: '4 h (20 h with case)', quick: '5 min → 1 h', case: 'USB-C', bt: '5.3', multi: true, jack: false },
  xm5:          { fit: 'Over-ear', anc: true, transp: true, weight: '250 g', driver: '30 mm', freq: '4 – 40 000 Hz', codecs: 'LDAC, AAC, SBC', play: '30 h', quick: '3 min → 3 h', bt: '5.2', multi: true, jack: true },
  'bose-ultra': { fit: 'Over-ear', anc: true, transp: true, color: 'Black / White Smoke', weight: '254 g', driver: '35 mm', freq: '20 – 20 000 Hz', codecs: 'aptX Adaptive, AAC, SBC', play: '24 h', quick: '15 min → 2.5 h', bt: '5.3', multi: true, jack: true },
  'senn-m4':    { fit: 'Over-ear', anc: true, transp: true, color: 'Black / White', weight: '293 g', driver: '42 mm', freq: '6 – 22 000 Hz', codecs: 'aptX Adaptive, AAC, SBC', play: '60 h', quick: '10 min → 5 h', bt: '5.2', multi: true, jack: true },
  'sonos-ace':  { fit: 'Over-ear', anc: true, transp: true, color: 'Black / Soft White', weight: '312 g', driver: '40 mm', freq: '20 – 20 000 Hz', codecs: 'aptX Lossless, AAC, SBC', play: '30 h', quick: '3 min → 3 h', bt: '5.4', multi: true, jack: true },
  'jbl-tour2':  { fit: 'Over-ear', anc: true, transp: true, color: 'Black', weight: '268 g', driver: '40 mm', freq: '10 – 40 000 Hz', codecs: 'AAC, SBC', play: '30 h', quick: '10 min → 5 h', bt: '5.3', multi: true, jack: true },
  'beats-pro':  { fit: 'Over-ear', anc: true, transp: true, color: '4 colours', weight: '260 g', driver: '40 mm', freq: '20 – 20 000 Hz', codecs: 'AAC, SBC (lossless over USB-C)', play: '24 h', quick: '10 min → 4 h', bt: '5.3', multi: false, jack: true },
  iphone: { size: '6.1″ OLED', res: '2556 × 1179', refresh: '60 Hz', chip: 'Apple A16 Bionic', ram: '6 GB', main: '48 MP ƒ/1.6', front: '12 MP ƒ/1.9', capacity: '3 349 mAh', charge: '20 W (MagSafe 15 W)', weight: '171 g', ip: 'IP68', g5: true, esim: true, usb: 'USB-C (USB 2)' },
  s24:    { size: '6.2″ AMOLED', res: '2340 × 1080', refresh: '120 Hz', chip: 'Exynos 2400', ram: '8 GB', main: '50 MP ƒ/1.8', front: '12 MP ƒ/2.2', capacity: '4 000 mAh', charge: '25 W', weight: '167 g', ip: 'IP68', g5: true, esim: true, usb: 'USB-C (USB 3.2)' },
  pixel8: { size: '6.2″ OLED', res: '2400 × 1080', refresh: '120 Hz', chip: 'Google Tensor G3', ram: '8 GB', main: '50 MP ƒ/1.7', front: '10.5 MP ƒ/2.2', capacity: '4 575 mAh', charge: '27 W', weight: '187 g', ip: 'IP68', g5: true, esim: true, usb: 'USB-C (USB 3.2)' },
  mba: { size: '13.6″ Liquid Retina', res: '2560 × 1664', nits: '500 nits', chip: 'Apple M3 (8-core CPU / 10-core GPU)', ram: '8 GB unified', life: 'Up to 18 h', charge: '30 W USB-C', weight: '1.24 kg', ports: '2× Thunderbolt / USB 4, MagSafe 3, 3.5 mm', wifi: 'Wi-Fi 6E' },
  switch:    { type: 'Hybrid console', disc: false, res: '1080p docked / 720p handheld', storage: '64 GB', expand: 'microSD', screen: '7.0″ OLED', battery: '4.5 – 9 h', weight: '420 g (with Joy-Con)' },
  ps5:       { type: 'Home console', disc: true, res: '4K @ 120 Hz (8K ready)', storage: '1 TB SSD', expand: 'M.2 NVMe slot', weight: '3.2 kg' },
  xbox:      { type: 'Home console', disc: true, res: '4K @ 120 Hz (8K ready)', storage: '1 TB SSD', expand: 'Proprietary expansion card', weight: '4.45 kg' },
  steamdeck: { type: 'Handheld PC', disc: false, expand: 'microSD', screen: '7.4″ OLED, 90 Hz', battery: '3 – 12 h', weight: '640 g', res: '1280 × 800 handheld' },
  tv:     { size: '55″', panel: 'QD-OLED', res: '3840 × 2160', refresh: '144 Hz', hdr: 'HDR10+, HLG', os: 'Tizen', hdmi: '4 of 4', earc: true, weight: '18.6 kg' },
  lgc3:   { size: '65″', panel: 'OLED evo', res: '3840 × 2160', refresh: '120 Hz', hdr: 'Dolby Vision, HDR10, HLG', os: 'webOS', hdmi: '4 of 4', earc: true, weight: '16.6 kg' },
  bravia: { size: '65″', panel: 'Mini-LED', res: '3840 × 2160', refresh: '120 Hz', hdr: 'Dolby Vision, HDR10, HLG', os: 'Google TV', hdmi: '2 of 4', earc: true, weight: '23.0 kg' },
  dyson:    { type: 'Cordless stick', mop: false, suction: '240 AW', nav: 'Laser dust illumination', bin: '0.77 L', runtime: 'Up to 60 min', noise: '82 dB', weight: '3.1 kg' },
  roborock: { type: 'Robot (with dock)', mop: true, suction: '6 000 Pa', nav: 'LiDAR + 3D obstacle avoidance', bin: '0.35 L (+ 2.5 L dock bag)', runtime: 'Up to 180 min', dock: 'Self-empty, mop wash & dry, refill', noise: '67 dB', weight: '4.6 kg' },
  hue: { contents: '3× E27 White & Color + Hue Bridge', socket: 'E27', lumen: '1 100 lm per bulb', colors: '16 M colours + white 2 000 – 6 500 K', life: '25 000 h', protocol: 'Zigbee (Bridge), Bluetooth', works: 'Apple Home, Google, Alexa, Matter', power: '9 W (≈ 75 W equivalent)' },
  kindle: { screen: '6.8″ E Ink, 300 ppi', light: '17 LED, adjustable warm light', storage: '16 GB', battery: 'Up to 10 weeks', ip: 'IPX8', weight: '205 g', conn: 'USB-C, Wi-Fi' },
  lego: { pieces: '608', age: '18+', theme: 'Icons — Botanical Collection', item: '10311', dims: '39 cm tall', released: '2022' },
};

// resolver — one row shape for the spec sheet and (later) comparison.
// { id, label, type, axis, selectable, value, display }
function specsFor(p, sel) {
  const entry = SPECS[p.id];
  // self-describing entry: { groups: [{ label, rows: [[label, display], …] }] }
  // wins over the category schema; lets products outside SPEC_KIND_BY_CAT render
  if (entry && Array.isArray(entry.groups)) {
    const groups = entry.groups.map((g, gi) => ({ id: g.id || 'g' + gi, label: g.label, rows: g.rows.map(([label, display], ri) => ({ id: 'g' + gi + 'r' + ri, label, display: display == null ? '—' : String(display), selectable: false })) }));
    return { kind: specKindOf(p), kindLabel: p.cat, groups };
  }
  const kind = specKindOf(p);
  if (!kind || !entry) return null;
  const vals = entry;
  const groups = SPEC_KINDS[kind].groups.map(g => ({ id: g.id, label: g.label, rows: g.rows.map(r => {
    const ax = r.axis && p.variants && p.variants.axes.find(a => a.id === r.axis);
    if (ax) {
      const cur = (sel && ax.options.find(o => o.id === sel[ax.id])) || ax.options[0];
      return { ...r, selectable: true, ax, value: cur.id, display: cur.label };
    }
    const v = vals[r.id];
    const display = r.type === 'bool' ? (v === true ? '✓' : '—') : (v == null ? '—' : String(v));
    return { ...r, selectable: false, value: v, display };
  }) }));
  return { kind, kindLabel: SPEC_KINDS[kind].label, groups };
}

// ---- spec sheet (PDP section) -----------------------------
function SpecRow({ r, onSel }) {
  let val;
  if (r.selectable && r.ax.type === 'swatch') {
    val = <span className="srow__opts">{r.ax.options.map(o => <button key={o.id} type="button" className={'vswatch vswatch--sm' + (r.value === o.id ? ' is-on' : '')} style={{ background: o.swatch }} title={o.label + (o.delta > 0 ? ' (+kr ' + fmt(o.delta) + ')' : '')} aria-label={o.label} onClick={() => onSel(r.ax.id, o.id)}></button>)}<span className="srow__cur">{r.display}</span></span>;
  } else if (r.selectable) {
    val = <span className="srow__opts">{r.ax.options.map(o => <button key={o.id} type="button" className={'vopt vopt--sm' + (r.value === o.id ? ' is-on' : '')} onClick={() => onSel(r.ax.id, o.id)}>{o.label}{o.delta > 0 && <span className="vopt__d">+{fmt(o.delta)}</span>}</button>)}</span>;
  } else {
    const na = r.display === '—';
    val = <span className={'srow__val' + (na ? ' is-na' : '') + (r.type === 'bool' && r.value === true ? ' is-yes' : '')}>{r.display}</span>;
  }
  return (
    <div className={'srow' + (r.selectable ? ' srow--sel' : '')}>
      <span className="srow__lbl">{r.label}{r.selectable && <span className="srow__tag" title="Selectable — affects price">options</span>}</span>
      {val}
    </div>
  );
}

function SpecsSection({ p, sel, onSel }) {
  const s = specsFor(p, sel);
  if (!s) return null;
  const n = s.groups.reduce((k, g) => k + g.rows.length, 0);
  return (
    <section className="specs" id="pdp-specs">
      <div className="specs__head">
        <h2>Specifications</h2>
        <span className="specs__note">{n} properties · {s.kindLabel}{p.variants ? ' · selectable options affect price' : ''}</span>
      </div>
      <div className="specs__grid">
        {s.groups.map(g => (
          <div key={g.id} className="sgrp">
            <div className="sgrp__h">{g.label}</div>
            {g.rows.map(r => <SpecRow key={r.id} r={r} onSel={onSel} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function scrollToSpecs() {
  const el = document.getElementById('pdp-specs');
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
}

Object.assign(window, { SPEC_KINDS, SPECS, specKindOf, specsFor, SpecsSection, scrollToSpecs });
