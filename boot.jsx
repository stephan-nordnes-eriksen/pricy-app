// ===========================================================
// Production boot — replaces the prototype's final babel block
// (tweaks-panel harness + preview App). Everything above this in
// the bundle is byte-faithful synced prototype code.
//
// Adds what the design harness deliberately leaves open:
//   - real session flag (localStorage) — logged out you get Landing/
//     Login/About only; search and every app screen require login
//   - URL routing mapped onto the prototype's go(name, params)
//   - layout choices frozen to the designer's TWEAK_DEFAULTS
//     (window.TWEAK_DEFAULTS, extracted by build.js)
// ===========================================================
const T = window.TWEAK_DEFAULTS;
const PUBLIC_SCREENS = ['landing', 'login', 'about'];

// Global auto-buy visibility: the designer's hideAutobuy tweak default is the
// operator setting (flip it upstream, re-sync, deploy — build.js enforces
// wrangler.jsonc's HIDE_AUTOBUY var agrees so the Worker hides the same
// surfaces). Tests may preset window.HIDE_AUTOBUY before boot.
if (window.HIDE_AUTOBUY === undefined) window.HIDE_AUTOBUY = !!T.hideAutobuy;

// Session is real now (Phase 4b): an HttpOnly cookie the Worker owns. ME
// caches the /api/me result fetched before first render; the gating logic
// reading these two functions is unchanged from the localStorage days.
let ME = null;
function readSession() { return !!ME; }
function writeSession(v) {
  if (!v && ME) {
    ME = null;
    if (typeof fetch === 'function') fetch('/api/logout', { method: 'POST' }).catch(() => {});
  }
}

const fetchJson = (url, opts) =>
  (typeof fetch === 'function' ? fetch(url, opts) : Promise.reject(new Error('no fetch')))
    .then(r => { if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); });

function serverLogin(email, path = '/api/auth/login', password) {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(password ? { email, password } : { email }),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return data; // { error } — AuthCard shows it and stays on the form
    // fetch this user's product rows before hydrating stores — hydrateMe
    // drops watches/orders it can't resolve against the (lazy) catalog
    return fetchJson('/api/alerts').catch(() => [])
      .then(alerts => hydrateSession(data, alerts))
      .then(() => true, () => true);
  }).catch(e => { console.error('login failed:', e); return false; });
}

// Hydrate the prototype's per-user module constants in place, same seam as
// the 4a catalog: USER is a const object (assign over it), WATCHED a const
// array (splice), and WatchStore.items a plain reassignable property.
// Header badge / greeting / saved numbers derive live from WatchStore
// (hits()/saved()), so setting items is enough.
const shortDate = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function hydrateMe(me) {
  ME = me;
  Object.assign(USER, me.user);
  // hit comes from the server now: a real alert fired and the price is still
  // at/below target (worker meBody) — not the old best-vs-target guess
  WatchStore.items = (me.watches || []).map(w =>
    ({ id: w.id, target: w.target, paused: !!w.paused, hit: !!w.hit, inclShip: !!w.inclShip }));
  ListStore.lists = me.lists || []; // server lists replace the baked demo ones
  WATCHED.splice(0, WATCHED.length, ...WatchStore.items.map(w => {
    const p = WatchStore.prod(w.id);
    return p && { ...p, target: w.target, hit: w.hit, spark: (p.history || []).slice(-12) };
  }).filter(Boolean));
  // Real purchase history + the persisted fullmakt/active-orders blob replace
  // the store's demo state. New users have signed nothing → signed=false and
  // /autobuy shows the real "Auto-buy is off" ceremony.
  const ab = me.autobuy || {};
  AutobuyStore.signed = !!ab.signed;
  AutobuyStore.signedAt = ab.signedAt || null;
  if (ab.cap != null) AutobuyStore.cap = ab.cap;
  if (ab.payment) AutobuyStore.payment = ab.payment;
  AutobuyStore.orders = [
    ...(ab.orders || [])
      .filter(o => AutobuyStore.prod(o.id)) // an order for a product gone from the catalog can't render
      .map(o => ({ id: o.id, max: o.max, expires: o.expires, shops: o.shops, status: 'active' })),
    ...(me.purchases || [])
      .filter(pu => AutobuyStore.prod(pu.product_id))
      .map(pu => ({
        id: pu.product_id, max: pu.price_nok, expires: '—', shops: pu.shop, status: 'executed',
        exec: {
          shop: pu.shop, price: pu.price_nok, at: shortDate(Date.parse(pu.purchased_at)),
          ref: 'PY-' + pu.order_id, angrerett: shortDate(Date.parse(pu.purchased_at) + 14 * 864e5),
        },
      })).reverse(), // server lists newest first; in-session buys append, so keep newest last
  ];
  _autobuyEmit.call(AutobuyStore); // original emit: hydration must not PUT back what it just read
}

// Real alert history replaces the baked demo FEED — same mutate-in-place seam
// as CATALOG/WATCHED: FEED is a module const array shared with the prototype
// blocks, so splicing re-points every consumer (AlertFeedCard, FeedCard,
// ActivityFeed). "ago" is computed here from created_at, in the demo's voice.
const ago = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : d + ' days ago';
};
function hydrateFeed(rows) {
  // ponytail: the server only records price-drop alerts, so every row is
  // kind 'down'; 'up'/'watch' feed events don't exist server-side yet
  FEED.splice(0, FEED.length, ...rows.map(a => {
    const prod = WatchStore.prod(a.product_id); // a product gone from the catalog can't render
    return prod && {
      id: a.product_id, kind: 'down', title: a.product || prod.name,
      text: 'dropped to your target (kr ' + fmt(a.target) + ')',
      from: a.prev_price ?? a.price, to: a.price,
      time: ago(a.created_at), tag: 'Price drop', prod,
    };
  }).filter(Boolean));
}

function saveProfile(name) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  return fetch('/api/account', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(async r => {
    if (!r.ok) throw new Error('save failed');
    const { user } = await r.json();
    Object.assign(USER, user);
    ME.user = user;
  });
}

function changePassword(currentPassword, newPassword) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  return fetch('/api/account/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'could not change password');
    ME.user.hasPassword = true;
  });
}

// Whole-object replace per save, merged onto the last known settings — same
// seam as WatchStore.emit below. Callers (NotifSection, PrivacySection) send
// either their whole sub-object or a single-key patch; merging covers both.
function saveSettings(patch) {
  if (!ME) return Promise.reject(new Error('not signed in'));
  const next = { ...(ME.settings || {}), ...patch };
  return fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  }).then(r => { if (!r.ok) throw new Error('save failed'); ME.settings = next; });
}

// Privacy bridges (plans/account-privacy.md): the synced PrivacySection
// prefers these over its demo toast/navigate when they exist.
window.exportData = async () => {
  if (!ME) throw new Error('not signed in');
  const r = await fetch('/api/account/export');
  if (!r.ok) throw new Error('export failed');
  const url = URL.createObjectURL(await r.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: 'pricy-export.json' });
  a.click();
  URL.revokeObjectURL(url);
};

window.deleteAccount = async () => {
  if (!ME) throw new Error('not signed in');
  const r = await fetch('/api/account', { method: 'DELETE' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'could not delete account');
  ME = null; // server already expired the cookie — no logout POST needed
};

// "Report a problem" bridge (plans/report-product-error.md): the synced
// report modal awaits this when present, demo-toasts otherwise.
window.reportProblem = async (productId, shop, reason, text) => {
  if (!ME) throw new Error('not signed in');
  const r = await fetch('/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId, shop, reason, text }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'could not send the report');
};

// Every watch mutation funnels through WatchStore.emit — persist from there.
const _emit = WatchStore.emit;
WatchStore.emit = function () {
  _emit.call(this);
  if (ME && typeof fetch === 'function') {
    fetch('/api/watches', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.items.map(w => ({ id: w.id, target: w.target, paused: !!w.paused, inclShip: !!w.inclShip }))),
    }).catch(() => {});
  }
};

// Every list mutation (create/rename/remove/add/markBought/share/setGift)
// funnels through ListStore.emit — persist the whole array from there, same
// seam as WatchStore.emit above.
const _listsEmit = ListStore.emit;
ListStore.emit = function () {
  _listsEmit.call(this);
  if (ME && typeof fetch === 'function') {
    fetch('/api/lists', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.lists),
    }).catch(() => {});
  }
};

// Del mints a real share link, once per list — the minted url is cached in
// the blob (shared.url, rides the emit PUT above) because reissuing replaces
// the token server-side and would kill every previously handed-out link.
// Upstream's ShareModal still renders its demo link until it reads
// shared.url (upstream prompt in plans/list-sharing-backend.md).
const _listShare = ListStore.share;
ListStore.share = function (id) {
  const l = this.get(id);
  const cached = l && !l.system && l.shared && l.shared.url;
  const demo = _listShare.call(this, id); // ensures l.shared exists (+emit)
  if (!l || l.system) return demo;
  if (!cached && ME && typeof fetch === 'function') {
    fetchJson('/api/lists/' + encodeURIComponent(id) + '/share', { method: 'POST' })
      .then(({ url }) => { l.shared = { ...l.shared, url }; this.emit(); })
      .catch(() => {});
  }
  return cached || demo;
};

// Member surface bridges for the upstream shared-list screen (/l/<token>):
// resolve a share token to its list (products hydrated into the catalog so
// WatchStore.prod works), and toggle a bought-mark. Both reject on a dead
// link; the screen shows its own error state.
window.onSharedList = (token) =>
  fetchJson('/api/l/' + encodeURIComponent(token)).then(d => {
    hydrateCatalog({ products: d.products });
    return d;
  });
window.onSharedBought = (token, productId, bought) =>
  fetchJson('/api/l/' + encodeURIComponent(token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_id: productId, bought: !!bought }),
  });

// ── Reviews bridge (plans/folkedommen-reviews.md) ──────────────────────────
// Upstream's ReviewSection reads ReviewStore synchronously, so the PDP route
// prefetches its product's reviews (ensureRoute) and this replaces that
// product's rows in place. Server rows carry numeric ids; the store's demo/
// optimistic ids are strings, which is how the vote wrap tells them apart.
const REVIEWED = new Set(); // product ids already fetched this session
const agoNo = (ms) => {
  const d = Math.floor((Date.now() - ms) / 864e5);
  if (d < 1) return 'I dag';
  if (d === 1) return 'I går';
  if (d < 30) return d + ' dager siden';
  const mn = Math.floor(d / 30);
  return mn < 12 ? mn + ' mnd siden' : Math.floor(mn / 12) + ' år siden';
};
// server `claims` is upstream's own 'ynu' string; the store speaks the object
const mapReview = (r) => ({
  id: String(r.id), prodId: r.prodId, author: r.mine ? 'Du' : r.author,
  claims: typeof r.claims === 'string'
    ? { worth: r.claims[0], durable: r.claims[1], described: r.claims[2] }
    : (r.claims || {}),
  plus: r.plus || [], minus: r.minus || [], shop: r.shop || null,
  paid: r.paid, showPaid: !!r.showPaid, edited: !!r.edited,
  date: agoNo(r.created_at), title: r.title, body: r.body,
  helpful: r.helpful, verified: r.verified,
});
function applyReviews(pid, rows) {
  ReviewStore.items = [
    ...rows.map(mapReview),
    ...ReviewStore.items.filter(x => x.prodId !== pid),
  ];
  rows.forEach(r => ReviewStore.voted[r.voted ? 'add' : 'delete'](String(r.id)));
  ReviewStore.emit();
}
function fetchReviews(id) {
  const pid = id.split('~')[0]; // reviews hang on the head, like SPECS
  // no ME gate: on a cold PDP load ensureRoute runs BEFORE hydrateSession has
  // set ME (they're concurrent), which silently skipped the fetch and made
  // every refresh lose the reviews. The route is auth-gated anyway; logged
  // out the 401 lands in the catch.
  if (REVIEWED.has(pid)) return Promise.resolve();
  return fetchJson('/api/reviews?ids=' + encodeURIComponent(pid))
    .then(({ reviews }) => { REVIEWED.add(pid); applyReviews(pid, reviews); })
    .catch(() => {});
}
// The account tab lists ReviewStore.mine() across ALL products, which the
// per-PDP fetch can never hold. Rows merge by id so a product already loaded
// keeps its other authors, then the referenced products are fetched so
// prodOf() resolves (upstream falls back to the bare id otherwise).
let MY_REVIEWS = false;
function fetchMyReviews() {
  if (MY_REVIEWS) return Promise.resolve();
  return fetchJson('/api/reviews?mine=1').then(({ reviews }) => {
    MY_REVIEWS = true;
    const rows = reviews.map(mapReview);
    const ids = [...new Set(rows.map(r => r.prodId))];
    const fresh = new Set(rows.map(r => r.id));
    ReviewStore.items = [...rows, ...ReviewStore.items.filter(x => !fresh.has(x.id))];
    ReviewStore.emit();
    return ids.length ? fetchProducts({ ids: ids.slice(0, 100).join(',') }) : null;
  }).catch(() => {});
}
// The write modal calls add()/update() for the instant local card; the server
// upserts (create-or-edit-your-own) and the refetched canonical rows replace
// the optimistic one — which is also what dedupes an edit instead of stacking
// a second card.
function postReview(r) {
  return fetchJson('/api/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      product_id: r.prodId, claims: r.claims, plus: r.plus, minus: r.minus,
      shop: r.shop, paid: r.paid, show_paid: r.showPaid, title: r.title, body: r.body,
    }),
  }).then(({ reviews }) => applyReviews(r.prodId, reviews)).catch(() => {});
}
const _revAdd = ReviewStore.add;
ReviewStore.add = function (r) {
  _revAdd.call(this, r);
  if (ME && typeof fetch === 'function') postReview(r);
};
const _revUpdate = ReviewStore.update;
ReviewStore.update = function (id, patch) {
  const cur = this.items.find(x => x.id === id);
  _revUpdate.call(this, id, patch);
  // same create-or-edit endpoint; the patch carries no prodId, the row does
  if (ME && cur && typeof fetch === 'function') postReview({ ...cur, ...patch });
};
const _revRemove = ReviewStore.remove;
ReviewStore.remove = function (id) {
  const cur = this.items.find(x => x.id === id);
  _revRemove.call(this, id);
  if (ME && cur && /^\d+$/.test(id) && typeof fetch === 'function') {
    fetchJson('/api/reviews/' + id, { method: 'DELETE' })
      .then(({ reviews }) => applyReviews(cur.prodId, reviews)).catch(() => {});
  }
};
const _revVote = ReviewStore.vote;
ReviewStore.vote = function (id) {
  _revVote.call(this, id);
  // numeric id = a server row; the optimistic local card has no server id yet
  if (ME && /^\d+$/.test(id) && typeof fetch === 'function') {
    fetch('/api/reviews/' + id + '/vote', { method: 'POST' }).catch(() => {});
  }
};

// Every auto-buy mutation (sign/revoke/add/cancel/payment change) funnels
// through AutobuyStore.emit — persist the fullmakt + active orders from
// there, same seam as WatchStore.emit above. Executed orders are derived
// from the purchases table, so only the active ones are sent.
const _autobuyEmit = AutobuyStore.emit;
AutobuyStore.emit = function () {
  _autobuyEmit.call(this);
  if (ME && typeof fetch === 'function') {
    fetch('/api/autobuy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signed: this.signed, signedAt: this.signedAt, cap: this.cap, payment: this.payment,
        orders: this.orders.filter(o => o.status === 'active')
          .map(o => ({ id: o.id, max: o.max, expires: o.expires, shops: o.shops })),
      }),
    }).catch(() => {});
  }
};

// Buy now persists for real: POST /api/buy hits the same purchases table as
// the MCP buy_now tool, and the server-charged price/order ref win over the
// UI's snapshot. The synced BuyNowModal awaits window.buyNowApi when present;
// until that upstream contract lands, the modal ignores this and stays local.
window.buyNowApi = (p, best) => fetch('/api/buy', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: p.id, shop: best.shop }),
}).then(async r => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'purchase failed — you were not charged');
  const order = {
    id: p.id, max: data.price_nok, expires: '—', shops: data.shop, status: 'executed',
    exec: {
      shop: data.shop, price: data.price_nok, at: 'Just now', ref: 'PY-' + data.order_id,
      angrerett: shortDate(Date.now() + 14 * 864e5),
    },
  };
  AutobuyStore.orders = [...AutobuyStore.orders, order];
  AutobuyStore.emit();
  return order;
});

// Recently viewed: per-browser localStorage ids, hydrated into the prototype's
// RECENT array in place (same splice seam as CATALOG/WATCHED/FEED) so the home
// rail shows what this browser actually viewed. recordRecent fires on every
// product navigation — go() clicks via nav, direct URLs/popstate via parseUrl.
// ponytail: per-browser, not per-account; server-side views table only if
// cross-device recents ever matters
// id → hydrated product; child ids (iphone~256-blue) resolve through the
// prototype's variant seam (watch/alert/order hydration already does, via
// WatchStore.prod/AutobuyStore.prod)
function prodById(id) {
  const p = CATALOG.find(x => x.id === id);
  if (p) return p;
  const rv = resolveVariantId(id);
  return rv ? variantListing(rv.p, rv.sel) : undefined;
}
function hydrateRecent() {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem('pricy_recent')) || []; } catch {}
  RECENT.splice(0, RECENT.length, ...ids.map(prodById).filter(Boolean));
}
function recordRecent(id) {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem('pricy_recent')) || []; } catch {}
  ids = [id, ...ids.filter(x => x !== id)].slice(0, 8);
  try { localStorage.setItem('pricy_recent', JSON.stringify(ids)); } catch {}
  hydrateRecent(); // screens remount per nav, so home reads fresh RECENT
}

function parseUrl(session) {
  const p = location.pathname;
  const q = new URLSearchParams(location.search);
  let s;
  if (p.startsWith('/product/')) s = { name: 'product', params: { id: decodeURIComponent(p.slice('/product/'.length)) } };
  else if (p === '/search') s = { name: 'results', params: { query: q.get('q') || undefined, cat: q.get('cat') || undefined, dept: q.get('dept') || undefined, brick: q.get('brick') || undefined, label: q.get('label') || undefined, count: q.get('count') ? Number(q.get('count')) : undefined } };
  else if (p === '/alerts') s = { name: 'alerts', params: { tab: q.get('tab') || undefined } };
  else if (p === '/lists') s = { name: 'lists', params: { id: q.get('id') || undefined } };
  else if (p.startsWith('/l/')) s = { name: 'lists', params: { token: decodeURIComponent(p.slice('/l/'.length)) } };
  else if (p === '/shop') s = { name: 'shop', params: { shop: q.get('shop') || undefined } };
  else if (p === '/account') s = { name: 'account', params: { tab: q.get('tab') || undefined } };
  else if (p === '/about') s = { name: 'about', params: { section: q.get('section') || undefined } };
  else if (['/login', '/browse', '/autobuy', '/onboarding', '/compare'].includes(p)) s = { name: p.slice(1), params: {} };
  else s = { name: session ? 'home' : 'landing', params: {} };
  if (!session && !PUBLIC_SCREENS.includes(s.name)) s = { name: 'login', params: {} };
  // recents are recorded after ensureRoute resolves (nav/popstate/boot), not
  // here — a direct /product/:id URL must not hydrate RECENT before the row
  // is in the cache
  return s;
}

// ── Lazy catalog cache ─────────────────────────────────────────────────────
// The catalog is no longer eagerly loaded: /api/products serves slices
// (ids / q / cat / sort=drop) that hydrateCatalog merges into the
// prototype's CATALOG array, and every route prefetches what its screen
// reads before it renders. FETCHED dedupes by query string.
// ponytail: session-lifetime cache, no TTL — add staleness when prices
// moving mid-session matters.
const FETCHED = new Map();
function fetchProducts(params) {
  const qs = new URLSearchParams(Object.entries(params).sort()).toString();
  if (FETCHED.has(qs)) return FETCHED.get(qs);
  const p = fetchJson('/api/products' + (qs ? '?' + qs : '')).then(hydrateCatalog)
    .catch(e => { FETCHED.delete(qs); throw e; }); // retry on next nav
  FETCHED.set(qs, p);
  return p;
}

// What each screen reads synchronously at render — fetched (and merged)
// before setScreen. Never rejects: a failed fetch falls back to whatever
// the cache (or the baked demo catalog) already has, like today.
function ensureRoute(name, params = {}) {
  const wants = [];
  if (name === 'home') wants.push({ top: 'drop', limit: 3 }); // "Biggest drops" sidecard
  // the list screens mirror Results' own default sort (SORT_FIELDS[0], price
  // ascending) — the screen re-queries with its sort on mount, and a prefetch
  // of a different slice would just be a second 400-row fetch per visit
  else if (name === 'results' && (params.brick || params.dept)) return gpcRoute(params);
  else if (name === 'results') wants.push(params.query ? { q: params.query } : listQuery({ cat: params.cat, sort: 'best', dir: 'asc' }));
  // server adds family + same-cat neighbors; reviews ride the same prefetch
  else if (name === 'product') return Promise.all([fetchProducts({ ids: params.id }).catch(() => {}), fetchReviews(params.id)]);
  // browse renders per-cat top drops + global top-4 from the cache; counts
  // and category presence come from the served meta.cats (upstream synced)
  else if (name === 'browse') wants.push({ top: 'drop', perCat: 1, limit: 4 });
  // any served slice: a cold /shop deep-link must run the live purge (demo
  // SHOP_META stars) and land meta.shopStats before ShopPage renders.
  // ponytail: rows shown are whatever the cache holds — a shop= product
  // query doesn't exist server-side
  else if (name === 'shop') wants.push({ top: 'drop', limit: 3 });
  // the "My reviews" tab reads ReviewStore.mine() synchronously, like the PDP
  else if (name === 'account') return fetchMyReviews();
  else if (name === 'compare') {
    const first = CompareStore.prods()[0];
    if (first) wants.push({ cat: first.cat }); // CmpAdd candidates are same-category
  }
  return Promise.all(wants.map(w => fetchProducts(w).catch(() => {})));
}

// GPC scopes (brick/dept) prefetch their backing category slices. The
// brick→cat mapping lives in the served registry (meta.depts, on every
// /api/products response) — a cold deep-link resolves it off home's cheap
// drops slice first. Never rejects, like ensureRoute's other wants.
// ponytail: a dept prefetches only its 2 biggest backing cats (400-row
// pages each); the rest hydrate as the shopper narrows.
async function gpcRoute(params) {
  if (!CATALOG.meta?.depts) await fetchProducts({ top: 'drop', limit: 3 }).catch(() => {});
  const counts = CATALOG.meta?.cats || {};
  const rules = (CATALOG.meta?.depts || []).flatMap(d => params.dept ? (d.id === params.dept ? d.rules : []) : d.rules.filter(r => r.b === params.brick));
  // a sliced brick prefetches its pinned slice — the same query the screen's
  // mount onQuery sends (pin seeded via gpcParams), so it lands as a FETCHED hit
  const pin = params.brick ? rules[0]?.facets : undefined;
  const cats = [...new Set(rules.map(r => r.cat).filter(Boolean))].sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).slice(0, 2);
  await Promise.all(cats.map(c => fetchProducts(listQuery({ cat: c, sort: 'best', dir: 'asc', filters: pin ? { facets: pin } : {} })).catch(() => {})));
}

// A sliced brick navigates with its registry pin as a real filter selection:
// Results seeds f.facets from history.state.params.facets (the same seam
// Browse's sub-chips use), so the pin filters the client pool, renders
// checked in the rail, and rides onQuery to the server as ordinary facets —
// no GPC-specific query path anywhere. Deep copy: Results must never share
// object identity with the registry.
function gpcParams(name, params) {
  if (name !== 'results' || !params.brick || params.facets) return params;
  const r = (CATALOG.meta?.depts || []).flatMap(d => d.rules).find(x => x.b === params.brick);
  return r?.facets ? { ...params, facets: JSON.parse(JSON.stringify(r.facets)) } : params;
}

// PDP breadcrumb paths (upstream productPaths, GpcData.jsx): the demo version
// resolves via PRODMAP, which hydrateCatalog empties — so with the served
// registry in, derive paths from meta.depts instead: every rule backing
// p.cat, slices only when the product's own facet value confirms the pin
// (upstream's honesty rule; values are exact facetrules vocabulary, so no
// case folding), finest match first so the breadcrumb prefers Dept › Slice
// over Dept › whole category.
const demoPaths = window.productPaths;
window.productPaths = (p) => {
  const depts = CATALOG.meta?.depts;
  if (!depts) return demoPaths(p);
  const out = [];
  for (const d of depts) for (const r of d.rules) {
    if (r.cat !== p.cat) continue;
    if (r.facets) {
      const ok = Object.entries(r.facets).every(([k, want]) => {
        const v = window.fval && fval(p, k);
        return v !== undefined && [].concat(v).some(x => want.includes(x));
      });
      if (!ok) continue;
      out.unshift({ dept: d, sub: r.name, nav: { brick: r.b, ...(r.n != null ? { count: r.n } : {}) } });
    } else out.push({ dept: d, sub: r.name, nav: { brick: r.b } });
  }
  return out;
};

// Login-time hydration: hydrateMe/hydrateFeed/hydrateRecent all resolve ids
// against the catalog and silently drop what they can't find — so fetch
// every product the session references in ONE ids= batch first.
function hydrateSession(me, alerts) {
  let recents = [];
  try { recents = JSON.parse(localStorage.getItem('pricy_recent')) || []; } catch {}
  const ids = [...new Set([
    ...(me.watches || []).map(w => w.id),
    ...((me.autobuy || {}).orders || []).map(o => o.id),
    ...(me.purchases || []).map(pu => pu.product_id),
    ...(alerts || []).map(a => a.product_id),
    ...(me.lists || []).flatMap(l => l.items || []),
    ...recents,
  ])].filter(Boolean).slice(0, 100); // ponytail: server cap; page the batch if a session ever tops it
  return (ids.length ? fetchProducts({ ids: ids.join(',') }).catch(() => {}) : Promise.resolve())
    .then(() => {
      hydrateMe(me);
      hydrateFeed(alerts || []);
      hydrateRecent();
    });
}

// Live header suggestions over the lazy cache: SearchSuggest (upstream)
// calls window.onSuggestData(q, refresh) per keystroke — debounce a
// /api/products?q= fetch and refresh the dropdown once rows merge. The
// return value is the effect's cleanup, so a superseded keystroke cancels
// its own timer.
window.onSuggestData = (q, refresh) => {
  const s = String(q || '').trim();
  if (s.length < 2) return undefined;
  const t = setTimeout(() => fetchProducts({ q: s }).then(refresh).catch(() => {}), 200);
  return () => clearTimeout(t);
};

// Results' whole query — category, sort, filters, page — travels to the
// server (upstream calls this on every change and for "Load more"), so the
// page it serves is the page the screen shows. Sorting and filtering stay
// client-side over the merged cache; this only decides WHICH rows are in it,
// which is the difference between "cheapest of the 400 loaded" and cheapest
// in the category. `total` and `fcounts` are the two numbers the screen can't
// compute from a partial cache — they come back per query, never off
// CATALOG.meta (any later ids=/q= fetch replaces that wholesale).
const PAGE = 400; // worker PAGE_MAX
const listQuery = ({ cat, sort, dir, filters: f = {}, page = 0 }) => ({
  ...(cat ? { cat } : {}),
  ...(sort ? { sort, dir: dir || 'asc' } : {}),
  // the rail's free-text refine (name only) — `name=`, not `q=`, which is the
  // header's blob search; without it the refine would see one 400-row page
  ...(f.q ? { name: f.q } : {}),
  ...(f.brands && f.brands.length ? { brand: f.brands.slice().sort().join(',') } : {}),
  ...(f.min ? { min: f.min } : {}), ...(f.max ? { max: f.max } : {}),
  ...(f.dom ? { dom: f.dom } : {}), // Folkedommen tier 1–3, not a star count
  ...(f.sale ? { sale: 1 } : {}),
  // availability (PROMPT 01): upstream's f.avail keys map onto query params —
  // 'instock' shares the legacy instock= param, 'fast' is the fixed ≤2-days def
  ...(f.instock || (f.avail || []).includes('instock') ? { instock: 1 } : {}),
  ...((f.avail || []).includes('freeship') ? { freeship: 1 } : {}),
  ...((f.avail || []).includes('fast') ? { maxeta: 2 } : {}),
  // sorted keys so the same selection is the same FETCHED cache entry
  ...(f.facets && Object.keys(f.facets).length ? { facets: JSON.stringify(Object.fromEntries(Object.entries(f.facets).sort())) } : {}),
  limit: PAGE, offset: page * PAGE,
});
// A 1–2 letter refine matches nearly the whole catalog — "e" on Toys is 1,309
// of its 1,387 rows — so every early keystroke merged a fresh 400-row page and
// left the screen recounting its facets over all of them. Measured on prod the
// SERVER is not the problem (`name=e` is 327 ms, the same as the unrefined
// listing); the round trip and the merge it triggers are. So hold anything
// shorter than REFINE_MIN past upstream's own 250 ms debounce: the third
// character supersedes it and nothing is ever fetched for "e" or "es". A held
// call resolves `null`, which is the contract upstream already has
// (`if (dead || !r) return`). "Load more" is a click, not a keystroke — never
// held, or the button would stall for half a second.
const REFINE_MIN = 3, REFINE_HOLD = 400;
// GPC scopes translate to the backing cat= via the served registry (every
// brick backs exactly one cat; a dept only when all its rules agree).
// Resolving null is upstream's "host can't serve this scope" contract — the
// screen falls back to client-side sort/filter over the cache, as before.
// ponytail: multi-cat "All <dept>" pages stay client-side; serving them
// needs a cat-set query the worker doesn't have.
const scopeCat = (q) => {
  if (!q.brick && !q.dept) return q.cat;
  const rules = (CATALOG.meta?.depts || []).flatMap(d => q.dept ? (d.id === q.dept ? d.rules : []) : d.rules.filter(r => r.b === q.brick));
  const cats = [...new Set(rules.map(r => r.cat).filter(Boolean))];
  return cats.length === 1 ? cats[0] : undefined;
};
let held = null;
window.onQuery = (q) => {
  if (held) { clearTimeout(held.t); held.res(null); held = null; }
  const cat = scopeCat(q);
  if ((q.brick || q.dept) && !cat) return Promise.resolve(null);
  const go = () => fetchProducts(listQuery({ ...q, cat })).then(d => ({ total: (d.meta || {}).total, fcounts: (d.meta || {}).fcounts, prange: (d.meta || {}).prange, brands: (d.meta || {}).brands, acounts: (d.meta || {}).acounts }));
  const n = String((q.filters || {}).q || '').trim().length;
  if (q.page || !n || n >= REFINE_MIN) return go();
  return new Promise(res => { held = { res, t: setTimeout(() => { held = null; res(go()); }, REFINE_HOLD) }; });
};

function toUrl(name, params = {}) {
  if (name === 'product') return '/product/' + encodeURIComponent(params.id);
  if (name === 'results') {
    const q = new URLSearchParams();
    if (params.query) q.set('q', params.query);
    if (params.cat) q.set('cat', params.cat);
    if (params.dept) q.set('dept', params.dept);
    if (params.brick) q.set('brick', params.brick);
    if (params.label) q.set('label', params.label);
    if (params.count != null) q.set('count', params.count);
    const s = q.toString();
    return '/search' + (s ? '?' + s : '');
  }
  if (name === 'shop') return '/shop' + (params.shop ? '?shop=' + encodeURIComponent(params.shop) : '');
  if (name === 'alerts') return '/alerts' + (params.tab ? '?tab=' + encodeURIComponent(params.tab) : '');
  if (name === 'lists') return params.token ? '/l/' + encodeURIComponent(params.token) : '/lists' + (params.id ? '?id=' + encodeURIComponent(params.id) : '');
  if (name === 'account') return '/account' + (params.tab ? '?tab=' + encodeURIComponent(params.tab) : '');
  if (name === 'about') return '/about' + (params.section ? '?section=' + encodeURIComponent(params.section) : '');
  if (name === 'home' || name === 'landing') return '/';
  return '/' + name;
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (this.state.e) return <pre style={{ padding: 24, font: '13px monospace', color: '#c0362c', whiteSpace: 'pre-wrap' }}>{String(this.state.e.stack || this.state.e)}</pre>;
    return this.props.children;
  }
}

function App() {
  const [session, setSessionState] = useState(readSession);
  const setSession = (v) => { writeSession(v); setSessionState(v); };
  const [screen, setScreen] = useState(() => parseUrl(readSession()));
  const [plan, setPlan] = useState(T.plan);
  window.PLAN = plan;
  window.setPlan = setPlan;

  // navigate without the auth gate (used right as auth state flips).
  // Async: the route's catalog slice is fetched (and merged) before the
  // screen swaps — screens read CATALOG synchronously at render. The
  // previous screen keeps showing for the fetch window; navSeq drops a
  // slow fetch's navigation when a newer one won the race.
  const nav = (name, params = {}) => {
    const t = ++navSeq;
    ensureRoute(name, params).then(() => {
      if (t !== navSeq) return;
      if (name === 'product') recordRecent(params.id); // after the fetch: prodById needs the row
      params = gpcParams(name, params); // after ensureRoute: needs the served registry
      const url = toUrl(name, params);
      // mirror upstream AppRouter: park scrollY on the outgoing entry so Back
      // restores it, and carry {name, params} on the new entry — Results seeds
      // its facet filters from history.state.params (Browse sub-chips)
      if (url !== location.pathname + location.search) {
        try { history.replaceState({ ...history.state, scrollY: window.scrollY }, ''); } catch (e) {}
        history.pushState({ name, params }, '', url);
      }
      window.scrollTo(0, 0);
      setScreen({ name, params });
    });
  };
  const go = (name, params = {}) => {
    // "log in" links act as logout; signed-in landing is only reachable via
    // the account menu's Log out / account deletion, so it ends the session
    if (name === 'login' || (name === 'landing' && session)) setSession(false);
    if (name !== 'login' && !session && !PUBLIC_SCREENS.includes(name)) { name = 'login'; params = {}; }
    nav(name, params);
  };
  // AuthCard hands us the attempt as onAuthed(email, {signup, password}) and
  // awaits the verdict: resolve strictly `true` = we set the session and
  // navigated; `false` or `{error}` = it shows its own error and stays.
  // Null email = fake BankID → shared demo account (the only passwordless
  // signup the server still accepts); everything else is real password auth
  // checked server-side (worker/index.js verifyPassword). Magic links never
  // come through here — the driver effect below owns that flow.
  const onAuthed = (email, opts) => {
    const signup = !!(opts && opts.signup);
    const password = opts && opts.password;
    return serverLogin(email || 'demo@pricy.no', signup || !email ? '/api/auth/signup' : '/api/auth/login', password)
      .then(ok => {
        if (ok === true) { setSession(true); nav(signup ? 'onboarding' : 'home'); }
        return ok;
      });
  };

  // Magic-link driver: the synced AuthCard only *renders* the waiting screen
  // (submit never reaches onAuthed for magic links), so the DOM is the seam.
  // While `.authcard .addr` shows an email we own the real work: POST
  // /api/auth/request for it, re-POST on "Resend link" clicks, and poll
  // /api/me every 3s (~10 min cap) until the emailed link is clicked in
  // another tab — the cookie jar is shared, so this tab picks the session up.
  // ponytail: same-browser pickup only. A link clicked on another device logs
  // that device in; handing the waiting tab a session too would need a
  // pollable claim token, which lets whoever *requested* the link steal the
  // session of whoever *clicked* it — deliberately not built.
  useEffect(() => {
    if (screen.name !== 'login' || session) return;
    let sentTo = null, iv = null, polls = 0, done = false;
    const requestLink = (email) => fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    const poll = () => {
      if (done || ++polls > 200) { clearInterval(iv); iv = null; return; }
      fetchJson('/api/me').then(me => {
        if (done || !me || !me.user) return;
        done = true;
        fetchJson('/api/alerts').catch(() => [])
          .then(alerts => hydrateSession(me, alerts))
          .then(() => { setSession(true); nav('home'); });
      }).catch(() => {});
    };
    const check = () => {
      const addr = document.querySelector('.authcard .addr');
      const email = (addr && addr.textContent.trim()) || null;
      if (email === sentTo) return;
      sentTo = email;
      polls = 0;
      if (iv) { clearInterval(iv); iv = null; }
      if (email) { requestLink(email); iv = setInterval(poll, 3000); }
    };
    const onResend = (e) => {
      const a = e.target.closest && e.target.closest('.authcard .auth-foot a');
      if (sentTo && a && /^Resend/.test(a.textContent)) requestLink(sentTo);
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { subtree: true, childList: true });
    document.addEventListener('click', onResend);
    check();
    return () => { mo.disconnect(); if (iv) clearInterval(iv); document.removeEventListener('click', onResend); };
  }, [screen.name, session]);

  useEffect(() => {
    const onPop = () => {
      const s = parseUrl(readSession());
      const t = ++navSeq;
      const scrollY = (history.state && history.state.scrollY) || 0;
      ensureRoute(s.name, s.params).then(() => {
        if (t !== navSeq) return;
        if (s.name === 'product') recordRecent(s.params.id);
        // an entry without params state (pre-boot deep link) gets the pin
        // seeded here; entries pushed by nav() already carry it — and their
        // rfilters (the user's own edits) must win, so never overwrite
        if (!(history.state || {}).params) try { history.replaceState({ ...history.state, name: s.name, params: gpcParams(s.name, s.params) }, ''); } catch (e) {}
        setScreen(s);
        // after the async swap renders (upstream AppRouter does the same double-rAF)
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const { name, params } = screen;
  let view;
  if (name === 'login') view = <Login onAuthed={onAuthed} go={go} layout={T.loginLayout} />;
  else if (name === 'landing') view = <Landing go={go} />;
  else if (name === 'results') view = <Results go={go} query={params.query} cat={params.cat} brick={params.brick} dept={params.dept} label={params.label} count={params.count} filterLayout={T.filterLayout} density={T.density} sparklines={T.sparklines} />;
  else if (name === 'product') view = <ProductPage go={go} id={params.id} />;
  else if (name === 'compare') view = <ComparePage go={go} />;
  else if (name === 'shop') view = <ShopPage go={go} shop={params.shop} />;
  else if (name === 'browse') view = <BrowsePage go={go} />;
  else if (name === 'alerts') view = <AlertsPage go={go} tab={params.tab} />;
  else if (name === 'lists') view = <ListsPage go={go} params={params} />;
  else if (name === 'account') view = <AccountPage go={go} tab={params.tab} me={ME} onSaveProfile={saveProfile} onSaveSettings={saveSettings} onChangePassword={changePassword} />;
  else if (name === 'autobuy' && !window.HIDE_AUTOBUY) view = <AutobuyPage go={go} />;
  else if (name === 'onboarding') view = <Onboarding go={go} onFinish={({ notif }) => saveSettings(notif).catch(() => {})} />;
  else if (name === 'about') view = <AboutPage go={go} section={params.section} />;
  else view = <SignedHome go={go} onLogout={() => go('landing')} layout={T.homeLayout} />;

  // Mirrors the prototype's App router (AppRouter.jsx), which renders the
  // shared Footer inside the keyed div on every screen except login/landing/
  // about (they inline their own authed={false} one) and onboarding. That
  // render lives in the harness block build.js discards, so it must be
  // mirrored here by hand — see the sync note in CLAUDE.md. No session check
  // needed: without one, every non-public screen is already gated to login.
  // CompareTray mirrors the harness too: hidden on the same public screens
  // plus the compare page itself.
  return <div className="app-shell" key={name + JSON.stringify(params)}>{view}{!({ login: 1, landing: 1, about: 1, onboarding: 1 })[name] && <Footer go={go} />}<CompareTray go={go} hidden={!!({ login: 1, landing: 1, about: 1, onboarding: 1, compare: 1 })[name]} /></div>;
}

// Catalog is served, not baked — and lazy: hydrateCatalog MERGES a
// /api/products slice into the prototype's module constants in place. This
// bundle shares one esbuild scope with the prototype blocks, so CATALOG and
// CAT_OF (the only load-time derived index) are directly in scope;
// getListing, searchCatalog and ALL_BRANDS read CATALOG live and follow
// automatically. window.CATALOG is the same array object, so it stays in
// sync too.
let navSeq = 0; // async-nav race token (nav + popstate share it)
// returns the payload so fetchProducts' callers can read per-query meta
// (total/fcounts) that must NOT live on CATALOG.meta — see window.onQuery
// id → row for the merged cache. Stale-proofed on CATALOG.length rather than
// kept eagerly: the array is shared with sync-owned prototype code.
function catIndex() {
  if (CATALOG.length !== catIndex.len) { catIndex.ix = new Map(CATALOG.map(p => [p.id, p])); catIndex.len = CATALOG.length; }
  return catIndex.ix;
}
function hydrateCatalog(data) {
  // body is {meta, products}; a bare array (older stubs) still works
  const rows = Array.isArray(data) ? data : data.products;
  if (!hydrateCatalog.live) {
    // first served payload: drop the baked demo catalog — merged real rows
    // must never sit next to fake demo prices in search/facets
    hydrateCatalog.live = true;
    CATALOG.length = 0;
    // Reviews layer: the baked demo reviews and shop ratings are fake trust
    // signals keyed on real served ids — same honesty rule. Real reviews
    // hydrate per PDP (fetchReviews); shop profiles stay dark until upstream
    // renders the served objective stats (plans/reviews-layer.md v1).
    // Purge DEMO rows only (string ids) — on a cold PDP load fetchReviews
    // races this first payload, and its landed server rows (numeric ids,
    // same discriminator as the vote wrap) must survive the purge.
    ReviewStore.items = ReviewStore.items.filter(r => /^\d+$/.test(r.id));
    Object.keys(SHOP_META).forEach(k => delete SHOP_META[k]);
  }
  // 4e: variant children (meta.family) stay out of CATALOG/CAT_OF — search,
  // results and browse are head-only; each head instead gets
  // p.listings = { comboKey: childRow }, which the prototype's
  // variantListing/variantBest prefer over their synth fallback.
  // Heads first, then children: a child's head may ride the same payload.
  // Existing rows are mutated in place (Object.assign) so references held
  // by WATCHED/RECENT/listings stay live.
  // Indexed by id, because this used to be CATALOG.find() per incoming row —
  // O(page x cache), and the cache grows all session. Merging one 400-row page
  // measured 2.5 ms into a fresh cache but 36 ms once it held 14k rows (Node;
  // a browser is slower), synchronously, on every landed query — which is what
  // made typing in the refine box feel worse the longer you had been browsing.
  // Indexed: 1.9 ms at 14k. Rebuilt whenever CATALOG's length moved under us,
  // so a future upstream that pushes rows itself can't leave a stale index.
  const ix = catIndex();
  const upsert = (r) => {
    const cur = ix.get(r.id);
    if (cur) return Object.assign(cur, r);
    CATALOG.push(r); ix.set(r.id, r); catIndex.len = CATALOG.length;
    return r;
  };
  rows.filter(r => !r.family).forEach(r => {
    const row = upsert(r);
    // the baked demo byId (AppData) overlaps served ids and WatchStore.prod
    // prefers it — re-point overlapping entries at the served row so demo
    // prices can never shadow real ones (unserved ids keep the demo row:
    // the public landing/login art reads byId.tv / byId.xm5)
    if (byId[row.id]) byId[row.id] = row;
    if (r.specs) SPECS[r.id] = r.specs; // served specs win — specsFor reads SPECS[p.id]
  });
  rows.filter(r => r.family).forEach(r => {
    if (r.specs) SPECS[r.id] = r.specs;
    const head = ix.get(r.family);
    if (head) (head.listings = head.listings || {})[r.id.slice(r.id.indexOf('~') + 1)] = r;
  });
  // served meta always wins — never recompute totals from the partial
  // cache; the recompute only backfills legacy bare-array stubs
  if (!Array.isArray(data) && data.meta) CATALOG.meta = data.meta;
  else if (!CATALOG.meta) {
    CATALOG.meta = {
      products: CATALOG.length,
      shops: new Set(CATALOG.flatMap(p => (p.offers || []).map(o => o.shop))).size,
      freshest: CATALOG.flatMap(p => (p.offers || []).map(o => o.updated_at)).filter(Boolean).sort((a, b) => a - b).pop() || null,
    };
  }
  // Per-shop objective stats (offers tracked, price freshness) for the
  // future served ShopPage — upstream still reads demo SHOP_META, which is
  // emptied above; this is the honest replacement it will switch to.
  if (CATALOG.meta?.shopStats) window.SHOP_STATS = CATALOG.meta.shopStats;
  // Dynamic categories: server cats the prototype doesn't know join
  // CATEGORIES in place (same array object as window.CATEGORIES, so every
  // lexical reader — browse tiles, header menu, suggest, onboarding — sees
  // them); tile icons ride meta.icons, upstream's own entries win.
  Object.keys(CATALOG.meta?.cats || {}).forEach(c => {
    if (!CATEGORIES.includes(c)) { CATEGORIES.push(c); CAT_ICONS[c] = CATALOG.meta.icons?.[c] || 'tag'; }
  });
  // Facet registry: served worker/facets.json replaces the baked upstream
  // demo FACETS in place (guarded — no-op until the prototype defines it).
  if (window.FACETS && CATALOG.meta?.facets) {
    Object.keys(window.FACETS).forEach(k => delete window.FACETS[k]);
    Object.assign(window.FACETS, CATALOG.meta.facets);
  }
  // GPC departments: the served registry (worker/depts.json) replaces
  // GpcData's demo layer in place — DEPTS/brickBy/ALL_BRICKS/BRICK_CAT/
  // BRICK_DEPT are shared top-level consts, so mutate, never reassign.
  // Rule counts join with meta.cats (each rule backs one whole cat).
  // PRODMAP/CLS_CAT are emptied: the demo ids ARE served ids, and a stale
  // PRODMAP direct match would pin a brick page to the handful of demo rows
  // instead of the whole backing category (brickProducts prefers direct).
  if (window.DEPTS && CATALOG.meta?.depts && CATALOG.meta?.cats) {
    const counts = CATALOG.meta.cats;
    DEPTS.length = 0; ALL_BRICKS.length = 0;
    // BRICK_FACETS too: the registry reuses demo brick codes, and a demo
    // per-brick def would shadow the served FACETS[cat] defs whose keys are
    // what the served fcounts speak
    for (const o of [brickBy, PRODMAP, BRICK_CAT, CLS_CAT, BRICK_DEPT, window.BRICK_FACETS || {}]) Object.keys(o).forEach(k => delete o[k]);
    for (const d of CATALOG.meta.depts) {
      const dep = { id: d.id, name: d.name, icon: d.icon, rules: [], n: 0, segs: [] };
      for (const r of d.rules) {
        const [seg = '', fam = '', cls = ''] = String(r.path || '').split(' › ');
        // sliced rules (r.facets) carry their cron-computed n; whole-cat rules
        // join the live cats histogram. A slice never adds to dep.n — its rows
        // already sit inside its whole-cat sibling (build.js enforces one).
        const n = r.facets ? (r.n ?? 0) : (counts[r.cat] || 0);
        const bk = { code: r.b, name: r.name, icon: r.icon, n, syn: r.syn || [], seg: { code: r.b, name: seg, icon: r.icon }, fam: { name: fam }, cls: { code: r.b, name: cls, bricks: [] } };
        brickBy[r.b] = bk; ALL_BRICKS.push(bk);
        BRICK_CAT[r.b] = r.cat;
        if (!BRICK_DEPT[r.b]) BRICK_DEPT[r.b] = dep;
        dep.rules.push(r.facets && r.n != null ? { b: r.b, n: r.n } : { b: r.b });
        if (!r.facets) dep.n += n;
      }
      DEPTS.push(dep);
    }
  }
  Object.keys(CAT_OF).forEach(k => delete CAT_OF[k]);
  CATALOG.forEach(p => { (CAT_OF[p.cat] = CAT_OF[p.cat] || []).push(p); });
  return data;
}

// Add-to-home-screen: registering the SW is what makes Chrome/Android offer
// "Install app" (iOS installs off the manifest alone). Fire-and-forget —
// nothing in the app depends on it, and jsdom/file:// have no serviceWorker.
navigator.serviceWorker?.register('/sw.js').catch(() => {});

// Web Push: iOS only exposes Notification/PushManager inside an installed
// (home-screen) web app, so the guards double as the platform gate; Android
// Chrome exposes them everywhere. Permission already granted → re-subscribe
// silently (endpoints rotate). Not asked yet → a one-tap chip, because
// requestPermission must run in a user gesture. Denied → nothing to do.
function setupPush() {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  const subscribe = async () => {
    const [reg, { key }] = await Promise.all([navigator.serviceWorker.ready, fetchJson('/api/push/key')]);
    if (!key) return;
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await fetchJson('/api/push/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub),
    });
  };
  if (Notification.permission === 'granted') { subscribe().catch(() => {}); return; }
  if (Notification.permission !== 'default') return;
  // ponytail: plain DOM chip, not an upstream component — one tap resolves the
  // permission either way, after which it never renders again. Moves into the
  // prototype's notification settings when that screen grows a push toggle.
  const btn = document.createElement('button');
  btn.textContent = '🔔 Slå på varsler';
  btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:60;padding:10px 16px;border:0;border-radius:999px;background:#111;color:#fff;font:600 14px system-ui;box-shadow:0 2px 12px rgba(0,0,0,.25);cursor:pointer';
  btn.onclick = async () => {
    btn.remove();
    try {
      if (await Notification.requestPermission() === 'granted') {
        await subscribe();
        // tapping the chip IS the opt-in: flip the settings channel toggle
        // (default off upstream) so fireAlerts' s.push gate opens. Only here —
        // the silent re-subscribe must not override a deliberate opt-out.
        await saveSettings({ push: true }).catch(() => {});
      }
    } catch (e) {}
  };
  document.body.appendChild(btn);
}

// Boot: who am I + alert history first (cheap), then ONE ids= batch for
// everything the session references plus the initial route's slice — no
// full-catalog fetch anywhere. fetch failure at any step falls back to the
// baked demo catalog (jsdom has no fetch).
Promise.all([
  fetchJson('/api/me').catch(() => null), // 401 / static hosting → logged out
  fetchJson('/api/alerts').catch(() => null), // 401 → keep the baked demo feed
]).then(async ([me, alerts]) => {
  const loggedIn = !!(me && me.user);
  const s = parseUrl(loggedIn);
  await Promise.all([
    loggedIn ? hydrateSession(me, alerts || []) : null,
    ensureRoute(s.name, s.params),
  ]);
  if (s.name === 'product') recordRecent(s.params.id);
  // a deep link has no history entry state — seed it so Results can read
  // params.facets (sliced-brick pin) exactly like a pushed nav
  try { history.replaceState({ ...history.state, name: s.name, params: gpcParams(s.name, s.params) }, ''); } catch (e) {}
  ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
  if (loggedIn) setupPush(); // subscriptions are session-bound, no point earlier
});
