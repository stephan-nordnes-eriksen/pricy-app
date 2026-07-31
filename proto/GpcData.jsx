// ===========================================================
// Pricy.no — GPC data layer (GS1 Global Product Classification)
// Segment → Family → Class → Brick; every product's EAN resolves to
// exactly one brick. DEPTS is the shopper-facing department mapping
// on top — editorial data that will come from the server (same
// pattern as CATALOG/CATEGORIES). Codes follow real GPC segment
// numbering; brick codes are illustrative until the real GS1 import.
// Counts are demo numbers. Loads after Primitives.jsx, before AppData.jsx.
// ===========================================================

const GPC = [
  { code: '68000000', name: 'Audio Visual / Photography', icon: 'clapperboard', fams: [
    { code: '68010000', name: 'Audio Visual Equipment', classes: [
      { code: '68010100', name: 'Audio Equipment', bricks: [
        { code: '10001085', name: 'Headphones / Earphones', icon: 'headphones', n: 412, syn: ['hodetelefoner', 'ørepropper', 'headset', 'earbuds', 'airpods'], attrs: [
          { t: 'Type', v: ['In-ear', 'On-ear', 'Over-ear'] },
          { t: 'Connection', v: ['True wireless', 'Wireless', 'Wired'] },
          { t: 'Noise cancelling', v: ['Yes', 'No'] },
          { t: 'Use', v: ['Everyday', 'Gaming', 'Sport'] } ] },
        { code: '10001093', name: 'Speakers', icon: 'speaker', n: 268, syn: ['høyttaler', 'høyttalere'], attrs: [ { t: 'Type', v: ['Portable', 'Smart', 'Bookshelf', 'Floorstanding'] } ] },
        { code: '10001098', name: 'Soundbars', icon: 'audio-lines', n: 74, syn: ['lydplanke'] },
        { code: '10001112', name: 'Turntables', icon: 'disc-3', n: 41, syn: ['platespiller'] },
        { code: '10001120', name: 'Amplifiers / Receivers', icon: 'audio-waveform', n: 58, syn: ['forsterker'] } ] },
      { code: '68010200', name: 'Visual Equipment', bricks: [
        { code: '10001585', name: 'Televisions', icon: 'tv', n: 326, syn: ['tv', 'fjernsyn'], attrs: [
          { t: 'Panel', v: ['OLED', 'QLED', 'LED'] },
          { t: 'Screen size', v: ['43″', '50″', '55″', '65″', '75″', '85″'] },
          { t: 'Refresh rate', v: ['60 Hz', '100 Hz', '120 Hz', '144 Hz'] } ] },
        { code: '10001593', name: 'Projectors', icon: 'projector', n: 52, syn: ['projektor'] },
        { code: '10001601', name: 'Media Streaming Devices', icon: 'monitor-play', n: 38, syn: ['apple tv', 'chromecast'] } ] },
      { code: '68010300', name: 'AV Accessories', bricks: [
        { code: '10001640', name: 'TV Wall Mounts', icon: 'frame', n: 95, syn: ['veggfeste'] },
        { code: '10001652', name: 'AV Cables / Adapters', icon: 'cable', n: 210, syn: ['hdmi', 'kabel'] } ] } ] },
    { code: '68020000', name: 'Photography / Optics', classes: [
      { code: '68020100', name: 'Cameras', bricks: [
        { code: '10000601', name: 'Digital Cameras', icon: 'camera', n: 88, syn: ['kamera'], attrs: [ { t: 'Type', v: ['Mirrorless', 'Compact', 'DSLR'] } ] },
        { code: '10000609', name: 'Action Cameras', icon: 'video', n: 34, syn: ['gopro'] },
        { code: '10000617', name: 'Camera Lenses', icon: 'aperture', n: 120, syn: ['objektiv'] } ] },
      { code: '68020200', name: 'Optics', bricks: [
        { code: '10000630', name: 'Binoculars / Telescopes', icon: 'telescope', n: 27, syn: ['kikkert'] } ] } ] } ] },

  { code: '66000000', name: 'Computing', icon: 'laptop', fams: [
    { code: '66010000', name: 'Computers / Peripherals', classes: [
      { code: '66010100', name: 'Computers', bricks: [
        { code: '10001199', name: 'Laptops', icon: 'laptop', n: 294, syn: ['bærbar', 'pc', 'macbook'], attrs: [
          { t: 'Screen size', v: ['13″', '14″', '15″', '16″', '17″'] },
          { t: 'Use', v: ['Everyday', 'Gaming', 'Creator'] } ] },
        { code: '10001200', name: 'Desktop Computers', icon: 'pc-case', n: 96, syn: ['stasjonær'] },
        { code: '10001201', name: 'Tablet Computers', icon: 'tablet', n: 112, syn: ['nettbrett', 'ipad'] },
        { code: '10001205', name: 'E-book Readers', icon: 'book-open', n: 23, syn: ['lesebrett', 'kindle'] } ] },
      { code: '66010200', name: 'Peripherals', bricks: [
        { code: '10001210', name: 'Monitors', icon: 'monitor', n: 203, syn: ['skjerm'], attrs: [
          { t: 'Screen size', v: ['24″', '27″', '32″', '34″+'] },
          { t: 'Refresh rate', v: ['60 Hz', '144 Hz', '165 Hz', '240 Hz'] },
          { t: 'Use', v: ['Office', 'Gaming', 'Creator'] } ] },
        { code: '10001215', name: 'Keyboards', icon: 'keyboard', n: 164, syn: ['tastatur'] },
        { code: '10001216', name: 'Computer Mice', icon: 'mouse', n: 171, syn: ['mus', 'datamus'] },
        { code: '10001220', name: 'Printers / Scanners', icon: 'printer', n: 87, syn: ['skriver'] },
        { code: '10001224', name: 'Webcams', icon: 'webcam', n: 44 } ] },
      { code: '66010300', name: 'Components', bricks: [
        { code: '10001230', name: 'Graphics Cards', icon: 'gpu', n: 118, syn: ['skjermkort', 'grafikkort', 'rtx'], attrs: [ { t: 'Chipset', v: ['RTX 50', 'RTX 40', 'RX 9000'] }, { t: 'VRAM', v: ['8 GB', '12 GB', '16 GB', '24 GB'] } ] },
        { code: '10001233', name: 'Processors', icon: 'cpu', n: 92, syn: ['prosessor'] },
        { code: '10001236', name: 'Memory (RAM)', icon: 'memory-stick', n: 143, syn: ['minne'] },
        { code: '10001239', name: 'Storage Drives', icon: 'hard-drive', n: 188, syn: ['ssd', 'harddisk'] },
        { code: '10001242', name: 'Power Supplies', icon: 'plug-zap', n: 76, syn: ['strømforsyning'] } ] },
      { code: '66010400', name: 'Networking', bricks: [
        { code: '10001250', name: 'Routers / Mesh Systems', icon: 'router', n: 83, syn: ['ruter', 'mesh', 'wifi'] },
        { code: '10001253', name: 'Network Switches', icon: 'network', n: 29 } ] } ] } ] },

  { code: '65000000', name: 'Communications', icon: 'smartphone', fams: [
    { code: '65010000', name: 'Communication Devices', classes: [
      { code: '65010100', name: 'Mobile Devices', bricks: [
        { code: '10003269', name: 'Mobile Phones', icon: 'smartphone', n: 187, syn: ['mobil', 'mobiltelefon', 'smarttelefon', 'iphone'], attrs: [
          { t: 'Storage', v: ['128 GB', '256 GB', '512 GB', '1 TB'] },
          { t: '5G', v: ['Yes', 'No'] } ] },
        { code: '10003271', name: 'Smart Watches', icon: 'watch', n: 94, syn: ['smartklokke', 'klokke'] } ] },
      { code: '65010200', name: 'Device Accessories', bricks: [
        { code: '10003280', name: 'Cases / Protection', icon: 'shield', n: 356, syn: ['deksel', 'skjermbeskytter'] },
        { code: '10003283', name: 'Chargers / Power Banks', icon: 'battery-charging', n: 298, syn: ['lader', 'nødlader', 'powerbank'] } ] } ] } ] },

  { code: '72000000', name: 'Home Appliances', icon: 'washing-machine', fams: [
    { code: '72010000', name: 'Major Domestic Appliances', classes: [
      { code: '72010100', name: 'Laundry / Dishcare', bricks: [
        { code: '10002310', name: 'Washing Machines', icon: 'washing-machine', n: 71, syn: ['vaskemaskin'] },
        { code: '10002313', name: 'Tumble Dryers', icon: 'wind', n: 48, syn: ['tørketrommel'] },
        { code: '10002316', name: 'Dishwashers', icon: 'waves', n: 64, syn: ['oppvaskmaskin'] } ] },
      { code: '72010200', name: 'Cooling / Cooking', bricks: [
        { code: '10002320', name: 'Refrigerators / Freezers', icon: 'refrigerator', n: 93, syn: ['kjøleskap', 'fryser'] },
        { code: '10002324', name: 'Ovens / Cooktops', icon: 'microwave', n: 57, syn: ['ovn', 'komfyr'] } ] } ] },
    { code: '72020000', name: 'Small Domestic Appliances', classes: [
      { code: '72020100', name: 'Floor / Air Care', bricks: [
        { code: '10002330', name: 'Vacuum Cleaners', icon: 'wind', n: 132, syn: ['støvsuger', 'robotstøvsuger'], attrs: [
          { t: 'Type', v: ['Robot', 'Stick', 'Canister'] },
          { t: 'Power source', v: ['Cordless', 'Corded'] } ] },
        { code: '10002334', name: 'Air Purifiers', icon: 'air-vent', n: 41, syn: ['luftrenser'] },
        { code: '10002337', name: 'Heat Pumps / AC', icon: 'thermometer', n: 36, syn: ['varmepumpe'] },
        { code: '10002340', name: 'Fans / Heaters', icon: 'fan', n: 59, syn: ['vifte', 'ovn'] } ] },
      { code: '72020200', name: 'Kitchen Appliances', bricks: [
        { code: '10002350', name: 'Coffee Machines', icon: 'coffee', n: 147, syn: ['kaffemaskin', 'espressomaskin', 'kaffetrakter'], attrs: [ { t: 'Type', v: ['Espresso', 'Pod', 'Filter', 'Fully automatic'] } ] },
        { code: '10002353', name: 'Coffee Grinders', icon: 'coffee', n: 32, syn: ['kaffekvern'] },
        { code: '10002356', name: 'Air Fryers', icon: 'flame', n: 68, syn: ['airfryer', 'luftfrityr'] },
        { code: '10002359', name: 'Kettles / Toasters', icon: 'cup-soda', n: 90, syn: ['vannkoker', 'brødrister'] },
        { code: '10002362', name: 'Food Processors / Blenders', icon: 'utensils', n: 77, syn: ['kjøkkenmaskin', 'blender'] } ] },
      { code: '72020300', name: 'Personal Care Appliances', bricks: [
        { code: '10002370', name: 'Shavers / Trimmers', icon: 'scissors', n: 85, syn: ['barbermaskin', 'trimmer'] },
        { code: '10002373', name: 'Hair Dryers / Stylers', icon: 'sparkles', n: 96, syn: ['hårføner', 'rettetang'] } ] } ] } ] },

  { code: '73000000', name: 'Kitchenware / Tableware', icon: 'chef-hat', fams: [
    { code: '73010000', name: 'Kitchenware', classes: [
      { code: '73010100', name: 'Cookware', bricks: [
        { code: '10002510', name: 'Pots / Pans', icon: 'cooking-pot', n: 118, syn: ['gryte', 'stekepanne'] },
        { code: '10002513', name: 'Kitchen Knives', icon: 'utensils-crossed', n: 87, syn: ['kniv', 'kokkekniv'] } ] },
      { code: '73010200', name: 'Tableware', bricks: [
        { code: '10002520', name: 'Dinnerware', icon: 'utensils', n: 64, syn: ['servise'] },
        { code: '10002523', name: 'Drinkware', icon: 'wine', n: 59, syn: ['glass', 'termos'] } ] } ] } ] },

  { code: '86000000', name: 'Toys / Games', icon: 'blocks', fams: [
    { code: '86010000', name: 'Toys / Games', classes: [
      { code: '86010100', name: 'Construction / Creative', bricks: [
        { code: '10005120', name: 'Construction Toys', icon: 'blocks', n: 241, syn: ['lego', 'byggesett'], attrs: [ { t: 'Age', v: ['4+', '9+', '13+', '18+'] } ] },
        { code: '10005124', name: 'Arts / Crafts Kits', icon: 'palette', n: 52, syn: ['hobby'] } ] },
      { code: '86010200', name: 'Games', bricks: [
        { code: '10005130', name: 'Board Games / Puzzles', icon: 'dices', n: 176, syn: ['brettspill', 'puslespill'] },
        { code: '10005134', name: 'Trading Cards', icon: 'wallet-cards', n: 48, syn: ['pokemon'] } ] },
      { code: '86010300', name: 'Electronic Games', bricks: [
        { code: '10005140', name: 'Video Game Consoles', icon: 'gamepad-2', n: 27, syn: ['konsoll', 'spillkonsoll', 'playstation', 'xbox', 'nintendo'], attrs: [ { t: 'Platform', v: ['PlayStation', 'Xbox', 'Nintendo'] } ] },
        { code: '10005143', name: 'Video Games', icon: 'disc-3', n: 312, syn: ['spill'] },
        { code: '10005146', name: 'Game Controllers', icon: 'joystick', n: 104, syn: ['kontroller', 'ratt'] } ] },
      { code: '86010400', name: 'Outdoor / RC', bricks: [
        { code: '10005150', name: 'RC Vehicles / Drones', icon: 'plane', n: 45, syn: ['drone', 'radiostyrt'] } ] } ] } ] },
];

// ---- rollups + lookups --------------------------------------
const clsN = (c) => c.bricks.reduce((s, b) => s + b.n, 0);
const famN = (f) => f.classes.reduce((s, c) => s + clsN(c), 0);
const segN = (g) => g.fams.reduce((s, f) => s + famN(f), 0);
const GPC_TOTAL = GPC.reduce((s, g) => s + segN(g), 0);

// flat brick index with full path
const ALL_BRICKS = [];
GPC.forEach(g => g.fams.forEach(f => f.classes.forEach(c => c.bricks.forEach(b => ALL_BRICKS.push({ ...b, seg: g, fam: f, cls: c })))));
const brickBy = Object.fromEntries(ALL_BRICKS.map(b => [b.code, b]));
const brickPath = (b) => { const x = brickBy[b.code] || b; return x.seg.name + ' › ' + x.fam.name + ' › ' + x.cls.name; };

// ---- demo products → EAN → brick ----------------------------
// The 8 original demo products carry their EANs; the extra catalog
// listings get a brick only (their EANs arrive with the real feed import).
const PRODMAP = {
  airpods: { ean: '0195949052556', brick: '10001085' },
  xm5:     { ean: '4548736132566', brick: '10001085' },
  tv:      { ean: '8806094848731', brick: '10001585' },
  iphone:  { ean: '0195949036194', brick: '10003269' },
  switch:  { ean: '0045496453351', brick: '10005140' },
  dyson:   { ean: '5025155060834', brick: '10002330' },
  lego:    { ean: '5702017152738', brick: '10005120' },
  kindle:  { ean: '0840080529066', brick: '10001205' },
  'bose-ultra': { brick: '10001085' }, 'senn-m4': { brick: '10001085' }, 'sonos-ace': { brick: '10001085' }, 'jbl-tour2': { brick: '10001085' }, airpods4: { brick: '10001085' }, 'beats-pro': { brick: '10001085' },
  ps5: { brick: '10005140' }, xbox: { brick: '10005140' }, steamdeck: { brick: '10005140' },
  s24: { brick: '10003269' }, pixel8: { brick: '10003269' },
  lgc3: { brick: '10001585' }, bravia: { brick: '10001585' },
  roborock: { brick: '10002330' }, mba: { brick: '10001199' },
  mbp14: { brick: '10001199' }, xps13: { brick: '10001199' }, yoga7x: { brick: '10001199' }, g14: { brick: '10001199' }, spectre: { brick: '10001199' },
  'lego-porsche': { brick: '10005120' }, 'lego-xwing': { brick: '10005120' }, 'lego-fire': { brick: '10005120' }, brio: { brick: '10005120' },
  'kobo-libra': { brick: '10001205' }, scribe: { brick: '10001205' }, 'kobo-clara': { brick: '10001205' },
  specialista: { brick: '10002350' }, barista: { brick: '10002350' }, mocca: { brick: '10002350' },
  ninja: { brick: '10002356' }, 'wilfa-kettle': { brick: '10002359' }, kitchenaid: { brick: '10002362' },
  'philips-air': { brick: '10002334' },
  lgc4: { brick: '10001585' }, qn90d: { brick: '10001585' }, qn900d: { brick: '10001585' }, tcl805: { brick: '10001585' },
  ip15pm: { brick: '10003269' }, a55: { brick: '10003269' },
  switchlite: { brick: '10005140' }, rogally: { brick: '10005140' },
  eufy: { brick: '10002330' }, jet85: { brick: '10002330' },
};
const _gpool = () => window.CATALOG || PRODUCTS;
const samplesOf = (code) => _gpool().filter(p => PRODMAP[p.id] && PRODMAP[p.id].brick === code);

// ---- curated departments = saved sets of bricks --------------
// rule = whole brick, or brick sliced by an attribute (where);
// label = shopper-facing name for a slice. Editorial data — will
// come from the server (same pattern as CATALOG/CATEGORIES).
const DEPTS = [
  { id: 'audio', name: 'Audio & Headphones', icon: 'headphones', rules: [ { b: '10001085' }, { b: '10001093' }, { b: '10001098' }, { b: '10001112' }, { b: '10001120' } ] },
  { id: 'tv', name: 'TV & Home Cinema', icon: 'tv', rules: [ { b: '10001585' }, { b: '10001593' }, { b: '10001601' }, { b: '10001640' }, { b: '10001652' } ] },
  { id: 'phones', name: 'Phones & Watches', icon: 'smartphone', rules: [ { b: '10003269' }, { b: '10003271' }, { b: '10003280' }, { b: '10003283' } ] },
  { id: 'computing', name: 'Computing', icon: 'laptop', rules: [ { b: '10001199' }, { b: '10001200' }, { b: '10001201' }, { b: '10001205' }, { b: '10001210', where: 'Use = Office / Creator', n: 155 }, { b: '10001215' }, { b: '10001216' }, { b: '10001220' }, { b: '10001224' }, { b: '10001230' }, { b: '10001233' }, { b: '10001236' }, { b: '10001239' }, { b: '10001242' }, { b: '10001250' }, { b: '10001253' } ] },
  { id: 'gaming', name: 'Gaming', icon: 'gamepad-2', rules: [ { b: '10005140' }, { b: '10005143' }, { b: '10005146' }, { b: '10001085', where: 'Use = Gaming', n: 57, label: 'Gaming Headsets' }, { b: '10001210', where: 'Use = Gaming', n: 48, label: 'Gaming Monitors' } ] },
  { id: 'home', name: 'Home & Cleaning', icon: 'wind', rules: [ { b: '10002330' }, { b: '10002334' }, { b: '10002337' }, { b: '10002340' }, { b: '10002310' }, { b: '10002313' }, { b: '10002316' }, { b: '10002320' }, { b: '10002324' } ] },
  { id: 'kitchen', name: 'Kitchen', icon: 'chef-hat', rules: [ { b: '10002350' }, { b: '10002353' }, { b: '10002356' }, { b: '10002359' }, { b: '10002362' }, { b: '10002510' }, { b: '10002513' }, { b: '10002520' }, { b: '10002523' } ] },
  { id: 'personal', name: 'Personal Care', icon: 'scissors', rules: [ { b: '10002370' }, { b: '10002373' } ] },
  { id: 'toys', name: 'Toys & Hobby', icon: 'blocks', rules: [ { b: '10005120' }, { b: '10005124' }, { b: '10005130' }, { b: '10005134' }, { b: '10005150' } ] },
];
DEPTS.forEach(d => {
  d.n = d.rules.reduce((s, r) => s + (r.n != null ? r.n : brickBy[r.b].n), 0);
  d.segs = [...new Set(d.rules.map(r => brickBy[r.b].seg.code))];
});
const DEPT_BRICKS = new Set(DEPTS.flatMap(d => d.rules.map(r => r.b)));
const BRICK_DEPT = {}; // brick → the department that claims it (first wins)
DEPTS.forEach(d => d.rules.forEach(r => { if (!BRICK_DEPT[r.b]) BRICK_DEPT[r.b] = d; }));

// ---- search over bricks (name + Norwegian/English synonyms) --
const brickSearch = (q) => {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  const score = (b) => {
    const name = b.name.toLowerCase(), syn = (b.syn || []).join(' ');
    if (name.startsWith(s)) return 3;
    if (name.includes(s)) return 2;
    if ((b.syn || []).some(x => x.startsWith(s)) || syn.includes(s)) return 2;
    if (brickPath(b).toLowerCase().includes(s)) return 1;
    return 0;
  };
  return ALL_BRICKS.map(b => [score(b), b]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1].n - a[1].n).slice(0, 8).map(x => x[1]);
};

// ---- bridge: GPC ↔ legacy p.cat strings ----------------------
// CATALOG rows still carry legacy category strings; until every row is
// EAN-classified, results scoped to a brick/department resolve through
// PRODMAP first and fall back to the legacy category of the brick's class.
const CLS_CAT = { '68010100': 'Audio', '68010200': 'TV', '68010300': 'TV', '66010100': 'Computers', '66010200': 'Computers', '66010300': 'Computers', '66010400': 'Computers', '65010100': 'Phones', '65010200': 'Phones', '72010100': 'Home', '72010200': 'Home', '72020100': 'Home', '72020200': 'Kitchen', '72020300': 'Home', '73010100': 'Kitchen', '73010200': 'Kitchen', '86010100': 'Toys', '86010200': 'Toys', '86010300': 'Gaming', '86010400': 'Toys' };
const BRICK_CAT = { '10001205': 'E-readers' }; // brick-level overrides
const brickToCat = (code) => BRICK_CAT[code] || (brickBy[code] ? CLS_CAT[brickBy[code].cls.code] : undefined);
const brickOf = (p) => (PRODMAP[p.id] || {}).brick;
function brickProducts(code) {
  const direct = _gpool().filter(p => brickOf(p) === code);
  if (direct.length) return direct;
  const c = brickToCat(code);
  return c ? _gpool().filter(p => p.cat === c) : [];
}
function deptProducts(id) {
  const d = DEPTS.find(x => x.id === id);
  if (!d) return [];
  // whole-brick rules only, both for bricks and legacy fallback — attribute
  // slices can't be evaluated against the demo corpus and must not claim a
  // whole brick/category for the department
  const bricks = new Set(d.rules.filter(r => !r.where).map(r => r.b));
  const cats = new Set(d.rules.filter(r => !r.where).map(r => brickToCat(r.b)).filter(Boolean));
  return _gpool().filter(p => { const b = brickOf(p); return b ? bricks.has(b) : cats.has(p.cat); });
}

Object.assign(window, { GPC, GPC_TOTAL, ALL_BRICKS, brickBy, brickPath, PRODMAP, samplesOf, DEPTS, DEPT_BRICKS, BRICK_DEPT, brickSearch, brickToCat, brickOf, brickProducts, deptProducts });
