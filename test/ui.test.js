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
  // /api/catalog.json is a Worker route now (4c) — stub it with the
  // build-generated seed, the same shape the route serves
  CATALOG_JSON = CATALOG_JSON || JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worker', 'seed.json'), 'utf8'));
  let ME = me || (session ? { user: mari, watches: [] } : null);
  win.api = []; // 'METHOD /path [body]' log for assertions
  const ok = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
  win.fetch = (u, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    win.api.push({ call: (opts.method || 'GET') + ' ' + u, body });
    if (u === '/api/catalog.json') return ok(catalog || CATALOG_JSON);
    if (u === '/api/me') return ME ? ok(ME) : ok({ error: 'unauthenticated' }, 401);
    if (u === '/api/auth/login' || u === '/api/auth/signup') {
      const name = body.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/(^| )\w/g, c => c.toUpperCase());
      ME = { user: { email: body.email, name, initials: name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') }, watches: [] };
      return ok(ME);
    }
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

test('logged out: search URL is gated to the login screen', async () => {
  const win = boot('http://pricy.test/search?q=sony');
  await tick();
  assert.ok(q(win, '.authcard'), 'expected login gate');
  assert.strictEqual(qa(win, '.rrow, .rcard').length, 0, 'results must not render logged out');
});

test('logged out: every app screen is gated, public ones are not', async () => {
  for (const p of ['/alerts', '/account', '/browse', '/autobuy', '/product/xm5']) {
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

test('magic-link "Open the link" acts as a verified signup', async () => {
  const win = boot('http://pricy.test/login');
  await tick();
  qa(win, '.seg button').find(b => /magic link/i.test(b.textContent)).click();
  type(win, q(win, '.authcard input[type="email"]'), 'kari@nordmann.no');
  submit(win, q(win, '.authcard form'));
  assert.ok(await until(() => q(win, '.authcard .addr')), 'sent screen missing');
  qa(win, '.authcard button').find(b => /open the link/i.test(b.textContent)).click();
  assert.ok(await until(() => q(win, '.avatar')), 'should reach the signed-in app');
  assert.ok(win.api.some(c => c.call === 'POST /api/auth/signup'), 'emailed-link simulation must upsert like verify does');
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
  const audioCount = cat.filter(p => p.cat === 'Audio').length;
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

test('rendered catalog comes from /api/catalog.json, not the baked constants', async () => {
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

test('lucide icons render as inline svg', async () => {
  const win = boot('http://pricy.test/', { session: true });
  const ok = await until(() => qa(win, '#root .icon svg, #root svg.lucide').length > 0 && qa(win, '#root i[data-lucide]').length === 0);
  assert.ok(ok, 'expected every <i data-lucide> replaced by svg');
});
