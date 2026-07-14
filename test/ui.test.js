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

// jsdom has no fetch — stub the whole API surface boot.jsx talks to.
// `session`/`me` seed the /api/me answer; every call lands in win.api.
function boot(url = 'http://pricy.test/', { session = false, me, catalog } = {}) {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.scrollTo = () => {};
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
    if (u === '/api/watches') return ok({ ok: true });
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

test('lucide icons render as inline svg', async () => {
  const win = boot('http://pricy.test/', { session: true });
  const ok = await until(() => qa(win, '#root .icon svg, #root svg.lucide').length > 0 && qa(win, '#root i[data-lucide]').length === 0);
  assert.ok(ok, 'expected every <i data-lucide> replaced by svg');
});
