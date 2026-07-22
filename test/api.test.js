// API tests: drive worker/index.js's fetch handler directly in Node, with
// D1 emulated over node:sqlite (same SQL engine family — real queries, no
// workerd). Request/Response/crypto come from the Node globals.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// minimal D1 shape: prepare().bind() → first/all/run, plus exec and batch
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return {
    exec: async (sql) => db.exec(sql),
    prepare: (sql) => ({ bind: (...args) => stmt(sql, args), ...stmt(sql, []) }),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { for (const s of stmts) await s.run(); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

let worker, parsePrice;
before(async () => {
  worker = (await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'index.js')))).default;
  ({ parsePrice } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'sources.js'))));
});

const api = (env) => (pathname, { method = 'GET', body, cookie } = {}) =>
  worker.fetch(new Request('http://pricy.test' + pathname, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), env);

const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

// real magic-link login: request logs the link (no SEND_EMAIL in tests),
// verify redeems it — the only way to mint a passwordless account now
async function magicLogin(call, email) {
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { await call('/api/auth/request', { method: 'POST', body: { email } }); }
  finally { console.log = realLog; }
  const link = logs.join('\n').match(/http:\/\/pricy\.test(\/api\/auth\/verify\?token=[0-9a-f]{64})/);
  assert.ok(link, 'magic link was not logged');
  return cookieOf(await call(link[1]));
}

test('signup issues an HttpOnly session cookie and /api/me returns the user', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/me')).status, 401, 'unauthenticated /api/me must 401');

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: 'Ola@Nordmann.no', password: 'correcthorse1' } });
  assert.strictEqual(signup.status, 200);
  const setCookie = signup.headers.get('set-cookie');
  assert.match(setCookie, /pricy_session=[0-9a-f]{64}/, 'session cookie missing');
  assert.match(setCookie, /HttpOnly/, 'cookie must be HttpOnly');

  const me = await (await call('/api/me', { cookie: cookieOf(signup) })).json();
  assert.ok(Number.isFinite(me.user.createdAt), 'createdAt must be the real signup timestamp');
  assert.deepStrictEqual(me.user, { email: 'ola@nordmann.no', name: 'Ola', initials: 'O', hasPassword: true, createdAt: me.user.createdAt });
  assert.deepStrictEqual(me.watches, []);
});

test('login is strict (existing accounts only, correct password); signup is create-or-log-in', async () => {
  const call = api({ DB: d1() });
  const unknown = await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } });
  assert.strictEqual(unknown.status, 401, 'login must not create accounts');
  assert.strictEqual(unknown.headers.get('set-cookie'), null, 'no cookie on failed login');

  await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } });
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } })).status, 200, 'login must work after signup with the right password');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'wrong-password' } })).status, 401, 'wrong password must be rejected');
  assert.strictEqual((await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } })).status, 200, 'signup with the right password just logs in');
});

test('passwordless signup is pinned to the BankID demo account', async () => {
  const call = api({ DB: d1() });
  const res = await call('/api/auth/signup', { method: 'POST', body: { email: 'anyone@example.no' } });
  assert.strictEqual(res.status, 400, 'arbitrary passwordless upsert must be rejected');
  assert.strictEqual(res.headers.get('set-cookie'), null, 'no session for a rejected signup');
  assert.strictEqual((await call('/api/auth/signup', { method: 'POST', body: { email: 'demo@pricy.no' } })).status, 200, 'fake BankID demo account still works');
});

test('signup cannot take over an existing account', async () => {
  const call = api({ DB: d1() });
  // passworded account: wrong password → no session
  await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } });
  const wrong = await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'attackerpass1' } });
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(wrong.headers.get('set-cookie'), null, 'no session for someone else\'s account');
  // magic-link (passwordless) account: signup must not attach a password to it
  await magicLogin(call, 'kari@example.no');
  const grab = await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'attackerpass1' } });
  assert.strictEqual(grab.status, 401, 'signup on a magic-link account must be refused');
  assert.strictEqual(grab.headers.get('set-cookie'), null);
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'attackerpass1' } })).status, 401, 'no password may have been attached');
});

test('password signup requires 8+ chars; login requires and verifies the password', async () => {
  const call = api({ DB: d1() });
  const short = await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'short1' } });
  assert.strictEqual(short.status, 400, 'short password must be rejected');

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } });
  assert.strictEqual(signup.status, 200);

  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no' } })).status, 400, 'login without a password must be rejected');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'nope-nope' } })).status, 401, 'wrong password must be rejected');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 200);
});

test('an account created without a password (BankID/magic-link bridge) cannot log in with one', async () => {
  const call = api({ DB: d1() });
  await call('/api/auth/signup', { method: 'POST', body: { email: 'demo@pricy.no' } });
  const res = await call('/api/auth/login', { method: 'POST', body: { email: 'demo@pricy.no', password: 'anything1' } });
  assert.strictEqual(res.status, 401);
});

test('an upsert never overwrites a password that is already set', async () => {
  const call = api({ DB: d1() });
  await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } });
  // a later magic-link login upserts passwordless — must not wipe the password
  await magicLogin(call, 'kari@example.no');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 200, 'original password must survive a magic-link login');
});

test('magic link: request logs a single-use link, verify sets the session', async () => {
  const call = api({ DB: d1() });
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const res = await call('/api/auth/request', { method: 'POST', body: { email: 'kari.nordmann@example.no' } });
    assert.strictEqual(res.status, 200);
  } finally { console.log = realLog; }
  const link = logs.join('\n').match(/http:\/\/pricy\.test(\/api\/auth\/verify\?token=[0-9a-f]{64})/);
  assert.ok(link, 'magic link was not logged');

  const verify = await call(link[1]);
  assert.strictEqual(verify.status, 302);
  assert.strictEqual(verify.headers.get('location'), 'http://pricy.test/');
  const cookie = cookieOf(verify);
  const me = await (await call('/api/me', { cookie })).json();
  assert.strictEqual(me.user.email, 'kari.nordmann@example.no');
  assert.strictEqual(me.user.name, 'Kari Nordmann');
  assert.strictEqual(me.user.initials, 'KN');

  // token is single-use
  const again = await call(link[1]);
  assert.strictEqual(again.headers.get('location'), 'http://pricy.test/login', 'reused token must not log in');
});

test('magic link: with a SEND_EMAIL binding the link is emailed, not logged', async () => {
  const sent = [];
  const call = api({ DB: d1(), SEND_EMAIL: { send: async (msg) => { sent.push(msg); } } });
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    assert.strictEqual((await call('/api/auth/request', { method: 'POST', body: { email: 'kari.nordmann@example.no' } })).status, 200);
  } finally { console.log = realLog; }

  assert.strictEqual(sent.length, 1, 'exactly one email sent');
  assert.strictEqual(sent[0].to, 'kari.nordmann@example.no');
  assert.strictEqual(sent[0].from.email, 'login@pricy.no');
  const link = sent[0].text.match(/http:\/\/pricy\.test(\/api\/auth\/verify\?token=[0-9a-f]{64})/);
  assert.ok(link, 'email text must contain the verify link');
  assert.ok(sent[0].html.includes(link[0]), 'email html must contain the verify link');
  assert.ok(!logs.join('\n').includes('magic link'), 'link must not be console-logged when emailed');

  const verify = await call(link[1]);
  assert.strictEqual(verify.status, 302);
  assert.strictEqual(verify.headers.get('location'), 'http://pricy.test/');

  // a failing send surfaces as an error, not a silent ok
  const broken = api({ DB: d1(), SEND_EMAIL: { send: async () => { throw new Error('boom'); } } });
  assert.strictEqual((await broken('/api/auth/request', { method: 'POST', body: { email: 'kari.nordmann@example.no' } })).status, 502);
});

test('bad email is rejected on all auth endpoints', async () => {
  const call = api({ DB: d1() });
  for (const p of ['/api/auth/login', '/api/auth/signup', '/api/auth/request']) {
    assert.strictEqual((await call(p, { method: 'POST', body: { email: 'not-an-email' } })).status, 400, p);
    assert.strictEqual((await call(p, { method: 'POST' })).status, 400, p + ' (no body)');
  }
});

test('watchlist persists per user and requires auth', async () => {
  const call = api({ DB: d1() });
  const watches = [{ id: 'xm5', target: 3100, paused: false }, { id: 'lgc3', target: 12000, paused: true }];
  assert.strictEqual((await call('/api/watches', { method: 'PUT', body: watches })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.strictEqual((await call('/api/watches', { method: 'PUT', body: watches, cookie: ola })).status, 200);
  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.deepStrictEqual(me.watches, [
    { id: 'xm5', target: 3100, paused: 0, hit: 0 },
    { id: 'lgc3', target: 12000, paused: 1, hit: 0 },
  ]);

  // replace-all semantics, and another user sees nothing
  await call('/api/watches', { method: 'PUT', body: [{ id: 'xm5', target: 2999 }], cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).watches, [{ id: 'xm5', target: 2999, paused: 0, hit: 0 }]);
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  assert.deepStrictEqual((await (await call('/api/me', { cookie: kari })).json()).watches, []);

  for (const bad of ['nope', [{ id: 42 }], [{ id: 'a', target: 'high' }], [{ id: 'a' }, { id: 'a' }]]) {
    assert.strictEqual((await call('/api/watches', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
});

test('account name and notification settings persist per user and require auth', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/account', { method: 'PATCH', body: { name: 'Ola' } })).status, 401, 'PATCH without session must 401');
  assert.strictEqual((await call('/api/settings', { method: 'PUT', body: { email: true } })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const patch = await call('/api/account', { method: 'PATCH', body: { name: 'Ola Norge' }, cookie: ola });
  assert.strictEqual(patch.status, 200);
  assert.deepStrictEqual((await patch.json()).user, { email: 'ola@nordmann.no', name: 'Ola Norge', initials: 'ON' });

  const settings = await call('/api/settings', { method: 'PUT', body: { email: false, digest: 'daily' }, cookie: ola });
  assert.strictEqual(settings.status, 200);

  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.strictEqual(me.user.name, 'Ola Norge', 'name change must persist across requests');
  assert.deepStrictEqual(me.settings, { email: false, digest: 'daily' });

  // another user's settings/name are untouched
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const kariMe = await (await call('/api/me', { cookie: kari })).json();
  assert.strictEqual(kariMe.user.name, 'Kari');
  assert.deepStrictEqual(kariMe.settings, {});

  for (const bad of [{}, { name: '' }, { name: '  ' }, { name: 'x'.repeat(101) }]) {
    assert.strictEqual((await call('/api/account', { method: 'PATCH', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
  for (const bad of [[], 'nope']) {
    assert.strictEqual((await call('/api/settings', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await call('/api/settings', { method: 'PUT', cookie: ola })).status, 400, 'missing body must 400');
});

test('fullmakt + active auto-buy orders persist per user via PUT /api/autobuy', async () => {
  const call = api({ DB: d1() });
  const blob = {
    signed: true, signedAt: '11 Jul 2026, 09:12', cap: 20000, payment: 'vipps',
    orders: [{ id: 'xm5', max: 2800, expires: '10 Aug 2026', shops: 'Any shop' }],
  };
  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: blob })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.strictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, null, 'a new user has signed nothing');

  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: blob, cookie: ola })).status, 200);
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, blob, 'the blob must round-trip verbatim');

  // revoke: signed false, no armed orders — also round-trips
  const revoked = { signed: false, signedAt: null, cap: 20000, payment: 'vipps', orders: [] };
  await call('/api/autobuy', { method: 'PUT', body: revoked, cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, revoked);

  // another user is untouched
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  assert.strictEqual((await (await call('/api/me', { cookie: kari })).json()).autobuy, null);

  for (const bad of [[], 'nope', { signed: true }, { orders: 'nope' }]) {
    assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', cookie: ola })).status, 400, 'missing body must 400');
});

test('GDPR: export downloads the session user\'s data; delete removes every row and kills the session', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/account/export')).status, 401, 'export without session must 401');
  assert.strictEqual((await call('/api/account', { method: 'DELETE' })).status, 401, 'delete without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/watches', { method: 'PUT', body: [{ id: 'xm5', target: 2999 }], cookie: ola });
  await call('/api/settings', { method: 'PUT', body: { email: false, digest: 'daily' }, cookie: ola });

  const res = await call('/api/account/export', { cookie: ola });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="pricy-export\.json"/);
  const data = await res.json();
  assert.strictEqual(data.user.email, 'ola@nordmann.no');
  assert.deepStrictEqual(data.settings, { email: false, digest: 'daily' });
  assert.deepStrictEqual(data.watches.map(w => w.id), ['xm5']);
  assert.ok(Array.isArray(data.alerts) && Array.isArray(data.purchases));
  assert.ok(!JSON.stringify(data).includes('password_hash'), 'export must not leak the password hash');
  assert.strictEqual(data.user.hasPassword, true); // the boolean is fine, the hash is not

  // scoped to the session user, not all users
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const kariData = await (await call('/api/account/export', { cookie: kari })).json();
  assert.deepStrictEqual(kariData.watches, []);

  const del = await call('/api/account', { method: 'DELETE', cookie: ola });
  assert.strictEqual(del.status, 200);
  assert.match(del.headers.get('set-cookie'), /pricy_session=;.*Max-Age=0/, 'delete must expire the cookie');
  assert.strictEqual((await call('/api/me', { cookie: ola })).status, 401, 'session must be dead');
  assert.strictEqual((await call('/api/account', { method: 'DELETE', cookie: ola })).status, 401, 'second delete must 401');
  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } });
  assert.notStrictEqual(login.status, 200, 'the account itself must be gone');
  assert.strictEqual((await call('/api/me', { cookie: kari })).status, 200, 'other users unaffected');
});

test('changing password requires the current one and re-hashes; passwordless accounts just set one', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/account/password', { method: 'POST', body: { newPassword: 'correcthorse1' } })).status, 401, 'POST without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).user.hasPassword, true);

  assert.strictEqual((await call('/api/account/password', { method: 'POST', body: { newPassword: 'short1' }, cookie: ola })).status, 400, 'too-short new password');
  assert.strictEqual((await call('/api/account/password', { method: 'POST', body: { newPassword: 'newpassword1' }, cookie: ola })).status, 400, 'existing password requires currentPassword');
  const wrong = await call('/api/account/password', { method: 'POST', body: { currentPassword: 'nope-nope', newPassword: 'newpassword1' }, cookie: ola });
  assert.strictEqual(wrong.status, 401, 'wrong current password rejected');

  const ok = await call('/api/account/password', { method: 'POST', body: { currentPassword: 'correcthorse1', newPassword: 'newpassword1' }, cookie: ola });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } })).status, 401, 'old password must stop working');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'newpassword1' } })).status, 200, 'new password must work');

  // passwordless (magic-link/BankID) account: no current password needed
  const demo = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'demo@pricy.no' } }));
  assert.strictEqual((await (await call('/api/me', { cookie: demo })).json()).user.hasPassword, false);
  const setPw = await call('/api/account/password', { method: 'POST', body: { newPassword: 'brandnew1' }, cookie: demo });
  assert.strictEqual(setPw.status, 200);
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'demo@pricy.no', password: 'brandnew1' } })).status, 200);
});

test('logout kills the session and clears the cookie', async () => {
  const call = api({ DB: d1() });
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const out = await call('/api/logout', { method: 'POST', cookie });
  assert.match(out.headers.get('set-cookie'), /pricy_session=;.*Max-Age=0/, 'cookie must be cleared');
  assert.strictEqual((await call('/api/me', { cookie })).status, 401, 'session must be dead server-side');
});

test('unknown api routes 404', async () => {
  assert.strictEqual((await api({ DB: d1() })('/api/nope')).status, 404);
});

// 4c: dynamic catalog — seed.json is generated by `node build.js` (npm test does)
const seed = require(path.join(__dirname, '..', 'worker', 'seed.json'));

// body is {meta, products} since the honest-metrics pass
const catBody = async (call) => (await (await call('/api/catalog.json')).json()).products;

test('catalog route seeds D1 on first request and serves the demo shape, no auth', async () => {
  const call = api({ DB: d1() });
  const res = await call('/api/catalog.json');
  assert.strictEqual(res.status, 200);
  const { meta, products: cat } = await res.json();
  assert.strictEqual(cat.length, seed.length, 'every seed product must be served');

  // honest metrics: meta = real aggregates; seed rows carry no freshness stamp
  // (variant children ride in the seed but only heads count as products)
  assert.strictEqual(meta.products, seed.filter(p => !p.family).length);
  assert.ok(seed.some(p => p.family), 'seed must carry variant child rows (4e)');
  const child = seed.find(p => p.id === 'iphone~256-blue');
  assert.ok(child && child.family === 'iphone' && /256 GB.*Blue/.test(child.name), 'child meta must bake family + vlabel into the name');
  assert.ok(!child.variants, 'child rows must not carry the picker axes');
  assert.ok(seed.find(p => p.id === 'iphone').variants, 'head rows must keep their variants for the picker');
  assert.strictEqual(meta.shops, new Set(seed.flatMap(p => p.offers.map(o => o.shop))).size);
  assert.strictEqual(meta.freshest, null, 'freshest must be null until an ingest stamps an offer');

  const want = seed[0];
  const got = cat.find(p => p.id === want.id);
  assert.strictEqual(got.name, want.name);
  assert.strictEqual(got.cat, want.cat);
  assert.deepStrictEqual(got.history, want.history.slice(-24), 'history must round-trip through price_points');
  assert.deepStrictEqual(new Set(got.offers.map(o => o.shop)), new Set(want.offers.map(o => o.shop)));
  assert.strictEqual(got.best, Math.min(...want.offers.map(o => o.price)), 'best derives from offers');
  assert.strictEqual(got.shops, got.offers.length);
  assert.deepStrictEqual(got.offers.map(o => o.price), [...got.offers.map(o => o.price)].sort((a, b) => a - b), 'offers are price-ordered');

  // specs ride on head rows and round-trip through products.meta
  const seedSpecs = seed.find(p => p.id === 'airpods').specs;
  assert.ok(seedSpecs && seedSpecs.fit, 'seed head rows must carry specs from the prototype');
  assert.deepStrictEqual(cat.find(p => p.id === 'airpods').specs, seedSpecs, 'specs must round-trip through the catalog route');
  assert.ok(!child.specs, 'variant children must not duplicate head specs');
});

// extra.json heads (repo-side products the prototype doesn't know) ride the
// seed with no demo offers — served, searchable, and priced only by ingest
const extra = require(path.join(__dirname, '..', 'worker', 'extra.json'));
test('extra.json products are served offer-less, searchable, and priced by ingest', async () => {
  assert.ok(extra.length, 'extra.json must carry the expansion batch');
  const env = { DB: d1(), INGEST_TOKEN: 't' };
  const call = api(env);
  const cat = await catBody(call);
  for (const want of extra) {
    const got = cat.find(p => p.id === want.id);
    assert.ok(got, `extra product ${want.id} must be served`);
    assert.strictEqual(got.name, want.name);
    assert.deepStrictEqual(got.offers, [], `${want.id} must have no demo offers`);
    assert.strictEqual(got.best, undefined, 'no offers → no best price');
  }
  const q = (await (await call('/api/products?q=moccamaster')).json()).products;
  assert.ok(q.some(p => p.id === 'moccamaster'), 'extra products must be searchable');

  // ingest prices an extra product exactly like a prototype one
  const push = await worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify([{ product_id: 'moccamaster', shop: 'Power', price: 3499, stock: 1, url: 'https://www.power.no/x' }]),
  }), env);
  assert.strictEqual(push.status, 200);
  const after = (await catBody(call)).find(p => p.id === 'moccamaster');
  assert.strictEqual(after.best, 3499);
  assert.deepStrictEqual(after.history, [3499], 'first price point starts the history');
});

// Query-based catalog: /api/products serves slices in the catalog.json row
// shape — ids (expanded to family + neighbors), q (broad candidates, the
// client re-filters), cat, sort=drop; meta carries per-category head counts
test('GET /api/products: ids expand to head + siblings + same-cat neighbors', async () => {
  const call = api({ DB: d1() });
  const res = await call('/api/products?ids=iphone~256-blue');
  assert.strictEqual(res.status, 200);
  const { meta, products } = await res.json();

  const ids = products.map(p => p.id);
  assert.ok(ids.includes('iphone~256-blue'), 'requested child must be served');
  assert.ok(ids.includes('iphone'), 'child id must pull its head');
  assert.ok(ids.includes('iphone~128-blue'), 'head must pull every sibling child');
  const neighbors = products.filter(p => !p.family && p.id !== 'iphone' && p.cat === 'Phones');
  assert.ok(neighbors.length >= 1 && neighbors.length <= 4, 'same-cat head neighbors ride along for "More in {cat}"');

  // row shape matches catalog.json (offers price-ordered, derived fields on)
  const head = products.find(p => p.id === 'iphone');
  assert.strictEqual(head.best, Math.min(...head.offers.map(o => o.price)));
  assert.deepStrictEqual(head.history, seed.find(p => p.id === 'iphone').history.slice(-24));

  // meta: global aggregates + per-cat head counts (children never counted)
  assert.strictEqual(meta.products, seed.filter(p => !p.family).length);
  const wantCats = seed.filter(p => !p.family).reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {});
  assert.deepStrictEqual(meta.cats, wantCats, 'meta.cats counts heads only');
  assert.ok(Object.keys(wantCats).every(c => meta.icons?.[c]), 'meta.icons (cats.json registry) must cover every seed cat');
  assert.deepStrictEqual(meta.facets?.TV?.map(f => f.key), ['size', 'panel', 'refresh'], 'meta.facets serves the facets.json registry');

  const many = await call('/api/products?ids=' + Array.from({ length: 101 }, (_, i) => 'x' + i).join(','));
  assert.strictEqual(many.status, 400, '>100 ids must 400');
});

test('GET /api/products: q is a broad head-only candidate match with client token semantics', async () => {
  const call = api({ DB: d1() });
  const hit = (await (await call('/api/products?q=bose')).json()).products;
  assert.ok(hit.some(p => p.id === 'bose-ultra'), 'name/brand match must land');
  assert.ok(hit.every(p => !p.family), 'search serves heads only');

  const kw = (await (await call('/api/products?q=headphones')).json()).products;
  assert.ok(kw.some(p => p.id === 'bose-ultra'), 'kw-only tokens must match (kw lives in meta)');

  const short = (await (await call('/api/products?q=a')).json()).products;
  assert.deepStrictEqual(short, [], 'a query with no tokens ≥2 chars matches nothing, like the client');
});

test('GET /api/products: sort=drop ranks by real drop%, perCat covers every category', async () => {
  const call = api({ DB: d1() });
  const { products } = await (await call('/api/products?sort=drop&limit=3')).json();
  assert.strictEqual(products.length, 3);
  const drops = products.map(p => p.drop);
  assert.deepStrictEqual(drops, [...drops].sort((a, b) => b - a), 'ordered by drop desc');
  const wantTop = seed.filter(p => p.was && !p.family)
    .map(p => ({ id: p.id, drop: Math.round((1 - Math.min(...p.offers.map(o => o.price)) / p.was) * 100) }))
    .sort((a, b) => b.drop - a.drop)[0];
  assert.strictEqual(products[0].id, wantTop.id, 'global top drop matches the seed-derived answer');

  const per = (await (await call('/api/products?sort=drop&perCat=1&limit=2')).json()).products;
  const cats = new Set(per.map(p => p.cat));
  const seedCats = new Set(seed.filter(p => !p.family && p.was).map(p => p.cat));
  assert.deepStrictEqual(cats, seedCats, 'perCat serves top drops for every category that has any');
  assert.ok(per.every(p => !p.family));
});

test('GET /api/products: cat filters exactly, no params serves all heads', async () => {
  const call = api({ DB: d1() });
  const audio = (await (await call('/api/products?cat=Audio')).json()).products;
  assert.strictEqual(audio.length, seed.filter(p => !p.family && p.cat === 'Audio').length);
  assert.ok(audio.every(p => p.cat === 'Audio' && !p.family));

  const all = (await (await call('/api/products')).json()).products;
  assert.strictEqual(all.length, seed.filter(p => !p.family).length, 'no params = every head');
});

// 4e step 1: seed evolution — a new seed.json refreshes meta for every row
// but never touches offers/price_points; brand-new rows land in full
test('seed evolution: changed seed refreshes meta, leaves real offers alone, adds new rows', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/catalog.json'); // seeds + writes the seed_meta marker

  // simulate a pre-4e prod DB: stale meta, a real ingested price, no marker
  await DB.prepare('UPDATE products SET meta = ? WHERE id = ?')
    .bind(JSON.stringify({ name: 'iPhone 15 128GB', cat: 'Phones' }), 'airpods').run();
  const shop = (await DB.prepare("SELECT shop FROM offers WHERE product_id = 'airpods' LIMIT 1").first()).shop;
  await DB.prepare("UPDATE offers SET price = 1234 WHERE product_id = 'airpods' AND shop = ?").bind(shop).run();
  await DB.prepare("DELETE FROM products WHERE id = 'xm5'").run(); // a row the DB never had
  await DB.prepare("DELETE FROM offers WHERE product_id = 'xm5'").run();
  await DB.prepare("DELETE FROM price_points WHERE product_id = 'xm5'").run();
  await DB.prepare('DELETE FROM seed_meta').run();

  const { products } = await (await call('/api/catalog.json')).json(); // re-seeds
  const airpods = products.find(p => p.id === 'airpods');
  assert.strictEqual(airpods.name, seed.find(p => p.id === 'airpods').name, 'stale meta must be re-upserted from the seed');
  assert.strictEqual(airpods.offers.find(o => o.shop === shop).price, 1234, 'real offer prices must survive the re-seed');
  const xm5 = products.find(p => p.id === 'xm5');
  assert.ok(xm5 && xm5.offers.length && xm5.history.length, 'a row new to the DB must be seeded in full');

  // marker written: the same seed must not re-seed again
  await DB.prepare('UPDATE products SET meta = ? WHERE id = ?')
    .bind(JSON.stringify({ name: 'Stale Again', cat: 'Phones' }), 'airpods').run();
  const again = (await (await call('/api/catalog.json')).json()).products.find(p => p.id === 'airpods');
  assert.strictEqual(again.name, 'Stale Again', 'matching seed_meta hash must skip the upsert');

  // once ANY offer is source-stamped (updated_at), the DB is no longer
  // virgin: a re-seed adds new rows WITHOUT demo offers/history
  await DB.prepare("UPDATE offers SET updated_at = 1 WHERE product_id = 'airpods' AND shop = ?").bind(shop).run();
  await DB.prepare("DELETE FROM products WHERE id = 'xm5'").run();
  await DB.prepare("DELETE FROM offers WHERE product_id = 'xm5'").run();
  await DB.prepare("DELETE FROM price_points WHERE product_id = 'xm5'").run();
  await DB.prepare('DELETE FROM seed_meta').run();
  const honest = (await (await call('/api/catalog.json')).json()).products.find(p => p.id === 'xm5');
  assert.ok(honest, 'new row still lands on re-seed');
  assert.deepStrictEqual([honest.offers, honest.history], [[], []], 'non-virgin DB must not get demo offers/history');
});

test('scheduled with no sources configured is a no-op — prices freeze until real rows arrive', async () => {
  const DB = d1();
  const call = api({ DB });
  const before = await catBody(call); // seeds
  await worker.scheduled({ cron: '0 * * * *' }, { DB }, { waitUntil() {} });
  const after = await catBody(call);
  assert.deepStrictEqual(after, before, 'no sources must mean no changes (the synthetic jiggle is gone)');
});

// 4d: real price sources — env.SOURCES config, Adtraction XML feeds matched
// by EAN (worker/eans.json), first-party JSON-LD scraping, freeze-on-failure.
const eans = require(path.join(__dirname, '..', 'worker', 'eans.json'));
const ctl = { waitUntil() {} };

const withFetch = async (impl, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
};

test('parsePrice handles Norwegian and feed formats', () => {
  assert.strictEqual(parsePrice('2990'), 2990);
  assert.strictEqual(parsePrice('2 990,00'), 2990);
  assert.strictEqual(parsePrice('2990.50 NOK'), 2991, 'rounds to whole kroner');
  assert.strictEqual(parsePrice('1.299'), 1299, 'dot as thousands grouping');
  assert.strictEqual(parsePrice('1,299,000'), 1299000, 'comma grouping');
  assert.strictEqual(parsePrice(''), null);
  assert.strictEqual(parsePrice('N/A'), null);
  assert.strictEqual(parsePrice('0'), null, 'zero is junk, not a price');
});

test('adtraction source: EAN-matched feed rows update offers with deep link; unknown EANs become hidden products', async () => {
  const entries = Object.entries(eans);
  assert.ok(entries.length, 'worker/eans.json is empty — 4d ingestion needs the product EAN map');
  const [pid, [ean]] = entries[0];

  const DB = d1();
  const call = api({ DB });
  const before = await catBody(call); // seeds

  const xml = `<?xml version="1.0" encoding="UTF-8"?><products>
    <product><SKU>a1</SKU><Name><![CDATA[Matched & sold]]></Name><Ean>${ean}</Ean><Price>2 490,00</Price><Shipping>Fri frakt</Shipping><Instock>yes</Instock><TrackingUrl>https://track.adtraction.com/t/?u=1&amp;d=2</TrackingUrl></product>
    <product><SKU>a2</SKU><Name>Not in catalog</Name><Ean>7091234567890</Ean><Price>999.00</Price><Instock>no</Instock><TrackingUrl>https://track.adtraction.com/t/?u=9</TrackingUrl></product>
  </products>`;
  const env = { DB, SOURCES: { Komplett: { type: 'adtraction' } }, ADTRACTION_FEEDS: JSON.stringify({ Komplett: 'https://feed.test/komplett.xml' }) };
  await withFetch(async (url) => {
    assert.strictEqual(String(url), 'https://feed.test/komplett.xml');
    return new Response(xml, { status: 200 });
  }, () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));

  const after = await catBody(call);
  assert.strictEqual(after.length, before.length, 'discovered products must stay out of the visible catalog');

  // the unknown EAN was discovered: hidden product with the feed's name + offer
  const hidden = (await (await call('/api/products?hidden=1')).json()).products;
  const noob = hidden.find(p => p.id === 'ean-7091234567890');
  assert.ok(noob, 'an unknown feed EAN must create a hidden product');
  assert.strictEqual(noob.name, 'Not in catalog');
  assert.strictEqual(noob.hidden, 1);
  assert.deepStrictEqual(noob.offers.map(o => [o.shop, o.price, o.stock]), [['Komplett', 999, false]]);

  const offer = after.find(p => p.id === pid).offers.find(o => o.shop === 'Komplett');
  assert.strictEqual(offer.price, 2490);
  assert.strictEqual(offer.ship, 'Fri frakt');
  assert.strictEqual(offer.stock, true);
  assert.strictEqual(offer.url, 'https://track.adtraction.com/t/?u=1&d=2', 'tracking deep link must survive entity decoding');

  // freeze: every offer not fed this run keeps its stored price
  for (const p of after) for (const o of p.offers) {
    if (p.id === pid && o.shop === 'Komplett') continue;
    const prev = before.find(q => q.id === p.id).offers.find(q => q.shop === o.shop);
    assert.strictEqual(o.price, prev.price, `${p.id}/${o.shop} had no feed row and must freeze`);
    assert.strictEqual(o.url, null, 'unfed offers have no deep link');
  }
});

test('scrape source: first-party JSON-LD product page updates the offer', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/catalog.json'); // seeds

  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"Product","name":"AirPods Pro",
     "offers":{"@type":"Offer","price":"2349.00","priceCurrency":"NOK","availability":"https://schema.org/InStock",
       "shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":89,"currency":"NOK"}}}}]}
  </script></head><body>hi</body></html>`;
  const env = { DB, SOURCES: { Power: { type: 'scrape', urls: { airpods: 'https://www.power.no/airpods-pro' } } } };
  await withFetch(async () => new Response(html, { status: 200 }), () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));

  const cat = await catBody(call);
  const offer = cat.find(p => p.id === 'airpods').offers.find(o => o.shop === 'Power');
  assert.strictEqual(offer.price, 2349);
  assert.strictEqual(offer.stock, true);
  assert.strictEqual(offer.url, 'https://www.power.no/airpods-pro', 'scraped offers link the shop page');
  assert.strictEqual(offer.ship, 'kr 89 shipping', 'JSON-LD shippingRate becomes the ship line');
});

test('scrape source: NetOnNet shape — priceSpecification price, browser UA opt-in', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/catalog.json'); // seeds

  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"AirPods Pro",
     "offers":{"@type":"Offer","availability":"https://schema.org/InStock",
       "priceSpecification":[{"@type":"UnitPriceSpecification","priceCurrency":"NOK","price":"2349.00"}]}}
  </script><script type="application/ld+json">
    {"@type":"OfferShippingDetails","deliveryTime":{"@type":"ShippingDeliveryTime",
      "handlingTime":{"@type":"QuantitativeValue","minValue":0,"maxValue":1,"unitCode":"DAY"},
      "transitTime":{"@type":"QuantitativeValue","minValue":1,"maxValue":3,"unitCode":"DAY"}}}
  </script></head><body>hi</body></html>`;
  const env = { DB, SOURCES: { NetOnNet: { type: 'scrape', ua: 'browser', urls: { airpods: 'https://www.netonnet.no/art/airpods' } } } };
  await withFetch(async (url, init) => {
    assert.match(init.headers['user-agent'], /^Mozilla/, 'ua: browser must send BROWSER_UA');
    return new Response(html, { status: 200 });
  }, () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));

  const offer = (await catBody(call)).find(p => p.id === 'airpods').offers.find(o => o.shop === 'NetOnNet');
  assert.strictEqual(offer.price, 2349);
  assert.strictEqual(offer.stock, true);
  assert.strictEqual(offer.eta, '1–4 days', 'deliveryTime in a separate JSON-LD block becomes the eta (handling + transit)');
});

test('a failing source freezes its shop without aborting the others', async () => {
  const DB = d1();
  const call = api({ DB });
  const before = await catBody(call); // seeds

  const html = `<html><script type="application/ld+json">{"@type":"Product","offers":{"price":"1111","availability":"https://schema.org/InStock"}}</script></html>`;
  const env = {
    DB,
    SOURCES: { Komplett: { type: 'adtraction' }, Power: { type: 'scrape', urls: { airpods: 'https://www.power.no/airpods-pro' } } },
    ADTRACTION_FEEDS: JSON.stringify({ Komplett: 'https://feed.test/komplett.xml' }),
  };
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    await withFetch(async (url) => String(url).includes('feed.test')
      ? new Response('nope', { status: 500 })
      : new Response(html, { status: 200 }),
    () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));
  } finally { console.error = realError; }

  const after = await catBody(call);
  for (const p of after) {
    const komplett = p.offers.find(o => o.shop === 'Komplett');
    if (komplett) {
      const prev = before.find(q => q.id === p.id).offers.find(q => q.shop === 'Komplett');
      assert.strictEqual(komplett.price, prev.price, 'the failed shop must freeze');
    }
  }
  assert.strictEqual(after.find(p => p.id === 'airpods').offers.find(o => o.shop === 'Power').price, 1111, 'the healthy source must still ingest');
  assert.ok(errors.some(e => e.includes('Komplett') && e.includes('frozen')), 'the failure must be logged');
});

// MCP experiment: Streamable-HTTP JSON-RPC at /mcp; login binds the
// Mcp-Session-Id header to the shared sessions table.
function mcpClient(env) {
  let sid = null, id = 0;
  const rpc = async (method, params) => {
    const res = await worker.fetch(new Request('http://pricy.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(sid ? { 'mcp-session-id': sid } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    }), env);
    sid ??= res.headers.get('mcp-session-id');
    return res.json();
  };
  const tool = async (name, args = {}) => {
    const { result } = await rpc('tools/call', { name, arguments: args });
    return { error: !!result.isError, ...(result.isError ? { message: result.content[0].text } : { data: JSON.parse(result.content[0].text) }) };
  };
  return { rpc, tool };
}

test('mcp oauth: discovery metadata serves for oauth well-knowns, 404 (json, not SPA) otherwise', async () => {
  const spa = { fetch: async () => new Response('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html' } }) };
  const env = { DB: d1(), ASSETS: spa };
  const call = (p) => worker.fetch(new Request('http://pricy.test' + p), env);
  assert.strictEqual((await call('/')).status, 200, 'the SPA itself still serves');

  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const res = await call(p);
    assert.strictEqual(res.status, 200, p);
    const meta = await res.json();
    assert.strictEqual(meta.resource, 'http://pricy.test/mcp');
    assert.deepStrictEqual(meta.authorization_servers, ['http://pricy.test']);
  }
  const as = await (await call('/.well-known/oauth-authorization-server')).json();
  assert.strictEqual(as.issuer, 'http://pricy.test');
  assert.strictEqual(as.authorization_endpoint, 'http://pricy.test/authorize');
  assert.strictEqual(as.token_endpoint, 'http://pricy.test/token');
  assert.strictEqual(as.registration_endpoint, 'http://pricy.test/register');
  assert.deepStrictEqual(as.code_challenge_methods_supported, ['S256']);

  const other = await call('/.well-known/openid-configuration');
  assert.strictEqual(other.status, 404);
  assert.match(other.headers.get('content-type'), /json/, 'well-known 404s must be json, never the SPA shell');
});

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const pkce = async (verifier) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');

test('mcp oauth: register → authorize (login page) → code → token = working bearer for /mcp', async () => {
  const env = { DB: d1() };
  const post = (p, body, form) => worker.fetch(new Request('http://pricy.test' + p, {
    method: 'POST',
    body: form ? new URLSearchParams(body) : JSON.stringify(body),
    ...(form ? {} : { headers: { 'content-type': 'application/json' } }),
  }), env);

  // DCR: known AI-client callback registers; anything else is refused
  const reg = await post('/register', { client_name: 'Claude', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'] });
  assert.strictEqual(reg.status, 201);
  const client = await reg.json();
  assert.ok(client.client_id, 'registration must mint a client_id');
  assert.deepStrictEqual(client.grant_types, ['authorization_code', 'refresh_token'], 'requested grant types are echoed');
  assert.strictEqual((await post('/register', { redirect_uris: ['https://evil.example/cb'] })).status, 400, 'unknown callback hosts must be refused');

  // authorize: GET serves the login form
  const verifier = 'test-verifier-abcdefghijklmnop';
  const challenge = await pkce(verifier);
  const authUrl = `/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(CALLBACK)}&state=xyz-123&code_challenge=${challenge}&code_challenge_method=S256`;
  const page = await worker.fetch(new Request('http://pricy.test' + authUrl), env);
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /form method="post"/, 'authorize must serve a login form');
  assert.strictEqual((await worker.fetch(new Request(`http://pricy.test/authorize?response_type=code&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&code_challenge=${challenge}`), env)).status, 400, 'evil redirect_uri never gets a form');

  // wrong password re-renders the form instead of redirecting
  await api(env)('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } });
  const bad = await post('/authorize', { action: 'login', email: 'ola@nordmann.no', password: 'wrong-wrong', redirect_uri: CALLBACK, state: 'xyz-123', code_challenge: challenge }, true);
  assert.strictEqual(bad.status, 401);
  assert.match(await bad.text(), /incorrect password/);

  // correct login 303s back to the callback with code + state
  const ok = await post('/authorize', { action: 'login', email: 'ola@nordmann.no', password: 'correcthorse1', redirect_uri: CALLBACK, state: 'xyz-123', code_challenge: challenge }, true);
  assert.strictEqual(ok.status, 303, 'must be 303, not 307 — the callback is fetched with GET');
  const loc = new URL(ok.headers.get('location'));
  assert.strictEqual(loc.origin + loc.pathname, CALLBACK);
  assert.strictEqual(loc.searchParams.get('state'), 'xyz-123');
  const code = loc.searchParams.get('code');
  assert.match(code, /^[0-9a-f]{64}$/);

  // token exchange: PKCE enforced, code single-use
  assert.strictEqual((await post('/token', { grant_type: 'authorization_code', code, code_verifier: 'not-the-verifier' }, true)).status, 400, 'wrong verifier must be rejected');
  // the failed attempt consumed the code (single-use) — get a fresh one
  const loc2 = new URL((await post('/authorize', { action: 'login', email: 'ola@nordmann.no', password: 'correcthorse1', redirect_uri: CALLBACK, code_challenge: challenge }, true)).headers.get('location'));
  const code2 = loc2.searchParams.get('code');
  const tok = await post('/token', { grant_type: 'authorization_code', code: code2, code_verifier: verifier, redirect_uri: CALLBACK }, true);
  assert.strictEqual(tok.status, 200);
  const { access_token, token_type, refresh_token } = await tok.json();
  assert.strictEqual(token_type, 'Bearer');
  assert.ok(refresh_token && refresh_token !== access_token, 'a distinct refresh token is issued');
  assert.strictEqual((await post('/token', { grant_type: 'authorization_code', code: code2, code_verifier: verifier }, true)).status, 400, 'code must be single-use');

  // refresh grant mints a fresh access token; junk refresh tokens are rejected
  const refreshed = await post('/token', { grant_type: 'refresh_token', refresh_token }, true);
  assert.strictEqual(refreshed.status, 200);
  const r = await refreshed.json();
  assert.ok(r.access_token && r.access_token !== access_token, 'refresh must mint a new access token');
  assert.strictEqual(r.refresh_token, refresh_token, 'refresh token is stable, not rotated');
  assert.strictEqual((await post('/token', { grant_type: 'refresh_token', refresh_token: 'f'.repeat(64) }, true)).status, 400, 'unknown refresh token rejected');

  // the bearer authenticates MCP tool calls with no login tool involved
  const res = await worker.fetch(new Request('http://pricy.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_products', arguments: { query: 'airpods' } } }),
  }), env);
  const { result } = await res.json();
  assert.ok(!result.isError, 'bearer from the oauth flow must authenticate tool calls');
  assert.strictEqual(JSON.parse(result.content[0].text).results[0].id, 'airpods');

  // an authenticated client never sees the password tools
  const list = await (await worker.fetch(new Request('http://pricy.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  }), env)).json();
  const names = list.result.tools.map(t => t.name);
  assert.ok(!names.includes('login') && !names.includes('signup'), 'login/signup must be hidden for oauth-authenticated clients');
  assert.ok(names.includes('buy_now'), 'the rest of the tools still list');

  // signup path creates the account and hands back a working code too
  const signupLoc = (await post('/authorize', { action: 'signup', email: 'kari@example.no', password: 'newpassword1', redirect_uri: CALLBACK, code_challenge: challenge }, true)).headers.get('location');
  assert.ok(new URL(signupLoc).searchParams.get('code'), 'signup via the authorize form must issue a code');
  assert.strictEqual((await api(env)('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'newpassword1' } })).status, 200, 'the account is a real pricy account');
});

test('mcp: initialize mints a session id, lists tools, rejects junk', async () => {
  const env = { DB: d1() };
  const { rpc } = mcpClient(env);
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.strictEqual(init.result.protocolVersion, '2025-06-18');
  assert.strictEqual(init.result.serverInfo.name, 'pricy.no');

  const tools = (await rpc('tools/list')).result.tools.map(t => t.name);
  assert.deepStrictEqual(tools, ['login', 'signup', 'search_products', 'get_product', 'buy_now', 'watch_product', 'unwatch_product', 'list_watches', 'list_purchases']);

  assert.strictEqual((await rpc('nope/nope')).error.code, -32601);
  const get = await worker.fetch(new Request('http://pricy.test/mcp'), env);
  assert.strictEqual(get.status, 405, 'GET (SSE stream) is not supported');
});

test('POST /api/buy records a real purchase for the web session, same table as MCP', async () => {
  const env = { DB: d1() };
  const call = api(env);
  assert.strictEqual((await call('/api/buy', { method: 'POST', body: { id: 'airpods' } })).status, 401, 'buying requires a session');

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@nordmann.no', password: 'correcthorse1' } });
  const cookie = cookieOf(signup);
  const cat = await catBody(call);
  const best = cat.find(p => p.id === 'airpods').offers.find(o => o.stock); // offers are price-ordered

  const res = await call('/api/buy', { method: 'POST', body: { id: 'airpods', shop: best.shop }, cookie });
  assert.strictEqual(res.status, 200);
  const buy = await res.json();
  assert.strictEqual(buy.price_nok, best.price, 'server charges its stored price for the shop');
  assert.strictEqual(buy.shop, best.shop);
  assert.ok(buy.order_id, 'order id missing');

  // the purchase is the same row MCP list_purchases sees
  const { rpc, tool } = mcpClient(env);
  await rpc('initialize', { protocolVersion: '2025-06-18' });
  await tool('login', { email: 'kari@nordmann.no', password: 'correcthorse1' });
  const orders = (await tool('list_purchases')).data.purchases;
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].order_id, buy.order_id);

  // reloads hydrate from /api/me — the purchase rides along, same shape as list_purchases
  const me = await (await call('/api/me', { cookie })).json();
  assert.strictEqual(me.purchases.length, 1);
  assert.deepStrictEqual(me.purchases[0], orders[0]);

  assert.strictEqual((await call('/api/buy', { method: 'POST', body: { id: 'nope' }, cookie })).status, 400, 'unknown product must not create an order');
});

test('mcp: tools require login; signup → search → buy → history round-trips', async () => {
  const env = { DB: d1() };
  const { rpc, tool } = mcpClient(env);
  await rpc('initialize', { protocolVersion: '2025-06-18' });

  const locked = await tool('search_products', { query: 'airpods' });
  assert.ok(locked.error && locked.message.includes('not logged in'), 'search before login must fail with guidance');

  assert.deepStrictEqual((await tool('signup', { email: 'ola@nordmann.no', password: 'correcthorse1' })).data.user.email, 'ola@nordmann.no');

  const search = await tool('search_products', { query: 'airpods' });
  assert.strictEqual(search.data.results[0].id, 'airpods');
  assert.strictEqual(search.data.results[0].best_price_nok, seed.find(p => p.id === 'airpods').offers.reduce((m, o) => Math.min(m, o.price), Infinity));

  const detail = (await tool('get_product', { product_id: 'airpods' })).data;
  assert.ok(detail.offers.length > 1 && detail.price_history_nok.length, 'detail carries offers and history');

  const buy = (await tool('buy_now', { product_id: 'airpods' })).data;
  const cheapestInStock = detail.offers.find(o => o.stock); // offers are price-ordered
  assert.strictEqual(buy.price_nok, cheapestInStock.price, 'buy_now charges the cheapest in-stock price');
  assert.strictEqual(buy.shop, cheapestInStock.shop);

  const orders = (await tool('list_purchases')).data.purchases;
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].order_id, buy.order_id);
  assert.strictEqual(orders[0].product_id, 'airpods');

  assert.ok((await tool('buy_now', { product_id: 'nope' })).error, 'unknown product must not create an order');
  const oos = detail.offers.find(o => !o.stock);
  if (oos) assert.ok((await tool('buy_now', { product_id: 'airpods', shop: oos.shop })).error, 'out-of-stock shop must be refused');
});

test('mcp: login is strict and signup cannot hijack an existing passworded account', async () => {
  const env = { DB: d1() };
  const web = api(env);
  await web('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } });

  const { rpc, tool } = mcpClient(env);
  await rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.ok((await tool('login', { email: 'nobody@example.no', password: 'whatever12' })).error, 'unknown account');
  assert.ok((await tool('login', { email: 'kari@example.no', password: 'wrong-wrong' })).error, 'wrong password');
  assert.ok((await tool('signup', { email: 'kari@example.no', password: 'wrong-wrong' })).error, 'signup with wrong password must not log into the existing account');
  assert.strictEqual((await tool('login', { email: 'kari@example.no', password: 'correcthorse1' })).data.ok, true);
});

// 4e step 4: variants over MCP — search stays head-only, get_product on a
// head lists its children, and a child id buys/watches like any product
test('mcp: search hides variant children; get_product lists them; a child id buys', async () => {
  const env = { DB: d1() };
  const { rpc, tool } = mcpClient(env);
  await rpc('initialize', { protocolVersion: '2025-06-18' });
  await tool('signup', { email: 'ola@nordmann.no', password: 'correcthorse1' });

  const search = (await tool('search_products', { query: 'iphone' })).data;
  assert.ok(search.results.length, 'iphone must be findable');
  assert.ok(search.results.every(r => !r.id.includes('~')), 'search must not return variant children');

  const detail = (await tool('get_product', { product_id: 'iphone' })).data;
  const want = seed.find(p => p.id === 'iphone~256-blue');
  assert.strictEqual(detail.variants.length, seed.filter(p => p.family === 'iphone').length, 'head must list all its children');
  const blue = detail.variants.find(v => v.id === 'iphone~256-blue');
  assert.strictEqual(blue.variant, want.vlabel);
  assert.strictEqual(blue.best_price_nok, Math.min(...want.offers.map(o => o.price)), 'child best derives from its own offers');

  const child = (await tool('get_product', { product_id: 'iphone~256-blue' })).data;
  assert.ok(/256 GB.*Blue/.test(child.name), 'child detail carries the vlabel-baked name');
  assert.ok(!child.variants, 'a child has no children');

  const buy = (await tool('buy_now', { product_id: 'iphone~256-blue' })).data;
  const cheapest = child.offers.find(o => o.in_stock !== false && o.stock); // offers are price-ordered
  assert.strictEqual(buy.price_nok, cheapest.price, 'buy_now on a child charges the child\'s own price');
  assert.strictEqual((await tool('watch_product', { product_id: 'iphone~256-blue', target_price: 9000 })).data.watching, 'iphone~256-blue');
  const watches = (await tool('list_watches')).data.watches;
  assert.ok(/256 GB.*Blue/.test(watches[0].name), 'watchlist names the exact variant');
});

test('mcp: watches are the same list the web sees', async () => {
  const env = { DB: d1() };
  const { rpc, tool } = mcpClient(env);
  await rpc('initialize', { protocolVersion: '2025-06-18' });
  await tool('signup', { email: 'ola@nordmann.no', password: 'correcthorse1' });

  assert.strictEqual((await tool('watch_product', { product_id: 'airpods', target_price: 1999 })).data.target_price_nok, 1999);
  const watches = (await tool('list_watches')).data.watches;
  assert.strictEqual(watches.length, 1);
  assert.strictEqual(watches[0].product_id, 'airpods');
  assert.ok(watches[0].best_price_nok > 0, 'watchlist carries current best price');

  // same rows through the web surface
  const web = api(env);
  const cookie = cookieOf(await web('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.deepStrictEqual((await (await web('/api/me', { cookie })).json()).watches, [{ id: 'airpods', target: 1999, paused: 0, hit: 0 }]);

  assert.strictEqual((await tool('unwatch_product', { product_id: 'airpods' })).data.removed, true);
  assert.deepStrictEqual((await tool('list_watches')).data.watches, []);
  assert.ok((await tool('watch_product', { product_id: 'not-a-product' })).error, 'unknown product cannot be watched');
});

// 4d interim: the laptop crawler pushes rows to POST /api/ingest
test('POST /api/ingest: bearer-gated, validated, lands offers and keeps one price point per day', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const push = (rows, token) => worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(rows),
  }), env);

  assert.strictEqual((await api({ DB: d1() })('/api/ingest', { method: 'POST', body: [] })).status, 503, 'no INGEST_TOKEN secret = endpoint disabled');
  const row = { product_id: 'airpods', shop: 'Elkjøp', price: 1999, ship: 'Fri frakt', stock: 1, url: 'https://www.elkjop.no/airpods' };
  assert.strictEqual((await push([row])).status, 401, 'missing bearer');
  assert.strictEqual((await push([row], 'wrong-token')).status, 401, 'wrong bearer');
  assert.strictEqual((await push([], 'sekrit-token')).status, 400, 'empty list');
  assert.strictEqual((await push([{ ...row, price: 19.99 }], 'sekrit-token')).status, 400, 'non-integer price');
  assert.strictEqual((await push([{ ...row, price: -5 }], 'sekrit-token')).status, 400, 'negative price');
  const unknown = await push([{ ...row, product_id: 'not-a-product' }], 'sekrit-token');
  assert.strictEqual(unknown.status, 400);
  assert.deepStrictEqual((await unknown.json()).ids, ['not-a-product'], 'unknown products are named');

  const before = await catBody(call);
  const baseline = before.find(p => p.id === 'airpods');

  const ok = await push([row], 'sekrit-token');
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(await ok.json(), { ok: true, ingested: 1 });

  const { meta, products } = await (await call('/api/catalog.json')).json();
  let airpods = products.find(p => p.id === 'airpods');
  let offer = airpods.offers.find(o => o.shop === 'Elkjøp');
  assert.strictEqual(offer.price, 1999);
  assert.strictEqual(offer.url, 'https://www.elkjop.no/airpods');
  assert.ok(Number.isFinite(offer.updated_at), 'ingested offers must carry a freshness stamp');
  assert.strictEqual(offer.stock, true, 'stock 1 surfaces as true');
  assert.strictEqual(offer.eta, baseline.offers.find(o => o.shop === 'Elkjøp').eta, 'a push without eta keeps the stored delivery info');

  // tri-state stock: 2 / missing = never checked → catalog omits the key
  // (StockBadge shows "Unknown"); 0 = out of stock
  await push([{ ...row, shop: 'Komplett', stock: 2 }, { ...row, shop: 'Power', stock: 0 }], 'sekrit-token');
  const offs = (await catBody(call)).find(p => p.id === 'airpods').offers;
  assert.strictEqual(offs.find(o => o.shop === 'Komplett').stock, undefined, 'stock 2 = unknown, key omitted');
  assert.strictEqual(offs.find(o => o.shop === 'Power').stock, false, 'stock 0 surfaces as false');
  assert.strictEqual(meta.freshest, offer.updated_at, 'meta.freshest tracks the newest stamp');
  assert.strictEqual(airpods.best, 1999, 'pushed price becomes best');
  assert.strictEqual(airpods.history.length, baseline.history.length, "today's point is upserted, not appended");
  assert.strictEqual(airpods.history.at(-1), 1999, "today's point tracks the pushed best");

  // a second, higher push the same day: offer follows, the day's point keeps the min
  await push([{ ...row, price: 2050 }], 'sekrit-token');
  airpods = (await catBody(call)).find(p => p.id === 'airpods');
  assert.strictEqual(airpods.offers.find(o => o.shop === 'Elkjøp').price, 2050);
  assert.strictEqual(airpods.history.at(-1), 1999, "the day's price point keeps the day's minimum");
  assert.strictEqual(airpods.history.length, baseline.history.length, 'still one point per day');
});

// Discovery: an unknown `ean-<digits>` row carrying a name auto-creates a
// hidden product — invisible in every user-facing query until enriched
// (extra.json + deploy), listed for triage via ?hidden=1
test('POST /api/ingest discovery: unknown ean- rows create hidden products, excluded until enriched', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const push = (rows) => worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sekrit-token' },
    body: JSON.stringify(rows),
  }), env);

  const { meta: before } = await (await call('/api/products')).json();

  // an ean- id without a name has no identity to create from → rejected like any unknown id
  assert.strictEqual((await push([{ product_id: 'ean-7099999999991', shop: 'Power', price: 500 }])).status, 400, 'ean- row without a name must be rejected');

  const row = { product_id: 'ean-7099999999991', shop: 'Power', price: 500, name: 'Mystery Widget 3000', brand: 'Acme', stock: 1, url: 'https://www.power.no/widget' };
  assert.strictEqual((await push([row])).status, 200);
  // second shop, same EAN-derived id → merges onto the same product
  assert.strictEqual((await push([{ ...row, shop: 'CDON', price: 480 }])).status, 200);

  const { meta, products } = await (await call('/api/products')).json();
  assert.ok(!products.some(p => p.id === 'ean-7099999999991'), 'hidden products stay out of the all-heads listing');
  assert.strictEqual(meta.products, before.products, 'catMeta count must not include hidden products');
  assert.strictEqual((await (await call('/api/products?q=mystery')).json()).products.length, 0, 'hidden products must not be searchable');
  assert.ok(!(await catBody(call)).some(p => p.id === 'ean-7099999999991'), 'hidden products stay out of the ops dump');

  const widget = (await (await call('/api/products?hidden=1')).json()).products.find(p => p.id === 'ean-7099999999991');
  assert.ok(widget, 'the hidden listing must surface the discovered product');
  assert.strictEqual(widget.name, 'Mystery Widget 3000');
  assert.strictEqual(widget.brand, 'Acme');
  assert.strictEqual(widget.ean, '7099999999991');
  assert.strictEqual(widget.hidden, 1);
  assert.strictEqual(widget.best, 480, 'both shops merged onto one product');
  assert.strictEqual(widget.offers.length, 2);
  assert.deepStrictEqual(widget.history, [480], 'price history starts collecting from discovery');
});

// OPEN-CATALOG-PLAN A: EAN routing through the D1 eans table + admin surface
const admin = (env) => (pathname, method, body, token = 'sekrit-token') =>
  worker.fetch(new Request('http://pricy.test' + pathname, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }), env);

test('eans table routes ingest rows; admin alias re-homes a discovered product and migrates its data', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  const push = (rows) => req('/api/ingest', 'POST', rows);

  // a row keyed by a known EAN (worker/eans.json) lands on the mapped product
  const [pid, [ean]] = Object.entries(eans)[0];
  assert.strictEqual((await push([{ product_id: `ean-${ean.replace(/^0+/, '')}`, shop: 'Komplett', price: 2222, name: 'whatever the feed calls it' }])).status, 200);
  const mapped = (await catBody(call)).find(p => p.id === pid);
  assert.strictEqual(mapped.offers.find(o => o.shop === 'Komplett').price, 2222, 'seeded eans.json mapping must route the row');
  assert.strictEqual((await (await call('/api/products?hidden=1')).json()).products.length, 0, 'no hidden product for a mapped EAN');

  // discover a new product with offers + history + a watch (Milrab is not a
  // seed shop; Power is — the alias below must handle both)
  const row = { product_id: 'ean-7099999999991', shop: 'Milrab', price: 500, name: 'Mystery Widget 3000', brand: 'Acme', stock: 1 };
  await push([row, { ...row, shop: 'Power', price: 480 }]);
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/watches', { method: 'PUT', body: [{ id: 'ean-7099999999991', target: 450 }], cookie });

  // auth: admin surface is bearer-gated like ingest
  assert.strictEqual((await req('/api/admin/alias', 'POST', { ean: '7099999999991', product_id: 'xm5' }, null)).status, 401);
  assert.strictEqual((await req('/api/admin/alias', 'POST', { ean: '7099999999991', product_id: 'xm5' }, 'wrong')).status, 401);
  assert.strictEqual((await req('/api/admin/alias', 'POST', { product_id: 'xm5' })).status, 400, 'ean required');
  assert.strictEqual((await req('/api/admin/alias', 'POST', { ean: '7099999999991', product_id: 'nope' })).status, 404, 'unknown target without meta.name');

  // triage verdict: the widget is really an xm5 variant
  const res = await req('/api/admin/alias', 'POST', { ean: '7099999999991', product_id: 'xm5' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true, ean: '7099999999991', product_id: 'xm5', migrated: true });

  const xm5 = (await catBody(call)).find(p => p.id === 'xm5');
  assert.strictEqual(xm5.offers.find(o => o.shop === 'Milrab').price, 500, 'collected offers migrate to the target');
  assert.strictEqual(xm5.offers.find(o => o.shop === 'Power').price, 3169, 'a shop the target already has keeps the target\'s offer');
  assert.strictEqual((await (await call('/api/products?hidden=1')).json()).products.length, 0, 'the orphan row is gone');
  assert.deepStrictEqual((await (await call('/api/me', { cookie })).json()).watches.map(w => w.id), ['xm5'], 'watches follow the migration');

  // future rows for that EAN land straight on the target
  await push([{ product_id: 'ean-7099999999991', shop: 'Elkjøp', price: 470, name: 'Mystery Widget 3000' }]);
  assert.strictEqual((await catBody(call)).find(p => p.id === 'xm5').offers.find(o => o.shop === 'Elkjøp').price, 470, 'runtime alias routes future ingests');
  assert.strictEqual((await (await call('/api/products?hidden=1')).json()).products.length, 0);
});

test('admin PATCH: validated meta merge — manual promote and demote without a deploy', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  await admin(env)('/api/ingest', 'POST', [{ product_id: 'ean-7099999999992', shop: 'Power', price: 900, name: 'Acme Soundbar S1', brand: 'Acme' }]);

  assert.strictEqual((await req('/api/admin/products/nope', 'PATCH', { cat: 'Audio' })).status, 404);
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', {})).status, 400, 'empty patch');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { cat: 'Lydplanker' })).status, 400, 'cat must be a real category');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { bogus: 'x' })).status, 400, 'unknown keys rejected');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { name: null })).status, 400, 'name cannot be deleted');

  // promote: fill display meta, drop hidden
  const res = await req('/api/admin/products/ean-7099999999992', 'PATCH', { name: 'Acme Soundbar S1', cat: 'Audio', icon: 'speaker', kw: 'soundbar lydplanke acme', hidden: null });
  assert.strictEqual(res.status, 200);
  const promoted = (await (await call('/api/products?q=soundbar')).json()).products;
  assert.strictEqual(promoted.length, 1, 'promoted product is searchable');
  assert.strictEqual(promoted[0].cat, 'Audio');
  assert.strictEqual(promoted[0].hidden, undefined);
  assert.strictEqual(promoted[0].best, 900, 'collected offers ship with the promotion');

  // facets: object-only meta merge that rides api rows (FILTERS-PLAN Phase B)
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { facets: ['x'] })).status, 400, 'facets must be an object');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { facets: { anc: true, fit: 'over-ear' } })).status, 200);
  const withFacets = (await (await call('/api/products?ids=ean-7099999999992')).json()).products;
  assert.deepStrictEqual(withFacets[0].facets, { anc: true, fit: 'over-ear' }, 'meta.facets rides /api/products rows');

  // specs: same object-only merge — boot feeds it to the PDP Specifications section
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { specs: 'nope' })).status, 400, 'specs must be an object');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { specs: { fit: 'Soundbar', anc: false } })).status, 200);
  const withSpecs = (await (await call('/api/products?ids=ean-7099999999992')).json()).products;
  assert.deepStrictEqual(withSpecs[0].specs, { fit: 'Soundbar', anc: false }, 'meta.specs rides /api/products rows');

  // demote: hidden again
  await req('/api/admin/products/ean-7099999999992', 'PATCH', { hidden: 1 });
  assert.strictEqual((await (await call('/api/products?q=soundbar')).json()).products.length, 0, 'demoted product disappears');
});

test('seed re-upsert merges meta: runtime specs/facets survive a deploy, seed keys still win', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // kobo-libra is a seed row (extra.json head) that ships without specs
  await req('/api/admin/products/kobo-libra', 'PATCH', { specs: { screen: '7.0″ E Ink' }, facets: { color: 'Yes' }, name: 'Renamed By Admin' });
  // stale the pinned hash so the next request re-runs the seed upsert
  await DB.prepare("UPDATE seed_meta SET hash = 'stale'").run();
  const row = (await (await call('/api/products?ids=kobo-libra')).json()).products[0];
  assert.deepStrictEqual(row.specs, { screen: '7.0″ E Ink' }, 'runtime specs must survive the seed re-upsert');
  assert.deepStrictEqual(row.facets, { color: 'Yes' }, 'runtime facets must survive the seed re-upsert');
  assert.strictEqual(row.name, 'Kobo Libra Colour', 'seed-owned keys still win on re-upsert');
});

// OPEN-CATALOG-PLAN B: auto-promotion — mapped source category = go live
test('auto-promotion: a hidden row with name+brand+CATMAP-mapped srcCat goes live; junk and unmapped stay hidden; demote sticks', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token', CATMAP: { Power: { Mobiltelefoner: 'Phones' } } };
  const call = api(env);
  const req = admin(env);
  const push = (rows) => req('/api/ingest', 'POST', rows);

  assert.strictEqual((await push([{ product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Pixel 9', srcCat: 42 }])).status, 400, 'non-string srcCat rejected');

  // mapped category + name + brand → live, with icon/kw/auto stamped
  await push([{ product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Google Pixel 9 128 GB', brand: 'Google', srcCat: 'Mobiltelefoner' }]);
  const live = (await (await call('/api/products?q=pixel 9')).json()).products.find(p => p.id === 'ean-7099999999993');
  assert.ok(live, 'auto-promoted product must be searchable');
  assert.strictEqual(live.cat, 'Phones');
  assert.strictEqual(live.icon, 'smartphone');
  assert.strictEqual(live.auto, 1);
  assert.ok(live.kw.includes('google') && live.kw.includes('pixel') && live.kw.includes('phones'), `kw covers name+brand+cat: ${live.kw}`);

  // no brand → stays hidden; unmapped srcCat → stays hidden; accessory name → stays hidden
  await push([
    { product_id: 'ean-7099999999994', shop: 'Power', price: 990, name: 'Nameless Phone', srcCat: 'Mobiltelefoner' },
    { product_id: 'ean-7099999999995', shop: 'Power', price: 990, name: 'Acme Blender', brand: 'Acme', srcCat: 'Kjøkkenmaskiner' },
    { product_id: 'ean-7099999999996', shop: 'Power', price: 99, name: 'Pixel 9 deksel svart', brand: 'Google', srcCat: 'Mobiltelefoner' },
  ]);
  const hiddenIds = (await (await call('/api/products?hidden=1')).json()).products.map(p => p.id);
  assert.deepStrictEqual(hiddenIds.sort(), ['ean-7099999999994', 'ean-7099999999995', 'ean-7099999999996'], 'brandless, unmapped and blocklisted rows stay hidden');

  // a human demotion out-ranks the machine: auto:1 + hidden:1 never re-promotes
  await req('/api/admin/products/ean-7099999999993', 'PATCH', { hidden: 1 });
  await push([{ product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Google Pixel 9 128 GB', brand: 'Google', srcCat: 'Mobiltelefoner' }]);
  assert.ok(!(await (await call('/api/products?q=pixel 9')).json()).products.some(p => p.id === 'ean-7099999999993'), 'demoted product must not re-promote');
});

// OPEN-CATALOG-PLAN C: alias can create a variant child on the fly (group.mjs)
test('alias with meta creates a variant child: data re-homed, child rides its head', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099999999997', shop: 'Power', price: 11990, name: 'iPhone 15 256GB Teal', brand: 'Apple' }]);

  const res = await req('/api/admin/alias', 'POST', {
    ean: '7099999999997', product_id: 'iphone~256-teal',
    meta: { name: 'iPhone 15 · 256 GB Teal', family: 'iphone', vlabel: '256 GB Teal' },
  });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true, ean: '7099999999997', product_id: 'iphone~256-teal', migrated: true });

  const rows = (await (await call('/api/products?ids=iphone')).json()).products;
  const child = rows.find(p => p.id === 'iphone~256-teal');
  assert.ok(child, 'the created child expands with its head');
  assert.strictEqual(child.family, 'iphone');
  assert.strictEqual(child.vlabel, '256 GB Teal');
  assert.strictEqual(child.offers.find(o => o.shop === 'Power').price, 11990, 'collected offers moved onto the child');
  assert.strictEqual((await (await call('/api/products?hidden=1')).json()).products.length, 0, 'orphan gone');

  // future ingests of that EAN land on the child
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099999999997', shop: 'CDON', price: 11790, name: 'iPhone 15 256GB Teal' }]);
  const again = (await (await call('/api/products?ids=iphone')).json()).products.find(p => p.id === 'iphone~256-teal');
  assert.strictEqual(again.offers.find(o => o.shop === 'CDON').price, 11790);
});

// product images: downloaded to R2 on ingest, only when the source URL changes
test('ingest images: one download per source URL, served at /img/:id with etag revalidation', async () => {
  const store = new Map();
  const r2 = {
    put: async (key, body, opts) => store.set(key, { body, type: opts?.httpMetadata?.contentType }),
    get: async (key, { onlyIf } = {}) => {
      const o = store.get(key);
      if (!o) return null;
      const match = onlyIf?.get?.('if-none-match');
      return { httpEtag: '"img-v1"', httpMetadata: { contentType: o.type },
        body: match === '"img-v1"' ? null : o.body };
    },
  };
  const env = { DB: d1(), INGEST_TOKEN: 't', IMAGES: r2 };
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(url); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); };
  const push = (rows) => worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(rows),
  }), env);
  try {
    const row = { product_id: 'airpods', shop: 'Elkjøp', price: 1999, image: 'https://cdn.example/a.jpg' };
    assert.strictEqual((await push([{ ...row, image: 42 }])).status, 400, 'non-string image rejected');
    assert.strictEqual((await push([row])).status, 200);
    assert.deepStrictEqual(fetched, ['https://cdn.example/a.jpg'], 'first sight of a URL downloads it');
    assert.ok(store.has('products/airpods'), 'image landed in the bucket');
    await push([row]);
    assert.strictEqual(fetched.length, 1, 'same URL again = no re-download');
    await push([{ ...row, image: 'https://cdn.example/b.jpg' }]);
    assert.strictEqual(fetched.length, 2, 'changed URL = fresh download');
  } finally {
    globalThis.fetch = realFetch;
  }

  const call = api(env);
  const img = await call('/img/airpods');
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('content-type'), 'image/jpeg');
  assert.ok(img.headers.get('cache-control').includes('max-age'), 'images must be browser-cacheable');
  const revalidate = await worker.fetch(new Request('http://pricy.test/img/airpods', { headers: { 'if-none-match': img.headers.get('etag') } }), env);
  assert.strictEqual(revalidate.status, 304, 'matching etag revalidates without a body');
  assert.strictEqual((await call('/img/nope')).status, 404);

  const airpods = (await catBody(call)).find(p => p.id === 'airpods');
  assert.strictEqual(airpods.img, '/img/airpods', 'catalog advertises the stored image');
  assert.strictEqual((await catBody(call)).find(p => p.id === 'xm5').img, undefined, 'no image row = no img field');
});

// price-drop alerts: the hook in ingest() fires on target crossings
const alertEnv = () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  return {
    DB, env, call: api(env),
    push: (rows) => worker.fetch(new Request('http://pricy.test/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer sekrit-token' },
      body: JSON.stringify(rows),
    }), env),
    alerts: async () => (await DB.prepare('SELECT * FROM alerts ORDER BY id').all()).results,
  };
};
const seedBest = Math.min(...seed.find(p => p.id === 'airpods').offers.map(o => o.price));
const withLog = async (fn) => {
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { await fn(); } finally { console.log = realLog; }
  return logs;
};

test('alerts: crossing below target fires once (logged), no refire while below, re-arms above', async () => {
  const { call, push, alerts } = alertEnv();
  await call('/api/catalog.json'); // seeds
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const target = seedBest - 100;
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target }], cookie });

  const row = (price) => ({ product_id: 'airpods', shop: 'Elkjøp', price, stock: 1 });
  const hit = async () => (await (await call('/api/me', { cookie })).json()).watches[0].hit;

  await withLog(() => push([row(seedBest - 50)]));
  assert.strictEqual((await alerts()).length, 0, 'above target must not fire');
  assert.strictEqual(await hit(), 0);

  const logs = await withLog(() => push([row(target - 10)]));
  let rows = await alerts();
  assert.strictEqual(rows.length, 1, 'crossing the target must fire exactly one alert');
  assert.strictEqual(rows[0].product_id, 'airpods');
  assert.strictEqual(rows[0].shop, 'Elkjøp');
  assert.strictEqual(rows[0].price, target - 10);
  assert.strictEqual(rows[0].prev_price, seedBest - 50);
  assert.strictEqual(rows[0].target, target);
  assert.ok(rows[0].created_at > 0 && rows[0].delivered_at > 0, 'console delivery counts as delivered');
  assert.ok(logs.some(l => l.includes('price alert for ola@nordmann.no') && l.includes(String(target - 10))), 'alert must be console-logged without SEND_EMAIL');

  await withLog(() => push([row(target - 20)]));
  assert.strictEqual((await alerts()).length, 1, 'must not refire while the price stays below target');
  assert.strictEqual(await hit(), 1, '/api/me must flag the watch as hit');

  await withLog(() => push([row(target + 50)]));
  assert.strictEqual((await alerts()).length, 1, 'rising back above fires nothing');
  assert.strictEqual(await hit(), 0, 'the hit flag clears when the price re-arms');

  await withLog(() => push([row(target - 30)]));
  assert.strictEqual((await alerts()).length, 2, 'a second crossing fires again');
  assert.strictEqual(await hit(), 1);
});

test('alerts: paused and target-less watches never fire', async () => {
  const { call, push, alerts } = alertEnv();
  await call('/api/catalog.json');
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target: seedBest - 100, paused: true }], cookie: kari });
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods' }], cookie: ola }); // watch with no target
  await withLog(() => push([{ product_id: 'airpods', shop: 'Elkjøp', price: seedBest - 200, stock: 1 }]));
  assert.deepStrictEqual(await alerts(), []);
});

test('alerts: threshold minimum-drop is respected; an all-time low overrides it unless lows is off', async () => {
  const { call, push, alerts } = alertEnv();
  await call('/api/catalog.json');
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/settings', { method: 'PUT', body: { threshold: '10', lows: false }, cookie });

  // controlled zone: everything below both the seed offers and the seed history
  const histMin = Math.min(...seed.find(p => p.id === 'airpods').history);
  const a = Math.min(seedBest, histMin) - 100;
  const d = Math.round(a * 0.04); // 4% of the baseline — under the 10% threshold
  const row = (price) => ({ product_id: 'airpods', shop: 'Elkjøp', price, stock: 1 });

  await withLog(() => push([row(a)])); // baseline best; today's price point = a (all-time low so far)
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target: a - d }], cookie });

  await withLog(() => push([row(a - d - 1)])); // crossing, drop ~4% < 10%, and a new low — but lows is off
  assert.strictEqual((await alerts()).length, 0, 'a sub-threshold drop must not fire, even at an all-time low, when lows is off');

  await call('/api/settings', { method: 'PUT', body: { threshold: '10', lows: true }, cookie });
  await withLog(() => push([row(a)])); // re-arm; all-time low so far = a - d - 1
  await withLog(() => push([row(a - d)])); // crossing, ~4% drop, NOT a new low (a-d > a-d-1)
  assert.strictEqual((await alerts()).length, 0, 'sub-threshold and not a low: still skipped with lows on');

  await withLog(() => push([row(a)])); // re-arm
  await withLog(() => push([row(a - 2 * d - 1)])); // ~8% drop < threshold, but 1 kr under the all-time low
  assert.strictEqual((await alerts()).length, 1, 'a sub-threshold drop at a new all-time low fires when lows is on');

  await withLog(() => push([row(a)])); // re-arm; low is now a - 2d - 1
  await withLog(() => push([row(a - 3 * d)])); // ~12% drop ≥ threshold
  assert.strictEqual((await alerts()).length, 2, 'an over-threshold drop fires regardless of lows');
});

test('alerts: SEND_EMAIL binding emails the alert; a failing send still records the alert undelivered', async () => {
  const sent = [];
  const { DB, call, alerts } = alertEnv();
  const env = { DB, INGEST_TOKEN: 'sekrit-token', SEND_EMAIL: { send: async (msg) => { sent.push(msg); } } };
  const push = (rows) => worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sekrit-token' },
    body: JSON.stringify(rows),
  }), env);
  await call('/api/catalog.json');
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target: seedBest - 100 }], cookie });

  const logs = await withLog(() => push([{ product_id: 'airpods', shop: 'Elkjøp', price: seedBest - 150, stock: 1 }]));
  assert.strictEqual(sent.length, 1, 'exactly one alert email sent');
  assert.strictEqual(sent[0].to, 'ola@nordmann.no');
  assert.strictEqual(sent[0].from.email, 'alerts@pricy.no');
  assert.ok(sent[0].subject.includes(String(seedBest - 150)), 'subject carries the new price');
  assert.ok(sent[0].text.includes('/product/airpods'), 'email links the product');
  assert.ok(!logs.some(l => l.includes('price alert')), 'must not console-log when emailed');
  assert.ok((await alerts())[0].delivered_at > 0);

  // failing send: alert recorded, delivered_at stays null (re-arm first)
  env.SEND_EMAIL = { send: async () => { throw new Error('boom'); } };
  await push([{ product_id: 'airpods', shop: 'Elkjøp', price: seedBest - 50, stock: 1 }]); // re-arm
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    await push([{ product_id: 'airpods', shop: 'Elkjøp', price: seedBest - 160, stock: 1 }]);
  } finally { console.error = realError; }
  const rows = await alerts();
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].delivered_at, null, 'failed send must leave the alert undelivered');
  assert.ok(errors.some(e => e.includes('price alert send failed for ola@nordmann.no')));
});

// activity feed: GET /api/alerts serves the session user's alert history
test('GET /api/alerts: 401 unauthenticated, scoped to the session user, newest first, capped at 50', async () => {
  const { DB, call, push } = alertEnv();
  await call('/api/catalog.json'); // seeds
  assert.strictEqual((await call('/api/alerts')).status, 401, 'no session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const target = seedBest - 100;
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target }], cookie: ola });
  const row = (price) => ({ product_id: 'airpods', shop: 'Elkjøp', price, stock: 1 });
  await withLog(() => push([row(target - 10)])); // fires
  await withLog(() => push([row(target + 50)])); // re-arm
  await withLog(() => push([row(target - 30)])); // fires again, newer

  const mine = await (await call('/api/alerts', { cookie: ola })).json();
  assert.strictEqual(mine.length, 2);
  assert.strictEqual(mine[0].price, target - 30, 'newest first');
  assert.strictEqual(mine[1].price, target - 10);
  assert.strictEqual(mine[0].product, seed.find(p => p.id === 'airpods').name, 'joined product title');
  assert.strictEqual(mine[0].product_id, 'airpods');
  assert.strictEqual(mine[0].shop, 'Elkjøp');
  assert.strictEqual(mine[0].target, target);
  assert.ok(mine[0].created_at >= mine[1].created_at);

  assert.deepStrictEqual(await (await call('/api/alerts', { cookie: kari })).json(), [], "another user's alerts must not leak");

  // cap: bulk-insert straight into the table (ola is user 1) and count
  for (let i = 0; i < 60; i++) {
    await DB.prepare('INSERT INTO alerts (user_id, product_id, shop, price, prev_price, target, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(1, 'airpods', 'Elkjøp', 1000 + i, null, 999, Date.now(), null).run();
  }
  assert.strictEqual((await (await call('/api/alerts', { cookie: ola })).json()).length, 50, 'capped at 50');
});

test('POST /api/report: session-gated, validated, capped at 20/day; rows ride the GDPR export and die with the account', async () => {
  const DB = d1();
  const call = api({ DB });
  const report = (body, cookie) => call('/api/report', { method: 'POST', body, cookie });

  assert.strictEqual((await report({ productId: 'airpods', reason: 'wrong price' })).status, 401, 'no session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.strictEqual((await report({ productId: 'airpods', shop: 'Elkjøp', reason: 'wrong price', text: 'shows 1990, site says 1790' }, ola)).status, 200);
  assert.strictEqual((await report({ productId: 'airpods', reason: 'other' }, ola)).status, 200, 'shop and text are optional');

  for (const bad of [
    {}, { productId: 'airpods' }, { reason: 'wrong price' },
    { productId: 'airpods', reason: '' },
    { productId: 'airpods', reason: 'x'.repeat(41) },
    { productId: 'airpods', reason: 'other', text: 'x'.repeat(1001) },
    { productId: 'no-such-product', reason: 'wrong price' },
  ]) {
    assert.strictEqual((await report(bad, ola)).status, 400, JSON.stringify(bad));
  }

  for (let i = 2; i < 20; i++) assert.strictEqual((await report({ productId: 'airpods', reason: 'other' }, ola)).status, 200);
  assert.strictEqual((await report({ productId: 'airpods', reason: 'other' }, ola)).status, 429, '21st report today must 429');

  const exported = await (await call('/api/account/export', { cookie: ola })).json();
  assert.strictEqual(exported.reports.length, 20, 'reports ride the GDPR export');
  assert.strictEqual(exported.reports[0].reason, 'other');
  assert.strictEqual(exported.reports.at(-1).text, 'shows 1990, site says 1790');

  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  assert.strictEqual((await report({ productId: 'airpods', reason: 'out of stock' }, kari)).status, 200, "the cap is per-user, not global");

  await call('/api/account', { method: 'DELETE', cookie: ola });
  const { n } = await DB.prepare('SELECT COUNT(*) AS n FROM reports').first();
  assert.strictEqual(n, 1, "GDPR delete must take ola's reports; kari's stays");
});
