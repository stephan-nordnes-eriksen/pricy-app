// UI tests: boot dist/index.html exactly as the browser does — its <script>
// pipeline executed inside jsdom — then drive it with real DOM events.
// Run `node build.js` first (npm test does).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const DIST = path.join(__dirname, '..', 'dist');

let CATALOG_JSON;
const mari = { email: 'mari@hansen.no', name: 'Mari', initials: 'M' };
const signedFullmakt = { signed: true, signedAt: '11 Jul 2026, 09:12', cap: 20000, payment: 'vipps', orders: [] };

// jsdom has no fetch — stub the whole API surface boot.jsx talks to.
// `session`/`me` seed the /api/me answer; every call lands in win.api.
function boot(url = 'http://pricy.test/', { session = false, me, catalog, alerts = [], storage, hideAutobuy = false, fcounts, reviews = [], catalogLag = 0 } = {}) {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.scrollTo = () => {};
  // most tests exercise the full app, so the harness presets auto-buy visible
  // regardless of the frozen production default; hideAutobuy: true tests the
  // hidden mode, null leaves boot.jsx to read TWEAK_DEFAULTS (the prod path)
  if (hideAutobuy != null) win.HIDE_AUTOBUY = hideAutobuy;
  // seed persisted localStorage (each JSDOM starts empty — this is the
  // "same browser, next visit" seam)
  if (storage) Object.entries(storage).forEach(([k, v]) => win.localStorage.setItem(k, v));
  // the catalog is served via /api/products slices — stub them over the
  // build-generated seed, the same row shape the route serves
  CATALOG_JSON = CATALOG_JSON || JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  let ME = me || (session ? { user: mari, watches: [] } : null);
  win.setMe = (v) => { ME = v; }; // "the emailed link was clicked elsewhere" seam
  win.api = []; // 'METHOD /path [body]' log for assertions
  const ok = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
  win.fetch = (u, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    win.api.push({ call: (opts.method || 'GET') + ' ' + u, body });
    if (u.startsWith('/api/products')) {
      // emulate the Worker's query route over the seed rows (same shapes);
      // a {meta, products} fixture serves its own meta verbatim
      const raw = catalog || CATALOG_JSON;
      const rows = Array.isArray(raw) ? raw : raw.products;
      const heads = rows.filter(r => !r.family);
      const p = new URLSearchParams(u.split('?')[1] || '');
      let out;
      if (p.get('ids') != null) {
        const want = new Set(p.get('ids').split(',').filter(Boolean).map(id => id.includes('~') ? id.slice(0, id.indexOf('~')) : id));
        out = rows.filter(r => want.has(r.id) || want.has(r.family));
        for (const c of new Set(out.filter(r => want.has(r.id)).map(r => r.cat))) {
          out = out.concat(heads.filter(h => h.cat === c && !out.includes(h)).slice(0, 4)); // same-cat neighbors
        }
      } else if (p.get('q') != null) {
        const toks = p.get('q').toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        out = toks.length ? heads.filter(r => toks.some(t => `${r.name} ${r.brand} ${r.cat} ${r.kw || ''}`.toLowerCase().includes(t))) : [];
      } else if (p.get('cat') != null) {
        out = heads.filter(r => r.cat === p.get('cat'));
      } else if (p.get('top') === 'drop') {
        const dr = r => r.was ? 1 - Math.min(...r.offers.map(o => o.price)) / r.was : -1;
        const sorted = [...heads].sort((a, b) => dr(b) - dr(a));
        const lim = Number(p.get('limit')) || 4;
        out = sorted.slice(0, lim);
        if (p.get('perCat') === '1') {
          const per = {};
          for (const r of sorted) if ((per[r.cat] = (per[r.cat] || 0) + 1) <= lim && !out.includes(r)) out.push(r);
        }
      } else {
        out = heads;
      }
      const meta = (!Array.isArray(raw) && raw.meta) || {
        products: heads.length,
        shops: new Set(rows.flatMap(r => r.offers.map(o => o.shop))).size,
        freshest: null,
        cats: heads.reduce((m, r) => ((m[r.cat] = (m[r.cat] || 0) + 1), m), {}),
        // the real worker always serves the facet registry (catMeta)
        facets: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'facets.json'), 'utf8')),
        // ...and the GPC department registry (boot swaps the demo layer)
        depts: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'depts.json'), 'utf8')),
        // ...and the per-cat sub-category counts (Browse type chips)
        types: heads.reduce((m, r) => { const t = r.facets?.type; if (t) ((m[r.cat] ??= {})[t] = (m[r.cat][t] || 0) + 1); return m; }, {}),
        // ...and per-shop objective stats (reviews layer: ShopPage fallback)
        shopStats: rows.flatMap(r => r.offers.map(o => o.shop)).reduce((m, s) => ((m[s] = { offers: (m[s]?.offers || 0) + 1, updated: Date.now() - 3600e3 }), m), {}),
        // ...and the shipping registry (basket optimizer's threshold-aware totals)
        shipping: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'shipping.json'), 'utf8')),
      };
      // list branches carry the query's own total (worker: meta.total)
      // list branches carry the query's own total and, with a cat, the
      // category-wide facet histogram as [value, count] pairs (worker: catMeta
      // + listIds). `fcounts` is injectable so a test can serve a value no
      // loaded row has — the whole point of counting server-side.
      // catalogLag: resolve a macrotask late, so tiny responses (reviews)
      // land first — the real network order on a cold PDP load
      const send = d => catalogLag ? new Promise(r => setTimeout(r, catalogLag)).then(() => ok(d)) : ok(d);
      if (p.get('ids') || p.get('q') || p.get('top')) return send({ meta, products: out });
      return send({ meta: { ...meta, total: out.length, ...(p.get('cat') && fcounts ? { fcounts } : {}) }, products: out });
    }
    if (u.startsWith('/api/reviews')) {
      // served-review rows (worker reviewsFor shape); `reviews` boot option
      // seeds them, POST upserts the session user's own like the worker does
      if (!ME) return ok({ error: 'unauthenticated' }, 401);
      if (/\/vote$/.test(u)) return ok({ helpful: 1, voted: true });
      if (opts.method === 'DELETE') {
        const id = Number(u.split('/')[3]);
        const gone = reviews.find(r => r.id === id);
        if (!gone) return ok({ error: 'not found' }, 404);
        reviews.splice(reviews.indexOf(gone), 1);
        return ok({ reviews: reviews.filter(r => r.prodId === gone.prodId) });
      }
      if (opts.method === 'POST') {
        const row = { id: 900, prodId: body.product_id, author: 'Mari N.',
          claims: ['worth', 'durable', 'described'].map(k => (body.claims || {})[k] || 'u').join(''),
          plus: body.plus || [], minus: body.minus || [], shop: body.shop || null,
          ...(body.paid != null ? { paid: body.paid } : {}), showPaid: !!body.show_paid,
          title: body.title, body: body.body, helpful: 0, verified: false, voted: false,
          mine: true, edited: false, created_at: Date.now() };
        const i = reviews.findIndex(r => r.mine && r.prodId === body.product_id);
        if (i >= 0) { row.id = reviews[i].id; row.edited = true; reviews[i] = row; } else { row.id += reviews.length; reviews.push(row); }
        return ok({ reviews: reviews.filter(r => r.prodId === body.product_id) });
      }
      const p2 = new URLSearchParams(u.split('?')[1]);
      if (p2.get('mine') === '1') return ok({ reviews: reviews.filter(r => r.mine) });
      const want = new Set((p2.get('ids') || '').split(','));
      return ok({ reviews: reviews.filter(r => want.has(r.prodId)) });
    }
    if (u === '/api/me') return ME ? ok(ME) : ok({ error: 'unauthenticated' }, 401);
    if (u === '/api/auth/login' || u === '/api/auth/signup') {
      const name = body.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/(^| )\w/g, c => c.toUpperCase());
      ME = { user: { email: body.email, name, initials: name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') }, watches: [] };
      return ok(ME);
    }
    if (u === '/api/auth/request') return ok({ ok: true });
    if (u === '/api/logout') { ME = null; return ok({ ok: true }); }
    if (u === '/api/alerts') return ME ? ok(alerts) : ok({ error: 'unauthenticated' }, 401);
    if (u === '/api/watches') return ok({ ok: true });
    if (u === '/api/autobuy') { ME.autobuy = body; return ok({ ok: true }); }
    if (u === '/api/buy') {
      const p = (catalog || CATALOG_JSON).find(x => x.id === body.id);
      const offer = (body.shop && p.offers.find(o => o.shop === body.shop)) || p.offers.find(o => o.stock);
      return ok({ ok: true, order_id: 4711, product_id: body.id, shop: offer.shop, price_nok: offer.price, purchased_at: new Date().toISOString() });
    }
    if (u === '/api/account') { ME.user = { ...ME.user, name: body.name, initials: body.name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') }; return ok({ user: ME.user }); }
    if (u === '/api/settings') { ME.settings = { ...ME.settings, ...body }; return ok({ ok: true }); }
    if (u === '/api/report') return ok({ ok: true });
    if (u === '/api/account/password') {
      if (ME.user.hasPassword && body.currentPassword !== 'hunter2') return ok({ error: 'current password is incorrect' }, 401);
      return ok({ ok: true });
    }
    return Promise.reject(new Error('unexpected fetch ' + u));
  };
  const ctx = dom.getInternalVMContext();
  // run the exact script pipeline from dist/index.html
  const scripts = [...html.matchAll(/<script(?:\s+src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 5, 'expected the dist/index.html script pipeline');
  for (const [, src, inline] of scripts) {
    const code = src ? fs.readFileSync(path.join(DIST, src), 'utf8') : inline;
    vm.runInContext(code, ctx, { filename: src || 'index.html:inline' });
  }
  return win;
}

const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await tick();
  // One extra yield AFTER the condition holds: React commits the DOM fn()
  // sees synchronously, but flushes passive effects (store subscriptions,
  // popstate/beforeinstallprompt listeners) a macrotask later — jsdom has no
  // MessageChannel, so the scheduler queues that flush via setTimeout(0).
  // Returning on the commit tick let a test click/dispatch before any
  // listener existed: an emit with no subscribers, missed forever. A real
  // browser flushes effects right after paint, long before a human can act,
  // so this yield restores the ordering the app actually runs under. This
  // was the whole story of the compare-tray / PDP-popstate / install-bar
  // flakes (they failed exactly when a test ran FAST).
  await tick();
  return fn();
}
function q(win, sel) { return win.document.querySelector(sel); }
function qa(win, sel) { return [...win.document.querySelectorAll(sel)]; }
function type(win, input, value) {
  const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function submit(win, form) {
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}
// email+password login through the real AuthCard (850ms fake network)
async function logIn(win) {
  assert.ok(await until(() => q(win, '.authcard')), 'login screen did not render');
  type(win, q(win, '.authcard input[type="email"], .authcard input[placeholder*="@" i], .authcard input'), 'mari@hansen.no');
  const pw = q(win, '.authcard input[type="password"]');
  assert.ok(pw, 'password input missing');
  type(win, pw, 'hunter2');
  submit(win, q(win, '.authcard form'));
  assert.ok(await until(() => q(win, '.avatar')), 'did not reach signed-in app after login');
}

// ---------- logged out ----------

test('logged out: / shows the public landing, and the header has NO search', async () => {
  const win = boot();
  await tick();
  assert.ok(q(win, '.app-hdr'), 'landing header missing');
  const nav = qa(win, '.app-hdr .navlink, .app-hdr .btn').map(el => el.textContent);
  assert.ok(nav.some(t => /log in/i.test(t)), 'Log in missing');
  assert.ok(nav.some(t => /sign up/i.test(t)), 'Sign up missing');
  assert.strictEqual(qa(win, '.app-hdr input').length, 0, 'logged-out header must not offer search');
  assert.ok(!q(win, '.avatar'), 'no signed-in avatar when logged out');
});

test('footer "How it works" routes to /about?section=how and the anchor exists', async () => {
  const win = boot();
  const link = await until(() => qa(win, '.foot a, .foot span, footer a, footer span').find(el => /^how it works$/i.test(el.textContent.trim())));
  assert.ok(link, 'footer How it works link missing');
  link.click();
  assert.ok(await until(() => win.location.pathname === '/about'), 'must land on /about');
  assert.strictEqual(win.location.search, '?section=how', 'section param must round-trip in the URL');
  assert.ok(await until(() => q(win, '#how')), 'About page must render the #how anchor section');
});

test('logged out: search URL is gated to the login screen', async () => {
  const win = boot('http://pricy.test/search?q=sony');
  await tick();
  assert.ok(q(win, '.authcard'), 'expected login gate');
  assert.strictEqual(qa(win, '.rrow, .rcard').length, 0, 'results must not render logged out');
});

test('logged out: every app screen is gated, public ones are not', async () => {
  for (const p of ['/alerts', '/account', '/browse', '/autobuy', '/product/xm5', '/compare']) {
    const win = boot('http://pricy.test' + p);
    await tick();
    assert.ok(q(win, '.authcard'), p + ' should be gated');
  }
  const about = boot('http://pricy.test/about');
  await tick();
  assert.ok(!q(about, '.authcard'), '/about is public');
});

test('landing "Log in" leads to the login screen; back returns to landing', async () => {
  const win = boot();
  await tick();
  qa(win, '.app-hdr .btn').find(el => /log in/i.test(el.textContent)).click();
  assert.ok(await until(() => q(win, '.authcard')), 'login screen did not render');
  assert.strictEqual(win.location.pathname, '/login');
  win.history.back();
  assert.ok(await until(() => !q(win, '.authcard')), 'back should leave login');
});

// ---------- login ----------

test('email login reaches the signed-in home and persists the session', async () => {
  const win = boot('http://pricy.test/login');
  await logIn(win);
  assert.strictEqual(win.location.pathname, '/');
  const login = win.api.find(c => c.call === 'POST /api/auth/login');
  assert.strictEqual(login && login.body.email, 'mari@hansen.no', 'typed email must reach the server');
  assert.strictEqual(login && login.body.password, 'hunter2', 'typed password must reach the server');
});

test('BankID authenticates into the shared demo account and lands home', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  q(win, '.bankid-btn').click();
  assert.ok(await until(() => q(win, '.avatar')), 'BankID should reach the signed-in app');
  assert.strictEqual(win.location.pathname, '/');
  const call = win.api.find(c => c.call === 'POST /api/auth/signup');
  assert.strictEqual(call && call.body.email, 'demo@pricy.no', 'fake BankID upserts the demo account');
  assert.strictEqual(call && call.body.password, undefined, 'BankID must not send a password');
});

test('signup mode creates the account and runs onboarding', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  qa(win, '.auth-foot a').find(a => /create an account/i.test(a.textContent)).click();
  assert.ok(await until(() => /create your account/i.test((q(win, '.authcard h1') || {}).textContent || '')), 'signup mode did not render');
  type(win, q(win, '.authcard input[type="email"]'), 'kari@nordmann.no');
  type(win, q(win, '.authcard input[type="password"]'), 'hunter22');
  submit(win, q(win, '.authcard form'));
  assert.ok(await until(() => win.location.pathname === '/onboarding'), 'signup should land on onboarding');
  const call = win.api.find(c => c.call === 'POST /api/auth/signup');
  assert.strictEqual(call && call.body.email, 'kari@nordmann.no', 'signup must hit the signup endpoint');
  assert.strictEqual(call && call.body.password, 'hunter22', 'typed password must reach the server');
});

test('magic link: waiting state requests a real link and polling /api/me completes login', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  qa(win, '.seg button').find(b => /magic link/i.test(b.textContent)).click();
  type(win, q(win, '.authcard input[type="email"]'), 'kari@nordmann.no');
  submit(win, q(win, '.authcard form'));
  assert.ok(await until(() => q(win, '.authcard .addr')), 'sent screen missing');
  assert.ok(q(win, '.sent__spinner'), 'waiting spinner missing');
  assert.ok(!qa(win, '.authcard button').some(b => /open the link/i.test(b.textContent)), 'the simulation button must be gone');
  // boot.jsx's driver must request a real emailed link for the typed address
  assert.ok(await until(() => win.api.some(c => c.call === 'POST /api/auth/request' && c.body.email === 'kari@nordmann.no'), 5000), 'must POST /api/auth/request');
  assert.ok(!win.api.some(c => c.call === 'POST /api/auth/signup'), 'magic flow must not touch the signup bridge');
  // the link is clicked on another tab/device → /api/me starts answering
  win.setMe({ user: { email: 'kari@nordmann.no', name: 'Kari', initials: 'K' }, watches: [] });
  assert.ok(await until(() => q(win, '.avatar'), 8000), 'waiting tab must pick the session up'); // poll runs every 3s
  assert.strictEqual(win.location.pathname, '/');
});

test('rejected login stays on the login screen', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  const fetch0 = win.fetch;
  win.fetch = (u, opts) => u === '/api/auth/login'
    ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'no account for this email' }) })
    : fetch0(u, opts);
  type(win, q(win, '.authcard input[type="email"]'), 'nobody@nowhere.no');
  type(win, q(win, '.authcard input[type="password"]'), 'hunter2');
  submit(win, q(win, '.authcard form'));
  assert.ok(await until(() => q(win, '.formhint.err')), 'server rejection must surface in the form');
  assert.match(q(win, '.formhint.err').textContent, /no account/i);
  assert.strictEqual(win.location.pathname, '/login', 'must not navigate without a session');
  assert.ok(!q(win, '.avatar'), 'must not render signed-in chrome');
});

test('login screen Back button returns to the landing page', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  qa(win, '.authcard, .screen').length; // ensure rendered
  const back = qa(win, 'button').find(b => /back/i.test(b.textContent) && b.querySelector('.icon'));
  assert.ok(back, 'Back button missing on the login screen');
  back.click();
  assert.ok(await until(() => q(win, '.lhero')), 'Back should land on the public landing');
  assert.strictEqual(win.location.pathname, '/');
});

// ---------- signed in ----------

test('signed in: / is the app home and the header search suggests live', async () => {
  const win = boot('http://pricy.test/', { session: true });
  await tick();
  assert.ok(q(win, '.avatar'), 'signed-in header missing');
  const input = q(win, '.app-hdr__search input');
  assert.ok(input, 'signed-in header must offer search');
  input.focus();
  type(win, input, 'sony');
  assert.ok(await until(() => q(win, '.suggest .suggest__item')), 'live suggestions missing');
  // Enter navigates to results
  input.closest('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  assert.ok(await until(() => win.location.pathname + win.location.search === '/search?q=sony'), 'Enter should open results for the query');
});

test('signed in: every app screen renders the shared footer exactly once', async () => {
  for (const p of ['/', '/browse', '/alerts', '/account', '/autobuy', '/product/xm5', '/search?q=sony']) {
    const win = boot('http://pricy.test' + p, { session: true });
    assert.strictEqual((await until(() => qa(win, '.ftr').length)), 1, p + ' should render one footer');
  }
  // public pages inline their own authed={false} footer — no doubling
  const landing = boot('http://pricy.test/');
  assert.strictEqual((await until(() => qa(landing, '.ftr').length)), 1, 'landing renders exactly one footer');
  // onboarding is footer-less in the prototype's router
  const ob = boot('http://pricy.test/onboarding', { session: true });
  assert.ok(await until(() => q(ob, '.ob')), 'onboarding did not render');
  assert.strictEqual(qa(ob, '.ftr').length, 0, 'onboarding must not render the footer');
});

test('signed in: header search Enter on an empty query stays put (no "airpods pro" fallback)', async () => {
  const win = boot('http://pricy.test/', { session: true });
  await tick();
  const input = q(win, '.app-hdr__search input');
  input.closest('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  type(win, input, '   ');
  input.closest('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.strictEqual(win.location.pathname, '/', 'empty or whitespace query must not navigate');
});

test('signed in: header alerts badge counts server-fired hits, not client best-vs-target math', async () => {
  // xm5 is below its (huge) target but the server says no alert fired → not
  // counted; lgc3 is above its target but the server flags a hit → counted.
  const me = { user: mari, watches: [{ id: 'xm5', target: 999999, paused: 0, hit: 0 }, { id: 'lgc3', target: 1, paused: 0, hit: 1 }] };
  const win = boot('http://pricy.test/', { session: true, me });
  assert.ok(await until(() => q(win, '.app-hdr .badge')), 'alerts badge missing for a server-hit watch');
  assert.strictEqual(q(win, '.app-hdr .badge').textContent, '1', 'only the server-flagged hit counts');
});

test('PDP alert field inherits the saved watch target', async () => {
  const me = { user: mari, watches: [{ id: 'xm5', target: 3100 }] };
  const win = boot('http://pricy.test/product/xm5', { session: true, me });
  assert.ok(await until(() => q(win, '.watchbox__field input')), 'watchbox input missing');
  assert.strictEqual(q(win, '.watchbox__field input').value, '3100', 'input must show the saved target, not the suggested price');
});

test('PDP: editing the target shows Update alert and persists the new target', async () => {
  const me = { user: mari, watches: [{ id: 'xm5', target: 3100 }] };
  const win = boot('http://pricy.test/product/xm5', { session: true, me });
  assert.ok(await until(() => q(win, '.watchbox__field input')), 'watchbox input missing');
  assert.ok(q(win, '.watchbox__status'), 'unedited watch must show the Watching status');
  type(win, q(win, '.watchbox__field input'), '2999');
  const update = await until(() => qa(win, '.watchbox .btn').find(b => /update alert/i.test(b.textContent)));
  assert.ok(update, 'edited target must surface an Update alert button');
  update.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/watches' && c.body[0] && c.body[0].target === 2999)), 'update must persist the new target');
  assert.ok(await until(() => q(win, '.watchbox__status')), 'after saving, status returns to Watching');
});

test('PDP: Buy now buys at the current best price', async () => {
  // fullmakt already signed — an unsigned user gets the ceremony first
  const win = boot('http://pricy.test/product/xm5', { session: true, me: { user: mari, watches: [], autobuy: signedFullmakt } });
  const buyBtn = await until(() => qa(win, '.btn').find(b => /buy now/i.test(b.textContent)));
  assert.ok(buyBtn, 'Buy now button missing on PDP');
  buyBtn.click();
  const best = CATALOG_JSON.find(p => p.id === 'xm5').offers[0];
  const confirm = await until(() => qa(win, '.buy-modal .btn').find(b => /buy for kr/i.test(b.textContent)));
  assert.ok(confirm, 'buy-now confirm modal missing');
  assert.ok(confirm.textContent.includes(String(best.price).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) || confirm.textContent.replace(/\D/g, '').includes(String(best.price)), 'confirm button must quote the current best price');
  confirm.click();
  assert.ok(await until(() => /order placed/i.test((q(win, '.buy-modal') || {}).textContent || '')), 'order confirmation missing');
  const order = win.AutobuyStore.orders.find(o => o.id === 'xm5' && o.status === 'executed');
  assert.ok(order, 'executed order missing from store');
  assert.strictEqual(order.max, best.price, 'buy-now limit must be the current price');
  assert.strictEqual(order.exec.price, best.price, 'buy-now charges the current price');
  assert.ok(win.api.some(c => c.call === 'POST /api/buy' && c.body.id === 'xm5' && c.body.shop === best.shop), 'purchase must hit the Worker');
  assert.strictEqual(order.exec.ref, 'PY-4711', 'order ref must come from the server order id');
});

// Outbound shop links are real <a target="_blank"> anchors, not window.open
// calls: installed as a home-screen app there is no browser back button, so a
// same-tab navigation to a shop strands the user outside the app.
test('PDP: Go to shop links out to the best offer url; disabled when no offer has one', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  const goBtn = await until(() => qa(win, '.btn').find(b => /go to shop/i.test(b.textContent)));
  assert.ok(goBtn, 'Go to shop button missing on PDP');
  const offers = CATALOG_JSON.find(p => p.id === 'xm5').offers;
  const expected = offers[0].url || offers.find(o => o.url)?.url;
  assert.ok(expected, 'seed must give xm5 an offer url for this test');
  assert.strictEqual(goBtn.tagName, 'A', 'Go to shop must be an anchor, not a scripted button');
  assert.strictEqual(goBtn.getAttribute('href'), expected, 'must link to the best offer url');
  assert.strictEqual(goBtn.getAttribute('target'), '_blank', 'must open in a new tab');
  assert.match(goBtn.getAttribute('rel') || '', /noopener/, 'outbound links need rel=noopener');
  // per-offer buy button is icon-only since the totals sync (2026-08-03)
  const visit = qa(win, '.orow .btn').find(b => b.tagName === 'A');
  assert.ok(visit, 'at least one per-offer Visit must be a link when offers have urls');
  assert.ok(offers.some(o => o.url === visit.getAttribute('href')), 'Visit must link to one of the offer urls');

  // no urls anywhere (prod state before real ingest) → disabled, not broken
  const bare = CATALOG_JSON.map(p => ({ ...p, offers: p.offers.map(({ url, ...o }) => o) }));
  const win2 = boot('http://pricy.test/product/xm5', { session: true, catalog: bare });
  const goBtn2 = await until(() => qa(win2, '.btn').find(b => /go to shop/i.test(b.textContent)));
  assert.strictEqual(goBtn2.tagName, 'BUTTON', 'a url-less Go to shop must not be a link at all');
  assert.ok(goBtn2.disabled, 'Go to shop must be disabled when no offer has a url');
});

test('PDP: Report a problem posts the report through the /api/report bridge', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  const link = await until(() => q(win, '.report-link'));
  assert.ok(link, 'Report a problem link missing from the offers table');
  link.click();
  const reason = await until(() => qa(win, '.report-modal__reason').find(b => /wrong price/i.test(b.textContent)));
  assert.ok(reason, 'reason chips did not render');
  const send = qa(win, '.report-modal .btn').find(b => /send report/i.test(b.textContent));
  assert.ok(send.disabled, 'Send must be disabled until a reason is picked');
  reason.click();
  await until(() => !send.disabled);
  send.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'POST /api/report')), 'no POST /api/report');
  const { body } = win.api.find(c => c.call === 'POST /api/report');
  assert.deepStrictEqual(body, {
    productId: 'xm5',
    shop: CATALOG_JSON.find(p => p.id === 'xm5').offers[0].shop,
    reason: 'Wrong price',
    text: '',
  });
  assert.ok(await until(() => !q(win, '.report-modal')), 'modal must close after sending');
  assert.ok(await until(() => /we.ll look into it/i.test((q(win, '.toast') || {}).textContent || '')), 'thanks toast missing');
});

test('PDP: similar products picks from the chained cat slice on a cold deep-link', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  assert.ok(await until(() => q(win, '.simsec')), 'similar section missing');
  assert.ok(win.api.some(a => a.call.startsWith('GET /api/products?') && /cat=Audio/.test(a.call)),
    'PDP must chain-fetch its cat slice for the pickSimilar pool');
  const cards = qa(win, '.simcard');
  assert.ok(cards.length >= 1 && cards.length <= 2, 'expected one or two sim cards');
  // the picks must not repeat in the "More in" grid below
  const simIds = cards.map(c => c.querySelector('.simcard__name').textContent);
  qa(win, '.morecard, .rcard').forEach(el => simIds.forEach(n => assert.ok(!el.textContent.includes(n), n + ' duplicated below')));
  cards[0].click();
  assert.ok(await until(() => win.location.pathname.startsWith('/product/') && !win.location.pathname.endsWith('/xm5')),
    'sim card click must navigate to that product');
});

test('recently viewed: a visited product shows in the home rail on the next visit', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  assert.ok(await until(() => q(win, '.watchbox')), 'PDP did not render');
  assert.deepStrictEqual(JSON.parse(win.localStorage.getItem('pricy_recent')), ['xm5'], 'view must persist to pricy_recent');
  // fresh boot, same browser: carry the persisted key over
  const home = boot('http://pricy.test/', { session: true, storage: { pricy_recent: win.localStorage.getItem('pricy_recent') } });
  assert.ok(await until(() => qa(home, '.rcard').length > 0), 'recent rail missing on home');
  const cards = qa(home, '.rcard').map(el => el.textContent);
  assert.strictEqual(cards.length, 1, 'rail must show only the actually-viewed product');
  assert.ok(/Sony WH-1000XM5/.test(cards[0]), 'rail must show the visited product');
});

test('recently viewed: section is hidden entirely when nothing has been viewed', async () => {
  const win = boot('http://pricy.test/', { session: true });
  assert.ok(await until(() => qa(win, '.sec').length > 0), 'home sections did not render');
  assert.ok(!/Recently viewed/i.test(win.document.body.textContent), 'empty rail must not render its header');
});

test('onboarding: finishing saves the chosen notification prefs', async () => {
  const win = boot('http://pricy.test/onboarding', { session: true });
  const next = () => qa(win, '.ob__foot .btn').find(b => /continue|skip for now/i.test(b.textContent));
  assert.ok(await until(next), 'onboarding did not render');
  for (let i = 0; i < 3; i++) { next().click(); await tick(); }
  const pushRow = qa(win, '.arow').find(r => /push notifications/i.test(r.textContent));
  pushRow.querySelector('.tgl').click();
  await tick();
  qa(win, '.ob__foot .btn').find(b => /start saving/i.test(b.textContent)).click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/settings')), 'finish must PUT /api/settings');
  const body = win.api.find(c => c.call === 'PUT /api/settings').body;
  assert.strictEqual(body.email, true, 'default email pref must persist');
  assert.strictEqual(body.push, true, 'flipped push pref must persist');
});

test('/autobuy on a reloaded session shows real purchases, not the demo orders', async () => {
  const me = {
    user: mari, watches: [], autobuy: signedFullmakt,
    purchases: [{ order_id: 7, product_id: 'xm5', product: 'Sony WH-1000XM5', shop: 'Elkjøp', price_nok: 3190, purchased_at: '2026-07-10T09:00:00.000Z' }],
  };
  const win = boot('http://pricy.test/autobuy', { session: true, me });
  assert.ok(await until(() => q(win, '.ab-exec')), 'executed purchase card missing');
  assert.strictEqual(qa(win, '.ab-exec').length, 1, 'only the real purchase should show');
  assert.strictEqual(qa(win, '.abrow').length, 0, 'demo active auto-buy orders must be gone');
  const meta = q(win, '.ab-exec .meta').textContent;
  assert.ok(meta.includes('Elkjøp'), 'shop missing: ' + meta);
  assert.ok(meta.includes('10 Jul 2026'), 'purchase date missing: ' + meta);
  assert.ok(meta.includes('24 Jul 2026'), 'angrerett must be 14 days out: ' + meta);
  assert.strictEqual(win.AutobuyStore.orders[0].exec.ref, 'PY-7', 'order ref must come from the server order id');
});

test('/autobuy hydrates the persisted fullmakt + armed orders; revoking persists', async () => {
  const me = {
    user: mari, watches: [], purchases: [],
    autobuy: { ...signedFullmakt, orders: [{ id: 'xm5', max: 2800, expires: '10 Aug 2026', shops: 'Any shop' }] },
  };
  const win = boot('http://pricy.test/autobuy', { session: true, me });
  assert.ok(await until(() => qa(win, '.abrow').length === 1), 'armed order must survive a reload');
  assert.ok(q(win, '.fm-signed').textContent.includes('11 Jul 2026, 09:12'), 'persisted signedAt missing from the receipt');
  assert.ok(!win.api.some(c => c.call === 'PUT /api/autobuy'), 'hydration must not PUT the state it just read');

  qa(win, '.btn').find(b => /revoke/i.test(b.textContent)).click();
  const confirm = await until(() => qa(win, '.btn').find(b => /revoke now/i.test(b.textContent)));
  assert.ok(confirm, 'revoke confirm dialog missing');
  confirm.click();
  const put = await until(() => win.api.find(c => c.call === 'PUT /api/autobuy'));
  assert.ok(put, 'revoking must persist to the server');
  assert.strictEqual(put.body.signed, false, 'revoked fullmakt must persist as unsigned');
  assert.deepStrictEqual(put.body.orders, [], 'revoking cancels the armed orders server-side too');
  assert.ok(await until(() => q(win, '.fm-cer')), 'revoked state must render the sign-again ceremony');
});

test('new user on /autobuy: nothing signed → the real "Auto-buy is off" ceremony; signing persists today\'s date', async () => {
  const win = boot('http://pricy.test/autobuy', { session: true }); // no autobuy blob
  assert.ok(await until(() => q(win, '.fm-cer')), 'unsigned user must see the fullmakt ceremony');
  assert.ok(/auto-buy is off/i.test(q(win, '.ab-inactive').textContent), 'off-state copy missing');
  assert.strictEqual(q(win, '.ab-cap'), null, 'cap bar must not render before signing');

  // copy honesty (plans/autobuy-copy-honesty.md): beta banner, no invented identity/org.nr
  assert.ok(q(win, '.beta-banner'), 'ceremony must carry the Beta — coming soon banner');
  const doc = q(win, '.fm-doc').textContent;
  assert.ok(!/Hansen|14\.03\.1991|923 456 789/.test(doc), 'fullmakt must not print invented name/birthdate/org.nr');
  assert.ok(/SNE Studio AS.*org\.nr\. 925 621 900/.test(doc), 'fullmakt must name the real company and org.nr');

  // fake BankID sign (parked per plan — must keep working) persists the fullmakt
  q(win, '.fm-agree input').click();
  q(win, '.bankid-btn').click();
  const put = await until(() => win.api.find(c => c.call === 'PUT /api/autobuy')); // BankIDButton fakes 1.4s
  assert.ok(put, 'signing must persist to the server');
  assert.strictEqual(put.body.signed, true);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  assert.ok(put.body.signedAt.startsWith(today + ','), `signedAt must be the real signing date, got: ${put.body.signedAt}`);
});

// HIDE_AUTOBUY: the operator's global buy-now kill switch (TWEAK_DEFAULTS.
// hideAutobuy frozen by boot.jsx; the harness presets it visible for the
// tests above, hideAutobuy: true boots the hidden mode)
test('HIDE_AUTOBUY: no Buy now, no Auto-buy box, no header zap — even for a signed fullmakt', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true, hideAutobuy: true, me: { user: mari, watches: [], autobuy: signedFullmakt } });
  assert.ok(await until(() => q(win, '.watchbox')), 'PDP must render');
  assert.ok(qa(win, '.btn').find(b => /go to shop/i.test(b.textContent)), 'Go to shop must stay');
  assert.ok(!qa(win, '.btn').find(b => /buy now/i.test(b.textContent)), 'Buy now button must not render');
  assert.strictEqual(q(win, '.abox'), null, 'Auto-buy box must not render');
  assert.strictEqual(q(win, '.app-hdr__icon[title="Auto-buy"]'), null, 'header Auto-buy icon must not render');
});

test('HIDE_AUTOBUY: /autobuy falls through to home, login hint and onboarding are scrubbed', async () => {
  const win = boot('http://pricy.test/autobuy', { session: true, hideAutobuy: true });
  assert.ok(await until(() => q(win, '.sec')), '/autobuy must land on the signed-in home');
  assert.strictEqual(q(win, '.fm-cer'), null, 'the fullmakt ceremony must not render');

  const login = boot('http://pricy.test/login', { hideAutobuy: true });
  const hint = await until(() => q(login, '.bankid-hint'));
  assert.ok(/verified instantly with bankid/i.test(hint.textContent), 'login must show the neutral BankID hint');
  assert.ok(!/auto-buy/i.test(hint.textContent), 'login hint must not mention auto-buy');

  const ob = boot('http://pricy.test/onboarding', { session: true, hideAutobuy: true });
  assert.ok(await until(() => qa(ob, '.ob__bar i').length === 3), 'onboarding must have 3 steps (auto-buy step gone)');
});

test('HIDE_AUTOBUY: without the test preset, boot freezes the designer\'s TWEAK_DEFAULTS.hideAutobuy', async () => {
  const win = boot('http://pricy.test/', { session: true, hideAutobuy: null });
  assert.strictEqual(win.HIDE_AUTOBUY, !!win.TWEAK_DEFAULTS.hideAutobuy, 'boot must mirror the frozen tweak default');
});

test('signed in with no watches: no alerts badge (demo values gone)', async () => {
  const win = boot('http://pricy.test/', { session: true });
  assert.ok(await until(() => q(win, '.avatar')), 'signed-in header missing');
  await tick();
  assert.strictEqual(q(win, '.app-hdr .badge'), null, 'badge must not show demo watch hits');
});

test('signed in: picking a header suggestion navigates', async () => {
  const win = boot('http://pricy.test/', { session: true });
  await tick();
  const input = q(win, '.app-hdr__search input');
  input.focus();
  type(win, input, 'sony');
  assert.ok(await until(() => q(win, '.suggest .suggest__item')), 'live suggestions missing');
  q(win, '.suggest .suggest__item').click();
  assert.ok(await until(() => {
    const p = win.location.pathname;
    return p.startsWith('/product/') || p === '/search';
  }), 'suggestion pick should open the product or results');
});

test('signed in: suggestions come from the served catalog, not the demo 8', async () => {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const DEMO = ['airpods', 'xm5', 'switch', 'dyson', 'iphone', 'tv', 'kindle', 'lego'];
  const fresh = cat.find(p => !DEMO.includes(p.id));
  const win = boot('http://pricy.test/', { session: true });
  await tick();
  const input = q(win, '.app-hdr__search input');
  input.focus();
  type(win, input, fresh.name);
  assert.ok(await until(() => qa(win, '.suggest__item').some(el => el.textContent.includes(fresh.name))),
    'served-catalog product missing from suggestions: ' + fresh.name);
  // category suggestion: departments (served registry) with real counts, pick = dept scope
  type(win, input, 'audio');
  const audioCount = cat.filter(p => p.cat === 'Audio' && !p.family).length; // heads only — children stay out of CAT_OF
  const audioItem = await until(() =>
    qa(win, '.suggest__item').find(el => /Audio & Headphones/.test(el.textContent) && el.textContent.includes(audioCount + ' products')));
  assert.ok(audioItem, 'Audio department must show the real catalog count, not the demo string');
  audioItem.click();
  assert.ok(await until(() => win.location.pathname + win.location.search === '/search?dept=audio'),
    'department pick should open the department scope, not run a text query');
});

test('signed in: results rows open the product page', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results rows missing');
  qa(win, '.rrow, .rcard')[0].click();
  assert.ok(await until(() => win.location.pathname.startsWith('/product/')), 'row click should open product');
});

test('results view switcher: compact rows render and the choice persists', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow').length > 0), 'details rows missing (default view)');
  const compact = await until(() => qa(win, '.viewbar button').find(b => /compact/i.test(b.getAttribute('aria-label') || '')));
  assert.ok(compact, 'view switcher missing');
  compact.click();
  assert.ok(await until(() => qa(win, '.crow').length > 0), 'compact rows missing after switch');
  assert.strictEqual(qa(win, '.rrow').length, 0, 'details rows must be gone in compact view');
  assert.strictEqual(win.localStorage.getItem('pricy.view'), 'compact', 'view choice must persist');
});

test('PDP gallery: carousel thumbs switch the view and the lightbox opens', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  assert.ok(await until(() => qa(win, '.pgal__thumb').length > 1), 'gallery thumbs missing');
  const thumbs = qa(win, '.pgal__thumb');
  thumbs[1].click();
  assert.ok(await until(() => thumbs[1].classList.contains('is-on')), 'thumb click should select that view');
  q(win, '.pgal__stage').click();
  assert.ok(await until(() => q(win, '.lb')), 'stage click should open the lightbox');
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(await until(() => !q(win, '.lb')), 'Escape should close the lightbox');
});

test('signed in: session survives a reload (fresh boot, /api/me still says yes)', async () => {
  const win = boot('http://pricy.test/alerts', { session: true });
  await tick();
  assert.ok(!q(win, '.authcard'), 'session flag should keep app screens open');
});

test('account menu logs out: back to landing, session cleared', async () => {
  const win = boot('http://pricy.test/', { session: true });
  await tick();
  q(win, '.avatar').click();
  assert.ok(await until(() => q(win, '.acctmenu')), 'avatar should open the account menu');
  const items = qa(win, '.acctmenu__item');
  items[items.length - 1].click(); // Log out
  assert.ok(await until(() => q(win, '.lhero')), 'log out should land on the public landing');
  assert.ok(win.api.some(c => c.call === 'POST /api/logout'), 'logout must kill the server session');
});

// ---------- catalog hydration (Phase 4a) ----------

test('honest metrics: {meta, products} body renders the served aggregates', async () => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const meta = { products: 123, shops: 7, freshest: Date.now() - 5 * 60000 };
  const win = boot('http://pricy.test/browse', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(win, '.browse__head .sub').length > 0), 'browse header did not render');
  const sub = qa(win, '.browse__head .sub')[0].textContent;
  assert.ok(sub.includes('123 products') && sub.includes('7 shops'), 'header must show meta counts, got: ' + sub);
  assert.ok(sub.includes('5 min ago'), 'freshness must derive from meta.freshest, got: ' + sub);
});

test('rendered catalog comes from /api/products slices, not the baked constants', async () => {
  const served = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'))
    .filter(p => p.cat !== 'Gaming') // dropped category must vanish from CAT_OF
    .map(p => p.cat === 'Audio' ? { ...p, name: 'Fetched ' + p.name } : p);
  const win = boot('http://pricy.test/search?cat=Audio', { session: true, catalog: served });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const names = qa(win, '.rrow, .rcard').map(el => el.textContent);
  assert.ok(names.length && names.every(t => t.includes('Fetched ')), 'results must show the fetched names, got: ' + names[0]);
  const cats = qa(win, '.catlink').map(el => el.textContent);
  assert.ok(cats.length > 0, 'category filter list did not render');
  assert.ok(!cats.some(t => t.includes('Gaming')), 'CAT_OF still lists the dropped Gaming category');
});

// ---------- lazy catalog (query-based, no eager full load) ----------

// extra.json heads ship offer-less until their first crawl — the upstream
// "No offers yet" state (synced 2026-07-21) must render them, not crash
test('offer-less heads render the "No offers yet" state', async () => {
  const win = boot('http://pricy.test/search?q=sony', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const row = qa(win, '.rrow, .rcard').find(el => el.textContent.includes('PlayStation 5 Pro'));
  assert.ok(row, 'the offer-less extra.json head must render in results');
  assert.ok(row.textContent.includes('No offers yet'), 'offer-less row must show the empty state, got: ' + row.textContent);
});

test('lazy catalog: a search boot fetches only its q slice — the eager full load is gone', async () => {
  const win = boot('http://pricy.test/search?q=sony', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  assert.ok(!win.api.some(c => c.call.includes('/api/catalog.json')), 'boot must not fetch the full catalog');
  assert.ok(win.api.some(c => c.call === 'GET /api/products?q=sony'), 'boot must fetch the q slice');
  assert.ok(!win.api.some(c => c.call === 'GET /api/products'), 'no unfiltered all-products fetch on a search boot');
  const allHeads = CATALOG_JSON.filter(p => !p.family).length;
  assert.ok(win.CATALOG.length > 0 && win.CATALOG.length < allHeads,
    `cache must hold only the slice (got ${win.CATALOG.length} of ${allHeads})`);
});

test('lazy catalog: session ids (watches + recents + purchases) land in ONE ids= batch', async () => {
  const me = {
    user: mari,
    watches: [{ id: 'xm5', target: 3100, paused: 0 }],
    purchases: [{ order_id: 9, product_id: 'lego', shop: 'Power', price_nok: 500, purchased_at: new Date().toISOString() }],
  };
  const win = boot('http://pricy.test/', { session: true, me, storage: { pricy_recent: JSON.stringify(['airpods']) } });
  assert.ok(await until(() => q(win, '.avatar')), 'home did not render');
  const idCalls = win.api.filter(c => c.call.startsWith('GET /api/products?ids='));
  assert.strictEqual(idCalls.length, 1, 'exactly one ids= batch, got: ' + idCalls.map(c => c.call).join(' | '));
  const ids = decodeURIComponent(idCalls[0].call.split('ids=')[1]).split(',');
  for (const id of ['xm5', 'lego', 'airpods']) assert.ok(ids.includes(id), `batch must carry ${id}, got: ${ids}`);
  // and the hydrated stores resolved against the batch
  assert.ok(await until(() => qa(win, '.wrow, .rcard').length > 0), 'watch/recent rows must render from the batch');
});

// window.onQuery is the whole Results query on the wire — if boot's
// serialisation and worker/index.js's listFilters() drift apart, the screen
// silently gets an unfiltered page back.
test('lazy catalog: onQuery puts Results’ sort and filters on the query string', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  assert.ok(win.api.some(c => /\?cat=Audio&dir=asc&limit=400&offset=0&sort=best$/.test(c.call)),
    'the route prefetch must ask for the screen’s own default sort, got: ' + win.api.map(c => c.call).join(' | '));

  // the rail's free-text refine must travel too — client-side it would only
  // ever narrow the loaded page, which is the bug the server query fixed
  type(win, q(win, '.refine input'), 'wireless');
  assert.ok(await until(() => win.api.some(c => c.call.includes('name=wireless'))),
    'typing in the refine box must re-query the server, got: ' + win.api.map(c => c.call).join(' | '));

  // ...but the first letters never reach the wire. "e" matches nearly the whole
  // catalog and the 400-row page it merges is what made early keystrokes slow.
  // Gaps of 300 ms: past upstream's own 250 ms debounce, so without the hold
  // each of these WOULD fetch (that is exactly the reported lag).
  const box = q(win, '.refine input');
  type(win, box, 'e'); await tick(300);
  type(win, box, 'es'); await tick(300);
  type(win, box, 'esp');
  assert.ok(!win.api.some(c => /[?&]name=es?&/.test(c.call)),
    'a 1–2 letter refine must be held until it is superseded, got: ' + win.api.map(c => c.call).join(' | '));
  assert.ok(await until(() => win.api.some(c => c.call.includes('name=esp'))),
    'the third letter must go through');
  type(win, box, '');

  const res = await win.onQuery({
    cat: 'Audio', sort: 'best', dir: 'desc', page: 2,
    filters: { q: 'buds', brands: ['Sony', 'Bose'], min: 100, max: 900, dom: 2, sale: true, instock: true, facets: { nc: true, size: [55, 65] } },
  });
  const call = win.api[win.api.length - 1].call;
  for (const part of ['cat=Audio', 'sort=best', 'dir=desc', 'offset=800', 'limit=400', 'brand=Bose%2CSony', 'name=buds',
    'min=100', 'max=900', 'dom=2', 'sale=1', 'instock=1', 'facets=' + encodeURIComponent('{"nc":true,"size":[55,65]}')]) {
    assert.ok(call.includes(part), `onQuery must send ${part}, got: ${call}`);
  }
  assert.strictEqual(typeof res.total, 'number', 'the served total must come back to the screen');

  // availability (PROMPT 01): upstream's f.avail keys map onto the shipping
  // query params — 'fast' is the fixed ≤2-days def, 'instock' shares instock=
  await win.onQuery({ cat: 'Audio', sort: 'total', filters: { avail: ['freeship', 'fast', 'instock'], brands: [], facets: {} } });
  const avail = win.api[win.api.length - 1].call;
  for (const part of ['sort=total', 'freeship=1', 'maxeta=2', 'instock=1']) {
    assert.ok(avail.includes(part), `onQuery must send ${part} for f.avail, got: ${avail}`);
  }

  // same selection, different click order = the same cache entry. Counted by
  // URL, not by log length: Results runs its own debounced onQuery on mount
  const hits = () => win.api.filter(c => c.call.includes('brand=Bose%2CSony')).length;
  const before = hits();
  await win.onQuery({ cat: 'Audio', sort: 'best', dir: 'desc', page: 2, filters: { q: 'buds', brands: ['Bose', 'Sony'], min: 100, max: 900, dom: 2, sale: true, instock: true, facets: { size: [55, 65], nc: true } } });
  assert.strictEqual(hits(), before, 'a re-ordered but identical selection must not refetch');
});

test('lazy catalog: a PDP visit merges into the cache without evicting earlier slices', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const audioCount = win.CATALOG.length;
  // navigate to a product outside Audio — its slice must merge, not replace
  win.history.pushState(null, '', '/product/lego');
  win.dispatchEvent(new win.PopStateEvent('popstate'));
  assert.ok(await until(() => qa(win, '.orow').length > 0), 'PDP did not render');
  assert.ok(win.CATALOG.some(p => p.id === 'lego'), 'PDP product must be in the cache');
  assert.ok(win.CATALOG.length > audioCount, 'earlier Audio slice must survive the merge');
  assert.ok(win.CATALOG.filter(p => p.cat === 'Audio').length === audioCount, 'no Audio rows lost');
  // the merge upserts through an id index now — a stale one re-pushes rows it
  // should have found, which shows up here and nowhere else
  assert.strictEqual(new Set(win.CATALOG.map(p => p.id)).size, win.CATALOG.length,
    'every merged slice must upsert, never duplicate');
});

test('lazy catalog: browse shows FULL category counts (meta.cats) off its small drops slice', async () => {
  const win = boot('http://pricy.test/browse', { session: true });
  assert.ok(await until(() => qa(win, '.dcard').length > 0), 'department cards did not render');
  assert.ok(win.api.some(c => /GET \/api\/products\?limit=4&perCat=1&top=drop/.test(c.call)),
    'browse must prefetch the per-cat drops slice, got: ' + win.api.map(c => c.call).join(' | '));
  assert.ok(!win.api.some(c => c.call === 'GET /api/products'), 'browse must not fetch all heads anymore');
  const heads = CATALOG_JSON.filter(p => !p.family);
  const audio = qa(win, '.dcard').find(el => el.querySelector('h3')?.textContent === 'Audio & Headphones');
  const audioTotal = heads.filter(p => p.cat === 'Audio').length;
  assert.ok(audio.textContent.includes(`${audioTotal} products`),
    `Audio card must show the full served count (${audioTotal}), not the cache size — got: ` + audio.textContent);
  // every dept in the served registry renders, even though the cache holds
  // only the drops slice — incl. non-electronics depts whose cats have no rows yet
  const DEPTS_REG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'depts.json'), 'utf8'));
  assert.strictEqual(qa(win, '.dcard').length, DEPTS_REG.length,
    'every served department must render even though the cache holds a slice');
  // a multi-cat dept sums its backing cats' served counts
  const kitchen = qa(win, '.dcard').find(el => el.querySelector('h3')?.textContent === 'Kitchen & Appliances');
  const kTotal = heads.filter(p => p.cat === 'Kitchen' || p.cat === 'Appliances').length;
  assert.ok(kitchen.textContent.includes(`${kTotal} products`),
    `Kitchen & Appliances must sum its backing cats (${kTotal}) — got: ` + kitchen.textContent);
  assert.ok(win.CATALOG.length < heads.length, 'the cache must hold only the drops slice');
});

test('dynamic categories: a served dept registry the prototype does not know renders, its cats join CATEGORIES', async () => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8')).filter(p => !p.family);
  const cats = products.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), { Wearables: 5 });
  const depts = [{ id: 'wear', name: 'Wearables', icon: 'watch', rules: [{ b: '10009999', name: 'Smart Watches', icon: 'watch', cat: 'Wearables', syn: ['smartklokke'], path: 'Communications › Communication Devices › Mobile Devices' }] }];
  const meta = { products: products.length + 5, shops: 3, freshest: Date.now(), cats, icons: { Wearables: 'watch' }, depts };
  const win = boot('http://pricy.test/browse', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(win, '.dcard').length > 0), 'department cards did not render');
  assert.ok(win.CATEGORIES.includes('Wearables'), 'served cat must join CATEGORIES in place');
  assert.strictEqual(win.CAT_ICONS.Wearables, 'watch', 'served icon must land in CAT_ICONS');
  assert.strictEqual(win.DEPTS.length, 1, 'served registry must replace the demo departments wholesale');
  const card = qa(win, '.dcard').find(el => el.querySelector('h3')?.textContent === 'Wearables');
  assert.ok(card, 'Wearables department card must render on browse');
  assert.ok(card.textContent.includes('5 products'), 'card must show the served count, got: ' + card.textContent);
});

// PDP breadcrumb over the served registry: boot's productPaths override —
// demo PRODMAP is emptied, so paths must derive from meta.depts, slices only
// when the row's own facet value confirms the pin
test('PDP breadcrumb: dept › matching slice canonical, only verified paths in Also in', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  assert.ok(await until(() => q(win, '.pdp__crumb')), 'PDP did not render');
  const links = [...q(win, '.pdp__crumb').querySelectorAll('a')].map(a => a.textContent);
  assert.deepStrictEqual(links.slice(0, 3), ['Home', 'Audio & Headphones', 'Headphones'],
    'canonical path must be dept › the slice xm5 verifiably matches, got: ' + links.join(' › '));
  const also = q(win, '.pdp__crumb-also');
  assert.ok(also, 'Also-in strip must render');
  assert.deepStrictEqual([...also.querySelectorAll('a')].map(a => a.textContent), ['Audio & Headphones', 'Audio'],
    'only the whole-cat brick may list under Also in — non-matching slices (Earbuds, Speakers…) must not');
});

// FILTERS-PLAN: data-driven per-category facet filters on Results
// h4 may carry a selected-count badge + chevron; the title is the first span
const h4Title = h => h.querySelector('span')?.textContent ?? h.textContent;
const facetGrp = (win, title) => qa(win, '.filters__grp').find(g => { const h = g.querySelector('h4'); return h && h4Title(h) === title; });

test('facet filters: TV renders spec-derived option groups, clicking filters rows, NC gone outside Audio', async () => {
  const win = boot('http://pricy.test/search?cat=TV', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const size = facetGrp(win, 'Screen size');
  assert.ok(size, 'Screen size facet group must render for cat=TV');
  const opts = [...size.querySelectorAll('.check')].map(el => el.textContent);
  assert.ok(opts[0].startsWith('48″') && opts[1].startsWith('55″'), 'options must be parsed+unit labels, numeric ascending, got: ' + opts.join(' | '));
  assert.ok(facetGrp(win, 'Panel'), 'Panel facet group must render');
  assert.ok(!qa(win, '.check, .fpill').some(el => el.textContent.includes('Noise cancelling')), 'hardcoded NC filter must be gone outside Audio');

  const fiftyFive = [...size.querySelectorAll('.check')].find(el => el.textContent.startsWith('55″'));
  const want = +fiftyFive.textContent.slice(3); // label '55″' + rendered count
  fiftyFive.click();
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length === want), 'selecting 55″ must filter to exactly the 55-inch sets (want ' + want + ')');
  const name = win.CATALOG.find(p => p.id === 'tv').name;
  assert.ok(qa(win, '.rrow, .rcard').some(r => r.textContent.includes(name)), 'the 55″ set must survive the filter');
  assert.ok(qa(win, '.fchip').some(el => el.textContent.includes('Screen size: 55″')), 'active facet must chip');
});

// The rail used to count the rows it happened to hold, so a value that only
// existed on row 700 of a 1,387-row category was invisible and unselectable.
// It now prefers the served histogram — the seam where the worker's
// [value, count] pairs meet the screen.
test('facet filters: the rail offers category-wide values the loaded rows do not have', async () => {
  const win = boot('http://pricy.test/search?cat=TV', {
    session: true,
    fcounts: { size: [[55, 3], [65, 9], [98, 42]] }, // 98″ is in no loaded row
  });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const opts = () => [...(facetGrp(win, 'Screen size')?.querySelectorAll('.check') || [])].map(el => el.textContent);
  assert.ok(await until(() => opts().some(t => t.startsWith('98″'))),
    'a value only the server knows must become selectable, got: ' + opts().join(' | '));
  assert.ok(opts().some(t => t.startsWith('98″') && t.includes('42')), 'its count is the served one, got: ' + opts().join(' | '));
  assert.ok(opts().some(t => t.startsWith('55″') && t.includes('3')),
    'a value the rows DO have still shows the category count, not the loaded count, got: ' + opts().join(' | '));
});

test('sub-categories: dept cards chip their rules, a sub-tile lands on the brick scope', async () => {
  const win = boot('http://pricy.test/browse', { session: true });
  assert.ok(await until(() => qa(win, '.dcard').length > 0), 'department cards did not render');
  // a non-electronics dept is reachable with its registry sub-categories
  const sport = qa(win, '.dcard').find(t => t.querySelector('h3')?.textContent === 'Sport & Outdoor');
  assert.ok(sport, 'Sport & Outdoor card must render');
  assert.deepStrictEqual([...sport.querySelectorAll('.mchip')].map(el => el.textContent),
    ['Sports & Training', 'Strength training', 'Ski & snow', 'Sportswear', '+5'], 'card chips are the dept rules (sliced sub-categories included)');

  // open card expands the sub-category panel; a sub-tile navigates to the brick
  const gaming = qa(win, '.dcard').find(t => t.querySelector('h3')?.textContent === 'Gaming');
  gaming.click();
  assert.ok(await until(() => q(win, '.dxp')), 'expand panel must open');
  qa(win, '.subtile').find(el => el.textContent.includes('Gaming')).click();
  assert.ok(await until(() => win.location.pathname + win.location.search === '/search?brick=10001139'),
    'sub-tile must land on the brick scope URL');
  // the brick page shows the backing category through the served bridge
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'brick results did not render');
});

test('GPC departments: brick deep-link renders backing cat, dept rail + GPC trail; Norwegian synonyms suggest', async () => {
  const win = boot('http://pricy.test/search?brick=10001448', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'brick results did not render');
  assert.ok(win.CATALOG.some(p => p.cat === 'Audio'), 'the backing Audio slice must be prefetched');
  // rail: the owning department heads the Category group; the GPC chip beside
  // the title shows the served classification path
  assert.ok(await until(() => qa(win, '.catlink--hd').some(el => el.textContent.includes('Audio & Headphones'))),
    'owner dept must head the category rail');
  const trail = q(win, '.gpcinfo');
  assert.ok(trail && trail.textContent.includes('#10001448') && trail.textContent.includes('Home Audio Equipment'),
    'GPC trail must render the served classification path, got: ' + (trail && trail.textContent));

  // dept deep-link renders too (prefetches its biggest backing cats)
  const win2 = boot('http://pricy.test/search?dept=computing', { session: true });
  assert.ok(await until(() => qa(win2, '.rrow, .rcard').length > 0), 'dept results did not render');

  // header suggest matches the registry's Norwegian synonyms — a sliced
  // sub-category rule (Headphones) is a first-class suggestion now
  const input = q(win2, '.app-hdr__search input');
  input.focus();
  type(win2, input, 'hodetelefoner');
  const item = await until(() => qa(win2, '.suggest__item').find(el => el.textContent.includes('Headphones')));
  assert.ok(item, 'Norwegian synonym must surface the sliced brick suggestion');
  item.click();
  assert.ok(await until(() => win2.location.pathname + win2.location.search === '/search?brick=10001181'),
    'brick pick must open the brick scope');
});

test('GPC scopes are served: onQuery translates brick/dept to the backing cat query', async () => {
  const win = boot('http://pricy.test/search?brick=10001448', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'brick results did not render');
  const audioCount = CATALOG_JSON.filter(p => !p.family && p.cat === 'Audio').length;
  const f = { q: '', brands: [], min: '', max: '', dom: 0, sale: false, instock: false, facets: {} };
  // a brick query rides its backing cat — total is the category-wide count,
  // not the page length, and brick/dept never leak onto the query string
  const r = await win.onQuery({ brick: '10001448', sort: 'best', dir: 'asc', filters: f, page: 0 });
  assert.strictEqual(r.total, audioCount, 'brick scope must serve the backing category total');
  assert.ok(win.api.some(c => c.call === 'GET /api/products?cat=Audio&dir=asc&limit=400&offset=0&sort=best'),
    'brick query must translate to a plain cat= list query, got: ' + win.api.map(c => c.call).join(' | '));
  // a single-cat dept serves the same way; a multi-cat dept resolves null
  // (upstream contract: the screen keeps client-side sort/filter)
  const rd = await win.onQuery({ dept: 'audio', sort: 'best', dir: 'asc', filters: f, page: 0 });
  assert.strictEqual(rd && rd.total, audioCount, 'single-cat dept scope must be served');
  const rm = await win.onQuery({ dept: 'computing', sort: 'best', dir: 'asc', filters: f, page: 0 });
  assert.strictEqual(rm, null, 'multi-cat dept scope must resolve null and stay client-side');
});

test('GPC sliced sub-category: the registry pin rides nav state as a real filter selection', async () => {
  // Consoles = the Gaming cat sliced by facets.type — the pin must reach
  // history.state.params.facets (Results seeds f from it), so the client pool
  // filters to consoles, the rail shows Type checked, and the prefetch query
  // carries facets= server-side. No GPC-specific query path anywhere.
  const win = boot('http://pricy.test/search?brick=10003817', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'sliced brick results did not render');
  const want = CATALOG_JSON.filter(p => !p.family && p.cat === 'Gaming' && p.facets?.type === 'Consoles').length;
  assert.ok(want >= 2 && want < CATALOG_JSON.filter(p => !p.family && p.cat === 'Gaming').length, 'seed sanity: consoles are a strict subset of Gaming');
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length === want),
    'the pool must respect the pin — consoles only, not the whole backing cat (got ' + qa(win, '.rrow, .rcard').length + ', want ' + want + ')');
  const type = facetGrp(win, 'Type');
  assert.ok(type && [...type.querySelectorAll('.check')].some(el => el.textContent.startsWith('Consoles') && el.classList.contains('is-on')),
    'the pinned Type value must render checked in the rail');
  assert.ok(win.api.some(c => c.call.startsWith('GET /api/products?cat=Gaming') && c.call.includes('facets=' + encodeURIComponent(JSON.stringify({ type: ['Consoles'] })))),
    'the prefetched slice query must carry the pin server-side, got: ' + win.api.map(c => c.call).join(' | '));
});

test('sub-categories: the Type facet groups a category under one curated vocabulary', async () => {
  const win = boot('http://pricy.test/search?cat=Gaming', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const grp = facetGrp(win, 'Type');
  assert.ok(grp, 'Type facet group must render for cat=Gaming');
  const opts = [...grp.querySelectorAll('.check')].map(el => el.textContent);
  assert.ok(opts.some(o => o.startsWith('Consoles')) && opts.some(o => o.startsWith('Controllers')), 'curated sub-cats must surface, got: ' + opts.join(' | '));
  assert.ok(!opts.some(o => o.includes('console')), 'demo spec strings (Home console…) must not leak in beside the curated values: ' + opts.join(' | '));
  const want = win.CATALOG.filter(p => p.cat === 'Gaming' && p.facets?.type === 'Controllers').length;
  assert.ok(want >= 2, 'seed sanity: at least two controller rows');
  [...grp.querySelectorAll('.check')].find(el => el.textContent.startsWith('Controllers')).click();
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length === want), 'Controllers must filter to exactly the controller rows');
});

test('facet filters: a variant-axis key (storage) derives options from the axes and matches any option', async () => {
  // served registry (worker/facets.json shape): Phones get a storage facet —
  // no product carries a storage spec/facet value, the variant axes supply it
  const products = CATALOG_JSON.filter(p => !p.family && p.cat === 'Phones');
  const meta = { products: products.length, shops: 3, freshest: Date.now(), cats: { Phones: products.length }, facets: { Phones: [{ key: 'storage', label: 'Storage', type: 'options', unit: 'GB' }] } };
  const win = boot('http://pricy.test/search?cat=Phones', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const grp = facetGrp(win, 'Storage');
  assert.ok(grp, 'Storage facet group must render for cat=Phones');
  const opts = [...grp.querySelectorAll('.check')].map(el => el.textContent);
  assert.ok(opts.some(o => o.startsWith('128 GB')) && opts.some(o => o.startsWith('256 GB')), 'axis option ids must surface as numeric GB options, got: ' + opts.join(' | '));
  // axis-derived 128s plus rows carrying an explicit storage facet array (a55)
  const kept = products.filter(p => (p.variants?.axes || []).some(a => a.id === 'storage' && a.options.some(o => o.id === '128')) || [].concat(p.facets?.storage || []).includes(128));
  assert.ok(kept.length > 0 && kept.length < products.length, 'seed sanity: 128 GB must split the cat');
  [...grp.querySelectorAll('.check')].find(el => el.textContent.startsWith('128 GB')).click();
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length === kept.length), '128 GB must keep every phone whose storage axis offers 128, got ' + qa(win, '.rrow, .rcard').length + ' want ' + kept.length);
});

test('facet filters: served meta.facets replaces the baked registry; cats without defs get no groups', async () => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8')).filter(p => !p.family);
  const cats = products.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {});
  const meta = { products: products.length, shops: 3, freshest: Date.now(), cats, facets: { TV: [{ key: 'panel', label: 'Panel tech', type: 'options' }] } };
  const win = boot('http://pricy.test/search?cat=TV', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  assert.ok(facetGrp(win, 'Panel tech'), 'served facet def must render');
  assert.ok(!facetGrp(win, 'Screen size'), 'baked TV defs must be replaced wholesale by the served registry');
  assert.strictEqual(win.FACETS.Audio, undefined, 'baked cats absent from the served registry must be dropped');

  // a cat absent from the SERVED registry gets no groups (every real cat
  // declares facets since 2026-07-25, so the stub registry is the fixture)
  const toys = boot('http://pricy.test/search?cat=Toys', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(toys, '.rrow, .rcard').length > 0), 'toys results did not render');
  const titles = qa(toys, '.filters__grp').map(g => { const h = g.querySelector('h4'); return h && h4Title(h); }).filter(Boolean);
  assert.deepStrictEqual(titles, ['Category', 'Brand', 'Price (kr)', 'Folkedommen', 'Show only', 'Availability'], 'no facet groups for a cat without defs (Availability is universal, not a facet), got: ' + titles.join(' | '));
});

test('filter search: narrows groups, no-match message clears back', async () => {
  const win = boot('http://pricy.test/search?cat=Gaming', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const grpTitles = () => qa(win, '.filters__grp h4').map(h4Title);
  const search = q(win, '.filters__search input');
  assert.ok(search, 'filter search box must render');

  type(win, search, 'folkedom');
  assert.ok(await until(() => grpTitles().length === 1), 'groups did not narrow');
  assert.deepStrictEqual(grpTitles(), ['Folkedommen']);

  type(win, search, 'zzzz-no-such-filter');
  assert.ok(await until(() => q(win, '.filters__nomatch')), 'no-match message must show');
  q(win, '.filters__nomatch button').click();
  assert.ok(await until(() => grpTitles().length === 7), 'clear must restore all groups (incl. the Gaming Type facet and Availability)');
});

test('lazy catalog: home "Biggest drops" ranks the served slice, not the baked demo 8', async () => {
  const heads = CATALOG_JSON.filter(p => !p.family);
  const dr = p => p.was ? 1 - Math.min(...p.offers.map(o => o.price)) / p.was : -1;
  const wantTop = [...heads].sort((a, b) => dr(b) - dr(a))[0];
  const win = boot('http://pricy.test/', { session: true });
  assert.ok(await until(() => qa(win, '.sidecard .afeed__item').length === 3), 'drops sidecard did not render');
  assert.ok(qa(win, '.sidecard .afeed__item')[0].textContent.includes(wantTop.name),
    `top drop must be the served ${wantTop.id}, got: ` + qa(win, '.sidecard .afeed__item')[0].textContent);
});

test('offer rows: Visit opens the offer url, url-less offers are disabled', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const served = seed.map(p => p.id !== 'xm5' ? p : {
    ...p,
    offers: p.offers.map((o, i) => i === 0 ? { ...o, url: 'https://shop.example/xm5' } : { ...o, url: null }),
  });
  const win = boot('http://pricy.test/product/xm5', { session: true, catalog: served });
  assert.ok(await until(() => qa(win, '.orow').length > 1), 'offer rows missing');
  const visits = qa(win, '.orow .btn'); // icon-only buy buttons since the totals sync
  assert.strictEqual(visits[0].getAttribute('href'), 'https://shop.example/xm5', 'Visit must link to the offer url');
  assert.strictEqual(visits[0].getAttribute('target'), '_blank', 'Visit must open in a new tab');
  assert.ok(visits.slice(1).every(b => b.tagName === 'BUTTON' && b.disabled),
    'offers without a url must render a disabled Visit, never a dead link');
});

// Reviews layer (plans/reviews-layer.md): production serves no shop ratings,
// so ShopPage must render off the served objective stats (window.SHOP_STATS,
// set by boot from meta.shopStats after the live purge empties SHOP_META) —
// name + freshness line, and none of the demo trust chrome.
test('shop profile renders served objective stats, never the demo stars', async () => {
  const win = boot('http://pricy.test/shop?shop=Elkj%C3%B8p', { session: true });
  assert.ok(await until(() => q(win, '.shop-hero__name')), 'shop page did not render');
  assert.strictEqual(q(win, '.shop-hero__name').textContent, 'Elkjøp');
  assert.match(q(win, '.shop-hero__meta').textContent, /priser fulgt · Sist oppdatert/);
  assert.ok(!q(win, '.shop-hero__stars'), 'no stars we did not measure');
  assert.ok(!q(win, '.shopbars'), 'no demo delivery/service/returns bars');
  assert.ok(!q(win, '.pdp .shopchip, .shopchip'), 'shop chips stay dark without measured ratings');
});

// The regression that shipped 2026-08-04: fetchReviews gated on boot's ME,
// which hydrateSession sets AFTER ensureRoute already ran (they're
// concurrent) — so a cold PDP load (refresh, deep link) never fetched and
// every persisted review "disappeared". The write modal's optimistic card
// masked it until the next refresh.
test('PDP reviews hydrate on a cold load — a refresh must not lose them', async () => {
  const win = boot('http://pricy.test/product/xm5', {
    session: true,
    reviews: [{ id: 1, prodId: 'xm5', author: 'Kari H.', claims: 'yyn', plus: ['God lyd'], minus: [], shop: null, showPaid: false, title: 'Server-omtale', body: 'Fra databasen', helpful: 2, verified: true, voted: false, mine: false, edited: false, created_at: Date.now() - 864e5 }],
  });
  assert.ok(await until(() => q(win, '.revsec .revcard')), 'served review did not render on a cold load');
  assert.match(q(win, '.revcard__title').textContent, /Server-omtale/);
  assert.ok(win.api.some(c => c.call === 'GET /api/reviews?ids=xm5'),
    'the PDP route must fetch its reviews, got: ' + win.api.map(c => c.call).join(' | '));
  // the baked demo reviews are purged — only served rows may render
  assert.strictEqual(qa(win, '.revsec .revcard').length, 1, 'demo PRODUCT_REVIEWS must not render next to real rows');
});

// The reviews response is tiny and beats the 400-row products payload on a
// real network — hydrateCatalog's first-payload demo purge then ran AFTER
// applyReviews and wiped the landed server rows (REVIEWED blocks a refetch).
test('PDP reviews survive the demo purge when they land before the catalog', async () => {
  const win = boot('http://pricy.test/product/xm5', {
    session: true, catalogLag: 5,
    reviews: [{ id: 1, prodId: 'xm5', author: 'Kari H.', claims: 'yyn', plus: ['God lyd'], minus: [], shop: null, showPaid: false, title: 'Server-omtale', body: 'Fra databasen', helpful: 2, verified: true, voted: false, mine: false, edited: false, created_at: Date.now() - 864e5 }],
  });
  assert.ok(await until(() => q(win, '.revsec .revcard')), 'served review was wiped by the demo purge');
  assert.match(q(win, '.revcard__title').textContent, /Server-omtale/);
  assert.strictEqual(qa(win, '.revsec .revcard').length, 1, 'demo PRODUCT_REVIEWS must stay purged');
});

// The whole point of the served aggregate (plans/folkedommen-reviews.md §6):
// boot only ever fetches review ROWS for the PDP you are on, so every result
// row, card and Compare cell asks reviewStats about a product with none
// loaded. Before _calcStats learned to read p.dom they all fell through to the
// p.rating synth — and the host never serves rating — so a catalog full of
// reviewed products read "Ingen omtaler ennå".
test('result rows render the served Folkedommen aggregate with no review rows loaded', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  // shapeRows strips the demo seed rating/reviews from every served row — the
  // production condition this test exists for. seed.json still carries them.
  const served = seed.map(({ rating, reviews, ...p }) => p.id !== 'xm5' ? p : {
    ...p,
    dom: { n: 42, c: { worth: [40, 1, 1], durable: [38, 2, 2], described: [41, 0, 1] },
      t: [['God lyd', 18, 1], ['Blir varm', 5, 0]] },
  });
  const win = boot('http://pricy.test/search?cat=Audio', { session: true, catalog: served });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const rows = qa(win, '.rrow, .rcard');
  const xm5 = rows.find(el => el.textContent.includes('WH-1000XM5'));
  assert.ok(xm5, 'the reviewed product must be on the page');
  assert.match(xm5.querySelector('.vchip').textContent, /Svært fornøyde/, 'the verdict must come off p.dom');
  assert.ok(xm5.querySelector('.vchip--pos'), 'tone follows the .85 tier cut');
  assert.match(xm5.textContent, /God lyd/, 'the top trait rides the aggregate too');

  const bare = rows.find(el => el !== xm5);
  assert.match(bare.querySelector('.vchip').textContent, /Ingen omtaler ennå/,
    'a product with no served aggregate stays honestly blank — no synth from demo stars');

  assert.ok(!win.api.some(c => c.call.startsWith('GET /api/reviews')),
    'a list screen must never fetch review rows, got: ' + win.api.map(c => c.call).join(' | '));
});

// The account tab lists ReviewStore.mine() across ALL products, and the store
// only ever holds the PDP you last opened — so the route prefetches ?mine=1
// and then the products it references (upstream's prodOf falls back to the
// bare id, which renders but looks broken).
test('account "My reviews" prefetches your reviews across products, and their products', async () => {
  const win = boot('http://pricy.test/account?tab=reviews', {
    session: true,
    reviews: [
      { id: 7, prodId: 'lego', author: 'Ola N.', claims: 'yyy', plus: ['Solid kvalitet'], minus: [], shop: null, showPaid: false, title: 'Min egen dom', body: '', helpful: 1, verified: false, voted: false, mine: true, edited: false, created_at: Date.now() - 3 * 864e5 },
    ],
  });
  assert.ok(await until(() => q(win, '.myrev')), 'the account tab did not render the served review');
  assert.match(q(win, '.myrev').textContent, /Min egen dom/);
  assert.ok(win.api.some(c => c.call === 'GET /api/reviews?mine=1'),
    'the account route must fetch mine=1, got: ' + win.api.map(c => c.call).join(' | '));
  assert.match(q(win, '.myrev__prod').textContent, /LEGO/, 'the referenced product must be fetched so prodOf resolves');
});

test('offer rows: updated_at renders a "checked … ago" stamp, absent otherwise', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const served = seed.map(p => p.id !== 'xm5' ? p : {
    ...p,
    offers: p.offers.map(({ updated_at, ...o }, i) => i === 0 ? { ...o, updated_at: Date.now() - 14 * 60000 } : o),
  });
  const win = boot('http://pricy.test/product/xm5', { session: true, catalog: served });
  assert.ok(await until(() => qa(win, '.orow').length > 1), 'offer rows missing');
  const stamps = qa(win, '.orow__checked');
  assert.strictEqual(stamps.length, 1, 'only the stamped offer may show a checked line');
  assert.match(stamps[0].textContent, /checked 14 min ago/, 'stamp must render relTime of updated_at');
  assert.ok(q(win, '.orow.is-best .orow__checked'), 'the stamp must sit on the offer that carries updated_at');
});

test('PDP specs render from the served catalog, not the baked design table', async () => {
  const served = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'))
    .map(p => p.id !== 'xm5' ? p : { ...p, specs: { ...p.specs, fit: 'Served-fit' } });
  const win = boot('http://pricy.test/product/xm5', { session: true, catalog: served });
  assert.ok(await until(() => q(win, '#pdp-specs')), 'specs section missing on the PDP');
  const rows = qa(win, '#pdp-specs .srow').map(el => el.textContent);
  assert.ok(rows.some(t => t.includes('Served-fit')), 'specs must show the served value, got: ' + rows[0]);
});

test('PDP specs: groups-shaped served specs render for a cat with no SPEC_KINDS schema', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const served = seed.concat([{
    id: 'ean-777', name: 'Acme Airfryer', brand: 'Acme', cat: 'Kitchen', icon: 'chef-hat', kw: '',
    specs: { groups: [{ label: 'Cooking', rows: [['Capacity', '5.5 L'], ['Power', '1700 W'], ['Missing', null]] }] },
    offers: [], history: [],
  }]);
  const win = boot('http://pricy.test/product/ean-777', { session: true, catalog: served });
  assert.ok(await until(() => q(win, '#pdp-specs')), 'groups-shaped specs section missing on the PDP');
  assert.match(q(win, '#pdp-specs .specs__note').textContent, /Kitchen/, 'kindLabel must fall back to the cat');
  const rows = qa(win, '#pdp-specs .srow').map(el => el.textContent);
  assert.ok(rows.some(t => t.includes('Capacity') && t.includes('5.5 L')), 'group rows must render label + value, got: ' + rows.join(' | '));
  assert.ok(rows.some(t => t.includes('Missing') && t.includes('—')), 'null values must render as —');
});

// The chart's per-shop line must come from served o.hist (real observed
// dailies, worker shop_prices) — genShopHist synth is demo-only. Once ANY
// offer carries hist: chips only for observed shops, <2 points = a note,
// never an invented line (plans/per-shop-history.md).
test('PDP chart: per-shop line reads served o.hist — short history shows a note, unobserved shops lose their chip', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  const served = seed.map(p => p.id !== 'xm5' ? p : {
    ...p,
    offers: p.offers.map((o, i) =>
      i === 0 ? { ...o, hist: [3000, 2900, o.price] } : i === 1 ? { ...o, hist: [o.price] } : o),
  });
  const xm5 = served.find(p => p.id === 'xm5');
  const [observed, shortHist] = [xm5.offers[0].shop, xm5.offers[1].shop];
  const win = boot('http://pricy.test/product/xm5', { session: true, catalog: served });
  assert.ok(await until(() => qa(win, '.chart__shops button').length > 0), 'shop chips missing');
  const chips = qa(win, '.chart__shops button').map(b => b.textContent);
  assert.deepStrictEqual(chips, ['All shops', observed, shortHist],
    'once any offer has hist, only observed shops keep a chip');

  qa(win, '.chart__shops button').find(b => b.textContent === observed).click();
  assert.ok(await until(() => /Price at/.test((q(win, '.chart__legend') || {}).textContent || '')), 'per-shop legend missing');
  assert.ok(q(win, '.chart__plot svg'), 'a shop with ≥2 observed points must chart its real line');

  qa(win, '.chart__shops button').find(b => b.textContent === shortHist).click();
  assert.ok(await until(() => /Not enough price history/.test((q(win, '.offers__empty') || {}).textContent || '')),
    'a 1-point shop must show the note, never a synthesized line');
  assert.ok(!q(win, '.chart__plot svg'), 'no chart may render for a 1-point shop');
});

// ---------- product variants (Phase 4e) ----------

test('PDP: variant picker renders from hydrated listings — selecting a combo swaps in the child row', async () => {
  // mutate the served child so the hydrated row is distinguishable from the
  // synth fallback (which is byte-identical to the seed by design)
  const served = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'))
    .map(p => p.id === 'iphone~256-black'
      ? { ...p, best: 1111, offers: [{ shop: 'TestShop', price: 1111, stock: true, ship: 'Free shipping', eta: 'In stock' }] }
      : p);
  const win = boot('http://pricy.test/product/iphone', { session: true, catalog: served });
  assert.ok(await until(() => q(win, '.vpick')), 'variant picker missing on a head with served variants');
  qa(win, '.vpick .vopt').find(b => /256 GB/.test(b.textContent)).click();
  assert.ok(await until(() => /256 GB · Black/.test((q(win, '.pdp__vtag') || {}).textContent || '')), 'selected combo label missing');
  assert.ok(await until(() => q(win, '.bestbox .t-price-lg').textContent.replace(/\D/g, '') === '1111'),
    'best price must come from the hydrated child row, not the synth');
  assert.strictEqual(qa(win, '.orow').length, 1, 'offer table must swap to the child row\'s offers');
  assert.ok(q(win, '.orow.is-best').textContent.includes('TestShop'), 'best offer must be the child\'s shop');
  // children must not leak into search/results
  assert.ok(!win.CATALOG.some(p => p.family), 'child rows must stay out of CATALOG');
});

test('PDP: watching a selected combo persists the child id; the watchlist renders it', async () => {
  const win = boot('http://pricy.test/product/iphone', { session: true });
  assert.ok(await until(() => q(win, '.vpick')), 'variant picker missing');
  qa(win, '.vpick .vopt').find(b => /256 GB/.test(b.textContent)).click();
  const watch = await until(() => qa(win, '.watchbox .btn').find(b => /watch price/i.test(b.textContent)));
  assert.ok(watch, 'Watch price button missing');
  watch.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/watches')), 'watch must persist');
  const put = win.api.find(c => c.call === 'PUT /api/watches');
  assert.strictEqual(put.body[0].id, 'iphone~256-black', 'watch must store the child id, not the head');

  // a reload hydrates the child watch and the watchlist shows the variant
  const me = { user: mari, watches: [{ id: 'iphone~256-black', target: 9500, paused: 0 }] };
  const win2 = boot('http://pricy.test/alerts', { session: true, me });
  assert.ok(await until(() => qa(win2, '.alrow').length === 1), 'child watch row missing from the watchlist');
  assert.ok(/256 GB/.test(q(win2, '.alrow .alrow__name').textContent), 'watch row must carry the variant label');
});

test('recently viewed: a visited variant PDP resolves its child id on the home rail', async () => {
  const home = boot('http://pricy.test/', { session: true, storage: { pricy_recent: JSON.stringify(['iphone~256-blue']) } });
  assert.ok(await until(() => qa(home, '.rcard').length === 1), 'recent rail missing');
  assert.ok(/iPhone 15/.test(qa(home, '.rcard')[0].textContent), 'rail must resolve the child id to its product');
});

test('PDP: a combination no shop sells is greyed out, priced as unsold, and offers the cheapest available', async () => {
  const win = boot('http://pricy.test/product/iphone', { session: true });
  assert.ok(await until(() => q(win, '.vpick')), 'variant picker missing');
  qa(win, '.vpick .vopt').find(b => /512 GB/.test(b.textContent)).click();
  // yellow is unsold at 512 GB — the picker must mark it before it's picked
  const yellow = await until(() => qa(win, '.vpick .vswatch').find(b => /^Yellow/.test(b.getAttribute('aria-label') || '')));
  assert.ok(yellow.className.includes('is-na'), 'unsold combo must be marked in the picker');
  yellow.click();
  assert.ok(await until(() => q(win, '.vpick__na')), 'unsold banner missing');
  assert.ok(/Not sold in this combination/.test(q(win, '.bestbox').textContent), 'bestbox must say the combo is unsold');
  assert.strictEqual(qa(win, '.orow').length, 0, 'unsold combo must list no offers');
  assert.ok(qa(win, '.watchbox .btn').find(b => /watch price/i.test(b.textContent)).disabled, 'watch must be disabled with no price');
  // escape hatch: cheapest available jumps to a combination a shop does sell
  q(win, '.vpick__combo').click();
  assert.ok(await until(() => !q(win, '.vpick__na')), 'cheapest available must land on a sold combination');
  assert.ok(q(win, '.bestbox .t-price-lg'), 'sold combination must show a price');
});

// ---------- per-user hydration + watch persistence (Phase 4b) ----------

test('identity and watchlist hydrate from /api/me, not the baked USER/WATCHED', async () => {
  const me = {
    user: { email: 'ola@nordmann.no', name: 'Ola Nordmann', initials: 'ON' },
    watches: [{ id: 'xm5', target: 3100, paused: 0 }],
  };
  const win = boot('http://pricy.test/alerts', { me });
  assert.ok(await until(() => q(win, '.avatar')), 'signed-in header missing');
  assert.strictEqual(q(win, '.avatar').textContent, 'ON', 'avatar must show the fetched user, not baked Mari');
  assert.ok(await until(() => qa(win, '.alrow').length === 1), 'alerts must show exactly the fetched watchlist');
  assert.ok(q(win, '.alrow .alrow__name').textContent.includes('Sony'), 'watch row must resolve its product');
});

test('activity feed hydrates from /api/alerts, not the demo five', async () => {
  const alerts = [{
    product_id: 'airpods', product: 'AirPods Pro (2nd gen, USB-C)', shop: 'Elkjøp',
    price: 1899, prev_price: 2199, target: 1900, created_at: Date.now() - 14 * 60000,
  }];
  const win = boot('http://pricy.test/alerts?tab=activity', { session: true, alerts });
  assert.ok(await until(() => q(win, '.actrow')), 'activity feed did not render');
  const rows = qa(win, '.actrow');
  assert.strictEqual(rows.length, 1, 'feed must show the hydrated alert, not the demo five');
  assert.ok(rows[0].textContent.includes('AirPods Pro'), 'row must carry the alerted product');
  assert.ok(rows[0].textContent.includes('14 min ago'), 'time must be computed from created_at');
  assert.ok(rows[0].textContent.includes('1\u00A0899'), 'row must show the alert price');
});

test('empty alert history renders the empty state, not the demo five', async () => {
  const win = boot('http://pricy.test/alerts?tab=activity', { session: true, alerts: [] });
  assert.ok(await until(() => q(win, '.actfeed .empty')), 'empty state did not render');
  assert.ok(q(win, '.actfeed .empty').textContent.includes('No alerts yet'));
  assert.strictEqual(qa(win, '.actrow').length, 0, 'no demo rows may leak through');
});

test('removing a watch PUTs the new list to /api/watches', async () => {
  const me = {
    user: { email: 'ola@nordmann.no', name: 'Ola Nordmann', initials: 'ON' },
    watches: [{ id: 'xm5', target: 3100, paused: 0 }, { id: 'lgc3', target: 12000, paused: 0 }],
  };
  const win = boot('http://pricy.test/alerts', { me });
  assert.ok(await until(() => qa(win, '.alrow').length === 2), 'watch rows missing');
  q(win, '.alrow .iconbtn.danger').click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/watches')), 'watch removal must persist');
  const put = win.api.find(c => c.call === 'PUT /api/watches');
  assert.strictEqual(put.body.length, 1, 'PUT must carry the remaining watchlist');
  assert.strictEqual(put.body[0].id, 'lgc3');
});

test('results row Watch price button adds a real watch (PUT /api/watches)', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow__save').length > 0), 'row watch buttons missing');
  const btn = qa(win, '.rrow__save')[0];
  btn.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/watches')), 'row watch must persist');
  const put = win.api.find(c => c.call === 'PUT /api/watches');
  assert.strictEqual(put.body.length, 1, 'PUT must carry the new watch');
  assert.ok(put.body[0].target > 0, 'watch must get a default target');
  assert.ok(await until(() => btn.className.includes('is-on')), 'button must reflect the watching state');
  // toggle off removes it again
  btn.click();
  assert.ok(await until(() => {
    const puts = win.api.filter(c => c.call === 'PUT /api/watches');
    return puts.length === 2 && puts[1].body.length === 0;
  }), 'second click must remove the watch');
});

// ---------- account settings persistence ----------

test('saving the profile name PATCHes /api/account', async () => {
  const me = { user: { ...mari, name: 'Mari' }, watches: [], settings: {} };
  const win = boot('http://pricy.test/account', { me });
  assert.ok(await until(() => q(win, '.acct')), 'account page did not render');
  const nameInput = q(win, '.formfield input');
  type(win, nameInput, 'Mari Hansen');
  qa(win, '.asec__body .btn').find(b => /save changes/i.test(b.textContent)).click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PATCH /api/account')), 'name save must PATCH /api/account');
  const patch = win.api.find(c => c.call === 'PATCH /api/account');
  assert.strictEqual(patch.body.name, 'Mari Hansen');
  assert.ok(await until(() => q(win, '.toast') && /profile saved/i.test(q(win, '.toast').textContent)), 'save confirmation toast missing');
});

test('changing the password checks the current one before saving the new one', async () => {
  const me = { user: { ...mari, hasPassword: true }, watches: [], settings: {} };
  const win = boot('http://pricy.test/account', { me });
  assert.ok(await until(() => q(win, '.acct')), 'account page did not render');
  qa(win, '.asec__body .btn').find(b => /change password/i.test(b.textContent)).click();
  assert.ok(await until(() => q(win, '.asec__body form')), 'password form did not open');

  const [curInput, newInput] = qa(win, '.asec__body form .formfield input');
  type(win, curInput, 'wrong-password');
  type(win, newInput, 'newpassword1');
  submit(win, q(win, '.asec__body form'));
  assert.ok(await until(() => q(win, '.formhint.err')), 'wrong current password must show an error');
  assert.ok(q(win, '.asec__body form'), 'form must stay open after a rejected attempt');

  type(win, curInput, 'hunter2');
  submit(win, q(win, '.asec__body form'));
  assert.ok(await until(() => win.api.filter(c => c.call === 'POST /api/account/password').length === 2), 'must POST /api/account/password');
  assert.ok(await until(() => !q(win, '.asec__body form')), 'form should close on success');
});

test('a passwordless (magic-link/BankID) account can set a password with no current one', async () => {
  const me = { user: { ...mari, hasPassword: false }, watches: [], settings: {} };
  const win = boot('http://pricy.test/account', { me });
  assert.ok(await until(() => q(win, '.acct')), 'account page did not render');
  qa(win, '.asec__body .btn').find(b => /set password/i.test(b.textContent)).click();
  assert.ok(await until(() => q(win, '.asec__body form')), 'password form did not open');
  assert.strictEqual(qa(win, '.asec__body form .formfield').length, 1, 'passwordless account must not ask for a current password');

  type(win, q(win, '.asec__body form .formfield input'), 'brandnew1');
  submit(win, q(win, '.asec__body form'));
  assert.ok(await until(() => win.api.some(c => c.call === 'POST /api/account/password')), 'must POST /api/account/password');
  assert.strictEqual(win.api.find(c => c.call === 'POST /api/account/password').body.currentPassword, '');
});

test('profile email field is read-only with a hint — it must not pretend to save', async () => {
  const me = { user: mari, watches: [], settings: {} };
  const win = boot('http://pricy.test/account', { me });
  assert.ok(await until(() => q(win, '.acct input[type="email"]')), 'email field did not render');
  const email = q(win, '.acct input[type="email"]');
  assert.strictEqual(email.readOnly, true, 'email input must be readOnly');
  assert.strictEqual(email.value, mari.email);
  assert.ok(/changing it isn't available yet/i.test(q(win, '.acct').textContent), 'read-only hint missing');
});

test('toggling a notification preference PUTs /api/settings and survives a reload', async () => {
  const me = { user: mari, watches: [], settings: { weekly: false } };
  const win = boot('http://pricy.test/account?tab=notifications', { me });
  assert.ok(await until(() => q(win, '.acct')), 'account page did not render');
  const weeklyToggle = qa(win, '.arow').find(r => /weekly summary/i.test(r.textContent)).querySelector('.tgl');
  weeklyToggle.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/settings')), 'toggle must PUT /api/settings');
  const put = win.api.find(c => c.call === 'PUT /api/settings');
  assert.strictEqual(put.body.weekly, true);
  assert.strictEqual(me.settings.weekly, true, 'server-side settings must be updated');
});

test('marketing email toggle in Privacy saves as a settings patch', async () => {
  const me = { user: mari, watches: [], settings: {} };
  const win = boot('http://pricy.test/account?tab=privacy', { me });
  assert.ok(await until(() => q(win, '.acct')), 'account page did not render');
  const marketingToggle = qa(win, '.arow').find(r => /marketing emails/i.test(r.textContent)).querySelector('.tgl');
  marketingToggle.click();
  assert.ok(await until(() => win.api.some(c => c.call === 'PUT /api/settings')), 'toggle must PUT /api/settings');
  assert.strictEqual(win.api.find(c => c.call === 'PUT /api/settings').body.marketing, true);
});

// ---------- compare ----------

test('compare: mark two results, tray appears, Compare opens the side-by-side page', async () => {
  const win = boot('http://pricy.test/search?cat=Audio', { session: true });
  assert.ok(await until(() => qa(win, '.rrow .cmpbtn, .rcard .cmpbtn').length >= 2), 'compare buttons missing on results');
  assert.ok(!q(win, '.ctray'), 'tray must be hidden with nothing marked');
  // re-query after each click — marking re-renders the rows, detaching old nodes
  qa(win, '.rrow .cmpbtn, .rcard .cmpbtn')[0].click();
  assert.ok(await until(() => q(win, '.ctray')), 'tray did not appear after first mark');
  assert.ok(q(win, '.ctray__item .ctray__pop'), 'tray item hover popover missing');
  assert.ok(!q(win, '.ctray .btn--primary').disabled, 'Compare must be enabled even with one product');
  qa(win, '.cmpbtn:not(.is-on)')[0].click();
  assert.ok(await until(() => q(win, '.ctray .btn--primary').textContent.includes('(2)')), 'count did not update after second mark');
  q(win, '.ctray .btn--primary').click();
  assert.ok(await until(() => q(win, '.cmp__head')), 'compare page did not render');
  assert.strictEqual(win.location.pathname, '/compare');
  assert.strictEqual(qa(win, '.cmp__prod').length, 2, 'both products should be columns');
  assert.ok(!q(win, '.ctray'), 'tray must be hidden on the compare page itself');
  // add-product menu: search filters the candidates, picking adds a column
  q(win, '.cmp__addbtn').click();
  assert.ok(await until(() => q(win, '.cmp__search input')), 'add menu search input missing');
  type(win, q(win, '.cmp__search input'), 'zzz-no-such-product');
  assert.ok(await until(() => q(win, '.cmp__none')), 'empty search state missing');
  type(win, q(win, '.cmp__search input'), '');
  assert.ok(await until(() => qa(win, '.cmp__cand:not(.cmp__cand--all)').length > 0), 'candidates missing');
  qa(win, '.cmp__cand:not(.cmp__cand--all)')[0].click();
  assert.ok(await until(() => qa(win, '.cmp__prod').length === 3), 'picked candidate should become a third column');
});

test('compare: a product from another category is refused with a notice', async () => {
  const win = boot('http://pricy.test/search?q=sony', { session: true }); // sony spans Audio/Gaming/TV
  assert.ok(await until(() => qa(win, '.cmpbtn').length >= 2), 'compare buttons missing on results');
  qa(win, '.cmpbtn')[0].click();
  assert.ok(await until(() => q(win, '.ctray')), 'tray did not appear');
  qa(win, '.cmpbtn:not(.is-on)')[0].click();
  assert.ok(await until(() => q(win, '.ctray__notice')), 'cross-category add should show the notice');
  assert.strictEqual(qa(win, '.ctray__item').length, 1, 'the mismatched product must not be added');
});

test('optimizer: plans over served real-shop offers, shipping once per shop', async () => {
  // Shops deliberately NOT in the demo SHOPS list: optimize()'s set-cover and
  // baseline passes iterate SHOPS, so without boot's live replacement (from
  // meta.shopStats) every item silently falls out of the fewest-shops plan —
  // whose lower total then replaces cheapest via the upstream guard.
  const off = (shop, price, shipCost) => ({ shop, price, shipCost, total: price + shipCost, stock: true, eta: 'In stock', url: 'https://www.example.no', updated_at: Date.now() });
  const catalog = [
    { id: 'a', name: 'Alpha', brand: 'X', cat: 'Audio', icon: 'headphones', best: 100, shops: 2, stock: true, offers: [off('Fjellsport', 100, 59), off('Sport 1', 120, 99)] },
    { id: 'b', name: 'Beta', brand: 'X', cat: 'Audio', icon: 'headphones', best: 150, shops: 2, stock: true, offers: [off('Lekia', 150, 79), off('Fjellsport', 200, 59)] },
    { id: 'c', name: 'Gamma', brand: 'X', cat: 'Audio', icon: 'headphones', best: 960, shops: 1, stock: true, offers: [off('Lekia', 960, 79)] },
  ];
  const me = { user: mari, watches: [{ id: 'a', target: 90, paused: 0 }, { id: 'b', target: 140, paused: 0 }, { id: 'c', target: 900, paused: 0 }] };
  const win = boot('http://pricy.test/optimizer', { session: true, me, catalog });
  assert.ok(await until(() => qa(win, '.opt-card').length === 2), 'two shop groups (Fjellsport + Lekia)');
  assert.ok(win.SHOPS.includes('Fjellsport'), 'SHOPS replaced in place from meta.shopStats');
  const names = qa(win, '.opt-row .nm').map(e => e.textContent);
  for (const n of ['Alpha', 'Beta', 'Gamma']) assert.ok(names.includes(n), n + ' must be in the plan');
  // threshold-aware shipping (meta.shipping → window.SHIPPING → shipFor): the
  // Lekia group sums 150 + 960 = 1110 ≥ its freeOver 999, so shipping is FREE
  // even though each offer's individual shipCost says kr 79
  const lekia = qa(win, '.opt-card').find(c => c.textContent.includes('Lekia'));
  assert.match(lekia.textContent, /Fri frakt/, 'basket crossing freeOver ships free');
  // cheapest: a@Fjellsport(100) + ship 59, b+c@Lekia(1110) + ship 0 = 1 269
  assert.match(q(win, '.opt-verdict').textContent, /1 269/, 'total = items + threshold-aware shipping once per shop');
  assert.match(q(win, '.opt-verdict').textContent, /2 butikker/);
});

// ---------- structural chrome + chaos monkey ----------
// A sync once shipped without the footer and no test noticed. CHROME lists
// the load-bearing structure per screen; the test asserts it all renders,
// then chaos-monkey style removes one randomly picked required element and
// asserts the same check detects the hole — proving the detector isn't
// vacuous. Random per run; failures print the seed, rerun with CHAOS_SEED=n.
const CHROME = [
  { url: '/', sels: ['.app-hdr', '.app-hdr__search input', '.avatar', '.sec', '.ftr'] },
  { url: '/browse', sels: ['.app-hdr', '.browse__head', '.ftr'] },
  { url: '/alerts', opts: { me: { user: mari, watches: [{ id: 'xm5', target: 3100, paused: 0 }] } }, sels: ['.app-hdr', '.alrow', '.ftr'] },
  { url: '/account', opts: { me: { user: mari, watches: [], settings: {} } }, sels: ['.app-hdr', '.acct', '.ftr'] },
  { url: '/autobuy', sels: ['.app-hdr', '.fm-cer', '.ftr'] },
  { url: '/product/xm5', sels: ['.app-hdr', '.watchbox', '.orow', '.ftr'] },
  { url: '/search?q=sony', sels: ['.app-hdr', '.rrow, .rcard', '.ftr'] },
  { url: '/compare', sels: ['.app-hdr', '.empty', '.ftr'] }, // empty state — CompareStore starts empty per boot
];
const missingChrome = (win, sels) => sels.filter(sel => !q(win, sel));

test('chaos monkey: required chrome renders, and its removal is detected', async () => {
  const seed = Number(process.env.CHAOS_SEED) || (Date.now() & 0xffff);
  let s = seed;
  // ponytail: LCG, plenty for picking indexes
  const rand = n => (s = (s * 1103515245 + 12345) & 0x7fffffff) % n;
  for (const { url, sels, opts } of CHROME) {
    const win = boot('http://pricy.test' + url, { session: true, ...opts });
    await until(() => missingChrome(win, sels).length === 0);
    assert.deepStrictEqual(missingChrome(win, sels), [], url + ' is missing required chrome');
    const victim = sels[rand(sels.length)];
    qa(win, victim).forEach(el => el.remove());
    assert.ok(missingChrome(win, sels).includes(victim),
      `removing "${victim}" from ${url} went undetected (seed ${seed})`);
  }
});

test('lucide icons render as inline svg', async () => {
  const win = boot('http://pricy.test/', { session: true });
  const ok = await until(() => qa(win, '#root .icon svg, #root svg.lucide').length > 0 && qa(win, '#root i[data-lucide]').length === 0);
  assert.ok(ok, 'expected every <i data-lucide> replaced by svg');
});

// Add-to-home-screen. Everything below is what an install actually reads:
// break any one link and the site silently stops being installable.
test('dist is installable as a home-screen app', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest\.json">/);
  // iOS ignores manifest icons and SVG touch icons — it needs this PNG
  assert.match(html, /<link rel="apple-touch-icon" href="\/icon-512\.png">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);

  const m = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.display, 'standalone'); // "browser" = no install offer
  for (const k of ['name', 'short_name', 'start_url', 'theme_color', 'background_color']) {
    assert.ok(m[k], `manifest is missing ${k}`);
  }
  // Chrome wants a 512 icon and it has to be a file that exists in dist
  const icon = m.icons.find(i => i.sizes === '512x512');
  assert.ok(icon, 'manifest declares no 512x512 icon');
  assert.ok(fs.existsSync(path.join(DIST, icon.src.slice(1))), `${icon.src} is not in dist/`);

  // sw.js must sit at the dist root to claim '/' as its scope, and Chrome
  // ignores a service worker whose fetch handler is empty
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /respondWith/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'boot.jsx'), 'utf8'),
    /serviceWorker\?\.register\('\/sw\.js'\)/);
});

// The install bar is the only in-app surface for this: Android gets a real
// button, iOS Safari (which never fires beforeinstallprompt) gets the Share
// gesture spelled out, everything else gets nothing.
test('install bar: Android prompts, iOS instructs, dismissal sticks', async () => {
  const win = boot('http://pricy.test/', { session: true });
  await until(() => q(win, '.app-hdr'));
  assert.strictEqual(q(win, '.instl'), null, 'no install bar before the browser offers one');

  let prompted = 0;
  const e = new win.Event('beforeinstallprompt');
  e.prompt = () => { prompted++; };
  win.dispatchEvent(e);
  const bar = await until(() => q(win, '.instl'));
  assert.ok(bar, 'beforeinstallprompt must reveal the install bar');
  const btn = qa(win, '.instl .btn').find(b => /install app/i.test(b.textContent));
  assert.ok(btn, 'Android install bar must offer an Install app button');
  btn.click();
  assert.strictEqual(prompted, 1, 'Install app must fire the browser install prompt');
  assert.ok(await until(() => q(win, '.instl') === null), 'bar must go away once prompted');

  // iOS: no event ever fires, so the bar has to appear off the user agent alone
  const ios = boot('http://pricy.test/', { session: true });
  Object.defineProperty(ios.navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', configurable: true });
  const iosBar = await until(() => q(ios, '.instl'));
  assert.ok(iosBar, 'iOS must get the install bar with no beforeinstallprompt');
  assert.match(iosBar.textContent, /Add to Home Screen/i, 'iOS needs the Share-sheet gesture spelled out');
  assert.strictEqual(qa(ios, '.instl .btn').length, 0, 'iOS has no programmatic install — offer no button');
  q(ios, '.instl__x').click();
  assert.ok(await until(() => q(ios, '.instl') === null), 'dismiss must hide the bar');
  assert.strictEqual(ios.localStorage.getItem('pricy_install_dismissed'), '1', 'dismissal must persist');

  // next visit in the same browser
  const again = boot('http://pricy.test/', { session: true, storage: { pricy_install_dismissed: '1' } });
  Object.defineProperty(again.navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', configurable: true });
  await until(() => q(again, '.app-hdr'));
  assert.strictEqual(q(again, '.instl'), null, 'a dismissed install bar must stay dismissed');
});
