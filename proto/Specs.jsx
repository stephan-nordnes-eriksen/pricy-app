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
  kitchen: { label: 'Kitchen', groups: [
    _G('format', 'Format', [_R('type', 'Type')]),
    _G('capacity', 'Capacity', [_R('capacity', 'Capacity'), _R('power', 'Power')]),
    _G('body', 'Body', [_R('weight', 'Weight')]),
  ] },
};

const SPEC_KIND_BY_CAT = { Audio: 'headphones', Phones: 'phone', Computers: 'laptop', Gaming: 'gaming', TV: 'tv', 'E-readers': 'ereader', Toys: 'toy', Kitchen: 'kitchen' };
const SPEC_KIND_OVERRIDE = { dyson: 'vacuum', roborock: 'vacuum', hue: 'lighting', eufy: 'vacuum', jet85: 'vacuum' };
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
  mbp14:   { size: '14.2″ Liquid Retina XDR', res: '3024 × 1964', nits: '1000 nits (1600 peak)', chip: 'Apple M4 (10-core CPU / 10-core GPU)', ram: '16 GB unified', storage: '512 GB', life: 'Up to 24 h', charge: '70 W USB-C', weight: '1.55 kg', ports: '3× Thunderbolt 4, HDMI, SDXC, MagSafe 3', wifi: 'Wi-Fi 6E' },
  xps13:   { size: '13.4″ InfinityEdge', res: '1920 × 1200', nits: '500 nits', chip: 'Intel Core Ultra 7 155H', ram: '16 GB', storage: '512 GB SSD', life: 'Up to 18 h', charge: '60 W USB-C', weight: '1.19 kg', ports: '2× Thunderbolt 4', wifi: 'Wi-Fi 7' },
  yoga7x:  { size: '14.5″ OLED touch', res: '2944 × 1840', nits: '500 nits (1000 HDR)', chip: 'Snapdragon X Elite', ram: '16 GB', storage: '512 GB SSD', life: 'Up to 23 h', charge: '65 W USB-C', weight: '1.28 kg', ports: '3× USB-C 4.0', wifi: 'Wi-Fi 7' },
  g14:     { size: '14″ OLED, 120 Hz', res: '2880 × 1800', nits: '500 nits', chip: 'AMD Ryzen 9 + GeForce RTX 4060', ram: '32 GB', storage: '1 TB SSD', life: 'Up to 10 h', charge: '180 W', weight: '1.5 kg', ports: 'USB 4, 2× USB-A, HDMI 2.1, SD', wifi: 'Wi-Fi 6E' },
  spectre: { size: '14″ OLED touch', res: '2880 × 1800', nits: '400 nits', chip: 'Intel Core Ultra 7 155H', ram: '16 GB', storage: '1 TB SSD', life: 'Up to 15 h', charge: '65 W USB-C', weight: '1.44 kg', ports: '2× Thunderbolt 4, USB-A, 3.5 mm', wifi: 'Wi-Fi 6E' },
  lgc4:    { size: '48″', panel: 'OLED evo', res: '3840 × 2160', refresh: '144 Hz', hdr: 'Dolby Vision, HDR10, HLG', os: 'webOS', hdmi: '4 of 4', earc: true, weight: '10.2 kg' },
  qn90d:   { size: '75″', panel: 'Neo QLED (Mini-LED)', res: '3840 × 2160', refresh: '144 Hz', hdr: 'HDR10+, HLG', os: 'Tizen', hdmi: '4 of 4', earc: true, weight: '31.6 kg' },
  qn900d:  { size: '75″', panel: 'Neo QLED (Mini-LED)', res: '7680 × 4320', refresh: '144 Hz', hdr: 'HDR10+, HLG', os: 'Tizen', hdmi: '4 of 4', earc: true, weight: '33.2 kg' },
  tcl805:  { size: '55″', panel: 'Mini-LED QLED', res: '3840 × 2160', refresh: '144 Hz', hdr: 'Dolby Vision, HDR10+, HLG', os: 'Google TV', hdmi: '2 of 4', earc: true, weight: '13.5 kg' },
  ip15pm:  { size: '6.7″ OLED ProMotion', res: '2796 × 1290', refresh: '120 Hz', chip: 'Apple A17 Pro', ram: '8 GB', main: '48 MP ƒ/1.8', front: '12 MP ƒ/1.9', capacity: '4 441 mAh', charge: '27 W (MagSafe 15 W)', weight: '221 g', ip: 'IP68', g5: true, esim: true, usb: 'USB-C (USB 3)' },
  a55:     { size: '6.6″ AMOLED', res: '2340 × 1080', refresh: '120 Hz', chip: 'Exynos 1480', ram: '8 GB', main: '50 MP ƒ/1.8', front: '32 MP ƒ/2.2', capacity: '5 000 mAh', charge: '25 W', weight: '213 g', ip: 'IP67', g5: true, esim: true, usb: 'USB-C (USB 2)' },
  switchlite: { type: 'Handheld console', disc: false, res: '720p handheld', storage: '32 GB', expand: 'microSD', screen: '5.5″ LCD', battery: '3 – 7 h', weight: '275 g' },
  rogally: { type: 'Handheld PC', disc: false, res: '1080p @ 120 Hz', storage: '1 TB SSD', expand: 'microSD', screen: '7″ IPS, 120 Hz', battery: '2 – 8 h', weight: '678 g' },
  'kobo-libra': { screen: '7″ E Ink Kaleido 3', light: 'ComfortLight PRO, warm light', storage: '32 GB', battery: 'Up to 6 weeks', ip: 'IPX8', weight: '199.5 g', conn: 'USB-C, Wi-Fi, Bluetooth' },
  scribe:  { screen: '10.2″ E Ink, 300 ppi', light: '35 LED, warm light', storage: '64 GB', battery: 'Up to 12 weeks', weight: '433 g', conn: 'USB-C, Wi-Fi' },
  'kobo-clara': { screen: '6″ E Ink Carta 1300', light: 'ComfortLight PRO', storage: '16 GB', battery: 'Up to 5 weeks', ip: 'IPX8', weight: '174 g', conn: 'USB-C, Wi-Fi' },
  'lego-porsche': { pieces: '1458', age: '18+', theme: 'Technic', item: '42096', dims: '45 cm long', released: '2021' },
  'lego-xwing': { pieces: '474', age: '9+', theme: 'Star Wars', item: '75301', dims: '31 cm long', released: '2021' },
  'lego-fire': { pieces: '540', age: '6+', theme: 'City', item: '60320', dims: '3 floors, fire truck included', released: '2022' },
  brio:    { pieces: '33', age: '3+', theme: 'Wooden railway', item: '33512', dims: 'Figure-eight track, beech wood', released: '2020' },
  eufy:    { type: 'Robot (with dock)', mop: true, suction: '8 000 Pa', nav: 'LiDAR + AI camera', bin: '0.4 L (+ 2.5 L dock bag)', runtime: 'Up to 180 min', dock: 'Self-empty, mop wash & dry', noise: '65 dB', weight: '4.4 kg' },
  jet85:   { type: 'Cordless stick', mop: false, suction: '210 AW', nav: 'Swivel head', bin: '0.5 L', runtime: 'Up to 60 min', noise: '78 dB', weight: '2.8 kg' },
  specialista: { type: 'Manual espresso machine', capacity: '1.1 L water tank', power: '1450 W', weight: '9.3 kg' },
  barista: { type: 'Manual espresso machine with grinder', capacity: '2.0 L water tank', power: '1850 W', weight: '6.4 kg' },
  mocca:   { type: 'Filter coffee maker', capacity: '1.25 L (10 cups)', power: '1520 W', weight: '2.9 kg' },
  ninja:   { type: 'Dual-zone air fryer', capacity: '9.5 L (two zones)', power: '2470 W', weight: '8.8 kg' },
  'wilfa-kettle': { type: 'Kettle', capacity: '1.7 L', power: '2200 W', weight: '1.0 kg' },
  kitchenaid: { type: 'Tilt-head stand mixer', capacity: '4.8 L bowl', power: '300 W', weight: '11.3 kg' },
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
function SpecRow({ r, onSel, p, sel, link }) {
  const naOf = (oid) => !!(p && sel && r.ax && window.comboAvail && !comboAvail(p, { ...sel, [r.ax.id]: oid }));
  let val;
  if (r.selectable && r.ax.type === 'swatch') {
    val = <span className="srow__opts">{r.ax.options.map(o => <button key={o.id} type="button" className={'vswatch vswatch--sm' + (r.value === o.id ? ' is-on' : '') + (naOf(o.id) ? ' is-na' : '')} style={{ background: o.swatch }} title={o.label + (o.delta > 0 ? ' (+kr ' + fmt(o.delta) + ')' : '') + (naOf(o.id) ? ' — no shop sells this combination' : '')} aria-label={o.label} onClick={() => onSel(r.ax.id, o.id)}></button>)}<span className="srow__cur">{r.display}</span></span>;
  } else if (r.selectable) {
    val = <span className="srow__opts">{r.ax.options.map(o => <button key={o.id} type="button" className={'vopt vopt--sm' + (r.value === o.id ? ' is-on' : '') + (naOf(o.id) ? ' is-na' : '')} title={naOf(o.id) ? 'No shop sells this combination' : undefined} onClick={() => onSel(r.ax.id, o.id)}>{o.label}{o.delta > 0 && <span className="vopt__d">+{fmt(o.delta)}</span>}</button>)}</span>;
  } else {
    const na = r.display === '—';
    val = (link && !na)
      ? <button type="button" className={'srow__val srow__val--link' + (r.type === 'bool' && r.value === true ? ' is-yes' : '')} title={link.title} onClick={link.go}>{r.display}</button>
      : <span className={'srow__val' + (na ? ' is-na' : '') + (r.type === 'bool' && r.value === true ? ' is-yes' : '')}>{r.display}</span>;
  }
  return (
    <div className={'srow' + (r.selectable ? ' srow--sel' : '')}>
      <span className="srow__lbl">{r.label}{r.selectable && <span className="srow__tag" title="Selectable — affects price">options</span>}</span>
      {val}
    </div>
  );
}

// collapse state is shared across every product (one key, not per-id)
const SPECS_LS = 'pricy.specs.open';
const specsOpenGet = () => { try { const v = localStorage.getItem(SPECS_LS); return v == null ? true : v === '1'; } catch (e) { return true; } };
const specsOpenSave = (open) => { try { localStorage.setItem(SPECS_LS, open ? '1' : '0'); } catch (e) {} };

function SpecsSection({ p, sel, onSel, go }) {
  const s = specsFor(p, sel);
  // rows whose id is a facet key in this category link to a pre-filtered search
  const _go = go || window.go;
  const fdefs = (window.FACETS || {})[p.cat] || [];
  const linkFor = (r) => {
    if (r.selectable || !_go || !window.fval) return null;
    const def = fdefs.find(d => d.key === r.id);
    if (!def) return null;
    const v = fval(p, r.id);
    if (v === undefined || (def.type === 'bool' && v !== true)) return null;
    const facets = { [r.id]: def.type === 'bool' ? true : (Array.isArray(v) ? v : [v]) };
    return { title: 'Vis alle i ' + p.cat + ' med ' + def.label.toLowerCase() + (def.type === 'bool' ? '' : ' ' + r.display), go: () => _go('results', { cat: p.cat, facets }) };
  };
  const [open, setOpen] = useState(specsOpenGet);
  useEffect(() => {
    const onForce = () => setOpen(true);
    window.addEventListener('pricy:specs-open', onForce);
    return () => window.removeEventListener('pricy:specs-open', onForce);
  }, []);
  if (!s) return null;
  const n = s.groups.reduce((k, g) => k + g.rows.length, 0);
  return (
    <section className={'specs' + (open ? ' is-open' : '')} id="pdp-specs">
      <button type="button" className="specs__head" aria-expanded={open} onClick={() => setOpen(o => { specsOpenSave(!o); return !o; })}>
        <span className="specs__title"><h2>Specifications</h2><span className="specs__note">{n} properties · {s.kindLabel}{p.variants ? ' · selectable options affect price' : ''}</span></span>
        <span className="specs__chev"><Icon name="chevron-down" size={16} /></span>
      </button>
      {open && <div className="specs__grid">
        {s.groups.map(g => (
          <div key={g.id} className="sgrp">
            <div className="sgrp__h">{g.label}</div>
            {g.rows.map(r => <SpecRow key={r.id} r={r} onSel={onSel} p={p} sel={sel} link={linkFor(r)} />)}
          </div>
        ))}
      </div>}
    </section>
  );
}

function scrollToSpecs() {
  specsOpenSave(true);
  window.dispatchEvent(new Event('pricy:specs-open'));
  requestAnimationFrame(() => {
    const el = document.getElementById('pdp-specs');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
  });
}

Object.assign(window, { SPEC_KINDS, SPECS, specKindOf, specsFor, SpecsSection, scrollToSpecs });
