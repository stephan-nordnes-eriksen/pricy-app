// ===========================================================
// Pricy.no — Product Search Results + Comparison (PDP)
// Depends on: Primitives (PRODUCTS, SHOPS, fmt, Icon, Price, Tag,
//   Delta, Btn, HistoryChart), AppData (CAT_ICONS), AppHeader,
//   HomeSections (DrawSpark, PriceTag)
// ===========================================================

// ---- deterministic offer + history generators -------------
function _seed(n) { let x = Math.sin(n * 99.13) * 43758.5453; return x - Math.floor(x); }
// shipping + delivery rotate per product (idn) — deterministic, but the mix varies:
// some products' cheapest shop charges frakt (→ totals subline / callout), some ship
// free everywhere, some (idn%5==3) never free, some (idn%4==1) only slow couriers.
const SHIP_P = [0, 79, 149, 0, 79, 79, 149, 79, 79, 79, 79, 79]; // by sorted rank; 0 = free
const ETA_P = ['In stock', '2–4 days', 'In stock', '1–2 days', '2–4 days', '3–5 days', 'In stock', '2–4 days', '1–2 days', '3–5 days', 'In stock', '2–4 days'];
const etaFast = (eta) => !!eta && (/^in stock/i.test(eta) || +((/^(\d+)/.exec(eta) || [])[1]) <= 2);
function genOffers(p) {
  const n = Math.min(p.shops, SHOPS.length), idn = p.idn || 0;
  const slowShipper = p.stock !== false && idn % 4 === 1; // whole assortment ships 3–5 days
  const noFree = idn % 5 === 3; // no shop ships this free
  // cheapest shop rotates per product (among confirmed-in-stock indexes) so
  // multi-item baskets genuinely split across shops (basket optimizer needs this)
  const stockIdx = SHOPS.slice(0, n).map((_, i) => i).filter(i => i % 4 !== 3 && i % 5 !== 4);
  const cheapIdx = stockIdx.length ? stockIdx[idn % stockIdx.length] : 0;
  const offers = SHOPS.slice(0, n).map((s, i) => ({
    shop: s,
    price: (() => { const r = (i - cheapIdx + n) % n; return r === 0 ? p.best : r === 1 ? p.best + 40 + (idn % 3) * 20 : p.best + Math.round((r * (p.best * 0.035) + 40 + _seed(idn + i) * 120) / 10) * 10; })(),
    stock: p.stock === false ? (i % 3 === 2 ? undefined : false) : (i % 5 === 4 ? undefined : i % 4 !== 3), // undefined = never checked → unknown
    url: i % 4 !== 3 ? 'https://www.' + s.toLowerCase().replace(/[^a-z0-9]/g, '') + '.no' : undefined,
    updated_at: i % 5 === 4 ? undefined : Date.now() - Math.round(5 + _seed(idn + i * 7) * 170) * 60000,
  })).sort((a, b) => a.price - b.price).map((o, j) => {
    const shipCost = SHIP_P[(idn + j) % 12] || (noFree ? 79 : 0);
    return { ...o, shipCost, ship: shipCost ? 'kr ' + shipCost + ' shipping' : 'Free shipping', eta: (p.stock === false || slowShipper) ? '3–5 days' : ETA_P[(idn + j) % 12] };
  });
  offers[0].price = p.best;
  offers.forEach(o => { o.total = o.price + o.shipCost; });
  return offers;
}
// true landed cost: cheapest price+frakt across shops
function applyTotals(p) {
  let bt = null, shop = null;
  (p.offers || []).forEach(o => { if (o.total != null && (bt == null || o.total < bt)) { bt = o.total; shop = o.shop; } });
  if (bt != null) { p.bestTotal = bt; p.bestTotalShop = shop; }
  return p;
}
function genHist(idn, base) {
  const vol = base * 0.06, pts = [];
  let v = base * 1.32;
  for (let i = 0; i < 24; i++) { v += Math.sin(i * 0.9) * vol + (_seed(idn * 7 + i) - 0.55) * vol; v = Math.max(base, v); pts.push(Math.round(v / 10) * 10); }
  pts[pts.length - 1] = base;
  return pts;
}
// per-shop history: rides at/above the lowest-across-shops line, ends at that shop's current price
function genShopHist(idn, j, hist, delta) {
  const last = hist.length - 1;
  return hist.map((h, i) => i === last ? h + delta : h + Math.round((delta * (0.5 + _seed(idn * 17 + j * 29 + i) * 1.1) + (_seed(idn * 3 + j * 11 + i) > 0.85 ? h * 0.04 : 0)) / 10) * 10);
}

// ---- expanded catalog (search corpus) ---------------------
// real PRODUCTS get reused (they already carry offers/history);
// new listings are generated. rating/stock/nc metadata for all.
const _META = {
  airpods: { rating: 4.6, reviews: 2140, nc: true,  facets: { battery: 6, wireless: true } },
  xm5:     { rating: 4.7, reviews: 3380, nc: true,  facets: { battery: 30, wireless: true } },
  switch:  { rating: 4.8, reviews: 5120, nc: false, facets: { type: 'Hybrid console', storage: 64, maxres: 1080 } },
  dyson:   { rating: 4.5, reviews: 1890, nc: false, facets: { type: 'Stick vacuum', runtime: 60, mop: false } },
  iphone:  { rating: 4.7, reviews: 6210, nc: false, facets: { scr: 6.1, refresh: 60, ram: 6, os: 'iOS', g5: true } },
  tv:      { rating: 4.6, reviews: 940,  nc: false, facets: { size: 55, panel: 'QD-OLED', refresh: 144, res: 4, os: 'Tizen', dv: false } },
  kindle:  { rating: 4.5, reviews: 2030, nc: false, facets: { scr: 6.8, storage: 16, ipx: true, pen: false } },
  lego:    { rating: 4.9, reviews: 880,  nc: false, facets: { age: 18, pieces: 608, theme: 'Icons' } },
};
const _NEW = [
  // AUDIO — the canonical results set
  { id: 'bose-ultra', name: 'Bose QuietComfort Ultra', brand: 'Bose', cat: 'Audio', icon: 'headphones', best: 3490, was: 3990, shops: 8, rating: 4.7, reviews: 1620, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling', facets: { battery: 24, wireless: true } },
  { id: 'senn-m4', name: 'Sennheiser Momentum 4', brand: 'Sennheiser', cat: 'Audio', icon: 'headphones', best: 2790, was: 3490, shops: 7, rating: 4.6, reviews: 980, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling', facets: { battery: 60, wireless: true } },
  { id: 'sonos-ace', name: 'Sonos Ace', brand: 'Sonos', cat: 'Audio', icon: 'headphones', best: 4290, was: 4990, shops: 5, rating: 4.5, reviews: 410, stock: false, nc: true, kw: 'headphones wireless over-ear noise cancelling', facets: { battery: 30, wireless: true } },
  { id: 'jbl-tour2', name: 'JBL Tour One M2', brand: 'JBL', cat: 'Audio', icon: 'headphones', best: 1990, was: 2790, shops: 6, rating: 4.3, reviews: 720, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling', facets: { battery: 30, wireless: true } },
  { id: 'airpods4', name: 'AirPods 4 (ANC)', brand: 'Apple', cat: 'Audio', icon: 'headphones', best: 1690, was: 1990, shops: 10, rating: 4.6, reviews: 1340, stock: true, nc: true, kw: 'headphones wireless earbuds noise cancelling', facets: { battery: 4, wireless: true } },
  { id: 'beats-pro', name: 'Beats Studio Pro', brand: 'Beats', cat: 'Audio', icon: 'headphones', best: 2290, was: 2990, shops: 7, rating: 4.2, reviews: 560, stock: true, nc: true, kw: 'headphones wireless over-ear noise cancelling', facets: { battery: 24, wireless: true } },
  // GAMING
  { id: 'ps5', name: 'PlayStation 5 Slim', brand: 'Sony', cat: 'Gaming', icon: 'gamepad-2', best: 5990, was: 6990, shops: 9, rating: 4.8, reviews: 4100, stock: true, nc: false, kw: 'console gaming ps5', facets: { type: 'Home console', storage: 1000, maxres: 2160, disc: true } },
  { id: 'xbox', name: 'Xbox Series X', brand: 'Microsoft', cat: 'Gaming', icon: 'gamepad-2', best: 5490, was: 6490, shops: 7, rating: 4.7, reviews: 2300, stock: true, nc: false, kw: 'console gaming xbox', facets: { type: 'Home console', storage: 1000, maxres: 2160, disc: true } },
  { id: 'steamdeck', name: 'Steam Deck OLED', brand: 'Valve', cat: 'Gaming', icon: 'gamepad-2', best: 6490, was: 6990, shops: 4, rating: 4.6, reviews: 880, stock: false, nc: false, kw: 'handheld gaming steam deck 512gb 1tb', facets: { type: 'Handheld', storage: [512, 1024], maxres: 800, disc: false } },
  { id: 'switchlite', name: 'Nintendo Switch Lite', brand: 'Nintendo', cat: 'Gaming', icon: 'gamepad-2', best: 2290, was: 2690, shops: 9, rating: 4.6, reviews: 1830, stock: true, nc: false, kw: 'handheld gaming nintendo switch lite', facets: { type: 'Handheld', storage: 32, maxres: 720, disc: false } },
  { id: 'rogally', name: 'ASUS ROG Ally X', brand: 'ASUS', cat: 'Gaming', icon: 'gamepad-2', best: 9990, was: 10990, shops: 5, rating: 4.5, reviews: 240, stock: true, nc: false, kw: 'handheld gaming pc rog ally windows', facets: { type: 'Handheld', storage: 1024, maxres: 1080, disc: false } },
  // PHONES
  { id: 's24', name: 'Samsung Galaxy S24', brand: 'Samsung', cat: 'Phones', icon: 'smartphone', best: 8490, was: 10990, shops: 11, rating: 4.6, reviews: 1980, stock: true, nc: false, kw: 'phone android samsung 128gb 256gb 512gb', facets: { scr: 6.2, refresh: 120, ram: 8, os: 'Android', g5: true } },
  { id: 'pixel8', name: 'Google Pixel 8', brand: 'Google', cat: 'Phones', icon: 'smartphone', best: 6490, was: 7990, shops: 7, rating: 4.5, reviews: 1120, stock: true, nc: false, kw: 'phone android pixel 128gb 256gb', facets: { scr: 6.2, refresh: 120, ram: 8, os: 'Android', g5: true } },
  { id: 'ip15pm', name: 'iPhone 15 Pro Max', brand: 'Apple', cat: 'Phones', icon: 'smartphone', best: 13490, was: 15990, shops: 10, rating: 4.8, reviews: 2100, stock: true, nc: false, kw: 'phone iphone apple pro max 256gb 512gb', facets: { storage: [256, 512, 1024], scr: 6.7, refresh: 120, ram: 8, os: 'iOS', g5: true } },
  { id: 'a55', name: 'Samsung Galaxy A55', brand: 'Samsung', cat: 'Phones', icon: 'smartphone', best: 4290, was: 5490, shops: 11, rating: 4.4, reviews: 860, stock: true, nc: false, kw: 'phone android samsung billig mobil 128gb', facets: { storage: [128, 256], scr: 6.6, refresh: 120, ram: 8, os: 'Android', g5: true } },
  // TV
  { id: 'lgc3', name: 'LG OLED C3 65"', brand: 'LG', cat: 'TV', icon: 'tv', best: 13990, was: 18990, shops: 6, rating: 4.8, reviews: 760, stock: true, nc: false, kw: 'tv oled lg', facets: { size: 65, panel: 'OLED', refresh: 120, res: 4, os: 'webOS', dv: true } },
  { id: 'bravia', name: 'Sony Bravia 9 65"', brand: 'Sony', cat: 'TV', icon: 'tv', best: 19990, was: 23990, shops: 5, rating: 4.7, reviews: 230, stock: true, nc: false, kw: 'tv mini-led sony', facets: { size: 65, panel: 'Mini-LED', refresh: 120, res: 4, os: 'Google TV', dv: true } },
  { id: 'lgc4', name: 'LG OLED C4 48"', brand: 'LG', cat: 'TV', icon: 'tv', best: 11490, was: 14990, shops: 7, rating: 4.8, reviews: 410, stock: true, nc: false, kw: 'tv oled lg gaming', facets: { size: 48, panel: 'OLED', refresh: 144, res: 4, os: 'webOS', dv: true } },
  { id: 'qn90d', name: 'Samsung QN90D 75"', brand: 'Samsung', cat: 'TV', icon: 'tv', best: 19990, was: 27990, shops: 6, rating: 4.6, reviews: 290, stock: true, nc: false, kw: 'tv neo qled mini-led samsung', facets: { size: 75, panel: 'Mini-LED', refresh: 144, res: 4, os: 'Tizen', dv: false } },
  { id: 'qn900d', name: 'Samsung QN900D 75" 8K', brand: 'Samsung', cat: 'TV', icon: 'tv', best: 34990, was: 44990, shops: 4, rating: 4.5, reviews: 90, stock: true, nc: false, kw: 'tv 8k neo qled samsung', facets: { size: 75, panel: 'Mini-LED', refresh: 144, res: 8, os: 'Tizen', dv: false } },
  { id: 'tcl805', name: 'TCL C805 55"', brand: 'TCL', cat: 'TV', icon: 'tv', best: 6490, was: 8990, shops: 5, rating: 4.4, reviews: 380, stock: true, nc: false, kw: 'tv mini-led qled tcl budget', facets: { size: 55, panel: 'Mini-LED', refresh: 144, res: 4, os: 'Google TV', dv: true } },
  // HOME
  { id: 'roborock', name: 'Roborock S8 Pro Ultra', brand: 'Roborock', cat: 'Home', icon: 'wind', best: 7990, was: 9990, shops: 6, rating: 4.6, reviews: 540, stock: true, nc: false, kw: 'robot vacuum home robotstøvsuger', facets: { type: 'Robot vacuum', runtime: 180, mop: true } },
  { id: 'hue', name: 'Philips Hue Starter Kit', brand: 'Philips', cat: 'Home', icon: 'wind', best: 1290, was: 1690, shops: 8, rating: 4.4, reviews: 1310, stock: true, nc: false, kw: 'smart home lighting lys', facets: { type: 'Smart lighting', mop: false } },
  { id: 'eufy', name: 'Eufy X10 Pro Omni', brand: 'Eufy', cat: 'Home', icon: 'wind', best: 7490, was: 8990, shops: 5, rating: 4.5, reviews: 310, stock: true, nc: false, kw: 'robot vacuum robotstøvsuger mopp', facets: { type: 'Robot vacuum', runtime: 180, mop: true } },
  { id: 'jet85', name: 'Samsung Jet 85', brand: 'Samsung', cat: 'Home', icon: 'wind', best: 4490, was: 5990, shops: 6, rating: 4.3, reviews: 270, stock: true, nc: false, kw: 'stick vacuum støvsuger trådløs', facets: { type: 'Stick vacuum', runtime: 60, mop: false } },
  { id: 'philips-air', name: 'Philips 3000i Air Purifier', brand: 'Philips', cat: 'Home', icon: 'wind', best: 3990, was: 4790, shops: 7, rating: 4.6, reviews: 520, stock: true, nc: false, kw: 'luftrenser air purifier allergi', facets: { type: 'Air purifier', mop: false, area: 135, app: true } },
  // COMPUTERS
  { id: 'mba', name: 'MacBook Air 13" M3', brand: 'Apple', cat: 'Computers', icon: 'laptop', best: 12990, was: 14990, shops: 9, rating: 4.8, reviews: 1640, stock: true, nc: false, kw: 'laptop computer apple macbook', facets: { ram: 8, scr: 13.6, chip: 'Apple M3', type: 'Laptop' } },
  { id: 'mbp14', name: 'MacBook Pro 14" M4', brand: 'Apple', cat: 'Computers', icon: 'laptop', best: 21990, was: 24490, shops: 8, rating: 4.9, reviews: 720, stock: true, nc: false, kw: 'laptop computer apple macbook pro', facets: { ram: 16, storage: 512, scr: 14.2, chip: 'Apple M4', type: 'Laptop' } },
  { id: 'xps13', name: 'Dell XPS 13', brand: 'Dell', cat: 'Computers', icon: 'laptop', best: 15490, was: 18990, shops: 6, rating: 4.5, reviews: 430, stock: true, nc: false, kw: 'laptop pc windows ultrabook', facets: { ram: 16, storage: 512, scr: 13.4, chip: 'Intel Core Ultra', type: 'Laptop' } },
  { id: 'yoga7x', name: 'Lenovo Yoga Slim 7x', brand: 'Lenovo', cat: 'Computers', icon: 'laptop', best: 13990, was: 16490, shops: 5, rating: 4.4, reviews: 210, stock: true, nc: false, kw: 'laptop pc windows arm copilot', facets: { ram: 16, storage: 512, scr: 14.5, chip: 'Snapdragon X', type: 'Laptop' } },
  { id: 'g14', name: 'ASUS ROG Zephyrus G14', brand: 'ASUS', cat: 'Computers', icon: 'laptop', best: 19990, was: 22990, shops: 6, rating: 4.7, reviews: 380, stock: true, nc: false, kw: 'laptop gaming pc windows rog', facets: { ram: 32, storage: 1024, scr: 14, chip: 'AMD Ryzen', type: 'Gaming laptop' } },
  { id: 'spectre', name: 'HP Spectre x360 14', brand: 'HP', cat: 'Computers', icon: 'laptop', best: 16990, was: 19990, shops: 5, rating: 4.4, reviews: 290, stock: false, nc: false, kw: 'laptop pc windows 2-in-1 convertible', facets: { ram: 16, storage: 1024, scr: 14, chip: 'Intel Core Ultra', type: 'Convertible (2-in-1)' } },
  // TOYS
  { id: 'lego-porsche', name: 'LEGO Technic Porsche 911', brand: 'LEGO', cat: 'Toys', icon: 'blocks', best: 1499, was: 1999, shops: 7, rating: 4.8, reviews: 640, stock: true, nc: false, kw: 'lego technic byggesett bil porsche', facets: { age: 18, pieces: 1458, theme: 'Technic' } },
  { id: 'lego-xwing', name: 'LEGO Star Wars X-Wing Starfighter', brand: 'LEGO', cat: 'Toys', icon: 'blocks', best: 449, was: 599, shops: 8, rating: 4.7, reviews: 510, stock: true, nc: false, kw: 'lego star wars byggesett x-wing', facets: { age: 9, pieces: 474, theme: 'Star Wars' } },
  { id: 'lego-fire', name: 'LEGO City Fire Station', brand: 'LEGO', cat: 'Toys', icon: 'blocks', best: 899, was: 1149, shops: 6, rating: 4.6, reviews: 330, stock: true, nc: false, kw: 'lego city byggesett brannstasjon', facets: { age: 6, pieces: 540, theme: 'City' } },
  { id: 'brio', name: 'BRIO World Railway Starter Set', brand: 'BRIO', cat: 'Toys', icon: 'blocks', best: 649, was: 799, shops: 9, rating: 4.8, reviews: 920, stock: true, nc: false, kw: 'brio togbane tog barn wooden railway', facets: { age: 3, pieces: 33, theme: 'Wooden railway' } },
  // E-READERS
  { id: 'kobo-libra', name: 'Kobo Libra Colour', brand: 'Kobo', cat: 'E-readers', icon: 'book-open', best: 2490, was: 2790, shops: 4, rating: 4.5, reviews: 340, stock: true, nc: false, kw: 'ebok leser ereader kobo farge', facets: { scr: 7, storage: 32, ipx: true, pen: true } },
  { id: 'scribe', name: 'Kindle Scribe', brand: 'Amazon', cat: 'E-readers', icon: 'book-open', best: 3990, was: 4490, shops: 4, rating: 4.4, reviews: 280, stock: true, nc: false, kw: 'ebok leser ereader kindle notater penn', facets: { scr: 10.2, storage: 64, ipx: false, pen: true } },
  { id: 'kobo-clara', name: 'Kobo Clara BW', brand: 'Kobo', cat: 'E-readers', icon: 'book-open', best: 1590, was: 1790, shops: 4, rating: 4.4, reviews: 450, stock: true, nc: false, kw: 'ebok leser ereader kobo', facets: { scr: 6, storage: 16, ipx: true, pen: false } },
  // KITCHEN
  { id: 'specialista', name: "De'Longhi La Specialista Arte", brand: "De'Longhi", cat: 'Kitchen', icon: 'utensils-crossed', best: 5490, was: 6490, shops: 7, rating: 4.5, reviews: 380, stock: true, nc: false, kw: 'kaffemaskin espresso kaffe', facets: { type: 'Espresso machine', capacity: 1.1, power: 1450, milk: true } },
  { id: 'barista', name: 'Sage Barista Express', brand: 'Sage', cat: 'Kitchen', icon: 'utensils-crossed', best: 5990, was: 7490, shops: 6, rating: 4.7, reviews: 890, stock: true, nc: false, kw: 'kaffemaskin espresso kaffe kvern', facets: { type: 'Espresso machine', capacity: 2, power: 1850, milk: true } },
  { id: 'mocca', name: 'Moccamaster KBG 741 AO', brand: 'Moccamaster', cat: 'Kitchen', icon: 'utensils-crossed', best: 2290, was: 2690, shops: 9, rating: 4.8, reviews: 1240, stock: true, nc: false, kw: 'kaffetrakter filterkaffe kaffe', facets: { type: 'Filter coffee', capacity: 1.25, power: 1520, milk: false } },
  { id: 'ninja', name: 'Ninja Foodi MAX Dual Air Fryer', brand: 'Ninja', cat: 'Kitchen', icon: 'utensils-crossed', best: 1990, was: 2490, shops: 8, rating: 4.7, reviews: 1560, stock: true, nc: false, kw: 'airfryer luftfrityr frityrkoker', facets: { type: 'Air fryer', capacity: 9.5, power: 2470, drawers: 2 } },
  { id: 'wilfa-kettle', name: 'Wilfa Classic+ Kettle', brand: 'Wilfa', cat: 'Kitchen', icon: 'utensils-crossed', best: 549, was: 699, shops: 10, rating: 4.3, reviews: 680, stock: true, nc: false, kw: 'vannkoker kjøkken', facets: { type: 'Kettle', capacity: 1.7, power: 2200, temp: false } },
  { id: 'kitchenaid', name: 'KitchenAid Artisan 185', brand: 'KitchenAid', cat: 'Kitchen', icon: 'utensils-crossed', best: 5290, was: 6490, shops: 8, rating: 4.8, reviews: 1080, stock: true, nc: false, kw: 'kjøkkenmaskin mikser baking', facets: { type: 'Stand mixer', capacity: 4.8, power: 300 } },
];

let _idn = 1;
const CATALOG = [
  // reused real products, enriched; offers regenerated in place (mutates the shared
  // Primitives object so byId/WATCHED consumers see the same shipping totals)
  ...PRODUCTS.filter(p => _META[p.id]).map(p => {
    if (p.idn == null) { p.idn = _idn++; p.offers = genOffers(p); applyTotals(p); }
    return { ...p, ...(_META[p.id]), stock: true, kw: (p.cat + ' ' + p.brand).toLowerCase() };
  }),
  // new generated listings
  ..._NEW.concat(window.BRICK_ROWS || []).map(p => {
    const drop = Math.round(((p.was - p.best) / p.was) * 100);
    const o = { ...p, drop, idn: _idn++ };
    o.offers = genOffers(o);
    o.history = genHist(o.idn, o.best);
    return applyTotals(o);
  }),
];
// universal availability filters — hardcoded, never collide with FACETS spec keys
const AVAIL = [
  { key: 'instock', label: 'In stock now', test: p => p.stock === true },
  { key: 'freeship', label: 'Free shipping', test: p => (p.offers || []).some(o => o.shipCost === 0) },
  { key: 'fast', label: 'Delivery ≤ 2 days', test: p => (p.offers || []).some(o => o.stock === true && etaFast(o.eta)) },
];
// attach variation axes (same product page, selectable variants)
if (window.VARIANT_DEFS) CATALOG.forEach(p => { if (VARIANT_DEFS[p.id]) p.variants = VARIANT_DEFS[p.id]; });
const CAT_OF = {};
CATALOG.forEach(p => { (CAT_OF[p.cat] = CAT_OF[p.cat] || []).push(p); });
// real, derived counts — all "N products / M shops" copy reads from this
CATALOG.meta = { products: CATALOG.length, shops: [...new Set(CATALOG.flatMap(p => (p.offers || []).map(o => o.shop)))].length, freshest: Date.now() - 14 * 60 * 1000 };
const ALL_BRANDS = (cat) => [...new Set(CATALOG.filter(p => !cat || p.cat === cat).map(p => p.brand))].sort();
function getListing(id) { return CATALOG.find(p => p.id === id); }

function searchCatalog({ query, cat, brick, dept }) {
  // GPC scopes (Departments II): PRODMAP-mapped rows first, legacy-cat fallback — see GpcData.jsx
  if (brick && window.brickProducts) return brickProducts(brick);
  if (dept && window.deptProducts) return deptProducts(dept);
  if (cat) return CATALOG.filter(p => p.cat === cat);
  const q = (query || '').toLowerCase().trim();
  if (!q) return CATALOG.slice();
  const toks = q.split(/\s+/).filter(t => t.length >= 2);
  return CATALOG.filter(p => {
    const hay = (p.name + ' ' + p.brand + ' ' + p.cat + ' ' + (p.kw || '')).toLowerCase();
    return toks.some(t => hay.includes(t));
  });
}

// ---- refine-within-results (free text on product name) ----
// narrows whatever set is already on screen (query or category + filters);
// every token must appear in the NAME — brand/keyword hits don't count here
// Norwegian shoppers type "hundefor", the catalog says "Hundefôr" — 25% of
// rows carry æ/ø/å/é. Uppercase forms are listed so the pairs survive hosts
// whose lower() is ASCII-only; toLowerCase makes them no-ops here.
const FOLD = [['æ','ae'],['Æ','ae'],['ø','o'],['Ø','o'],['å','a'],['Å','a'],['ä','a'],['Ä','a'],['ö','o'],['Ö','o'],['ü','u'],['Ü','u'],['é','e'],['É','e'],['è','e'],['ê','e'],['ô','o'],['ç','c']];
const foldTxt = (s) => FOLD.reduce((a, [x, y]) => a.split(x).join(y), String(s).toLowerCase());
const refineToks = (q) => foldTxt(q || '').trim().split(/\s+/).filter(Boolean);
const refineMatch = (p, toks) => { const n = foldTxt(p.name); return toks.every(t => n.includes(t)); };
const _reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function HiName({ text, q }) {
  const toks = refineToks(q);
  if (!toks.length) return <>{text}</>;
  const parts = String(text).split(new RegExp('(' + toks.map(_reEsc).join('|') + ')', 'ig'));
  return <>{parts.map((s, i) => i % 2 ? <mark key={i} className="hitext">{s}</mark> : s)}</>;
}
function RefineField({ value, onChange, scope, n }) {
  return (
    <div className={'refine' + (value ? ' is-on' : '')}>
      <Icon name="search" size={15} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={'Search names in ' + scope} aria-label={'Search product names in ' + scope} />
      {!!value && <>
        <span className="refine__n">{fmt(n)} {n === 1 ? 'hit' : 'hits'}</span>
        <button className="refine__clear" onClick={() => onChange('')} aria-label="Clear name search"><Icon name="x" size={14} /></button>
      </>}
    </div>
  );
}

// ---- small UI bits ----------------------------------------
// (folkedommen: Verdict/TraitChip live in Reviews.jsx — no numbers)
function Spark({ points, hit }) {
  const D = window.DrawSpark;
  return D
    ? <D points={points} w={132} h={36} color={hit ? 'var(--green-500)' : 'var(--ink-900)'} draw={false} />
    : <Sparkline points={points} w={132} h={36} color={hit ? 'var(--green-500)' : 'var(--ink-900)'} />;
}

// ---- result row (details view) ----------------------------
function ResultRow({ p, go, spark, saved, onSave, badge, hl }) {
  return (
    <div className="rrow" onClick={() => go('product', { id: p.id })}>
      <div className="rrow__img"><ProdImg p={p} fill size={34} /></div>
      <div className="rrow__main">
        <div className="rrow__brand">{p.brand}</div>
        <div className="rrow__name"><HiName text={p.name} q={hl} /></div>
        <div className="rrow__metarow">
          {badge && <span className="sortval">{badge}</span>}
          <Verdict p={p} traits={2} count />
          {p.nc && <span className="rrow__feat">Noise cancelling</span>}
          <StockBadge state={p.stock ? 'in' : 'back'} />
          <VariantHint p={p} />
        </div>
      </div>
      {spark && <div className="rrow__spark">{p.history && p.history.length ? <Spark points={p.history} /> : null}</div>}
      <div className="rrow__price">
        {p.best != null ? (<>
          {p.drop >= 12 && <span className="rrow__drop"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
          <div className="rrow__from">from</div>
          <Price value={p.best} size={24} />
          {p.bestTotal != null && p.bestTotal > p.best && <div className="rrow__tot t-small">kr {fmt(p.bestTotal)} inkl. frakt hos {p.bestTotalShop}</div>}
          <div className="rrow__shops">{p.shops} shops →</div>
        </>) : <div className="no-offers">No offers yet</div>}
      </div>
      <div className="rrow__acts">
        <div className="saveg">
          <button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}>
            <Icon name="bookmark" size={17} />
          </button>
          <SaveMenu p={p} />
        </div>
        <CompareBtn p={p} />
      </div>
    </div>
  );
}

// ---- result row (compact view) ----------------------------
function ResultRowCompact({ p, go, saved, onSave, badge, showBadge, hl }) {
  return (
    <div className="crow" onClick={() => go('product', { id: p.id })}>
      <div className="crow__img"><ProdImg p={p} fill size={18} /></div>
      <span className="crow__brand">{p.brand}</span>
      <span className="crow__name"><HiName text={p.name} q={hl} /></span>
      <span className="crow__drop">{p.drop >= 12 ? <>▼ −{p.drop}%</> : null}</span>
      <span className="crow__meta">{(() => { const s = reviewStats(p); return s ? <span className={'vtx vtx--' + s.verdict.tone}>{s.verdict.tiny}</span> : 'ingen omtaler'; })()}</span>
      <span className="crow__meta">{p.shops} shops</span>
      {showBadge && <span className="crow__sv">{badge && <span className="sortval">{badge}</span>}</span>}
      <span className="crow__price"><Price value={p.best} size={15} /></span>
      <span className="saveg"><button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}><Icon name="bookmark" size={14} /></button><SaveMenu p={p} /></span>
      <CompareBtn p={p} className="crow__cmp" />
    </div>
  );
}

// ---- result card (grid view) ------------------------------
function ResultCard({ p, go, badge, hl, saved, onSave }) {
  return (
    <div className="pcard" onClick={() => go('product', { id: p.id })}>
      {p.drop >= 12 && <span className="pcard__tag"><Tag kind="best">▼ −{p.drop}%</Tag></span>}
      <CompareBtn p={p} className="pcard__cmp" />
      {onSave && <div className="saveg pcard__saveg"><button className={'rrow__save' + (saved ? ' is-on' : '')} title="Watch price" onClick={(e) => { e.stopPropagation(); onSave(p.id); }}><Icon name="bookmark" size={15} /></button><SaveMenu p={p} /></div>}
      <div className="pcard__img"><ProdImg p={p} fill size={42} /></div>
      <div className="pcard__name"><HiName text={p.name} q={hl} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px', flexWrap: 'wrap' }}>{badge && <span className="sortval">{badge}</span>}<Verdict p={p} traits={1} /><VariantHint p={p} /></div>
      <div className="pcard__foot">
        <div>
          {p.best != null ? (<><div className="pcard__from">from</div><Price value={p.best} size={20} /></>) : <div className="no-offers">No offers yet</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pcard__meta">{p.shops} shops</div>
        </div>
      </div>
    </div>
  );
}


// ---- filters rail -----------------------------------------
function Check({ on, label, count, onClick }) {
  return (
    <div className={'check' + (on ? ' is-on' : '')} onClick={onClick}>
      <span className="box"><Icon name="check" size={13} /></span>
      <span>{label}</span>
      {count != null && <span className="ct">{count}</span>}
    </div>
  );
}

// collapse state persists per group (localStorage); filter search temporarily expands
const FGRP_LS = 'pricy.filters.open';
const fgrpAll = () => { try { return JSON.parse(localStorage.getItem(FGRP_LS)) || {}; } catch (e) { return {}; } };
const fgrpSave = (id, open) => { try { const m = fgrpAll(); m[id] = open ? 1 : 0; localStorage.setItem(FGRP_LS, JSON.stringify(m)); } catch (e) {} };
function FGroup({ id, title, nSel = 0, defOpen = true, forceOpen = false, children }) {
  const [open, setOpen] = useState(() => { const s = fgrpAll()[id]; return s == null ? defOpen : !!s; });
  const shown = forceOpen || open;
  return (
    <section className={'filters__grp fgrp' + (shown ? ' is-open' : '')}>
      <h4 className="fgrp__h"><button type="button" aria-expanded={shown} onClick={() => setOpen(o => { fgrpSave(id, !o); return !o; })}>
        <span>{title}</span>
        {nSel > 0 && <span className="fgrp__n">{nSel}</span>}
        <span className="fgrp__chev"><Icon name="chevron-down" size={13} /></span>
      </button></h4>
      {shown && children}
    </section>
  );
}
// long option lists: top slice + any selected values, expand on demand, inner scroll past scrollAt
function FList({ entries, cap = 6, scrollAt = 12, searching = false, listClass = 'flist' }) {
  const [all, setAll] = useState(false);
  const truncatable = !searching && entries.length > cap + 1;
  const showAll = !truncatable || all;
  const shown = showAll ? entries : entries.filter((e, i) => i < cap || e.on);
  return (
    <>
      <div className={listClass + (showAll && entries.length > scrollAt ? ' flist--scroll' : '')}>{shown.map(e => e.node)}</div>
      {truncatable && <button type="button" className="fmore" onClick={() => setAll(a => !a)}>{(all ? 'Show fewer' : 'Show all ' + entries.length)}<Icon name={all ? 'chevron-up' : 'chevron-down'} size={12} /></button>}
    </>
  );
}

// price fields hold strings ('' = unset); the slider works in numbers
const numOr = (v, d) => (v !== '' && v != null && isFinite(+v) ? +v : d);

// ---- category nav model (GPC departments — Departments II) ----
// The Category group mirrors Browse: root = curated departments (DEPTS);
// a scoped view shows its owner department with sibling sub-categories.
// Owner of a brick scope = dept whose rule matches brick+label (BRICK_DEPT
// fallback); bricks outside every dept fall back to their GPC class.
// Legacy p.cat scopes resolve through the brickToCat bridge.
const ruleNav = (r) => ({ brick: r.b, ...(r.label ? { label: r.label } : {}), ...(r.n != null ? { count: r.n } : {}) }); // = navOfRule (PagesBrowse), inlined for load order
function catNavModel({ cat, brick, dept, label }) {
  const DS = window.DEPTS || [], bb = window.brickBy || {};
  const ruleOn = (r) => !!brick && r.b === brick && (label ? r.label === label : !r.label);
  const d = dept ? DS.find(x => x.id === dept)
    : brick ? ((label && DS.find(x => x.rules.some(ruleOn))) || (window.BRICK_DEPT || {})[brick])
    : cat ? DS.find(x => x.rules.some(r => !r.where && brickToCat(r.b) === cat))
    : null;
  if (!d && brick && bb[brick]) { // not in any department → GPC class siblings
    const bk = bb[brick];
    return {
      head: { name: bk.cls.name, icon: bk.seg.icon, n: bk.cls.bricks.reduce((s, b) => s + b.n, 0), on: false, nav: null },
      subs: bk.cls.bricks.map(b => ({ key: b.code, label: b.name, icon: b.icon, n: b.n, on: b.code === brick, nav: { brick: b.code } })),
    };
  }
  if (!d) return { depts: DS.map(x => ({ key: x.id, label: x.name, icon: x.icon, n: x.n, on: false, nav: { dept: x.id } })) };
  // a legacy cat that maps to exactly one sub-category highlights it (e.g. E-readers)
  const catSubs = cat ? d.rules.filter(r => !r.where && brickToCat(r.b) === cat) : [];
  const subs = d.rules.map(r => {
    const bk = bb[r.b];
    return { key: r.b + '|' + (r.label || ''), label: r.label || bk.name, icon: bk.icon, n: r.n != null ? r.n : bk.n, on: ruleOn(r) || (catSubs.length === 1 && catSubs[0] === r), nav: ruleNav(r) };
  });
  return { head: { name: d.name, icon: d.icon, n: d.n, on: !subs.some(s => s.on), nav: { dept: d.id } }, subs };
}
// GS1 GPC classification: hover chip next to the results title (CSS-only popover)
function GpcInfo({ bk, r }) {
  return (
    <span className={'gpcinfo' + (r ? ' gpcinfo--r' : '')}>
      <button className="gpcinfo__btn" aria-label="GS1 GPC classification of this sub-category"><Icon name="info" size={12} />GS1 GPC</button>
      <span className="gpcinfo__pop" role="tooltip">
        <span className="gpcinfo__k">GS1 GPC classification<span className="gpcinfo__c">#{bk.code}</span></span>
        <span className="gpcinfo__p">{bk.seg.name} › {bk.fam.name} › {bk.cls.name} › <b>{bk.name}</b></span>
      </span>
    </span>
  );
}

function FiltersBody({ f, set, base, baseSel, go, facetDefs, facetBase, setFacet, setBoolFacet, availCounts, setAvail }) {
  const brands = base.brands; // brands present in the active result set
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  // filter search: every token must hit the group title or an entry label;
  // tokens not covered by the title narrow which entries stay visible
  const [q, setQ] = useState('');
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const grpPred = (title, labels) => {
    if (!tokens.length) return () => true;
    const t = title.toLowerCase();
    const rest = tokens.filter(tok => !t.includes(tok));
    if (!rest.length) return () => true;
    const pred = (l) => { const s = String(l).toLowerCase(); return rest.every(tok => s.includes(tok)); };
    return labels.some(pred) ? pred : null;
  };
  const cnav = catNavModel(baseSel || {});
  const crows = cnav.depts || cnav.subs;
  const optionDefs = facetDefs.filter(d => d.type === 'options' && ((facetBase[d.key] || {}).vals || []).length >= 2);
  const boolDefs = facetDefs.filter(d => d.type === 'bool');
  const pCat = grpPred('Category', crows.map(s => s.label).concat(cnav.head ? [cnav.head.name] : []));
  const pBrand = grpPred('Brand', brands);
  const pPrice = grpPred('Price (kr)', []);
  const pDom = grpPred('Folkedommen', DOM_TIERS.map(t => t.label));
  const pShow = grpPred('Show only', ['On sale', 'In stock', ...boolDefs.map(d => d.label)]);
  const pAvail = grpPred('Availability', AVAIL.map(d => d.label));
  const optPreds = optionDefs.map(def => grpPred(def.label, facetBase[def.key].vals.map(v => fdisp(v, def))));
  const anyVisible = pCat || pBrand || pPrice || pDom || pShow || pAvail || optPreds.some(Boolean);
  const searching = tokens.length > 0;
  const nShow = (f.sale ? 1 : 0) + (f.instock ? 1 : 0) + boolDefs.filter(d => f.facets[d.key]).length;
  const specVisible = optionDefs.some((d, i) => optPreds[i]);
  return (
    <>
      <div className="filters__grp filters__search">
        <Icon name="search" size={14} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a filter" aria-label="Find a filter" />
        {!!q && <button className="filters__sclear" onClick={() => setQ('')} aria-label="Clear filter search"><Icon name="x" size={13} /></button>}
      </div>
      {pCat && <FGroup id="cat" title="Category" nSel={cnav.head ? 1 : 0} forceOpen={searching}>
        {cnav.head && <>
          {!searching && <div className="catback" onClick={() => go('results', { query: '' })}><Icon name="chevron-left" size={13} /><span>All categories</span></div>}
          {pCat(cnav.head.name) && <div className={'catlink catlink--hd' + (cnav.head.on ? ' is-on' : '') + (cnav.head.nav ? '' : ' catlink--nohov')} onClick={() => cnav.head.nav && go('results', cnav.head.nav)}>
            <span className="catlink__ic"><Icon name={cnav.head.icon} size={15} /></span>
            <span>{cnav.head.name}</span><span className="ct">{fmt(cnav.head.n)}</span>
          </div>}
        </>}
        <FList listClass={'catlist' + (cnav.head ? ' catlist--sub' : '')} cap={cnav.head ? 12 : 9} searching={searching} entries={crows.filter(s => pCat(s.label)).map(s => ({
          on: s.on,
          node: (
            <div key={s.key} className={'catlink' + (s.on ? ' is-on' : '')} onClick={() => go('results', s.nav)}>
              <span className="catlink__ic"><Icon name={s.icon} size={15} /></span>
              <span>{s.label}</span><span className="ct">{fmt(s.n)}</span>
            </div>
          ),
        }))} />
      </FGroup>}
      {pBrand && brands.length > 0 && <FGroup id="brand" title="Brand" nSel={f.brands.length} forceOpen={searching}>
        <FList searching={searching} entries={brands.filter(pBrand).map(b => ({ on: f.brands.includes(b), node: <Check key={b} on={f.brands.includes(b)} label={b} count={base.byBrand[b] || 0} onClick={() => setBrand(b)} /> }))} />
      </FGroup>}
      {pPrice && <FGroup id="price" title="Price (kr)" nSel={(f.min !== '' ? 1 : 0) + (f.max !== '' ? 1 : 0)} forceOpen={searching}>
        <div className="pricefields">
          <input type="number" placeholder={String(base.min)} value={f.min} onChange={e => set('min', e.target.value)} />
          <span className="pricefields__d">–</span>
          <input type="number" placeholder={String(base.max)} value={f.max} onChange={e => set('max', e.target.value)} />
        </div>
        <RangeSlider min={base.min} max={base.max} label="price"
          lo={numOr(f.min, base.min)} hi={numOr(f.max, base.max)}
          onChange={(lo, hi) => { set('min', lo <= base.min ? '' : String(lo)); set('max', hi >= base.max ? '' : String(hi)); }} />
        <div className="pricefields__lbl"><span>kr {fmt(base.min)}</span><span>kr {fmt(base.max)}</span></div>
      </FGroup>}
      {pDom && <FGroup id="rating" title="Folkedommen" nSel={f.dom ? 1 : 0} forceOpen={searching}>
        {DOM_TIERS.filter(t => pDom(t.label)).map(t => (
          <div key={t.v} className={'ropt' + (f.dom === t.v ? ' is-on' : '')} onClick={() => set('dom', f.dom === t.v ? 0 : t.v)}>
            <span className={'vtx ' + (t.v >= 2 ? 'vtx--pos' : 'vtx--mix')}>{t.v >= 2 ? '✓' : '·'}</span>
            <span>{t.label}</span>
          </div>
        ))}
      </FGroup>}
      {pShow && <FGroup id="show" title="Show only" nSel={nShow} forceOpen={searching}>
        {pShow('On sale') && <Check on={f.sale} label="On sale" onClick={() => set('sale', !f.sale)} />}
        {pShow('In stock') && <Check on={f.instock} label="In stock" onClick={() => set('instock', !f.instock)} />}
        {boolDefs.filter(d => pShow(d.label)).map(def => <Check key={def.key} on={!!f.facets[def.key]} label={def.label} onClick={() => setBoolFacet(def.key)} />)}
      </FGroup>}
      {pAvail && <FGroup id="avail" title="Availability" nSel={f.avail.length} forceOpen={searching}>
        {AVAIL.filter(d => pAvail(d.label)).map(d => <Check key={d.key} on={f.avail.includes(d.key)} label={d.label} count={availCounts[d.key]} onClick={() => setAvail(d.key)} />)}
      </FGroup>}
      {specVisible && <div className="filters__cluster">{(((window.brickBy || {})[(baseSel || {}).brick] || {}).name || base.cat || 'Product') + ' specs'}</div>}
      {optionDefs.map((def, i) => optPreds[i] && (
        <FGroup key={def.key} id={'facet.' + def.key} title={def.label} nSel={(f.facets[def.key] || []).length} defOpen={i < 2} forceOpen={searching}>
          <FList searching={searching} entries={facetBase[def.key].vals.filter(v => optPreds[i](fdisp(v, def))).map(v => ({ on: (f.facets[def.key] || []).includes(v), node: <Check key={String(v)} on={(f.facets[def.key] || []).includes(v)} label={fdisp(v, def)} count={facetBase[def.key].counts.get(v)} onClick={() => setFacet(def.key, v)} /> }))} />
        </FGroup>
      ))}
      {!anyVisible && <div className="filters__grp filters__nomatch">No filters match “{q}”<button onClick={() => setQ('')}>Clear search</button></div>}
    </>
  );
}

// ---- top filter bar (dropdown variant) --------------------
function Dropdown({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="fdrop" ref={ref}>
      <button className={'fdrop__btn' + (active ? ' is-on' : '') + (open ? ' is-open' : '')} onClick={() => setOpen(o => !o)}>
        {label}<Icon name="chevron-down" size={14} />
      </button>
      {open && <div className="fdrop__menu">{children}</div>}
    </div>
  );
}

function FilterBar({ f, set, base, go, baseSel, facetDefs, facetBase, setFacet, setBoolFacet, availCounts, setAvail }) {
  const brands = base.brands;
  const setBrand = (b) => set('brands', f.brands.includes(b) ? f.brands.filter(x => x !== b) : [...f.brands, b]);
  const cnav = catNavModel(baseSel);
  const crows = cnav.depts || cnav.subs;
  const cscope = cnav.head ? ((crows.find(s => s.on) || {}).label || cnav.head.name) : null;
  return (
    <div className="filterbar">
      <Dropdown label={cscope ? 'Category · ' + cscope : 'Category'} active={!!cscope}>
        {cnav.head && <>
          <div className="fmenu__item fmenu__item--back" onClick={() => go('results', { query: '' })}><Icon name="chevron-left" size={14} /><span>All categories</span></div>
          <div className={'fmenu__item fmenu__item--hd' + (cnav.head.on ? ' is-on' : '')} onClick={() => cnav.head.nav && go('results', cnav.head.nav)}>
            <Icon name={cnav.head.icon} size={15} /><span>{cnav.head.name}</span><span className="ct">{fmt(cnav.head.n)}</span>
          </div>
        </>}
        {crows.map(s => (
          <div key={s.key} className={'fmenu__item' + (s.on ? ' is-on' : '') + (cnav.head ? ' fmenu__item--sub' : '')} onClick={() => go('results', s.nav)}>
            <Icon name={s.icon} size={15} /><span>{s.label}</span><span className="ct">{fmt(s.n)}</span>
          </div>
        ))}
      </Dropdown>
      <Dropdown label={f.brands.length ? 'Brand · ' + f.brands.length : 'Brand'} active={!!f.brands.length}>
        {brands.map(b => <Check key={b} on={f.brands.includes(b)} label={b} count={base.byBrand[b] || 0} onClick={() => setBrand(b)} />)}
      </Dropdown>
      <Dropdown label={(f.min || f.max) ? 'Price · set' : 'Price'} active={!!(f.min || f.max)}>
        <div style={{ padding: '4px 2px', minWidth: 200 }}>
          <div className="pricefields">
            <input type="number" placeholder={String(base.min)} value={f.min} onChange={e => set('min', e.target.value)} />
            <span className="pricefields__d">–</span>
            <input type="number" placeholder={String(base.max)} value={f.max} onChange={e => set('max', e.target.value)} />
          </div>
          <RangeSlider min={base.min} max={base.max} label="price"
            lo={numOr(f.min, base.min)} hi={numOr(f.max, base.max)}
            onChange={(lo, hi) => { set('min', lo <= base.min ? '' : String(lo)); set('max', hi >= base.max ? '' : String(hi)); }} />
        </div>
      </Dropdown>
      <Dropdown label={f.dom ? 'Folkedom · ' + (DOM_TIERS.find(t => t.v === f.dom) || {}).label : 'Folkedommen'} active={!!f.dom}>
        {DOM_TIERS.map(t => (
          <div key={t.v} className={'fmenu__item' + (f.dom === t.v ? ' is-on' : '')} onClick={() => set('dom', f.dom === t.v ? 0 : t.v)}>
            <span className={'vtx ' + (t.v >= 2 ? 'vtx--pos' : 'vtx--mix')}>{t.v >= 2 ? '✓' : '·'}</span><span>{t.label}</span>
          </div>
        ))}
      </Dropdown>
      <Dropdown label={f.avail.length ? 'Availability · ' + f.avail.length : 'Availability'} active={!!f.avail.length}>
        {AVAIL.map(d => <Check key={d.key} on={f.avail.includes(d.key)} label={d.label} count={availCounts[d.key]} onClick={() => setAvail(d.key)} />)}
      </Dropdown>
      {facetDefs.filter(d => d.type === 'options' && ((facetBase[d.key] || {}).vals || []).length >= 2).map(def => {
        const sel = f.facets[def.key] || [];
        return (
          <Dropdown key={def.key} label={sel.length ? def.label + ' \u00b7 ' + sel.length : def.label} active={!!sel.length}>
            {facetBase[def.key].vals.map(v => <Check key={String(v)} on={sel.includes(v)} label={fdisp(v, def)} count={facetBase[def.key].counts.get(v)} onClick={() => setFacet(def.key, v)} />)}
          </Dropdown>
        );
      })}
      <span className="filterbar__sep" />
      <button className={'fpill' + (f.sale ? ' is-on' : '')} onClick={() => set('sale', !f.sale)}>On sale</button>
      <button className={'fpill' + (f.instock ? ' is-on' : '')} onClick={() => set('instock', !f.instock)}>In stock</button>
      {facetDefs.filter(d => d.type === 'bool').map(def => <button key={def.key} className={'fpill' + (f.facets[def.key] ? ' is-on' : '')} onClick={() => setBoolFacet(def.key)}>{def.label}</button>)}
    </div>
  );
}

const VIEWS = [
  { id: 'grid', icon: 'layout-grid', label: 'Grid' },
  { id: 'details', icon: 'layout-list', label: 'Details' },
  { id: 'compact', icon: 'align-justify', label: 'Compact' },
];

// ---- sorting ----------------------------------------------
// every field sorts both ways. `w` overrides the direction wording,
// `badge` surfaces the sorted value on each row so the order is legible.
const DIRW = { num: { asc: 'Low \u2192 High', desc: 'High \u2192 Low' }, text: { asc: 'A \u2192 Z', desc: 'Z \u2192 A' }, date: { asc: 'Oldest first', desc: 'Newest first' } };
const lastUpd = (p) => { const t = (p.offers || []).map(o => o.updated_at).filter(Boolean); return t.length ? Math.max(...t) : undefined; };
const SORT_FIELDS = [
  { id: 'best', label: 'Price', grp: 'Price', type: 'num', dir: 'asc', val: p => p.best, w: { asc: 'Cheapest first', desc: 'Priciest first' } },
  { id: 'total', label: 'Totalpris', grp: 'Price', type: 'num', dir: 'asc', val: p => p.bestTotal != null ? p.bestTotal : p.best, w: { asc: 'Cheapest first', desc: 'Priciest first' }, badge: p => p.bestTotal != null ? 'kr ' + fmt(p.bestTotal) + ' totalt' : null },
  { id: 'drop', label: 'Price drop', grp: 'Price', type: 'num', dir: 'desc', val: p => p.drop, w: { asc: 'Smallest drop', desc: 'Biggest drop' }, badge: p => p.drop != null ? '\u2212' + p.drop + '%' : null },
  { id: 'save', label: 'Kroner off', grp: 'Price', type: 'num', dir: 'desc', val: p => (p.was != null && p.best != null) ? p.was - p.best : undefined, badge: p => (p.was != null && p.best != null) ? 'kr ' + fmt(p.was - p.best) + ' off' : null },
  { id: 'updated', label: 'Price updated', grp: 'Price', type: 'date', dir: 'desc', val: lastUpd, badge: p => lastUpd(p) ? relTime(lastUpd(p)) : null },
  { id: 'rating', label: 'Folkedommen', grp: 'Popularity', type: 'num', dir: 'desc', val: p => domScore(p), badge: p => { const s = reviewStats(p); return s ? s.verdict.short : null; } },
  { id: 'reviews', label: 'Reviews', grp: 'Popularity', type: 'num', dir: 'desc', val: p => p.reviews, badge: p => p.reviews != null ? fmt(p.reviews) + ' reviews' : null },
  { id: 'shops', label: 'Shops with offers', grp: 'Popularity', type: 'num', dir: 'desc', val: p => p.shops },
  { id: 'name', label: 'Product name', grp: 'Catalog', type: 'text', dir: 'asc', val: p => p.name },
  { id: 'brand', label: 'Brand', grp: 'Catalog', type: 'text', dir: 'asc', val: p => p.brand },
];
const REL_FIELD = { id: 'rel', label: 'Best match', type: 'none', dir: 'desc', val: () => 0 };
// spec fields are derived from the same FACETS defs the filters use
function specSorts(facetDefs, facetBase, grp) {
  return facetDefs.filter(d => d.type === 'options' && ((facetBase[d.key] || {}).vals || []).length >= 2).map(d => {
    const num = facetBase[d.key].vals.every(v => typeof v === 'number');
    // a product with several values on this axis (e.g. 128/256/512 GB) sorts by
    // the end of its range that matches the direction
    const pick = (v, dir) => { const a = v.slice().sort((x, y) => num ? x - y : String(x).localeCompare(String(y))); return dir === 'asc' ? a[0] : a[a.length - 1]; };
    const one = (p, dir) => { const v = fval(p, d.key); if (v === undefined) return undefined; return Array.isArray(v) ? (v.length ? pick(v, dir) : undefined) : v; };
    return {
      id: 'facet:' + d.key, label: d.label, grp, type: num ? 'num' : 'text', dir: num ? 'desc' : 'asc', val: one,
      badge: (p, dir) => { const v = one(p, dir); return v === undefined ? null : fdisp(v, d); },
    };
  });
}
const dirWord = (fd, dir) => (fd.w || DIRW[fd.type] || DIRW.num)[dir];
const _blank = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v));
function sortList(list, fd, dir) {
  if (!fd || fd.type === 'none') return list;
  const mul = dir === 'asc' ? 1 : -1;
  return list.map((p, i) => ({ p, i, v: fd.val(p, dir) })).sort((a, b) => {
    // products with no value on this axis stay at the bottom either way
    if (_blank(a.v) || _blank(b.v)) return _blank(a.v) && _blank(b.v) ? a.i - b.i : _blank(a.v) ? 1 : -1;
    const c = fd.type === 'text' ? String(a.v).localeCompare(String(b.v), 'nb') : a.v - b.v;
    return c * mul || a.i - b.i;
  }).map(o => o.p);
}

function SortMenu({ fields, field, dir, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, []);
  const cur = fields.find(x => x.id === field) || fields[0];
  const grps = [];
  fields.forEach(fd => { const g = grps.find(x => x.t === (fd.grp || '')); if (g) g.items.push(fd); else grps.push({ t: fd.grp || '', items: [fd] }); });
  const pick = (fd, d) => { onPick(fd.id, d || (fd.id === cur.id ? dir : fd.dir)); setOpen(false); };
  return (
    <div className="fdrop sortdrop" ref={ref}>
      <button className={'fdrop__btn' + (open ? ' is-open' : '')} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(o => !o)}>
        {cur.label}<Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="fdrop__menu sortmenu">
          {grps.map(g => (
            <div className="sortmenu__grp" key={g.t}>
              {g.t && <div className="sortmenu__hd">{g.t}</div>}
              {g.items.map(fd => {
                const on = fd.id === cur.id;
                return (
                  <div key={fd.id} className={'sortopt' + (on ? ' is-on' : '')}>
                    <button className="sortopt__lbl" onClick={() => pick(fd)}>
                      <span className="sortopt__dot"><Icon name="check" size={11} /></span>{fd.label}
                    </button>
                    {fd.type !== 'none' && (
                      <span className="sortopt__dirs">
                        {['asc', 'desc'].map(d => (
                          <button key={d} className={on && dir === d ? 'is-on' : ''} title={dirWord(fd, d)} aria-label={fd.label + ': ' + dirWord(fd, d)} onClick={() => pick(fd, d)}>
                            <Icon name={d === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================
// RESULTS SCREEN
// ===========================================================
const emptyFilters = () => ({ q: '', brands: [], min: '', max: '', dom: 0, sale: false, instock: false, avail: [], facets: {} });
function Results({ go, query, cat, brick, dept, label, count, filterLayout = 'rail', density = 'comfy', sparklines = true }) {
  const [view, _setView] = useState(() => { try { const v = localStorage.getItem('pricy.view'); return v && v !== 'list' ? v : 'details'; } catch (e) { return 'details'; } });
  const setView = (v) => { _setView(v); try { localStorage.setItem('pricy.view', v); } catch (e) {} };
  // GPC scopes (Departments II): brick = one GPC sub-category, dept = curated department
  const gb = brick ? (window.brickBy || {})[brick] : null;
  const gd = dept ? (window.DEPTS || []).find(d => d.id === dept) : null;
  const catF = cat || (gb ? brickToCat(brick) : undefined); // legacy cat that drives facet defs
  const baseSel = { query, cat, brick, dept, label }; // label: catNavModel matches labeled slices; searchCatalog ignores it
  // `n` bumps when the host merges server rows into CATALOG in place (same pattern as SearchSuggest)
  const [n, bump] = useState(0);
  const baseResults = useMemo(() => searchCatalog(baseSel), [query, cat, brick, dept, n]);
  const [shown, setShown] = useState(60);
  const [loadingMore, setLoadingMore] = useState(false);
  // what the host served for the current query: real category-wide total + facet counts
  const [served, setServed] = useState({ total: null, fcounts: null, prange: null, brands: null, acounts: null });
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(() => (window.history.state || {}).rsort || 'best');
  const [dir, setDir] = useState(() => (window.history.state || {}).rdir || (SORT_FIELDS.find(s => s.id === (window.history.state || {}).rsort) || SORT_FIELDS[0]).dir);
  const [f, setF] = useState(() => {
    const st = window.history.state || {};
    if (st.rfilters) return { ...emptyFilters(), ...st.rfilters };
    const navFacets = (st.params || {}).facets;
    return navFacets ? { ...emptyFilters(), facets: navFacets } : emptyFilters();
  });
  useWatchStore();
  // filters live in the history entry so browser Back restores them
  useEffect(() => { try { window.history.replaceState({ ...window.history.state, rfilters: f, rsort: sort, rdir: dir }, ''); } catch (e) {} }, [f, sort, dir]);
  // reset filters when the search changes (skip the mount that restored them)
  const _fInit = useRef(true);
  useEffect(() => { if (_fInit.current) { _fInit.current = false; return; } setF(emptyFilters()); setShown(60); }, [query, cat, brick, dept]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  // the free-text refine narrows the base set first, so brand counts, the price range
  // and every filter below it read from what's actually matching — but a text that
  // matches nothing falls back to the unrefined set so the rail keeps real bounds
  const rToks = refineToks(f.q);
  const pool = useMemo(() => rToks.length ? baseResults.filter(p => refineMatch(p, rToks)) : baseResults, [baseResults, f.q]);
  const countPool = pool.length ? pool : baseResults;
  // data-driven facets: brick-specific defs win (BrickData.jsx), else the
  // legacy category defs (window.FACETS — replaced by the boot layer)
  const facetDefs = (brick && (window.BRICK_FACETS || {})[brick]) || (catF ? ((window.FACETS || {})[catF] || []) : []);
  // counts come from the host when it served this key (every value in the category,
  // including ones no loaded row has); otherwise from the rows we hold
  const facetBase = useMemo(() => {
    const m = {};
    facetDefs.forEach(def => {
      if (def.type !== 'options') return;
      const counts = new Map();
      // host-served counts are category-wide; once a refine text narrows the set we
      // count the rows we hold so brand and spec counts agree with each other
      const srv = !rToks.length && served.fcounts && served.fcounts[def.key];
      if (srv) srv.forEach(pair => counts.set(pair[0], pair[1]));
      else countPool.forEach(p => { const v = fval(p, def.key); if (v === undefined) return; if (Array.isArray(v)) v.forEach(x => counts.set(x, (counts.get(x) || 0) + 1)); else counts.set(v, (counts.get(v) || 0) + 1); });
      const vals = [...counts.keys()].sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'number' ? -1 : typeof b === 'number' ? 1 : String(a).localeCompare(String(b)));
      m[def.key] = { vals, counts };
    });
    return m;
  }, [countPool, cat, served, f.q]);
  const setFacet = (key, v) => setF(prev => { const cur = prev.facets[key] || []; const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]; const fac = { ...prev.facets }; if (next.length) fac[key] = next; else delete fac[key]; return { ...prev, facets: fac }; });
  const setBoolFacet = (key) => setF(prev => { const fac = { ...prev.facets }; if (fac[key]) delete fac[key]; else fac[key] = true; return { ...prev, facets: fac }; });
  const setAvail = (key) => setF(prev => ({ ...prev, avail: prev.avail.includes(key) ? prev.avail.filter(x => x !== key) : [...prev.avail, key] }));
  const availCounts = useMemo(() => { if (!rToks.length && served.acounts) return { ...served.acounts }; const m = {}; AVAIL.forEach(d => { m[d.key] = countPool.filter(d.test).length; }); return m; }, [countPool, served, f.q]);

  // the host serves the query: it merges the matching page into CATALOG and answers
  // with the category-wide total + facet counts. Debounced, page 0, mount included.
  // A search (q=) is capped at 100 rows the client already holds \u2014 never ask.
  const fKey = JSON.stringify(f);
  useEffect(() => {
    if (!window.onQuery || query) { setServed({ total: null, fcounts: null, prange: null, brands: null, acounts: null }); return; }
    let dead = false;
    const t = setTimeout(() => {
      Promise.resolve(window.onQuery({ cat, brick, dept, label, sort, dir, filters: f, page: 0 })).then(r => {
        if (dead || !r) return;
        setServed({ total: r.total != null ? r.total : null, fcounts: r.fcounts || null, prange: r.prange || null, brands: r.brands || null, acounts: r.acounts || null });
        setPage(0); setShown(60); bump(x => x + 1);
      }).catch(() => {});
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [query, cat, brick, dept, sort, dir, fKey]);

  // sortable fields = universal ones + this category's spec axes (+ relevance on a search)
  const sortFields = useMemo(() => [
    ...(query ? [REL_FIELD] : []),
    ...SORT_FIELDS,
    ...specSorts(facetDefs, facetBase, ((gb && gb.name) || catF || 'Product') + ' specs'),
  ], [query, cat, facetBase]);
  const sortField = sortFields.find(s => s.id === sort) || SORT_FIELDS[0];
  const sortDir = sortFields.some(s => s.id === sort) ? dir : sortField.dir;
  const pickSort = (id, d) => { setSort(id); setDir(d); };
  // a spec sort that doesn't exist in the new category falls back to price
  useEffect(() => { if (!sortFields.some(s => s.id === sort)) { setSort('best'); setDir('asc'); } }, [sortFields, sort]);
  const badgeOf = sortField.badge ? (p) => sortField.badge(p, sortDir) : null;

  // brand counts + price bounds cross-filter against the active facet
  // selections (a sliced brick page's pin is one), matching the served
  // fcounts convention; brand's own selection is deliberately NOT applied
  // so picking a brand keeps its siblings listed
  const brandPool = useMemo(() => {
    if (!Object.keys(f.facets).length) return countPool;
    return countPool.filter(p => facetDefs.every(def => {
      const sel = f.facets[def.key];
      if (!sel) return true;
      const v = fval(p, def.key);
      if (def.type === 'bool') return v === true;
      return v !== undefined && (Array.isArray(v) ? v.some(x => sel.includes(x)) : sel.includes(v));
    }));
  }, [countPool, fKey, facetDefs]);

  // served prange/brands are category-wide (same cross-filter convention as fcounts);
  // use them when no free-text refine narrows the set, else fall back to local rows
  const srvWide = !rToks.length;
  const prices = (srvWide && served.prange) ? null : brandPool.map(p => p.best).filter(n => n != null && isFinite(n));
  const base = {
    min: (srvWide && served.prange) ? Math.floor(served.prange[0] / 100) * 100 : (prices.length ? Math.floor(Math.min(...prices) / 100) * 100 : 0),
    max: (srvWide && served.prange) ? Math.ceil(served.prange[1] / 100) * 100 : (prices.length ? Math.ceil(Math.max(...prices) / 100) * 100 : 1000),
    cat,
    byBrand: (srvWide && served.brands) ? served.brands.reduce((m, pr) => ((m[pr[0]] = pr[1]), m), {}) : brandPool.reduce((m, p) => ((m[p.brand] = (m[p.brand] || 0) + 1), m), {}),
  };
  base.brands = Object.keys(base.byBrand).sort();
  base.cat = cat || catF;

  let list = pool.filter(p => {
    if (f.brands.length && !f.brands.includes(p.brand)) return false;
    if ((f.min || f.max) && p.best == null) return false;
    if (f.min && p.best < +f.min) return false;
    if (f.max && p.best > +f.max) return false;
    if (f.dom && (domTier(p) == null || domTier(p) < f.dom)) return false;
    if (f.sale && p.drop < 12) return false;
    if (f.instock && !p.stock) return false;
    for (const a of AVAIL) { if (f.avail.includes(a.key) && !a.test(p)) return false; }
    for (const def of facetDefs) {
      const sel = f.facets[def.key];
      if (!sel) continue;
      const v = fval(p, def.key);
      if (def.type === 'bool') { if (v !== true) return false; }
      else if (v === undefined || (Array.isArray(v) ? !v.some(x => sel.includes(x)) : !sel.includes(v))) return false;
    }
    return true;
  });
  list = sortList(list, sortField, sortDir);

  // paging: reveal 60 at a time; when the host serves a category it owns which rows
  // are in the cache and how many exist — we still sort/filter the cache locally
  const total = served.total;
  // brick/dept scopes show the category-wide count from GpcData ("N of M products")
  const catTotal = query ? undefined : (total != null ? total : gb ? (count != null ? count : gb.n) : gd ? gd.n : (cat ? metaOf()?.cats?.[cat] : undefined));
  const serverMore = total != null && total > list.length;
  const localMore = list.length > shown;
  const loadMore = async () => {
    if (localMore) { setShown(s => s + 60); return; }
    if (!serverMore || loadingMore || !window.onQuery) return;
    setLoadingMore(true);
    try {
      const r = await window.onQuery({ cat, brick, dept, label, sort, dir, filters: f, page: page + 1 });
      setPage(page + 1);
      if (r) setServed(s => ({ total: r.total != null ? r.total : s.total, fcounts: r.fcounts || s.fcounts, prange: r.prange || s.prange, brands: r.brands || s.brands, acounts: r.acounts || s.acounts }));
      bump(x => x + 1);
      setShown(s => s + 60);
    } catch (e) {}
    setLoadingMore(false);
  };

  const scope = cat ? cat : gb ? (label || gb.name) : gd ? gd.name : query ? 'these results' : 'all products';
  const title = cat ? cat : gb ? (label || gb.name) : gd ? gd.name : query ? <>Results for <span className="q">“{query}”</span></> : 'All products';
  const activeChips = [
    ...(f.q ? [{ k: 'q', label: 'name: “' + f.q + '”', clear: () => set('q', '') }] : []),
    ...f.brands.map(b => ({ k: 'brand:' + b, label: b, clear: () => set('brands', f.brands.filter(x => x !== b)) })),
    ...(f.min ? [{ k: 'min', label: 'min kr ' + fmt(+f.min), clear: () => set('min', '') }] : []),
    ...(f.max ? [{ k: 'max', label: 'max kr ' + fmt(+f.max), clear: () => set('max', '') }] : []),
    ...(f.dom ? [{ k: 'dom', label: (DOM_TIERS.find(t => t.v === f.dom) || {}).label, clear: () => set('dom', 0) }] : []),
    ...(f.sale ? [{ k: 'sale', label: 'On sale', clear: () => set('sale', false) }] : []),
    ...(f.instock ? [{ k: 'instock', label: 'In stock', clear: () => set('instock', false) }] : []),
    ...f.avail.map(k => { const d = AVAIL.find(a => a.key === k); return { k: 'avail:' + k, label: d ? d.label : k, clear: () => setAvail(k) }; }),
    ...facetDefs.flatMap(def => {
      const sel = f.facets[def.key];
      if (!sel) return [];
      if (def.type === 'bool') return [{ k: 'facet:' + def.key, label: def.label, clear: () => setBoolFacet(def.key) }];
      return sel.map(v => ({ k: 'facet:' + def.key + ':' + v, label: def.label + ': ' + fdisp(v, def), clear: () => setFacet(def.key, v) }));
    }),
  ];

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} query={query || ''} />
      <div className={'page results' + (filterLayout === 'topbar' ? ' results--topbar' : '') + (density === 'compact' ? ' is-compact' : '') + (view === 'grid' ? ' is-grid' : '')}>
        {filterLayout === 'rail' && (
          <aside className="filterscol">
            <input type="checkbox" id="fcol-open" className="fcol-open" />
            <label htmlFor="fcol-open" className="fcol-toggle">
              <Icon name="sliders-horizontal" size={15} />
              <span>Filters</span>
              {activeChips.length > 0 && <span className="fcol-n">{activeChips.length}</span>}
              <span className="fcol-chev"><Icon name="chevron-down" size={16} /></span>
            </label>
            <button type="button" className="fjump" aria-label="Jump to results" title="Jump to results" onClick={() => { const el = document.querySelector('.results__main'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 78, behavior: 'smooth' }); }}>
              <Icon name="arrow-down-to-line" size={19} />
            </button>
            <div className="filters">
              <FiltersBody f={f} set={set} base={base} baseSel={baseSel} go={go} facetDefs={facetDefs} facetBase={facetBase} setFacet={setFacet} setBoolFacet={setBoolFacet} availCounts={availCounts} setAvail={setAvail} />
            </div>
          </aside>
        )}
        <main className="results__main">
          {filterLayout === 'topbar' && <FilterBar f={f} set={set} base={base} go={go} baseSel={baseSel} facetDefs={facetDefs} facetBase={facetBase} setFacet={setFacet} setBoolFacet={setBoolFacet} availCounts={availCounts} setAvail={setAvail} />}
          <div className="results__title">
            <div className="results__ttl"><h1>{title}</h1>{gb && <GpcInfo bk={gb} />}</div>
            <RefineField value={f.q} onChange={v => { set('q', v); setShown(60); }} scope={scope} n={list.length} />
          </div>
          <div className="results__bar">
            <div className="count">{rToks.length ? <>{fmt(list.length)} {list.length === 1 ? 'product' : 'products'} matching “{f.q}”</> : catTotal != null && catTotal > list.length ? <>{fmt(list.length)} of {fmt(catTotal)} products</> : <>{fmt(list.length)} {list.length === 1 ? 'product' : 'products'}</>} · {list.reduce((t, p) => t + p.shops, 0)} offers tracked</div>
            <div className="results__sort">
              <span className="results__sortlbl">Sort</span>
              <SortMenu fields={sortFields} field={sortField.id} dir={sortDir} onPick={pickSort} />
              {sortField.type !== 'none' && (
                <button className="dirbtn" onClick={() => pickSort(sortField.id, sortDir === 'asc' ? 'desc' : 'asc')} title={'Sorted ' + dirWord(sortField, sortDir).toLowerCase() + ' \u2014 click to reverse'} aria-label={'Reverse sort order (now ' + dirWord(sortField, sortDir) + ')'}>
                  <Icon name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={13} /><span>{dirWord(sortField, sortDir)}</span>
                </button>
              )}
              <span className="results__sortlbl" style={{ marginLeft: 'var(--s-3)' }}>View</span>
              <div className="sortbar viewbar" role="group" aria-label="View mode">
                {VIEWS.map(v => <button key={v.id} className={view === v.id ? 'is-on' : ''} title={v.label} aria-label={v.label + ' view'} aria-pressed={view === v.id} onClick={() => setView(v.id)}><Icon name={v.icon} size={15} /></button>)}
              </div>
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="activechips">
              {activeChips.map(c => (
                <button key={c.k} className="fchip" onClick={c.clear}>{c.label}<Icon name="x" size={12} /></button>
              ))}
              <button className="fchip fchip--clear" onClick={() => setF(emptyFilters())}>Clear all</button>
            </div>
          )}

          {list.length === 0 ? (
            <div className="empty">
              <div className="empty__ic"><Icon name="search-x" size={40} /></div>
              {rToks.length ? (<>
                <h2>No name in {scope} matches “{f.q}”</h2>
                <p>Try fewer words — this searches product names only.</p>
                <div className="empty__acts">
                  <Btn variant="primary" onClick={() => set('q', '')}>Clear text</Btn>
                  {activeChips.length > 1 && <Btn variant="ghost" onClick={() => setF(emptyFilters())}>Clear everything</Btn>}
                </div>
              </>) : (<>
                <h2>No products match those filters</h2>
                <p>Try widening your price range or clearing a filter.</p>
                <Btn variant="primary" onClick={() => setF(emptyFilters())}>Clear filters</Btn>
              </>)}
            </div>
          ) : view === 'grid' ? (
            <div className="pgrid">
              {list.slice(0, shown).map(p => <ResultCard key={p.id} p={p} go={go} badge={badgeOf && badgeOf(p)} hl={f.q} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round((p.best || 0) * 0.92 / 10) * 10)} />)}
            </div>
          ) : view === 'compact' ? (
            <div className={'rlist rlist--compact' + (badgeOf ? ' has-sv' : '')}>
              {list.slice(0, shown).map(p => <ResultRowCompact key={p.id} p={p} go={go} badge={badgeOf && badgeOf(p)} showBadge={!!badgeOf} hl={f.q} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round((p.best || 0) * 0.92 / 10) * 10)} />)}
            </div>
          ) : (
            <div className="rlist">
              {list.slice(0, shown).map(p => <ResultRow key={p.id} p={p} go={go} spark={sparklines} badge={badgeOf && badgeOf(p)} hl={f.q} saved={WatchStore.has(p.id)} onSave={(id) => WatchStore.toggle(id, Math.round((p.best || 0) * 0.92 / 10) * 10)} />)}
            </div>
          )}
          {list.length > 0 && (localMore || serverMore) && (
            <Btn style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--s-5)' }} disabled={loadingMore} onClick={loadMore}>
              {loadingMore
                ? <React.Fragment><span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></span> Loading…</React.Fragment>
                : 'Load more'}
            </Btn>
          )}
        </main>
      </div>
    </div>
  );
}

// --- Report a problem ---------------------------------------
const REPORT_REASONS = ['Wrong price', 'Out of stock', 'Wrong product info', 'Other'];
function ReportProblemModal({ p, onClose, onDone }) {
  const [reason, setReason] = useState(null);
  const [shop, setShop] = useState((((p.offers || [])[0]) || {}).shop || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!reason || busy) return;
    setErr('');
    if (window.reportProblem) {
      setBusy(true);
      try { await window.reportProblem(p.id, shop, reason, text); }
      catch (e) { setErr((e && e.message) || 'Could not send report'); setBusy(false); return; }
    }
    onDone('Thanks \u2014 we\u2019ll look into it.');
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal report-modal" role="dialog" aria-label="Report a problem">
        <div className="modal__head">
          <b>Report a problem</b>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="report-modal__body">
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>Shop</div>
            <select className="report-modal__shop" value={shop} onChange={e => setShop(e.target.value)}>
              {p.offers.map(o => <option key={o.shop} value={o.shop}>{o.shop}</option>)}
            </select>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 6 }}>What's wrong?</div>
            <div className="report-modal__reasons" role="radiogroup" aria-label="Reason">
              {REPORT_REASONS.map(r => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} className={'report-modal__reason' + (reason === r ? ' is-on' : '')} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          </div>
          <textarea className="report-modal__text" rows={3} placeholder="Anything else we should know? (optional)" value={text} onChange={e => setText(e.target.value)}></textarea>
          {err && <div className="report-modal__err"><Icon name="alert-triangle" size={14} /> {err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={!reason || busy} onClick={submit}>{busy ? 'Sending\u2026' : 'Send report'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// PRODUCT COMPARISON PAGE (PDP)
// ===========================================================
const OFFERS_SHOWN = 5; // cheapest N shown; the rest expand on demand
function OfferRow({ o, best, totSort, go }) {
  return (
    <div className={'orow' + (best ? ' is-best' : '')}>
      <div className="orow__shop">{o.shop}<ShopChip shop={o.shop} go={go} />{best && <Tag kind="best">{totSort ? '★ Billigst totalt' : '★ Best'}</Tag>}</div>
      <div className="orow__ship">{o.ship}</div>
      <div className="orow__ship"><StockBadge state={o.stock === undefined ? 'unknown' : o.stock ? 'in' : 'out'} label={o.stock ? o.eta : undefined} />{o.updated_at ? <div className="orow__checked">checked {relTime(o.updated_at)}</div> : null}</div>
      <div className="orow__item"><Price value={o.price} size={15} /></div>
      <div className="orow__totcell">{o.total != null ? <Price value={o.total} size={15} /> : <span className="orow__tot">—</span>}</div>
      <div className="orow__buy">
        <Btn variant={best ? 'primary' : 'ghost'} size="sm" icon="external-link" disabled={!o.url} href={o.url} target="_blank" rel="noopener" title="Open in new tab"></Btn>
      </div>
    </div>
  );
}

function ProductPage({ go, id }) {
  const rv = getListing(id) ? null : resolveVariantId(id);
  const p = getListing(id) || (rv && rv.p) || CATALOG[0];
  const [sel, setSel] = useState(() => rv ? rv.sel : defaultSel(p));
  useEffect(() => { setSel(rv ? rv.sel : defaultSel(p)); }, [id]);
  const v = useMemo(() => variantListing(p, sel), [p, sel]);
  useWatchStore();
  const w = WatchStore.get(v.id);
  const [target, setTarget] = useState(w ? w.target : (v.best ? Math.round(v.best * 0.92 / 10) * 10 : ''));
  const watching = !!w;
  useEffect(() => { if (!watching) setTarget(v.best ? Math.round(v.best * 0.92 / 10) * 10 : ''); }, [v.best]);
  const dirty = watching && +target !== w.target;
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2400); };
  const [weeks, setWeeks] = useState(24);
  const RANGES = [{ w: 6, label: '6W' }, { w: 12, label: '12W' }, { w: 24, label: '24W' }];
  const histAll = v.history || [];
  const histView = histAll.slice(-weeks);
  const low = histAll.length ? Math.min(...histAll) : null;
  const [shopSel, setShopSel] = useState('all');
  useEffect(() => { setShopSel('all'); }, [id]);
  const histShops = (v.offers || []).slice(0, 6);
  const selOffer = shopSel !== 'all' ? histShops.find(o => o.shop === shopSel) : null;
  const anyHist = histShops.some(o => o.hist && o.hist.length);
  const realPts = selOffer && anyHist ? (selOffer.hist || []).slice(-weeks) : null;
  const tooShort = realPts && realPts.length < 2;
  const chartPts = selOffer ? (realPts ? realPts : genShopHist(v.idn || v.shops || 1, histShops.indexOf(selOffer), histAll, Math.max(0, selOffer.price - (v.best != null ? v.best : selOffer.price))).slice(-weeks)) : histView;
  const refPts = selOffer ? (realPts ? histView.slice(-realPts.length) : histView) : null;
  const best = (v.offers && v.offers.length) ? v.offers[0] : null;
  const shopUrl = (best && best.url) || ((v.offers || []).find(o => o.url) || {}).url;
  const [osort, setOsort] = useState('price');
  const sOffers = useMemo(() => { const os = v.offers || []; return osort === 'total' ? [...os].sort((a, b) => (a.total != null ? a.total : a.price) - (b.total != null ? b.total : b.price)) : os; }, [v, osort]);
  const bestTot = useMemo(() => { let m = null; (v.offers || []).forEach(o => { if (o.total != null && (!m || o.total < m.total)) m = o; }); return m; }, [v]);
  const oVal = (o) => (osort === 'total' && o.total != null) ? o.total : o.price;
  const [inclShip, _setIncl] = useState(w ? !!w.inclShip : false);
  useEffect(() => { _setIncl(w ? !!w.inclShip : false); }, [id, watching]);
  const onIncl = (val) => { _setIncl(val); if (WatchStore.has(v.id)) WatchStore.setInclShip(v.id, val); };
  const [buyNow, setBuyNow] = useState(false);
  const [report, setReport] = useState(false);
  // full category path(s): canonical first (breadcrumb), plus every other
  // department the product occurs in — see productPaths (GpcData.jsx)
  const paths = window.productPaths ? productPaths(p) : [];
  const main = paths[0];
  const gbk = main ? brickBy[main.nav.brick] : null;
  const _seen = new Set([p.id]);
  const _dedup = (arr) => arr.filter(x => _seen.has(x.id) ? false : (_seen.add(x.id), true));
  const more = _dedup(main ? [...brickProducts(main.nav.brick), ...(CAT_OF[p.cat] || [])] : (CAT_OF[p.cat] || [])).slice(0, 4);

  return (
    <div className="screen">
      <AppHeader go={go} onLogout={() => go('landing')} />
      <div className="page pdp">
        <div className="pdp__crumb">
          <a onClick={() => go('home')}>Home</a><Icon name="chevron-right" size={13} />
          {main && main.dept && <React.Fragment><a onClick={() => go('results', { dept: main.dept.id })}>{main.dept.name}</a><Icon name="chevron-right" size={13} /></React.Fragment>}
          <a onClick={() => go('results', main ? main.nav : { cat: p.cat })}>{main ? main.sub : p.cat}</a><Icon name="chevron-right" size={13} />
          <span style={{ color: 'var(--ink-900)' }}>{p.name}</span>
          {(paths.length > 1 || gbk) && <span className="pdp__crumb-also">
            {paths.length > 1 && <React.Fragment><span>Also in</span>{paths.slice(1).map((x, i) => <span key={i} className="pdp__crumb-alt">{x.dept && <React.Fragment><a onClick={() => go('results', { dept: x.dept.id })}>{x.dept.name}</a> › </React.Fragment>}<a onClick={() => go('results', x.nav)}>{x.sub}</a></span>)}</React.Fragment>}
            {gbk && <GpcInfo bk={gbk} r />}
          </span>}
        </div>

        <div className="pdp__top">
          <ProductGallery p={p} vlabel={v.vlabel} />
          <div className="pdp__info">
            <div className="pdp__brand">{p.brand}</div>
            <h1>{p.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', margin: '0 0 var(--s-4)', flexWrap: 'wrap' }}>
              <a className="pdp__revlink" title="Les omtaler" onClick={scrollToReviews}><Verdict p={p} traits={2} count /></a>
              {p.nc && <span className="rrow__feat">Noise cancelling</span>}
              <StockBadge state={v.unavailable ? 'out' : (p.stock ? 'in' : 'back')} />
              {specsFor(p) && <a className="pdp__speclink" onClick={scrollToSpecs}>Specifications ↓</a>}
              <CompareBtn p={p} variant="pill" />
            </div>

            <VariantPicker p={p} sel={sel} onSel={(axis, opt) => setSel(s => ({ ...s, [axis]: opt }))} onSelAll={(s) => setSel(s)} />

            <div className={'bestbox' + (v.unavailable ? ' is-na' : '')}>
              <div className="bestbox__top">
                <div>
                  <div className="label">{best ? 'Best price · ' + best.shop : 'Best price'}</div>
                  {best ? <div className="bestbox__price"><span className="cur">kr</span><span className="t-price-lg">{fmt(best.price)}</span></div> : <div className="no-offers" style={{ fontSize: 15, padding: '10px 0' }}>{v.unavailable ? 'Not sold in this combination' : 'No offers yet'}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', alignItems: 'stretch' }}>
                  {!window.HIDE_AUTOBUY && <Btn variant="dark" icon="zap" disabled={!best} title={best ? undefined : (v.unavailable ? 'No shop sells this combination' : 'No offers yet')} onClick={() => setBuyNow(true)}>Buy now</Btn>}
                  <Btn variant={window.HIDE_AUTOBUY ? 'dark' : 'ghost'} icon="external-link" disabled={!shopUrl} title={shopUrl ? undefined : 'No shop link available for this product'} href={shopUrl} target="_blank" rel="noopener">Go to shop</Btn>
                </div>
              </div>
              <div className="bestbox__bot">
                {best ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>{v.was != null && <span className="strike">was kr {fmt(v.was)}</span>}{v.drop > 0 && <span className="delta delta--down" style={{ whiteSpace: 'nowrap' }}>▼ −{v.drop}%</span>}<span className="muted">· {v.shops} shops</span></span>
                ) : <span className="muted">{v.unavailable ? 'No shop lists ' + v.vlabel + ' — pick another combination' : 'We’ll show prices as soon as a shop lists it'}</span>}
                {low != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-700)', whiteSpace: 'nowrap' }}>All-time low kr {fmt(low)}</span>}
              </div>
            </div>

            <div className="watchbox">
              <div className="watchbox__row">
                <div>
                  <div className="t-label" style={{ marginBottom: 6 }}>Alert me when price drops below</div>
                  <div className="watchbox__field">
                    <span className="cur">kr</span>
                    <input type="number" value={target} onChange={e => setTarget(+e.target.value)} />
                  </div>
                </div>
                {!watching ? (
                  <Btn variant="primary" icon="bell" disabled={!v.best || !(+target > 0)} title={v.unavailable ? 'Pick a combination a shop sells' : (!v.best ? 'No prices to watch yet' : undefined)} onClick={() => { WatchStore.add(v.id, +target || v.best || 0, inclShip); flash('Watching — we\u2019ll ping you below kr ' + fmt(+target || v.best || 0)); }}>
                    Watch price
                  </Btn>
                ) : (
                  <div className="watchbox__on">
                    {dirty ? (
                      <Btn variant="primary" icon="check" onClick={() => { WatchStore.setTarget(v.id, +target); flash('Alert updated to kr ' + fmt(+target)); }}>
                        Update alert
                      </Btn>
                    ) : (
                      <span className="watchbox__status"><Icon name="bell-ring" size={15} /> Watching</span>
                    )}
                    <button className="iconbtn danger" type="button" title="Stop watching" aria-label="Stop watching" onClick={() => { WatchStore.remove(v.id); flash('Stopped watching'); }}>
                      <Icon name="bell-off" size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div className="watchbox__incl">
                <Toggle small on={inclShip} onChange={onIncl} />
                <span>Inkluder frakt</span>
                {inclShip && v.best != null && <span className="watchbox__inclv">— sammenlignes mot kr {fmt(WatchStore.basis(v, true))} totalt</span>}
              </div>
              <div className="watchbox__listrow"><SaveMenu p={v} label="Lagre i liste…" align="left" /></div>
            </div>
            {toast && <Toast>{toast}</Toast>}

            {!window.HIDE_AUTOBUY && <AutobuyBox p={v}></AutobuyBox>}
            {buyNow && <BuyNowModal p={v} onClose={() => setBuyNow(false)}></BuyNowModal>}
            {report && <ReportProblemModal p={v} onClose={() => setReport(false)} onDone={flash}></ReportProblemModal>}
          </div>
        </div>

        <div className="pdp__grid">
          <div className={'offers' + (osort === 'total' ? ' is-tot' : '')}>
            {best && <div className="offers__bar">
              <span className="offers__sortlbl">Sortér:</span>
              <div className="seg seg--mini" role="group" aria-label="Sortér tilbud">
                <button type="button" className={osort === 'price' ? 'is-on' : ''} aria-pressed={osort === 'price'} onClick={() => setOsort('price')}>Pris</button>
                <button type="button" className={osort === 'total' ? 'is-on' : ''} aria-pressed={osort === 'total'} onClick={() => setOsort('total')}>Totalpris</button>
              </div>
            </div>}
            {best && bestTot && bestTot.shop !== best.shop && (
              <div className="offers__callout"><Icon name="truck" size={14} /><span>Billigst totalt: <b>{bestTot.shop}</b> — kr {fmt(bestTot.total)} inkl. frakt</span></div>
            )}
            <div className="offers__h"><span>Shop</span><span>Delivery</span><span>Stock</span><span style={{ textAlign: 'right' }}>Price</span><span style={{ textAlign: 'right' }}>Totalt</span><span></span></div>
            {!best && <div className="offers__empty">{v.unavailable ? 'No shop sells ' + v.vlabel + ' right now' : 'No offers yet — we’re tracking this product'}</div>}
            {sOffers.slice(0, OFFERS_SHOWN).map((o, i) => <OfferRow key={o.shop} o={o} best={i === 0} totSort={osort === 'total'} go={go} />)}
            {sOffers.length > OFFERS_SHOWN && (
              <details className="offers__more">
                <summary className="offers__toggle">
                  <Icon name="chevron-down" size={14} />
                  <span className="offers__toggle-lbl offers__toggle-lbl--more">Show {sOffers.length - OFFERS_SHOWN} more shops</span>
                  <span className="offers__toggle-lbl offers__toggle-lbl--less">Show fewer shops</span>
                  <span className="offers__toggle-hint">kr {fmt(oVal(sOffers[OFFERS_SHOWN]))} – kr {fmt(oVal(sOffers[sOffers.length - 1]))}</span>
                </summary>
                {sOffers.slice(OFFERS_SHOWN).map(o => <OfferRow key={o.shop} o={o} totSort={osort === 'total'} go={go} />)}
              </details>
            )}
            <div className="offers__foot">
              <button type="button" className="report-link" onClick={() => setReport(true)}><Icon name="flag" size={12} /> Report a problem</button>
            </div>
          </div>

          <div className="chart">
            <div className="chart__head">
              <h3 style={{ margin: 0, fontSize: 16 }}>Price history · {weeks} weeks</h3>
              <div className="chart__ranges" role="group" aria-label="Time scale">
                {RANGES.map(r => (
                  <button key={r.w} type="button" className={weeks === r.w ? 'is-active' : ''} aria-pressed={weeks === r.w} onClick={() => setWeeks(r.w)}>{r.label}</button>
                ))}
              </div>
            </div>
            {histAll.length > 0 && histShops.length > 1 && <div className="chart__shops" role="group" aria-label="Price history per shop">
              <button type="button" className={shopSel === 'all' ? 'is-on' : ''} aria-pressed={shopSel === 'all'} onClick={() => setShopSel('all')}>All shops</button>
              {histShops.filter(o => !anyHist || (o.hist && o.hist.length)).map(o => <button key={o.shop} type="button" className={shopSel === o.shop ? 'is-on' : ''} aria-pressed={shopSel === o.shop} onClick={() => setShopSel(o.shop)}>{o.shop}</button>)}
            </div>}
            {!histAll.length ? <div className="offers__empty">No price history yet</div> : tooShort ? <div className="offers__empty">Not enough price history for this shop yet</div> : <HistoryChart points={chartPts} low={low} refPoints={refPts} />}
            {histAll.length > 0 && <div className="chart__legend">
              <span><span className="dot dot--line" /> {selOffer ? 'Price at ' + selOffer.shop : 'Lowest across shops'}</span>
              {selOffer && <span><span className="dot dot--ref" /> Lowest across shops</span>}
              <span><span className="dot dot--low" /> All-time low kr {fmt(low)}</span>
            </div>}
          </div>
        </div>

        <SpecsSection p={p} sel={sel} onSel={(axis, opt) => setSel(s => ({ ...s, [axis]: opt }))}></SpecsSection>

        <ReviewSection p={p}></ReviewSection>

        <div className="sec" style={{ marginTop: 'var(--s-7)' }}>
          <div className="sec__head"><h2>More in {main ? main.sub : p.cat}</h2><span className="more" onClick={() => go('results', main ? main.nav : { cat: p.cat })}>See all <Icon name="arrow-right" size={14} /></span></div>
          <div className="pgrid">
            {more.map(x => <ResultCard key={x.id} p={x} go={go} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CATALOG, CAT_OF, getListing, searchCatalog, genOffers, genHist, applyTotals, etaFast, Results, ProductPage, ResultRow, ResultRowCompact, ResultCard, HiName, refineToks, refineMatch });
