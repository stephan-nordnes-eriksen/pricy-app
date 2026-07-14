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

let worker;
before(async () => {
  worker = (await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'index.js')))).default;
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

test('signup issues an HttpOnly session cookie and /api/me returns the user', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/me')).status, 401, 'unauthenticated /api/me must 401');

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: 'Ola@Nordmann.no', password: 'correcthorse1' } });
  assert.strictEqual(signup.status, 200);
  const setCookie = signup.headers.get('set-cookie');
  assert.match(setCookie, /pricy_session=[0-9a-f]{64}/, 'session cookie missing');
  assert.match(setCookie, /HttpOnly/, 'cookie must be HttpOnly');

  const me = await (await call('/api/me', { cookie: cookieOf(signup) })).json();
  assert.deepStrictEqual(me.user, { email: 'ola@nordmann.no', name: 'Ola', initials: 'O', hasPassword: true });
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
  assert.strictEqual((await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } })).status, 200, 'signup for an existing account just logs in (password bridge, e.g. magic link/BankID)');
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

test('signing up with a password on a pre-existing passwordless account actually sets it', async () => {
  const call = api({ DB: d1() });
  // account first exists passwordless (e.g. an earlier magic-link/BankID upsert)
  await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no' } });
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 401, 'no password yet');

  const signup = await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } });
  assert.strictEqual(signup.status, 200);
  assert.strictEqual((await signup.json()).user.hasPassword, true, 'the second signup must actually save the password');
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 200, 'must be able to log in with the password just set');
});

test('an upsert never overwrites a password that is already set', async () => {
  const call = api({ DB: d1() });
  await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } });
  // a later passwordless upsert (magic-link "open the link" / BankID) must not wipe it
  await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no' } });
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 200, 'original password must survive a passwordless upsert');
  // nor a signup attempt with a different password
  await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'differentpass1' } });
  assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } })).status, 200, 'a second signup must not silently change the password');
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

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } }));
  assert.strictEqual((await call('/api/watches', { method: 'PUT', body: watches, cookie: ola })).status, 200);
  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.deepStrictEqual(me.watches, [
    { id: 'xm5', target: 3100, paused: 0 },
    { id: 'lgc3', target: 12000, paused: 1 },
  ]);

  // replace-all semantics, and another user sees nothing
  await call('/api/watches', { method: 'PUT', body: [{ id: 'xm5', target: 2999 }], cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).watches, [{ id: 'xm5', target: 2999, paused: 0 }]);
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no' } }));
  assert.deepStrictEqual((await (await call('/api/me', { cookie: kari })).json()).watches, []);

  for (const bad of ['nope', [{ id: 42 }], [{ id: 'a', target: 'high' }], [{ id: 'a' }, { id: 'a' }]]) {
    assert.strictEqual((await call('/api/watches', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
});

test('account name and notification settings persist per user and require auth', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/account', { method: 'PATCH', body: { name: 'Ola' } })).status, 401, 'PATCH without session must 401');
  assert.strictEqual((await call('/api/settings', { method: 'PUT', body: { email: true } })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } }));
  const patch = await call('/api/account', { method: 'PATCH', body: { name: 'Ola Norge' }, cookie: ola });
  assert.strictEqual(patch.status, 200);
  assert.deepStrictEqual((await patch.json()).user, { email: 'ola@nordmann.no', name: 'Ola Norge', initials: 'ON' });

  const settings = await call('/api/settings', { method: 'PUT', body: { email: false, digest: 'daily' }, cookie: ola });
  assert.strictEqual(settings.status, 200);

  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.strictEqual(me.user.name, 'Ola Norge', 'name change must persist across requests');
  assert.deepStrictEqual(me.settings, { email: false, digest: 'daily' });

  // another user's settings/name are untouched
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no' } }));
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
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } }));
  const out = await call('/api/logout', { method: 'POST', cookie });
  assert.match(out.headers.get('set-cookie'), /pricy_session=;.*Max-Age=0/, 'cookie must be cleared');
  assert.strictEqual((await call('/api/me', { cookie })).status, 401, 'session must be dead server-side');
});

test('unknown api routes 404', async () => {
  assert.strictEqual((await api({ DB: d1() })('/api/nope')).status, 404);
});

// 4c: dynamic catalog — seed.json is generated by `node build.js` (npm test does)
const seed = require(path.join(__dirname, '..', 'worker', 'seed.json'));

test('catalog route seeds D1 on first request and serves the demo shape, no auth', async () => {
  const call = api({ DB: d1() });
  const res = await call('/api/catalog.json');
  assert.strictEqual(res.status, 200);
  const cat = await res.json();
  assert.strictEqual(cat.length, seed.length, 'every seed product must be served');

  const want = seed[0];
  const got = cat.find(p => p.id === want.id);
  assert.strictEqual(got.name, want.name);
  assert.strictEqual(got.cat, want.cat);
  assert.deepStrictEqual(got.history, want.history.slice(-24), 'history must round-trip through price_points');
  assert.deepStrictEqual(new Set(got.offers.map(o => o.shop)), new Set(want.offers.map(o => o.shop)));
  assert.strictEqual(got.best, Math.min(...want.offers.map(o => o.price)), 'best derives from offers');
  assert.strictEqual(got.shops, got.offers.length);
  assert.deepStrictEqual(got.offers.map(o => o.price), [...got.offers.map(o => o.price)].sort((a, b) => a - b), 'offers are price-ordered');
});

test('scheduled refresh moves offer prices and keeps one price point per day', async () => {
  const DB = d1();
  const call = api({ DB });
  const before = await (await call('/api/catalog.json')).json(); // seeds
  const ctl = { waitUntil() {} };
  await worker.scheduled({ cron: '0 * * * *' }, { DB }, ctl);
  await worker.scheduled({ cron: '0 * * * *' }, { DB }, ctl);
  const after = await (await call('/api/catalog.json')).json();

  for (const p of after) {
    const prev = before.find(q => q.id === p.id);
    assert.strictEqual(p.offers.length, prev.offers.length, `refresh must not add or lose offers (${p.id})`);
    assert.strictEqual(p.best, Math.min(...p.offers.map(o => o.price)), `best must track refreshed offers (${p.id})`);
    assert.strictEqual(p.history.length, prev.history.length, `today's point is upserted, not appended (${p.id})`);
  }
  assert.ok(after.some((p, i) => p.best !== before[i].best), 'refresh should move at least one price');
});
