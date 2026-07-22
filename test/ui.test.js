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
function boot(url = 'http://pricy.test/', { session = false, me, catalog, alerts = [], storage } = {}) {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.scrollTo = () => {};
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
      } else if (p.get('sort') === 'drop') {
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
      };
      return ok({ meta, products: out });
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

test('PDP: Go to shop opens the best offer url; disabled when no offer has one', async () => {
  const win = boot('http://pricy.test/product/xm5', { session: true });
  const opened = [];
  win.open = (...args) => { opened.push(args); return null; };
  const goBtn = await until(() => qa(win, '.btn').find(b => /go to shop/i.test(b.textContent)));
  assert.ok(goBtn, 'Go to shop button missing on PDP');
  const offers = CATALOG_JSON.find(p => p.id === 'xm5').offers;
  const expected = offers[0].url || offers.find(o => o.url)?.url;
  assert.ok(expected, 'seed must give xm5 an offer url for this test');
  goBtn.click();
  assert.deepStrictEqual(opened, [[expected, '_blank', 'noopener']], 'must open the best offer url in a new tab');
  const visit = qa(win, '.btn').find(b => /^visit$/i.test(b.textContent.trim()) && !b.disabled);
  assert.ok(visit, 'at least one per-offer Visit button must be enabled when offers have urls');
  visit.click();
  assert.strictEqual(opened.length, 2, 'Visit must open the offer url');
  assert.ok(offers.some(o => o.url === opened[1][0]), 'Visit must open one of the offer urls');

  // no urls anywhere (prod state before real ingest) → disabled, not broken
  const bare = CATALOG_JSON.map(p => ({ ...p, offers: p.offers.map(({ url, ...o }) => o) }));
  const win2 = boot('http://pricy.test/product/xm5', { session: true, catalog: bare });
  const goBtn2 = await until(() => qa(win2, '.btn').find(b => /go to shop/i.test(b.textContent)));
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
  // category suggestion: real count from the served catalog, picks as a cat filter
  type(win, input, 'audio');
  const audioCount = cat.filter(p => p.cat === 'Audio' && !p.family).length; // heads only — children stay out of CAT_OF
  const audioItem = await until(() =>
    qa(win, '.suggest__item').find(el => /Audio/.test(el.textContent) && el.textContent.includes(audioCount + ' products')));
  assert.ok(audioItem, 'Audio category must show the real catalog count, not the demo string');
  audioItem.click();
  assert.ok(await until(() => win.location.pathname + win.location.search === '/search?cat=Audio'),
    'category pick should filter by category, not run a text query');
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
});

test('lazy catalog: browse shows FULL category counts (meta.cats) off its small drops slice', async () => {
  const win = boot('http://pricy.test/browse', { session: true });
  assert.ok(await until(() => qa(win, '.bigcat').length > 0), 'category tiles did not render');
  assert.ok(win.api.some(c => /GET \/api\/products\?limit=4&perCat=1&sort=drop/.test(c.call)),
    'browse must prefetch the per-cat drops slice, got: ' + win.api.map(c => c.call).join(' | '));
  assert.ok(!win.api.some(c => c.call === 'GET /api/products'), 'browse must not fetch all heads anymore');
  const heads = CATALOG_JSON.filter(p => !p.family);
  const audio = qa(win, '.bigcat').find(el => /Audio/.test(el.textContent));
  const audioTotal = heads.filter(p => p.cat === 'Audio').length;
  assert.ok(audio.textContent.includes(`${audioTotal} products`),
    `Audio tile must show the full served count (${audioTotal}), not the cache size — got: ` + audio.textContent);
  // every served category renders, even though the cache holds only the
  // drops slice (the prototype's CATEGORIES list covers all seed cats now)
  assert.strictEqual(qa(win, '.bigcat').length, new Set(heads.map(p => p.cat)).size,
    'every served category must render even though the cache holds a slice');
  assert.ok(qa(win, '.bigcat').some(el => /E-readers/.test(el.textContent)), 'E-readers tile must render');
  assert.ok(win.CATALOG.length < heads.length, 'the cache must hold only the drops slice');
});

test('dynamic categories: a server cat the prototype does not know renders with its served icon', async () => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8')).filter(p => !p.family);
  const cats = products.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), { Wearables: 5 });
  const meta = { products: products.length + 5, shops: 3, freshest: Date.now(), cats, icons: { Wearables: 'watch' } };
  const win = boot('http://pricy.test/browse', { session: true, catalog: { meta, products } });
  assert.ok(await until(() => qa(win, '.bigcat').length > 0), 'category tiles did not render');
  assert.ok(win.CATEGORIES.includes('Wearables'), 'served cat must join CATEGORIES in place');
  assert.strictEqual(win.CAT_ICONS.Wearables, 'watch', 'served icon must land in CAT_ICONS');
  const tile = qa(win, '.bigcat').find(el => /Wearables/.test(el.textContent));
  assert.ok(tile, 'Wearables tile must render on browse');
  assert.ok(tile.textContent.includes('5'), 'tile must show the served count, got: ' + tile.textContent);
});

// FILTERS-PLAN: data-driven per-category facet filters on Results
const facetGrp = (win, title) => qa(win, '.filters__grp').find(g => g.querySelector('h4')?.textContent === title);

test('facet filters: TV renders spec-derived option groups, clicking filters rows, NC gone outside Audio', async () => {
  const win = boot('http://pricy.test/search?cat=TV', { session: true });
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length > 0), 'results did not render');
  const size = facetGrp(win, 'Screen size');
  assert.ok(size, 'Screen size facet group must render for cat=TV');
  const opts = [...size.querySelectorAll('.check')].map(el => el.textContent);
  assert.ok(opts[0].startsWith('55 ″') && opts[1].startsWith('65 ″'), 'options must be parsed+unit labels, numeric ascending, got: ' + opts.join(' | '));
  assert.ok(facetGrp(win, 'Panel'), 'Panel facet group must render');
  assert.ok(!qa(win, '.check, .fpill').some(el => el.textContent.includes('Noise cancelling')), 'hardcoded NC filter must be gone outside Audio');

  const before = qa(win, '.rrow, .rcard').length;
  [...size.querySelectorAll('.check')][0].click(); // 55 ″
  assert.ok(await until(() => qa(win, '.rrow, .rcard').length === 1), 'selecting 55 ″ must filter to the one 55-inch TV (started with ' + before + ')');
  const name = win.CATALOG.find(p => p.id === 'tv').name;
  assert.ok(qa(win, '.rrow, .rcard')[0].textContent.includes(name), 'the surviving row must be the 55″ set');
  assert.ok(qa(win, '.fchip').some(el => el.textContent.includes('Screen size: 55 ″')), 'active facet must chip');
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

  const gaming = boot('http://pricy.test/search?cat=Gaming', { session: true });
  assert.ok(await until(() => qa(gaming, '.rrow, .rcard').length > 0), 'gaming results did not render');
  const titles = qa(gaming, '.filters__grp').map(g => g.querySelector('h4')?.textContent);
  assert.deepStrictEqual(titles, ['Category', 'Brand', 'Price (kr)', 'Rating', 'Show only'], 'no facet groups for a cat without defs, got: ' + titles.join(' | '));
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
  const opened = [];
  win.open = u => { opened.push(u); return null; };
  const visits = qa(win, '.orow .btn').filter(b => /visit/i.test(b.textContent));
  visits[0].click();
  assert.deepStrictEqual(opened, ['https://shop.example/xm5'], 'Visit must open the offer url');
  assert.ok(visits.slice(1).every(b => b.disabled), 'offers without a url must render a disabled Visit');
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
