// ===========================================================
// Pricy.no ADMIN — mock data + tiny store
// Depends on Primitives.jsx (PRODUCTS, SHOPS, fmt)
// ===========================================================
const ADMIN_ME = 'you@pricy.no';

const A_STATS = {
  kpi: [
    { l: 'Products', v: 84312, d: '+412 today', k: 'ok' },
    { l: 'Offers tracked', v: 1240966, d: '+9 118 today', k: 'ok' },
    { l: 'Webstores live', v: 96, d: '+2 this week', k: 'ok' },
    { l: 'Registered users', v: 41208, d: '+318 this week', k: 'ok' },
    { l: 'Clicks out · 24 h', v: 18421, d: '+6.2% vs 7-day avg', k: 'ok' },
    { l: 'Alerts sent · 24 h', v: 3216, d: '68% push · 32% email' },
  ],
  clicks14: [11.2, 12.4, 11.8, 13.1, 12.2, 14.6, 15.9, 13.4, 12.8, 13.9, 15.2, 16.4, 17.1, 18.4],
  searches: [
    { q: 'airpods pro', n: 1842 }, { q: 'iphone 15', n: 1511 }, { q: 'robot vacuum', n: 1204 },
    { q: 'sony xm5', n: 988 }, { q: 'air fryer', n: 833 }, { q: 'dyson v15', n: 799 },
    { q: 'garmin fenix 8', n: 412, zero: true }, { q: 'meta quest 4', n: 233, zero: true },
  ],
  health: [
    { l: 'Offers refreshed < 1 h', v: 92.4, k: 'ok' },
    { l: 'Products missing GTIN', v: 6.9, k: 'warn' },
    { l: 'Unknown stock status', v: 4.1, k: 'warn' },
    { l: 'Offers stale > 24 h', v: 1.8, k: 'bad' },
  ],
};

const A_SPECS = {
  airpods: { Type: 'In-ear', 'Noise cancelling': 'Yes', Battery: '6 h (30 h case)' },
  xm5: { Type: 'Over-ear', 'Noise cancelling': 'Yes', Battery: '30 h', Weight: '250 g' },
  switch: { Screen: '7" OLED', Storage: '64 GB', Dock: 'Included' },
  dyson: { Runtime: '60 min', Bin: '0.77 L', Filtration: 'HEPA' },
  iphone: { Storage: '128 GB', Screen: '6.1"', Chip: 'A16 Bionic' },
  tv: { Size: '55"', Panel: 'QD-OLED', Refresh: '144 Hz' },
  kindle: { Screen: '6.8"', Storage: '16 GB', Waterproof: 'IPX8' },
  lego: { Pieces: '608', Age: '18+', Series: 'Botanical Collection' },
};

const A_CATALOG = PRODUCTS.map((p, i) => ({
  id: p.id, name: p.name, brand: p.brand, cat: p.cat, icon: p.icon,
  gtin: '70325' + String(81030000 + i * 91731).slice(0, 8),
  offers: p.shops, best: p.best, upd: 6 + i * 9,
  status: p.id === 'xm5' ? 'flagged' : 'live',
  issue: p.id === 'xm5' ? 'Open price report: Power checkout price mismatch' : null,
  specs: A_SPECS[p.id] || {},
})).concat([
  { id: 'xm5-dup', name: 'Sony WH1000XM5 wireless (parallel import)', brand: 'Sony', cat: 'Audio', icon: 'headphones', gtin: '—', offers: 2, best: 2790, upd: 41, status: 'dupe', dupeOf: 'xm5', src: 'CDON feed', specs: {} },
  { id: 'd1', name: 'Garmin Fenix 8 Solar 47mm', brand: 'Garmin', cat: 'Sports', icon: 'watch', gtin: '—', offers: 1, best: 9490, upd: 112, status: 'draft', src: 'XXL feed', missing: ['GTIN', 'category mapping', 'images'], specs: {} },
  { id: 'd2', name: 'Philips OneBlade 360 Face + Body', brand: 'Philips', cat: 'Personal care', icon: 'zap', gtin: '8710103990642', offers: 1, best: 549, upd: 260, status: 'draft', src: 'Coolshop feed', missing: ['category mapping'], specs: {} },
]);

const A_USERS = [
  { id: 'u1', name: 'Mari Hansen', email: 'mari@hansen.no', plan: 'plus', joined: '14 Mar 2026', alerts: 12, lists: 4, clicks: 86, last: '14 m ago', status: 'active' },
  { id: 'u2', name: 'Jonas Berg', email: 'jonas.berg@gmail.com', plan: 'free', joined: '2 Apr 2026', alerts: 5, lists: 2, clicks: 31, last: '2 h ago', status: 'active' },
  { id: 'u3', name: 'Ingrid Solberg', email: 'ingrid@solbergfoto.no', plan: 'plus', joined: '21 Jan 2026', alerts: 23, lists: 7, clicks: 122, last: '38 m ago', status: 'active' },
  { id: 'u4', name: 'pricehunter_99', email: 'feeds@pricehunter.io', plan: 'free', joined: '19 Jun 2026', alerts: 412, lists: 0, clicks: 0, last: '6 d ago', status: 'blocked', note: 'Scraping — 40 k req/day via alerts API' },
  { id: 'u5', name: 'Kari Nilsen', email: 'kari.nilsen@outlook.com', plan: 'free', joined: '30 May 2026', alerts: 8, lists: 3, clicks: 44, last: '1 h ago', status: 'active' },
  { id: 'u6', name: 'Erik Moen', email: 'erik.moen@icloud.com', plan: 'free', joined: '8 Feb 2026', alerts: 0, lists: 1, clicks: 9, last: '12 d ago', status: 'deletion', note: 'GDPR erasure requested 19 Aug — due in 23 d' },
  { id: 'u7', name: 'Silje Dahl', email: 'silje@dahlinvest.no', plan: 'plus', joined: '4 Jul 2026', alerts: 17, lists: 5, clicks: 63, last: '3 h ago', status: 'active' },
  { id: 'u8', name: 'Ola Nordmann', email: 'ola.nordmann@gmail.com', plan: 'free', joined: '11 May 2026', alerts: 3, lists: 1, clicks: 12, last: '3 d ago', status: 'active' },
  { id: 'u9', name: 'Thomas Lie', email: 'thomas@lie.dev', plan: 'free', joined: '27 Jul 2026', alerts: 6, lists: 2, clicks: 18, last: '5 h ago', status: 'active' },
];

const A_MODS = [
  { id: 'q1', kind: 'report', user: 'Mari Hansen', time: '22 min ago', prodId: 'xm5', shop: 'Power', flag: 'Price mismatch', text: 'Prisen viser 2 999 hos Power, men i kassen blir det 3 499. Skjermbilde vedlagt.', status: 'pending' },
  { id: 'q2', kind: 'review', user: 'Trond Kristiansen', time: '1 h ago', prodId: 'xm5', rating: 4, text: 'Utrolig god støydemping og komfort. Trekker ett poeng for at de ikke tåler regn — ellers best i klassen.', status: 'pending' },
  { id: 'q3', kind: 'review', user: 'bestpricebot', time: '2 h ago', prodId: 'airpods', rating: 5, flag: 'Link spam', text: 'Beste pris finner du hos kjop-billig.ru — 50% rabatt med kode AIRPODS50!!', status: 'pending' },
  { id: 'q4', kind: 'correction', user: 'Ole Brumm', time: '4 h ago', prodId: 'kindle', field: 'GTIN', old: '0840268982157', neu: '0840268982164', text: 'Feil GTIN — dette er 2024-modellen med USB-C, ikke 2021-utgaven.', status: 'pending' },
  { id: 'q5', kind: 'report', user: 'Jonas Berg', time: '6 h ago', prodId: 'tv', shop: 'Elkjøp', flag: 'Stock mismatch', text: 'Vises som «på lager» men Elkjøp sier utsolgt i hele landet, 3–5 ukers ventetid.', status: 'pending' },
  { id: 'q6', kind: 'photo', user: 'Anna Sætre', time: 'Yesterday', prodId: 'dyson', text: 'User photo submitted for gallery — V15 with all attachments, white background.', status: 'pending' },
  { id: 'q7', kind: 'review', user: 'Petter Aas', time: 'Yesterday', prodId: 'switch', rating: 2, text: 'Skjermen ripes altfor lett i dokken. Joy-con drift etter tre måneder. Skuffet.', status: 'pending' },
  { id: 'q8', kind: 'correction', user: 'Nina Foss', time: 'Yesterday', prodId: 'lego', field: 'Category', old: 'Toys › Building sets', neu: 'Toys › Botanical Collection', text: 'Denne hører til Botanical Collection-serien.', status: 'pending' },
];

const A_MERCH = [
  { id: 'm1', stage: 'applied', name: 'Fjellsport', domain: 'fjellsport.no', org: '989 512 774', contact: 'Nora Vik', email: 'nora@fjellsport.no', applied: '2 d ago', products: 14200, feed: 'Google Shopping XML', feedUrl: 'https://fjellsport.no/feeds/google.xml' },
  { id: 'm2', stage: 'applied', name: 'Blivakker', domain: 'blivakker.no', org: '987 105 621', contact: 'Per Strand', email: 'per@blivakker.no', applied: '5 h ago', products: 22400, feed: 'JSON (custom)', feedUrl: 'https://api.blivakker.no/products.json' },
  { id: 'm3', stage: 'feed', name: 'Milrab', domain: 'milrab.no', org: '992 041 883', contact: 'Kim Rustad', email: 'kim@milrab.no', applied: '6 d ago', products: 9800, feed: 'Google Shopping XML', feedUrl: 'https://milrab.no/feed/pricy.xml', issues: ['34% of items missing GTIN', 'Invalid availability values on 1 204 items', 'VAT-included flag missing'] },
  { id: 'm4', stage: 'feed', name: 'Kjell & Company', domain: 'kjell.com', org: '556 507 291', contact: 'Sara Lind', email: 'sara.lind@kjell.com', applied: '4 d ago', products: 12600, feed: 'Google Shopping XML', feedUrl: 'https://kjell.com/no/feeds/pricy.xml', issues: [] },
  { id: 'm5', stage: 'crawl', name: 'Jollyroom', domain: 'jollyroom.no', org: '996 723 110', contact: 'Eva Holm', email: 'eva@jollyroom.no', applied: '9 d ago', products: 18200, feed: 'CSV', feedUrl: 'https://jollyroom.no/export/pricy.csv', crawl: { done: false, pct: 82, items: 15011, errs: 14 } },
  { id: 'm6', stage: 'crawl', name: 'Skousen', domain: 'skousen.no', org: '990 118 452', contact: 'Lars Bakke', email: 'lars@skousen.no', applied: '11 d ago', products: 6100, feed: 'Google Shopping XML', feedUrl: 'https://skousen.no/feeds/google.xml', crawl: { done: true, items: 6120, errs: 2, dur: '11 m 40 s' } },
  { id: 'm7', stage: 'live', name: 'XXL', domain: 'xxl.no', org: '920 594 733', contact: 'Ida Strøm', email: 'ida.strom@xxl.no', applied: '3 w ago', products: 31240, feed: 'Google Shopping XML', feedUrl: 'https://xxl.no/feeds/google.xml', liveSince: '2 d ago' },
  { id: 'm8', stage: 'live', name: 'Coolshop', domain: 'coolshop.no', org: '994 205 617', contact: 'Mads Kjær', email: 'mads@coolshop.no', applied: '4 w ago', products: 41022, feed: 'JSON (custom)', feedUrl: 'https://api.coolshop.no/no/feed.json', liveSince: '5 d ago' },
];

const okSpark = (dip) => Array.from({ length: 14 }, (_, i) => dip && i > 10 ? (i === 13 ? 0 : 40) : 94 + Math.round(Math.sin(i * 1.7) * 3) + 2);
const A_CRAWL = [
  { id: 'c1', shop: 'Elkjøp', kind: 'feed', sched: '15 min', last: 8, dur: '2 m 41 s', items: 31240, changed: 1184, errs: 0, status: 'ok', url: 'https://elkjop.no/feeds/google.xml', ok: okSpark(), log: [['12:44:02', 'Fetched feed (31 240 items, 48.2 MB)'], ['12:44:19', 'Parsed OK — 1 184 price changes, 96 new'], ['12:44:31', 'Committed to catalog']] },
  { id: 'c2', shop: 'Power', kind: 'feed', sched: '15 min', last: 4, dur: '1 m 58 s', items: 26811, changed: 942, errs: 3, status: 'ok', url: 'https://power.no/feeds/pricy.xml', ok: okSpark(), log: [['12:48:11', 'Fetched feed (26 811 items)'], ['12:48:24', '3 items skipped: malformed price'], ['12:48:29', 'Committed to catalog']] },
  { id: 'c3', shop: 'Komplett', kind: 'api', sched: '15 min', last: 11, dur: '44 s', items: 19404, changed: 611, errs: 0, status: 'ok', url: 'https://api.komplett.no/v2/products', ok: okSpark(), log: [['12:41:05', 'API sync — 611 changes'], ['12:41:49', 'Committed to catalog']] },
  { id: 'c4', shop: 'NetOnNet', kind: 'feed', sched: '1 h', last: 22, dur: '3 m 12 s', items: 14220, changed: 388, errs: 455, status: 'warn', note: 'Price parse errors on 3.2% of items since feed format change', url: 'https://netonnet.no/feeds/prisjakt.xml', ok: okSpark().map(v => v - 4), log: [['12:30:01', 'Fetched feed (14 220 items)'], ['12:31:44', 'WARN 455 items: price field uses "1.299,00" format', 'e'], ['12:33:13', 'Committed with 455 skips']] },
  { id: 'c5', shop: 'Clas Ohlson', kind: 'crawler', sched: '6 h', last: 190, dur: '38 m 07 s', items: 8102, changed: 214, errs: 12, status: 'ok', url: 'https://clasohlson.com/no/', ok: okSpark(), log: [['09:22:40', 'Crawl finished — 8 102 pages'], ['09:22:41', '12 pages 404 (discontinued)'], ['09:22:55', 'Committed to catalog']] },
  { id: 'c6', shop: 'Proshop', kind: 'feed', sched: '1 h', last: 41, dur: '2 m 05 s', items: 22090, changed: 501, errs: 1, status: 'ok', url: 'https://proshop.no/feed/google.xml', ok: okSpark(), log: [['12:11:18', 'Fetched feed (22 090 items)'], ['12:13:23', 'Committed to catalog']] },
  { id: 'c7', shop: 'CDON', kind: 'crawler', sched: '1 h', last: 132, dur: '—', items: 0, changed: 0, errs: 1, status: 'fail', note: 'HTTP 403 on /produkter since 09:12 — robots.txt changed, crawler now disallowed', url: 'https://cdon.no/produkter', ok: okSpark(true), log: [['10:12:00', 'GET /produkter → 403 Forbidden', 'e'], ['10:12:00', 'robots.txt diff: "Disallow: /produkter" added', 'e'], ['10:12:01', 'Run aborted — 3 consecutive failures', 'e'], ['10:12:01', 'Escalated: needs merchant contact or feed switch']] },
  { id: 'c8', shop: 'Dustin', kind: 'feed', sched: '6 h', last: 2880, dur: '—', items: 11480, changed: 0, errs: 0, status: 'paused', note: 'Paused by merchant request — platform migration until 24 Aug', url: 'https://dustin.no/feeds/pricy.xml', ok: okSpark(), log: [['Tue 14:02', 'Paused by mari@pricy.no (merchant request)']] },
  { id: 'c9', shop: 'XXL', kind: 'feed', sched: '15 min', last: 6, dur: '3 m 44 s', items: 31240, changed: 1502, errs: 8, status: 'ok', url: 'https://xxl.no/feeds/google.xml', ok: okSpark(), log: [['12:46:20', 'Fetched feed (31 240 items)'], ['12:50:04', 'Committed to catalog']] },
  { id: 'c10', shop: 'Coolshop', kind: 'feed', sched: '1 h', last: 55, dur: '4 m 51 s', items: 41022, changed: 1893, errs: 22, status: 'ok', url: 'https://api.coolshop.no/no/feed.json', ok: okSpark(), log: [['11:57:33', 'Fetched feed (41 022 items)'], ['12:02:24', 'Committed to catalog']] },
];

const A_FLAGS = [
  { key: 'reviews', label: 'Reviews layer', desc: 'User reviews on product pages', on: true },
  { key: 'deals', label: 'Deals hub', desc: 'Front-page deals & honesty badges', on: true },
  { key: 'scanner', label: 'Barcode scanner', desc: 'Camera scanner in mobile web app', on: true },
  { key: 'push', label: 'Push notifications', desc: 'Web push for price alerts', on: true },
  { key: 'ext', label: 'Extension prompts', desc: 'Promote browser extension on results', on: false },
  { key: 'autobuy', label: 'Auto-buy (beta)', desc: 'Automatic purchase at target price', on: false },
  { key: 'refunds', label: 'Price-guarantee refunds', desc: 'Refund claims flow (pilot)', on: false },
];

const A_AUDIT = [
  { t: '09:41', actor: 'system', action: 'Crawler alert raised', target: 'CDON — HTTP 403' },
  { t: '09:12', actor: 'jonas@pricy.no', action: 'Merchant advanced to test crawl', target: 'jollyroom.no' },
  { t: '08:55', actor: 'mari@pricy.no', action: 'Review rejected (link spam)', target: 'AirPods Pro 2' },
  { t: 'Yesterday', actor: 'jonas@pricy.no', action: 'Products merged', target: 'Samsung S90C (import) → S90C' },
  { t: 'Yesterday', actor: 'system', action: 'Feed re-validated — 3 issues', target: 'milrab.no' },
  { t: 'Tue', actor: 'mari@pricy.no', action: 'User blocked', target: 'feeds@pricehunter.io' },
];

const ADMIN = {
  stats: A_STATS, catalog: A_CATALOG, users: A_USERS, mods: A_MODS,
  merchants: A_MERCH, crawlers: A_CRAWL, flags: A_FLAGS, audit: A_AUDIT,
  banner: { on: false, text: 'Planned maintenance Sunday 02:00–04:00 — price data may lag.' },
  admins: [{ who: 'you@pricy.no', role: 'Owner' }, { who: 'mari@pricy.no', role: 'Operations' }, { who: 'jonas@pricy.no', role: 'Catalog' }],
};

const AdminStore = {
  subs: new Set(), toast: null, tn: 0,
  emit() { this.subs.forEach(f => f()); },
  // say(msg) → toast only; say(msg, action, target) → toast + audit entry
  say(msg, action, target) {
    if (action) ADMIN.audit.unshift({ t: 'just now', actor: ADMIN_ME, action, target });
    this.toast = msg; this.tn++; this.emit();
  },
};
function useAdmin() {
  const [, s] = useState(0);
  useEffect(() => { const f = () => s(x => x + 1); AdminStore.subs.add(f); return () => AdminStore.subs.delete(f); }, []);
  return ADMIN;
}
const MERCH_STAGES = [['applied', 'Applied'], ['feed', 'Feed check'], ['crawl', 'Test crawl'], ['live', 'Live']];
const A_PROD = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

Object.assign(window, { ADMIN, AdminStore, useAdmin, ADMIN_ME, MERCH_STAGES, A_PROD });
