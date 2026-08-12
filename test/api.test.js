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
  const stmt = (sql, args) => {
    // real D1 rejects >100 bound parameters — node:sqlite allows ~32k, so
    // without this cap an unchunked IN (...) over a grown category passes
    // here and 1101s in prod (Audio at 124 heads, 2026-07-23)
    if (args.length > 100) throw new Error(`D1 caps bound parameters at 100, got ${args.length}: ${sql.slice(0, 80)}`);
    return stmtOps(sql, args);
  };
  const stmtOps = (sql, args) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return {
    exec: async (sql) => db.exec(sql),
    prepare: (sql) => ({ bind: (...args) => stmt(sql, args), ...stmt(sql, []) }),
    // real D1 returns one D1Result per statement, ROWS INCLUDED, so a batch of
    // SELECTs is a legitimate way to spend one round trip instead of five
    // (catMeta does exactly that). A shim that only .run()s each statement
    // returns nothing, which passes here and serves empty pages in prod — so
    // this returns per-statement results. node:sqlite's all() is safe for DML
    // too (returns []), so one path covers reads and writes alike.
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push({ ...await s.all(), success: true });
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

let worker, shipCost, parsePrice, parseSitemapXml, breadcrumbCat, scrapeSource, discoverSource;
before(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'index.js')));
  worker = mod.default;
  shipCost = mod.shipCost;
  ({ parsePrice, parseSitemapXml, breadcrumbCat, scrapeSource, discoverSource } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'sources.js'))));
});

// Ops routes (ingest, admin, the catalog.json dump) are bearer-gated, so
// every test env gets a token unless it declares its own — including
// `INGEST_TOKEN: undefined`, which is how the "endpoint disabled" path is
// tested. Mutated in place: some tests swap bindings on `env` after api().
const OPS = 'ops-token';
const api = (env) => {
  if (!('INGEST_TOKEN' in env)) env.INGEST_TOKEN = OPS;
  const call = (pathname, { method = 'GET', body, cookie, token } = {}) =>
    worker.fetch(new Request('http://pricy.test' + pathname, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
  call.token = env.INGEST_TOKEN; // so catBody can reach the gated dump
  return call;
};

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
    { id: 'xm5', target: 3100, paused: 0, hit: 0, inclShip: 0 },
    { id: 'lgc3', target: 12000, paused: 1, hit: 0, inclShip: 0 },
  ]);

  // replace-all semantics, and another user sees nothing
  await call('/api/watches', { method: 'PUT', body: [{ id: 'xm5', target: 2999 }], cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).watches, [{ id: 'xm5', target: 2999, paused: 0, hit: 0, inclShip: 0 }]);
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

test('HIDE_AUTOBUY hides every buy surface: MCP tools, /api/buy, /api/autobuy, the me blob', async () => {
  const env = { DB: d1(), HIDE_AUTOBUY: true };
  const call = api(env);
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));

  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.ok(!('autobuy' in me) && !('purchases' in me), 'me blob must not carry autobuy/purchases');
  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: { signed: true, orders: [] }, cookie: ola })).status, 404, 'PUT /api/autobuy must 404');
  assert.strictEqual((await call('/api/buy', { method: 'POST', body: { id: 'airpods' }, cookie: ola })).status, 404, 'POST /api/buy must 404');

  // GDPR export stays complete — the user's own data is not feature-flagged
  const exported = await (await call('/api/account/export', { cookie: ola })).json();
  assert.ok('autobuy' in exported && 'purchases' in exported, 'the data export must keep autobuy/purchases');

  const { rpc, tool } = mcpClient(env);
  const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.ok(!/buy_now/.test(init.result.instructions), 'instructions must not mention buy_now');
  const { result } = await rpc('tools/list');
  const names = result.tools.map(t => t.name);
  assert.ok(!names.includes('buy_now') && !names.includes('list_purchases'), 'buy tools must not list');
  assert.ok(names.includes('search_products'), 'the rest still list');
  assert.ok(!result.tools.some(t => /buy_now/.test(t.description)), 'no tool description may mention buy_now');
  await tool('login', { email: 'ola@nordmann.no', password: 'correcthorse1' });
  const buy = await tool('buy_now', { product_id: 'airpods' });
  assert.ok(buy.error && /unknown tool/.test(buy.message), 'calling buy_now must fail as unknown');
  const purchases = await tool('list_purchases');
  assert.ok(purchases.error && /unknown tool/.test(purchases.message), 'calling list_purchases must fail as unknown');
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

test('custom lists persist per user via PUT /api/lists', async () => {
  const call = api({ DB: d1() });
  const lists = [
    { id: 'hytta', name: 'Hytta 2027', icon: 'mountain-snow', items: ['xm5', 'airpods'], shared: null, bought: {}, createdAt: '2026-08-02' },
    { id: 'gaver', name: 'Julegaver', icon: 'gift', items: ['kindle'], shared: { role: 'owner', people: [], gift: true }, bought: { kindle: { by: 'Du', at: '2026-08-02' } }, createdAt: '2026-08-02' },
  ];
  assert.strictEqual((await call('/api/lists', { method: 'PUT', body: lists })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).lists, [], 'a new user has no lists');

  assert.strictEqual((await call('/api/lists', { method: 'PUT', body: lists, cookie: ola })).status, 200);
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).lists, lists, 'the blob must round-trip verbatim');

  // deleting a list is just PUTting the shorter array
  await call('/api/lists', { method: 'PUT', body: lists.slice(0, 1), cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).lists, lists.slice(0, 1));

  // another user is untouched
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  assert.deepStrictEqual((await (await call('/api/me', { cookie: kari })).json()).lists, []);

  for (const bad of ['nope', {}, [{ id: 'x' }], [{ id: 'x', name: 'X', items: [1] }], [{ id: 'x', name: 'X', items: [] }, { id: 'x', name: 'Dup', items: [] }]]) {
    assert.strictEqual((await call('/api/lists', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await call('/api/lists', { method: 'PUT', cookie: ola })).status, 400, 'missing body must 400');
});

test('list sharing: mint, member join, bought marks, gift privacy', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/account', { method: 'PATCH', body: { name: 'Ola Nordmann' }, cookie: ola });
  await call('/api/lists', {
    method: 'PUT', cookie: ola,
    body: [{ id: 'gaver', name: 'Julegaver', icon: 'gift', items: ['xm5', 'airpods'], shared: { role: 'owner', people: [], gift: true }, bought: {}, createdAt: '2026-08-02' }],
  });

  // mint: auth + existence gates, then a token url; reissue kills the old link
  assert.strictEqual((await call('/api/lists/gaver/share', { method: 'POST' })).status, 401, 'mint without session must 401');
  assert.strictEqual((await call('/api/lists/nope/share', { method: 'POST', cookie: ola })).status, 404, 'mint for a list you do not have must 404');
  const { url } = await (await call('/api/lists/gaver/share', { method: 'POST', cookie: ola })).json();
  const token = url.split('/l/')[1];
  assert.match(token, /^[0-9a-f]{64}$/, 'share url must end in a token');

  // member surface: session required, dead token 404s
  assert.strictEqual((await call('/api/l/' + token)).status, 401, 'member GET without session must 401');
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  await call('/api/account', { method: 'PATCH', body: { name: 'Kari Nordmann' }, cookie: kari });
  assert.strictEqual((await call('/api/l/' + 'f'.repeat(64), { cookie: kari })).status, 404, 'unknown token must 404');

  // kari opens the link: sees the list with live rows, and joins as a member
  const view = await (await call('/api/l/' + token, { cookie: kari })).json();
  assert.strictEqual(view.list.name, 'Julegaver');
  assert.deepStrictEqual([view.list.role, view.list.gift, view.list.owner], ['member', true, 'Ola Nordmann']);
  assert.deepStrictEqual(view.products.map(p => p.id).sort(), ['airpods', 'xm5'], 'items ride as hydrated rows');
  const olaMe = await (await call('/api/me', { cookie: ola })).json();
  assert.deepStrictEqual(olaMe.lists[0].shared.people, [{ name: 'Kari Nordmann', initials: 'KN' }], 'first view joins the member');

  // kari checks off xm5; a mark for something not in the list is refused
  assert.strictEqual((await call('/api/l/' + token, { method: 'POST', body: { product_id: 'tv', bought: true }, cookie: kari })).status, 400);
  const marked = await (await call('/api/l/' + token, { method: 'POST', body: { product_id: 'xm5', bought: true }, cookie: kari })).json();
  assert.deepStrictEqual(marked.bought.xm5.by, 'Kari Nordmann', 'members see who bought');
  assert.strictEqual(marked.bought.xm5.mine, true);

  // another member cannot clear kari's mark; kari can clear her own
  const per = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'per@example.no', password: 'correcthorse1' } }));
  const perClear = await (await call('/api/l/' + token, { method: 'POST', body: { product_id: 'xm5', bought: false }, cookie: per })).json();
  assert.ok(perClear.bought.xm5, 'a member clearing someone else\'s mark is a no-op');

  // gift privacy: the OWNER never sees who — not via /api/me, not via the link
  const olaMe2 = await (await call('/api/me', { cookie: ola })).json();
  assert.ok(olaMe2.lists[0].bought.xm5.at, 'owner sees THAT it was bought');
  assert.ok(!('by' in olaMe2.lists[0].bought.xm5), 'owner me payload must not say who');
  const ownerView = await (await call('/api/l/' + token, { cookie: ola })).json();
  assert.deepStrictEqual([ownerView.list.role, 'by' in ownerView.bought.xm5], ['owner', false], 'owner link view strips names too');

  // a crafted PUT cannot smuggle names into the owner's payload
  const smuggled = olaMe2.lists.map(l => ({ ...l, bought: { xm5: { by: 'Kari Nordmann', at: '2026-08-02' } } }));
  await call('/api/lists', { method: 'PUT', body: smuggled, cookie: ola });
  assert.ok(!('by' in (await (await call('/api/me', { cookie: ola })).json()).lists[0].bought.xm5), 'server marks win over the blob for shared lists');

  // the owner can clear anyone's mark
  const cleared = await (await call('/api/l/' + token, { method: 'POST', body: { product_id: 'xm5', bought: false }, cookie: ola })).json();
  assert.deepStrictEqual(cleared.bought, {}, 'owner clear removes the mark');

  // reissue replaces: the old link dies, the new one works
  const { url: url2 } = await (await call('/api/lists/gaver/share', { method: 'POST', cookie: ola })).json();
  assert.strictEqual((await call('/api/l/' + token, { cookie: kari })).status, 404, 'reissue must kill the old link');
  assert.strictEqual((await call('/api/l/' + url2.split('/l/')[1], { cookie: kari })).status, 200);
});

test('list sharing GDPR: deleting either side removes their rows', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/lists', { method: 'PUT', cookie: ola, body: [{ id: 'g', name: 'G', icon: 'gift', items: ['xm5'], shared: { role: 'owner', people: [], gift: true }, bought: {}, createdAt: '2026-08-02' }] });
  const { url } = await (await call('/api/lists/g/share', { method: 'POST', cookie: ola })).json();
  const token = url.split('/l/')[1];
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  await call('/api/l/' + token, { method: 'POST', body: { product_id: 'xm5', bought: true }, cookie: kari });

  // member deletes: gone from people, mark gone
  await call('/api/account', { method: 'DELETE', cookie: kari });
  const me = await (await call('/api/me', { cookie: ola })).json();
  assert.deepStrictEqual([me.lists[0].shared.people, me.lists[0].bought], [[], {}], 'a deleted member leaves no trace on the list');

  // owner deletes: the link is dead
  const kari2 = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  await call('/api/account', { method: 'DELETE', cookie: ola });
  assert.strictEqual((await call('/api/l/' + token, { cookie: kari2 })).status, 404, 'owner deletion must kill the link');
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

// ── Reviews / Folkedommen (plans/folkedommen-reviews.md) ───────────────────
const REV = (claims, x = {}) => ({ claims: { worth: claims[0], durable: claims[1], described: claims[2] }, ...x });
const prodOf = async (call, id) => (await (await call('/api/products?ids=' + id)).json()).products.find(q => q.id === id);

test('reviews: post is edit-your-own (one per user), the udom aggregate lands in product meta, votes toggle', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/reviews?ids=xm5')).status, 401, 'GET requires a session');
  assert.strictEqual((await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy') } })).status, 401, 'POST requires a session');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari.hansen@example.no', password: 'correcthorse1' } }));

  for (const bad of [
    { product_id: 'xm5' },                                              // claims are the one required field
    { product_id: 'xm5', claims: { worth: 'y', durable: 'x', described: 'y' } },
    { product_id: 'xm5', claims: { worth: 'y', described: 'y' } },
    // these join to a valid 'ynu' string with the answers on the wrong claims
    { product_id: 'xm5', claims: { worth: 'yn', durable: 'u' } },
    { product_id: 'xm5', claims: { worth: 'ynu' } },
    { product_id: 'xm5', ...REV('yyy'), title: 'x'.repeat(81) },
    { product_id: 'xm5', ...REV('yyy'), body: 'x'.repeat(2001) },
    { product_id: 'xm5', ...REV('yyy'), shop: 'x'.repeat(61) },
    { product_id: 'xm5', ...REV('yyy'), paid: 0 },
    { product_id: 'xm5', ...REV('yyy'), paid: 2790.5 },
    { product_id: 'xm5', ...REV('yyy'), paid: 1000001 },
    { product_id: 'nope-no-such', ...REV('yyy') },
  ]) assert.strictEqual((await call('/api/reviews', { method: 'POST', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));

  // the demo seed stars are fake trust signals — a row with no real reviews
  // serves no dom/rating/reviews at all ("Ingen omtaler ennå" upstream)
  const bare = await prodOf(call, 'xm5');
  assert.strictEqual(bare.rating, undefined, 'demo seed rating must never serve — it is upstream\'s synth input');
  assert.strictEqual(bare.dom, undefined, 'no reviews, no verdict');
  assert.strictEqual(bare.reviews, undefined, 'demo seed review count must not serve');

  // title and body are optional now; the three claims carry the review
  const first = await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), plus: ['God lyd'] }, cookie: ola });
  assert.strictEqual(first.status, 200);
  const mine = (await first.json()).reviews;
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].author, 'Ola'); // single-word name, no initial
  assert.strictEqual(mine[0].claims, 'yyy', 'claims serve as upstream\'s own 3-char encoding');
  assert.deepStrictEqual(mine[0].plus, ['God lyd']);
  assert.strictEqual(mine[0].title, '');
  assert.strictEqual(mine[0].edited, false);
  assert.strictEqual(mine[0].mine, true);
  assert.strictEqual(mine[0].verified, false);

  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('ynu'), plus: ['God lyd'], minus: ['Blir varm'], title: 'Grei' }, cookie: kari });
  let list = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews;
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list.find(r => !r.mine).author, 'Kari H.', 'author is first name + last initial');

  // the served aggregate — the ONLY thing every result row, card and Compare
  // cell can read for a product whose review rows the client never fetched
  let p = await prodOf(call, 'xm5');
  assert.deepStrictEqual(p.dom.c, { worth: [2, 0, 0], durable: [1, 1, 0], described: [1, 0, 1] });
  assert.strictEqual(p.dom.n, 2);
  assert.strictEqual(p.reviews, 2, 'upstream\'s `reviews` sort still reads a count');
  assert.deepStrictEqual(p.dom.t, [['God lyd', 2, 1], ['Blir varm', 1, 0]], 'traits are [trait, count, 1=plus], count desc');
  assert.strictEqual(p.dom.p, undefined, 'nobody reported a price');
  assert.strictEqual(p.rating, undefined, 'no numeric rating survives Folkedommen');

  // second POST from the same user edits, never duplicates
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('nnn'), title: 'Ombestemt' }, cookie: ola });
  list = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews;
  assert.strictEqual(list.length, 2, 'edit must not add a row');
  assert.strictEqual(list.find(r => r.mine).edited, true, 'an edit keeps created_at and stamps updated_at');
  p = await prodOf(call, 'xm5');
  assert.deepStrictEqual(p.dom.c.worth, [1, 1, 0]);
  assert.deepStrictEqual(p.dom.t, [['God lyd', 1, 1], ['Blir varm', 1, 0]], 'the edited-away trait is gone');

  // free text rendered to other users is capped: 6 entries, 40 chars each
  await call('/api/reviews', { method: 'POST', body: {
    product_id: 'xm5', ...REV('yyy'),
    plus: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x'.repeat(50), ' b ', ''],
  }, cookie: ola });
  const capped = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews.find(r => r.mine);
  assert.strictEqual(capped.plus.length, 6, 'at most 6 traits per side');
  assert.ok(capped.plus.every(t => t.length <= 40), 'each trait is capped at 40 chars');
  assert.deepStrictEqual(capped.plus.slice(0, 3), ['a', 'b', 'c'], 'trimmed and deduped');

  // a purchase marks the buyer's review as a verified buy
  await call('/api/buy', { method: 'POST', body: { id: 'xm5' }, cookie: ola });
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy') }, cookie: ola });
  list = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews;
  assert.strictEqual(list.find(r => r.mine).verified, true);

  // helpful votes toggle, one per user, counted at read
  const rid = list.find(r => !r.mine).id;
  let vote = await (await call(`/api/reviews/${rid}/vote`, { method: 'POST', cookie: ola })).json();
  assert.deepStrictEqual(vote, { helpful: 1, voted: true });
  list = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews;
  assert.strictEqual(list.find(r => r.id === rid).voted, true);
  vote = await (await call(`/api/reviews/${rid}/vote`, { method: 'POST', cookie: ola })).json();
  assert.deepStrictEqual(vote, { helpful: 0, voted: false }, 'second vote un-votes');
  assert.strictEqual((await call('/api/reviews/999999/vote', { method: 'POST', cookie: ola })).status, 404);
});

// "alltid spennet, aldri enkeltkjøp" — a single reporter's exact receipt is a
// named person's purchase, hidden toggle or not, and upstream renders
// lo === hi as ONE amount. The floor of 3 + rounding is what makes that true.
test('reviews: what people paid is a rounded range over 3+ reporters, and a hidden amount never carries a name', async () => {
  const call = api({ DB: d1() });
  const users = [];
  for (const email of ['ola@nordmann.no', 'kari@example.no', 'per@example.no']) {
    users.push(cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email, password: 'correcthorse1' } })));
  }
  const [ola, kari, per] = users;

  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), paid: 2795, show_paid: false }, cookie: ola });
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), paid: 3291, show_paid: true }, cookie: kari });
  assert.strictEqual((await prodOf(call, 'xm5')).dom.p, undefined, 'two reporters is not a range yet');

  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), paid: 2999, show_paid: true }, cookie: per });
  // a HIDDEN amount still counts toward the range — it is only never attached
  // to a name — so lo comes off ola's 2795, rounded down to the nearest 10
  assert.deepStrictEqual((await prodOf(call, 'xm5')).dom.p, [2790, 3300, 3]);

  const seen = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews;
  const olasRow = seen.find(r => r.author === 'Ola');
  assert.strictEqual(olasRow.paid, undefined, 'a hidden amount must never reach another user');
  assert.strictEqual(olasRow.showPaid, false);
  assert.strictEqual(seen.find(r => r.mine).paid, 3291, 'your own amount comes back — the edit modal prefills from it');
  assert.strictEqual(seen.find(r => r.author === 'Per').paid, 2999, 'a shown amount is public');

  const own = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews.find(r => r.mine);
  assert.strictEqual(own.paid, 2795, 'the author always sees their own hidden amount');

  // show_paid can only be true when there is something to show
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), show_paid: true }, cookie: ola });
  const cleared = (await (await call('/api/reviews?ids=xm5', { cookie: ola })).json()).reviews.find(r => r.mine);
  assert.strictEqual(cleared.showPaid, false);
  assert.strictEqual(cleared.paid, undefined);
  assert.strictEqual((await prodOf(call, 'xm5')).dom.p, undefined, 'back under 3 reporters, the range goes away');
});

test('reviews: delete removes your own only, cascades votes and refreshes the aggregate', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const olaRid = (await (await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), title: 'Topp' }, cookie: ola })).json()).reviews.find(r => r.mine).id;
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('nnn'), title: 'Dårlig' }, cookie: kari });
  await call(`/api/reviews/${olaRid}/vote`, { method: 'POST', cookie: kari });

  assert.strictEqual((await call(`/api/reviews/${olaRid}`, { method: 'DELETE' })).status, 401);
  assert.strictEqual((await call(`/api/reviews/${olaRid}`, { method: 'DELETE', cookie: kari })).status, 404, 'someone else\'s review is a 404, not a 403');
  assert.strictEqual((await call('/api/reviews/999999', { method: 'DELETE', cookie: ola })).status, 404);

  const gone = await call(`/api/reviews/${olaRid}`, { method: 'DELETE', cookie: ola });
  assert.strictEqual(gone.status, 200);
  assert.deepStrictEqual((await gone.json()).reviews.map(r => r.title), ['Dårlig'], 'the response is the product\'s canonical rows');
  assert.deepStrictEqual((await prodOf(call, 'xm5')).dom.c.worth, [0, 1, 0], 'aggregate recomputed');
  assert.strictEqual((await call(`/api/reviews/${olaRid}`, { method: 'DELETE', cookie: ola })).status, 404, 'second delete is a 404');

  // deleting the last one takes the verdict off the product entirely
  const kariRid = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews[0].id;
  await call(`/api/reviews/${kariRid}`, { method: 'DELETE', cookie: kari });
  const p = await prodOf(call, 'xm5');
  assert.strictEqual(p.dom, undefined, 'no reviews left, no served verdict');
  assert.strictEqual(p.reviews, undefined);
});

test('reviews: mine=1 lists your reviews across every product', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  assert.strictEqual((await call('/api/reviews?mine=1')).status, 401);

  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), title: 'Sony' }, cookie: ola });
  await call('/api/reviews', { method: 'POST', body: { product_id: 'ps5', ...REV('yuy'), title: 'Konsoll' }, cookie: ola });
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('nnn'), title: 'Kari' }, cookie: kari });

  const mine = (await (await call('/api/reviews?mine=1', { cookie: ola })).json()).reviews;
  assert.deepStrictEqual(mine.map(r => [r.prodId, r.title]), [['ps5', 'Konsoll'], ['xm5', 'Sony']], 'newest first, both products, mine only');
  assert.ok(mine.every(r => r.mine));
  assert.deepStrictEqual((await (await call('/api/reviews?mine=1', { cookie: kari })).json()).reviews.map(r => r.title), ['Kari']);
});

// The CLAUDE.md rule about failGroups/sortRows drifting from Results' own
// predicate applies here exactly as it does to facets: these numbers ARE
// upstream's domTier cuts (.85/.6/.4) over its claim shares.
test('reviews: the dom filter and the Folkedommen sort mirror upstream\'s tiers server-side', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  // score = mean of y/(y+n) per claim, .5 for a claim with no decided answers
  for (const [id, c] of [['xm5', 'yyy'], ['bose-ultra', 'yyn'], ['airpods', 'nnn'], ['senn-m4', 'uuu']]) {
    await call('/api/reviews', { method: 'POST', body: { product_id: id, ...REV(c) }, cookie: ola });
  }
  const ids = async (qs) => (await (await call('/api/products?cat=Audio&' + qs)).json()).products.map(p => p.id);
  const meta = async (qs) => (await (await call('/api/products?cat=Audio&' + qs)).json()).meta;

  // 1.0 → tier 3, .667 → 2, 0 → 0, .5 (all undecided) → 1
  assert.deepStrictEqual((await ids('dom=3')).sort(), ['xm5']);
  assert.deepStrictEqual((await ids('dom=2')).sort(), ['bose-ultra', 'xm5']);
  assert.deepStrictEqual((await ids('dom=1')).sort(), ['bose-ultra', 'senn-m4', 'xm5'],
    'an all-«vet ikke» review still scores .5 — tier 1');
  assert.strictEqual((await meta('dom=2')).total, 2, 'the served total counts the same rows');
  assert.strictEqual((await ids('dom=9')).length > 4, true, 'an out-of-range tier is no filter at all');

  // a row with no reviews has no tier and is EXCLUDED — upstream's behaviour
  assert.ok(!(await ids('dom=1')).includes('airpods4'), 'unreviewed rows fail the tier test');

  const sorted = await ids('sort=rating&dir=desc');
  assert.deepStrictEqual(sorted.slice(0, 4), ['xm5', 'bose-ultra', 'senn-m4', 'airpods'],
    'Folkedommen sorts on the claim score, best first, unreviewed rows last');
  assert.deepStrictEqual((await ids('sort=reviews&dir=desc')).slice(0, 4).sort(),
    ['airpods', 'bose-ultra', 'senn-m4', 'xm5'], 'the reviews sort ranks the four that have one');
});

test('reviews: moderation hide drops the review from GET and the aggregate; editing cannot republish', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), title: 'Spam', body: 'kjøp klokker billig' }, cookie: ola });
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('ynu'), title: 'Grei', body: 'Helt ok' }, cookie: kari });
  const rid = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews.find(r => !r.mine).id;

  assert.strictEqual((await call(`/api/admin/reviews/${rid}`, { method: 'PATCH', body: { hidden: 1 } })).status, 401, 'moderation is bearer-gated');
  assert.strictEqual((await call(`/api/admin/reviews/${rid}`, { method: 'PATCH', body: { hidden: 2 }, token: OPS })).status, 400);
  assert.strictEqual((await call(`/api/admin/reviews/${rid}`, { method: 'PATCH', body: { hidden: 1 }, token: OPS })).status, 200);
  assert.strictEqual((await call('/api/admin/reviews/999999', { method: 'PATCH', body: { hidden: 1 }, token: OPS })).status, 404);

  let list = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews;
  assert.deepStrictEqual(list.map(r => r.title), ['Grei'], 'hidden review is gone from GET');
  let p = await prodOf(call, 'xm5');
  assert.deepStrictEqual(p.dom.c, { worth: [1, 0, 0], durable: [0, 1, 0], described: [0, 0, 1] }, 'aggregate recomputed without the hidden review');
  assert.strictEqual(p.dom.n, 1);
  assert.deepStrictEqual((await (await call('/api/reviews?mine=1', { cookie: ola })).json()).reviews, [], 'a hidden review is not served to its author either');
  assert.strictEqual((await call(`/api/reviews/${rid}/vote`, { method: 'POST', cookie: kari })).status, 404, 'hidden reviews cannot be voted');

  // editing while hidden stays hidden — no self-republish
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), title: 'Ny drakt', body: 'samme spam' }, cookie: ola });
  list = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews;
  assert.deepStrictEqual(list.map(r => r.title), ['Grei']);

  assert.strictEqual((await call(`/api/admin/reviews/${rid}`, { method: 'PATCH', body: { hidden: 0 }, token: OPS })).status, 200);
  list = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews;
  assert.strictEqual(list.length, 2, 'unhide restores it');
});

test('reviews GDPR: export includes reviews + votes; delete removes them and recomputes the aggregate', async () => {
  const call = api({ DB: d1() });
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('yyy'), title: 'Topp', body: 'Beste ANC', plus: ['God lyd'], shop: 'Komplett', paid: 2790, show_paid: true }, cookie: ola });
  const kariRid = (await (await call('/api/reviews', { method: 'POST', body: { product_id: 'xm5', ...REV('ynu'), title: 'Grei', body: 'Helt ok' }, cookie: kari })).json()).reviews.find(r => r.mine).id;
  await call(`/api/reviews/${kariRid}/vote`, { method: 'POST', cookie: ola });

  const data = await (await call('/api/account/export', { cookie: ola })).json();
  assert.deepStrictEqual(data.reviews.map(r => [r.product_id, r.claims, r.plus, r.buy_shop, r.paid, r.show_paid, r.title]),
    [['xm5', 'yyy', '["God lyd"]', 'Komplett', 2790, 1, 'Topp']], 'the export carries every field the review holds');
  assert.strictEqual(data.reviews[0].updated_at, data.reviews[0].created_at,
    'a create stamps ONE timestamp — a ms tick between two Date.now() calls read as edited');
  assert.deepStrictEqual(data.review_votes, [kariRid]);

  await call('/api/account', { method: 'DELETE', cookie: ola });
  const list = (await (await call('/api/reviews?ids=xm5', { cookie: kari })).json()).reviews;
  assert.deepStrictEqual(list.map(r => r.title), ['Grei'], 'deleted user\'s review is gone');
  assert.strictEqual(list[0].helpful, 0, 'their votes die too');
  const p = await prodOf(call, 'xm5');
  assert.strictEqual(p.dom.n, 1, 'aggregate recomputed after the delete');
  assert.deepStrictEqual(p.dom.c.worth, [1, 0, 0]);
});

test('catMeta serves per-shop objective stats (shopStats) and the shops count off the same GROUP BY', async () => {
  const call = api({ DB: d1() });
  const { meta } = await (await call('/api/products?ids=xm5')).json();
  assert.ok(meta.shops > 0);
  assert.strictEqual(Object.keys(meta.shopStats).length, meta.shops, 'shops count = shopStats keys');
  for (const s of Object.values(meta.shopStats)) {
    assert.ok(Number.isInteger(s.offers) && s.offers > 0);
    assert.ok('updated' in s);
  }
  // basket optimizer: the raw {flat, freeOver} rules ride along — per-offer
  // shipCost is priced at the single item, so threshold-aware basket totals
  // need the registry itself (plans/basket-optimizer.md)
  assert.deepStrictEqual(meta.shipping, JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'worker', 'shipping.json'), 'utf8')), 'meta.shipping serves the shipping registry');
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
const catBody = async (call) => (await (await call('/api/catalog.json', { token: call.token })).json()).products;

test('catalog route seeds D1 on first request and serves the demo shape, ops-gated', async () => {
  const call = api({ DB: d1() });
  assert.strictEqual((await call('/api/catalog.json')).status, 401, 'the 7 MB ops dump must not be public');
  const res = await call('/api/catalog.json', { token: OPS });
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
  // gpc-strict: seed rows carry NO category — display derives from the brick
  // the resolver stamps, and before any drain the row is honestly unsorted
  assert.ok(!('cat' in want), 'seed rows must not bake a category');
  assert.strictEqual(got.cat, 'Ukategorisert');
  assert.strictEqual(got.icon, 'package-search');
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

// Name-derived facet values (worker/facetrules.js): the 13.7k auto-promoted
// rows carry a name and nothing else, so the filters they render have to be
// read off it. Registry coverage (every rule key is declared) is build.js's
// job — this is the extraction itself.
test('facet values derive from the product name, per category', async () => {
  const { deriveFacets } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'facetrules.js')));
  const cases = [
    [{ cat: 'Furniture', name: 'Kontinentalseng 180x200 HOLMELVA grå stoff' }, { type: 'Beds', dim: '180x200', material: 'Fabric', color: 'Grey' }],
    [{ cat: 'Jewelry', name: 'Halssmykke med smiley i 925 forgylt sølv' }, { type: 'Necklaces', material: 'Gold plated' }],
    [{ cat: 'Pets', name: 'Royal Canin Dog Starter Mousse Våtfôr 0,195kg' }, { animal: 'Dog', type: 'Food', weight: 0.2 }],
    [{ cat: 'Beauty', name: "Kiehl's Ultra Facial Cream SPF30 125ml" }, { type: 'Moisturisers', volume: 125, spf: 30 }],
    [{ cat: 'Fashion', name: 'Wheat - Shorts Baby Vic Navy - 62' }, { type: 'Shorts', audience: 'Kids', size: '62', color: 'Blue' }],
    [{ cat: 'Computers', name: 'MacBook Air 13" M3 · 1 TB · Silver' }, { type: 'Laptops', size: 13, storage: 1024, color: 'Silver' }],
    [{ cat: 'TV', name: 'Samsung 55" OLED S90C' }, { type: 'TVs', size: 55, panel: 'OLED' }],
    // a TV stand is not a TV — the type facet is what separates them
    [{ cat: 'TV', name: 'Casø Birk TV-bord' }, { type: 'TV furniture' }],
    // Audio: Accessories outranks the host product's own words — a Sonos mount
    // is not a Speaker, and an accessory filed under "Hodetelefoner…" is not a
    // Headphone. But "Stativ/kompakt høyttaler" is a real stand-MOUNT speaker
    // breadcrumb, so bare "stativ" must not trip the Accessories rule.
    [{ cat: 'Audio', name: 'Wall Mount for Sonos Beam' }, { type: 'Accessories' }],
    [{ cat: 'Audio', name: 'Linocell Ørebøyler for modeller med stamme, 2-pk.', srcCat: 'Hodetelefoner og hodesett > Hodetelefonstativ & tilbehør' }, { type: 'Accessories' }],
    [{ cat: 'Audio', name: '606 S3', srcCat: 'Høyttalere > Stativ/kompakt høyttaler' }, { type: 'Speakers' }],
    // the general ACC pass: any category, off the shop's own accessory filing —
    // but only the name and the LEAF speak ("Skrivere og tilbehør > Laserskrivere"
    // holds the printers), and a conjunction means INCLUDED, not IS ("Romskip
    // med tilbehør", "Karnevalsdrakter & Tilbehør" are the real deal)
    [{ cat: 'Tools', name: 'DYSE 60° 110-145 BAR', srcCat: 'Verktøy > Høytrykkspyler tilbehør' }, { type: 'Accessories' }],
    [{ cat: 'Pets', name: 'VarioGate sett 2 Reservedeler' }, { type: 'Accessories' }],
    [{ cat: 'Office', name: 'Canon iSENSYS LBP122DW Laserskriver', srcCat: 'Skrivere og tilbehør > Laserskrivere' }, undefined],
    [{ cat: 'Toys', name: 'Romskip med tilbehør og belysning og lyd, 20cm' }, undefined],
    [{ cat: 'Toys', name: 'Spiderman maske', srcCat: 'Karnevalsdrakter & Tilbehør' }, undefined],
    // strong nouns (a deksel is never the product) beat the host product's
    // own words; ambiguous nouns are a FALLBACK, so the per-cat vocabulary
    // shields every "the noun IS the product" case — a Magic card named
    // "Case of…" stays a Trading card, "Long Sleeve" is garment phrasing,
    // and Books has no type rules so the comic "Cable" derives nothing.
    [{ cat: 'Computers', name: 'Otterbox Defender Deksel for iPad Pro 11" (M4)' }, { type: 'Accessories', size: 11 }],
    [{ cat: 'Gaming', name: 'Goobay HDMI 2.1 Kabel 1m' }, { type: 'Accessories' }],
    // an accessory noun in the name/leaf caps the crumb walk at the leaf: a
    // parent aisle names the HOST product ("Kabler til TV" holds no TV), so
    // it must not out-type the noun — but with no noun, parents still speak
    [{ cat: 'TV', name: 'Luxorparts Antennekabel, hvit 1,5 m', srcCat: 'Produkter > Kabler og kontakter > Kabler til TV > Antennekabler > Antennekabler' }, { type: 'Accessories' }],
    [{ cat: 'TV', name: 'QE55Q70T', srcCat: 'Elektronikk > TV > Samsung' }, { type: 'TVs' }],
    // …and the per-cat vocabulary still shields machines NAMED after their
    // cables — a kabelkryss is a Strength station, not a cable
    [{ cat: 'Sport', name: 'Abilica CrossOver-kabelkryss', srcCat: 'Styrketrening / Cable cross' }, { type: 'Strength' }],
    // brick-slice vocabulary (the Watches/Mobile Phones tiles pin these):
    // model-number names type off the shop's watch leaf, and a "Power Bank"
    // with a space is an accessory, not an untyped row
    [{ cat: 'Watches', name: 'G-shock GM-2110D-2AER', srcCat: 'Multifunksjons klokker' }, { type: 'Wristwatches' }],
    [{ cat: 'Phones', name: 'Xiaomi 15T Pro' }, { type: 'Phones' }],
    [{ cat: 'Phones', name: 'Anker 737 Power Bank' }, { type: 'Accessories' }],
    [{ cat: 'Gaming', name: 'Case of the Trampled Garden (Enkeltkort)', srcCat: 'Magic løskort' }, { type: 'Trading cards' }],
    // a platform-prefixed accessory is not the machine, and a game title
    // carrying its platform is a game, not a console
    [{ cat: 'Gaming', name: 'Nintendo Switch™ Deluxe Travel Case Super Mario™ reiseveske' }, { type: 'Accessories' }],
    [{ cat: 'Gaming', name: 'Horizon Forbidden West PS5' }, { type: 'Games' }],
    [{ cat: 'Gaming', name: 'Splatoon 3 for Nintendo Switch™' }, { type: 'Games' }],
    [{ cat: 'Gaming', name: 'Nintendo Switch OLED' }, { type: 'Consoles' }],
    [{ cat: 'Books', name: 'Cable And X-force Volume 4: Vendetta (marvel Now)' }, { format: 'Comics & graphic novels' }],
    [{ cat: 'Fashion', name: 'Soft Texture Long Sleeve' }, undefined],
    [{ cat: 'Toys', name: 'NEGLESETT M/ARMBÅND OG STICKE.' }, undefined],
  ];
  for (const [row, want] of cases) assert.deepStrictEqual(deriveFacets(row), want, row.name);
  assert.strictEqual(deriveFacets({ cat: 'Books', name: 'Around the Moon' }), undefined, 'no match = no facets, never an empty object');
  assert.strictEqual(deriveFacets({ cat: 'Nonesuch', name: 'Sofa' }), undefined, 'a category with no rules derives nothing');
});

// Query-based catalog: /api/products serves slices in the catalog.json row
// shape — ids (expanded to family + neighbors), q (broad candidates, the
// client re-filters), cat, top=drop; meta carries per-category head counts
test('GET /api/products: ids expand to head + siblings + same-brick neighbors', async () => {
  const call = api({ DB: d1() });
  await call('/api/products?ids=iphone'); // seeds
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS }); // resolve demo gtins → bricks
  const res = await call('/api/products?ids=iphone~256-blue');
  assert.strictEqual(res.status, 200);
  const { meta, products } = await res.json();

  const ids = products.map(p => p.id);
  assert.ok(ids.includes('iphone~256-blue'), 'requested child must be served');
  assert.ok(ids.includes('iphone'), 'child id must pull its head');
  assert.ok(ids.includes('iphone~128-blue'), 'head must pull every sibling child');
  const neighbors = products.filter(p => !p.family && p.id !== 'iphone' && p.brick === '10001198');
  assert.ok(neighbors.length >= 1 && neighbors.length <= 4, 'same-brick head neighbors ride along for "More in {cat}"');

  // row shape matches catalog.json (offers price-ordered, derived fields on)
  const head = products.find(p => p.id === 'iphone');
  assert.strictEqual(head.best, Math.min(...head.offers.map(o => o.price)));
  assert.deepStrictEqual(head.history, seed.find(p => p.id === 'iphone').history.slice(-24));
  // display derives from the brick: Norwegian overlay name, GPC trail
  assert.strictEqual(head.cat, 'Mobil og kommunikasjon', 'display cat is the SEGMENT name — row badges/pools key on it');
  assert.strictEqual(head.path, 'Communications › Communications › Mobile Communication Devices/Services');

  // meta: global aggregates + the brick axis (gpc-strict)
  assert.strictEqual(meta.products, seed.filter(p => !p.family).length);
  assert.ok(meta.bricks['10001198'] >= 1, 'meta.bricks is the stocked-brick histogram');
  assert.strictEqual(Object.values(meta.bricks).reduce((a, b) => a + b, 0) + meta.uncat, meta.products, 'bricks + uncat account for every head');
  // tree: the stocked GPC hierarchy, 4 levels, overlay names where curated
  const seg = meta.tree.find(t => t.code === '66000000');
  assert.ok(seg, 'Communications segment is stocked (phones resolve there)');
  assert.strictEqual(seg.name, 'Mobil og kommunikasjon', 'overlay names win over EN titles');
  const findNode = (nodes, code) => { for (const n of nodes || []) { if (n.code === code) return n; const hit = findNode(n.children, code); if (hit) return hit; } };
  const brickNode = findNode(meta.tree, '10001198');
  assert.ok(brickNode, 'stocked bricks appear as tree leaves');
  assert.strictEqual(brickNode.n, meta.bricks['10001198'], 'tree leaf counts equal the histogram');
  assert.strictEqual(brickNode.name, 'Smarttelefoner');
  // depts: overlay tiles, counts joined from the same histogram
  const drules = meta.depts?.flatMap(d => d.rules) || [];
  assert.ok(meta.depts?.length >= 10 && drules.length, 'meta.depts serves the overlay tiles');
  assert.ok(drules.every(r => r.b && r.name && r.icon && Array.isArray(r.syn) && typeof r.n === 'number'), 'every tile has b/name/icon/syn and a served count');
  const phones = drules.find(r => r.b === '10001198,10008506');
  assert.strictEqual(phones.n, (meta.bricks['10001198'] || 0) + (meta.bricks['10008506'] || 0), 'a multi-code tile sums stocked bricks under its codes');
  // facet registry + ruleset routing
  assert.deepStrictEqual(meta.facets?.TV?.map(f => f.key), ['type', 'size', 'panel', 'res', 'refresh', 'platform'], 'meta.facets serves the facets.json ruleset registry');
  assert.strictEqual(meta.facetKeys['10001198'], 'Phones', 'stocked bricks route to their facet ruleset');
  assert.strictEqual(meta.facetKeys['10001181'], 'Audio', 'brick-level facetKeys win over ancestors');
  // SUBCATS: build.js still stamps curated facets.type on demo rows
  assert.strictEqual(seed.find(p => p.id === 'ps5').facets?.type, 'Consoles', 'demo rows keep their curated type facet');

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

// Norwegian shoppers type ASCII; the catalog doesn't. Measured on the live 14k
// catalog before the fix: q=kjokken 0 hits vs q=kjøkken 100, q=hundefor 0 vs
// q=hundefôr 2 — 25% of rows carry æ/ø/å/é in name or brand.
test('GET /api/products: search folds diacritics on both sides of the match', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  const add = async (ean, meta) => {
    await req('/api/ingest', 'POST', [{ product_id: 'ean-' + ean, shop: 'Power', price: 199, name: meta.name, brand: meta.brand }]);
    await req('/api/admin/products/ean-' + ean, 'PATCH', { ...meta, hidden: null });
  };
  await add('7099900000001', { name: 'Xtra Hundefôr for Voksne Hunder', brand: 'Xtra', cat: 'Pets', kw: 'hundefôr' });
  await add('7099900000002', { name: 'Øretelefoner Pro', brand: 'Acme', cat: 'Audio', kw: 'øretelefoner' });

  const ids = async (q) => (await (await call('/api/products?q=' + encodeURIComponent(q))).json()).products.map(p => p.id);
  assert.deepStrictEqual(await ids('hundefor'), ['ean-7099900000001'], 'an ASCII-typed query must find the ô row');
  assert.deepStrictEqual(await ids('hundefôr'), ['ean-7099900000001'], 'the accented query still works');
  // sqlite's lower() is ASCII-only, so a leading Ø never lowercases — the fold
  // list carries the uppercase forms for exactly this row
  assert.deepStrictEqual(await ids('oretelefoner'), ['ean-7099900000002'], 'uppercase Ø folds too');
  assert.deepStrictEqual(await ids('øretelefoner'), ['ean-7099900000002']);
});

// LIMIT 100 over rowid order = "whichever shop we crawled first". Measured on
// the live catalog: q=ring matched 409 product NAMES and served 100 rows, 25 of
// which weren't jewellery at all, while 314 real name matches never came back.
test('GET /api/products: search ranks name matches above blob matches before truncating', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // inserted worst-first, so rowid order is the exact opposite of the ranking
  const rows = [
    ['7099910000001', { name: 'Sokkelist eik', brand: 'Acme', kw: 'ringmåler pynt' }], // blob only
    ['7099910000002', { name: 'Skrujern 4 mm', brand: 'Ringo', kw: 'skrujern' }],     // brand
    ['7099910000003', { name: 'Armring i sølv', brand: 'Acme', kw: 'armring' }],      // mid-word in name
    ['7099910000004', { name: 'Ring i gull', brand: 'Acme', kw: 'ring' }],            // word-start in name
  ];
  for (const [ean, meta] of rows) {
    // rows auto-promote at ingest (gpc-strict: visibility never waits for a
    // category); the PATCH pins the kw the blob tier matches on
    await req('/api/ingest', 'POST', [{ product_id: 'ean-' + ean, shop: 'Power', price: 500, name: meta.name, brand: meta.brand }]);
    await req('/api/admin/products/ean-' + ean, 'PATCH', { kw: meta.kw });
  }
  const got = (await (await call('/api/products?q=ring')).json()).products.map(p => p.id).filter(id => id.startsWith('ean-70999100'));
  assert.deepStrictEqual(got, ['ean-7099910000004', 'ean-7099910000003', 'ean-7099910000002', 'ean-7099910000001'],
    'word-start-in-name > substring-in-name > brand > mentioned anywhere in the blob');
});

test('GET /api/products: top=drop ranks by real drop%, perCat covers every category', async () => {
  const call = api({ DB: d1() });
  const { products } = await (await call('/api/products?top=drop&limit=3')).json();
  assert.strictEqual(products.length, 3);
  const drops = products.map(p => p.drop);
  assert.deepStrictEqual(drops, [...drops].sort((a, b) => b - a), 'ordered by drop desc');
  const wantTop = seed.filter(p => p.was && !p.family)
    .map(p => ({ id: p.id, drop: Math.round((1 - Math.min(...p.offers.map(o => o.price)) / p.was) * 100) }))
    .sort((a, b) => b.drop - a.drop)[0];
  assert.strictEqual(products[0].id, wantTop.id, 'global top drop matches the seed-derived answer');

  // perCat buckets by BRICK (gpc-strict): drain first so demo rows carry one
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS });
  const per = (await (await call('/api/products?top=drop&perCat=1&limit=2')).json()).products;
  const gotBricks = new Set(per.map(p => p.brick).filter(Boolean));
  const fixture = require(path.join(__dirname, '..', 'worker', 'gpc-fixture.json'));
  const eanKey = (e) => String(e).replace(/\D/g, '').replace(/^0+/, '');
  const wantBricks = new Set(seed.filter(p => !p.family && p.was && eans[p.id]).map(p => fixture[eanKey(eans[p.id][0])]).filter(Boolean));
  for (const b of wantBricks) assert.ok(gotBricks.has(b), `perCat must cover stocked brick ${b} (it has a was-priced row)`);
  assert.ok(per.every(p => !p.family));
});

test('GET /api/products: node filters exactly at every level, no params serves all heads', async () => {
  const call = api({ DB: d1() });
  await call('/api/products'); // seeds
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS });
  const fixture = require(path.join(__dirname, '..', 'worker', 'gpc-fixture.json'));
  const eanKey = (e) => String(e).replace(/\D/g, '').replace(/^0+/, '');
  const brickOf = (id) => eans[id] ? fixture[eanKey(eans[id][0])] : undefined;
  const heads = seed.filter(p => !p.family);

  // brick level: exactly the heads whose gtin resolved to that brick
  const phones = (await (await call('/api/products?node=10001198')).json()).products;
  assert.deepStrictEqual(phones.map(p => p.id).sort(), heads.filter(p => brickOf(p.id) === '10001198').map(p => p.id).sort());
  assert.ok(phones.every(p => p.brick === '10001198' && !p.family));

  // class level expands to stocked bricks under it: Video Game Consoles
  // (65011000) covers both the non-portable (ps5/xbox) and portable
  // (switch/steamdeck) console bricks
  const consoles = (await (await call('/api/products?node=65011000')).json()).products;
  assert.deepStrictEqual(consoles.map(p => p.id).sort(),
    heads.filter(p => ['10003817', '10003818'].includes(brickOf(p.id))).map(p => p.id).sort());

  // comma-joined multi-code node = the union
  const both = (await (await call('/api/products?node=10003817,10003818')).json()).products;
  assert.deepStrictEqual(both.map(p => p.id).sort(), consoles.map(p => p.id).sort());

  // uncat = the honest bucket: every head with no resolved brick
  const uncat = (await (await call('/api/products?node=uncat')).json()).products;
  assert.deepStrictEqual(uncat.map(p => p.id).sort(), heads.filter(p => !brickOf(p.id)).map(p => p.id).sort());
  assert.ok(uncat.every(p => p.cat === 'Ukategorisert' && !p.brick));

  const all = (await (await call('/api/products')).json()).products;
  assert.strictEqual(all.length, heads.length, 'no params = every head');
});

// PAGE_MAX bounded the response, but rowid decided WHICH rows you got: with
// Toys at 1,387 heads, 70% of the category was unreachable and the reachable
// part was "whichever shop we crawled first". Now ranked by offer count (the
// point of a price comparison) and paged with limit/offset.
test('GET /api/products: list branches rank by offer count and page with limit/offset', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // inserted worst-first, so rowid order is the opposite of the ranking
  const shopsFor = { '7099930000001': ['Power'], '7099930000002': ['Power', 'Elkjøp'], '7099930000003': ['Power', 'Elkjøp', 'Komplett'] };
  for (const [ean, shops] of Object.entries(shopsFor)) {
    await req('/api/ingest', 'POST', shops.map(shop => ({ product_id: 'ean-' + ean, shop, price: 500, name: 'Hundeseng ' + ean.slice(-1), brand: 'Acme' })));
    await req('/api/admin/products/ean-' + ean, 'PATCH', { brick: '10000736' });
  }
  const ids = async (qs) => (await (await call('/api/products?' + qs)).json()).products.map(p => p.id);

  assert.deepStrictEqual(await ids('node=10000736'), ['ean-7099930000003', 'ean-7099930000002', 'ean-7099930000001'],
    'most offers first — an offer-less or single-shop row must not outrank a three-shop one on insertion order');
  assert.deepStrictEqual(await ids('node=10000736&limit=2'), ['ean-7099930000003', 'ean-7099930000002'], 'limit takes the head of the ranking');
  assert.deepStrictEqual(await ids('node=10000736&limit=2&offset=2'), ['ean-7099930000001'], 'offset reaches the rest of the category');
  assert.deepStrictEqual(await ids('node=10000736&offset=99'), [], 'past the end is empty, not an error');

  // same paging on the all-heads branch, and the cap still holds
  const page1 = await ids('limit=5');
  const page2 = await ids('limit=5&offset=5');
  assert.strictEqual(page1.length, 5);
  assert.strictEqual(new Set([...page1, ...page2]).size, 10, 'pages must not overlap');
  const heads = seed.filter(p => !p.family).length + 3;
  assert.strictEqual((await ids('limit=9999')).length, Math.min(heads, 400), 'limit is clamped to PAGE_MAX');
});

// Ranking the page was only half of it: Results sorts and filters client-side
// over the rows it has, so on a 1,387-row category "cheapest first" meant
// cheapest of the 400 loaded. sort=/filters now pick WHICH rows the page holds
// (the screen still re-sorts locally), and meta.total/meta.fcounts are the two
// numbers a partial cache cannot produce.
test('GET /api/products: sort and filters run over the whole category, not the page', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // three Pets heads. The cheapest is the one NO shop but one carries, so the
  // default offer-count ranking puts it last — exactly the row a client-side
  // "cheapest first" over page 0 could never see.
  const rows = [
    { ean: '7099931000001', name: 'Hundefôr Laks 2kg', brand: 'Acme', price: 900, shops: ['Power', 'Elkjøp', 'Komplett'] },
    { ean: '7099931000002', name: 'Kattesand Klumpende', brand: 'Zoo', price: 500, shops: ['Power', 'Elkjøp'] },
    { ean: '7099931000003', name: 'Hundeseng Myk', brand: 'Zoo', price: 100, shops: ['Power'] },
  ];
  for (const r of rows) {
    await req('/api/ingest', 'POST', r.shops.map(shop => ({ product_id: 'ean-' + r.ean, shop, price: r.price, name: r.name, brand: r.brand })));
    await req('/api/admin/products/ean-' + r.ean, 'PATCH', { brick: '10000736' });
  }
  const id = (ean) => 'ean-' + ean;
  const get = async (qs) => (await (await call('/api/products?' + qs)).json());
  const ids = async (qs) => (await get(qs)).products.map(p => p.id);

  // sort: the whole category is ordered before the page is cut
  assert.deepStrictEqual(await ids('node=10000736&sort=best&dir=asc&limit=1'), [id('7099931000003')],
    'page 1 of "cheapest first" must be the cheapest in the CATEGORY, not of the default page');
  assert.deepStrictEqual(await ids('node=10000736&sort=best&dir=desc&limit=1'), [id('7099931000001')], 'direction travels too');
  assert.deepStrictEqual(await ids('node=10000736&sort=name&dir=asc&limit=1'), [id('7099931000001')], 'text fields sort as text');
  assert.deepStrictEqual(await ids('node=10000736&sort=best&dir=asc&limit=1&offset=1'), [id('7099931000002')], 'paging follows the sort');

  // filters: stored (brand) and DERIVED (facetrules reads animal off the name)
  assert.deepStrictEqual((await ids('node=10000736&brand=Zoo&sort=best&dir=asc')).sort(), [id('7099931000002'), id('7099931000003')].sort());
  assert.deepStrictEqual(await ids('node=10000736&facets=' + encodeURIComponent('{"animal":["Cat"]}')), [id('7099931000002')],
    'a derived facet value must filter server-side — SQL cannot see it');
  assert.deepStrictEqual(await ids('node=10000736&min=200&max=600'), [id('7099931000002')], 'price bounds filter on the best offer');
  assert.deepStrictEqual(await ids('node=10000736&brand=Nobody'), [], 'no match is empty, not unfiltered');

  // the rail's free-text refine (`name=`): every token in the NAME, whole
  // category — client-side it could only ever refine the loaded page
  assert.deepStrictEqual(await ids('node=10000736&name=hunde'), [id('7099931000001'), id('7099931000003')], 'substring of the name matches');
  assert.deepStrictEqual(await ids('node=10000736&name=' + encodeURIComponent('myk hundeseng')), [id('7099931000003')], 'every token must hit, order-free');
  assert.deepStrictEqual(await ids('node=10000736&name=Zoo'), [], 'brand is not name — the refine searches names only');
  assert.deepStrictEqual(await ids('node=10000736&name=hundefor'), [id('7099931000001')], 'ASCII typing must find "Hundefôr" — same fold as q=');
  assert.deepStrictEqual(await ids('node=10000736&name=' + encodeURIComponent('hundefôr')), [id('7099931000001')], 'and the accented spelling still works');
  assert.strictEqual((await get('node=10000736&name=hunde')).meta.total, 2, 'total counts the refined set');
  assert.deepStrictEqual(await ids('node=10000736&name=hunde&brand=Zoo'), [id('7099931000003')], 'refine stacks with the other filters');

  // totals and the rail's counts, over the whole category
  const filtered = await get('node=10000736&brand=Zoo');
  assert.strictEqual(filtered.meta.total, 2, 'meta.total counts every matching row, not the page');
  assert.strictEqual((await get('node=10000736')).meta.total, 3);
  const fc = (await get('node=10000736')).meta.fcounts;
  assert.deepStrictEqual(fc.animal, [['Dog', 2], ['Cat', 1]], 'facet counts cover the category as [value, count] pairs (a JSON key would stringify numeric axes)');
  assert.ok(!(await get('node=10001181')).meta.fcounts?.animal, 'histogram is per queried node');
  assert.strictEqual((await get('')).meta.fcounts, undefined, 'no category, no rail, no histogram');

  // cross-filtered: every OTHER group counts what's left, the group you picked
  // in keeps its own "what if I picked this too" numbers. A stale "Dog 2" next
  // to brand Zoo (which has one dog bed) was the whole complaint.
  assert.deepStrictEqual((await get('node=10000736&brand=Zoo')).meta.fcounts.animal, [['Dog', 1], ['Cat', 1]],
    'a brand filter must re-count the facet groups');
  const picked = await get('node=10000736&facets=' + encodeURIComponent('{"animal":["Cat"]}'));
  assert.deepStrictEqual(picked.meta.fcounts.animal, [['Dog', 2], ['Cat', 1]],
    "a group is counted ignoring its OWN selection — else every unpicked value reads 0");
  assert.deepStrictEqual((await get('node=10000736&name=kattesand')).meta.fcounts.animal, [['Dog', 0], ['Cat', 1]],
    'a value with nothing left counts 0, it does not disappear (the rail drops a group under 2 values)');

  // price bounds + brand histogram over the whole category, in Results'
  // brandPool convention: facet selections apply, the non-facet block does
  // not — sliding the price slider must not move its own ends, and a brand
  // outside the loaded page (slider max kr 100 on Toys, true max kr 25k)
  // must still be listed.
  assert.deepStrictEqual((await get('node=10000736')).meta.prange, [100, 900], 'bounds span the category, not the page');
  assert.deepStrictEqual((await get('node=10000736')).meta.brands, [['Acme', 1], ['Zoo', 2]]);
  assert.deepStrictEqual((await get('node=10000736&min=200&max=600')).meta.prange, [100, 900], 'the price filter never shrinks its own slider');
  assert.deepStrictEqual((await get('node=10000736&brand=Zoo')).meta.brands, [['Acme', 1], ['Zoo', 2]], 'picking a brand keeps its siblings listed');
  assert.deepStrictEqual(picked.meta.prange, [500, 500], 'a facet selection cross-filters the bounds');
  assert.deepStrictEqual(picked.meta.brands, [['Zoo', 1]], 'and the brand counts');
  assert.strictEqual((await get('')).meta.prange, undefined, 'no category, no rail, no bounds');

  // the other branches keep their own semantics
  assert.ok((await ids('ids=' + id('7099931000001') + '&sort=best')).includes(id('7099931000001')), 'ids= ignores list params');
  assert.strictEqual((await get('q=hundeseng&sort=best')).meta.total, undefined, 'q= is not a paged list branch');
  const bad = await get('node=10000736&facets=' + encodeURIComponent('{oops'));
  assert.strictEqual(bad.products.length, 3, 'an unparseable filter param must not 500 the listing');
});

// The refine box filters twice — server-side over the whole category, then
// client-side over the merged cache. Both use their own copy of FOLD, and a
// server that folds while the screen doesn't serves rows the screen drops:
// a non-zero count over an empty list, with a live "Load more" under it.
test('the name filter folds identically on both sides', () => {
  const fold = (f) => {
    const m = require('node:fs').readFileSync(path.join(__dirname, '..', f), 'utf8').match(/const FOLD = (\[.*?\]);/);
    assert.ok(m, `no FOLD list in ${f} — did the fold move or get renamed?`);
    return JSON.parse(m[1].replace(/'/g, '"'));
  };
  assert.deepStrictEqual(fold('worker/index.js'), fold('proto/Results.jsx'),
    'worker/index.js and the prototype must fold the same characters the same way');
});

test('GET /api/products: a category beyond 100 heads survives the D1 param cap', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/products?node=10001181'); // trigger seeding first
  for (let i = 0; i < 120; i++) {
    await DB.prepare('INSERT INTO products (id, meta) VALUES (?, ?)')
      .bind(`ean-cap${i}`, JSON.stringify({ name: `Cap Bud ${i}`, brand: 'Cap', brick: '10001181' })).run();
  }
  const res = await call('/api/products?node=10001181');
  assert.strictEqual(res.status, 200, 'big node slice must not throw (prod 1101, Audio at 124 heads)');
  const { products } = await res.json();
  assert.strictEqual(products.length, 120, 'every brick row serves (seed rows have no brick without a drain)');

  // the expand path (ids=) pages its double-bound query + neighbor top-up too
  const one = await call('/api/products?ids=ean-cap5');
  assert.strictEqual(one.status, 200);
  const rows = (await one.json()).products;
  assert.ok(rows.some(p => p.id === 'ean-cap5'));
  assert.ok(rows.length > 1, 'same-brick neighbors still ride along');
});

// 4e step 1: seed evolution — a new seed.json refreshes meta for every row
// but never touches offers/price_points; brand-new rows land in full
test('seed evolution: changed seed refreshes meta, leaves real offers alone, adds new rows', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/products'); // seeds + writes the seed_meta marker

  // simulate a pre-4e prod DB: stale meta, a real ingested price, no marker
  await DB.prepare('UPDATE products SET meta = ? WHERE id = ?')
    .bind(JSON.stringify({ name: 'iPhone 15 128GB', cat: 'Phones' }), 'airpods').run();
  const shop = (await DB.prepare("SELECT shop FROM offers WHERE product_id = 'airpods' LIMIT 1").first()).shop;
  await DB.prepare("UPDATE offers SET price = 1234 WHERE product_id = 'airpods' AND shop = ?").bind(shop).run();
  await DB.prepare("DELETE FROM products WHERE id = 'xm5'").run(); // a row the DB never had
  await DB.prepare("DELETE FROM offers WHERE product_id = 'xm5'").run();
  await DB.prepare("DELETE FROM price_points WHERE product_id = 'xm5'").run();
  await DB.prepare('DELETE FROM seed_meta').run();

  const { products } = await (await call('/api/catalog.json', { token: call.token })).json(); // re-seeds
  const airpods = products.find(p => p.id === 'airpods');
  assert.strictEqual(airpods.name, seed.find(p => p.id === 'airpods').name, 'stale meta must be re-upserted from the seed');
  assert.strictEqual(airpods.offers.find(o => o.shop === shop).price, 1234, 'real offer prices must survive the re-seed');
  const xm5 = products.find(p => p.id === 'xm5');
  assert.ok(xm5 && xm5.offers.length && xm5.history.length, 'a row new to the DB must be seeded in full');

  // marker written: the same seed must not re-seed again
  await DB.prepare('UPDATE products SET meta = ? WHERE id = ?')
    .bind(JSON.stringify({ name: 'Stale Again', cat: 'Phones' }), 'airpods').run();
  const again = (await (await call('/api/catalog.json', { token: call.token })).json()).products.find(p => p.id === 'airpods');
  assert.strictEqual(again.name, 'Stale Again', 'matching seed_meta hash must skip the upsert');

  // once ANY offer is source-stamped (updated_at), the DB is no longer
  // virgin: a re-seed adds new rows WITHOUT demo offers/history
  await DB.prepare("UPDATE offers SET updated_at = 1 WHERE product_id = 'airpods' AND shop = ?").bind(shop).run();
  await DB.prepare("DELETE FROM products WHERE id = 'xm5'").run();
  await DB.prepare("DELETE FROM offers WHERE product_id = 'xm5'").run();
  await DB.prepare("DELETE FROM price_points WHERE product_id = 'xm5'").run();
  await DB.prepare('DELETE FROM seed_meta').run();
  const honest = (await (await call('/api/catalog.json', { token: call.token })).json()).products.find(p => p.id === 'xm5');
  assert.ok(honest, 'new row still lands on re-seed');
  assert.deepStrictEqual([honest.offers, honest.history], [[], []], 'non-virgin DB must not get demo offers/history');
});

test('scheduled with no sources configured is a no-op — prices freeze until real rows arrive', async () => {
  const DB = d1();
  const call = api({ DB });
  await catBody(call); // seeds
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS }); // settle brick resolution first
  const before = await catBody(call);
  assert.ok(before.some(r => r.brick), 'the drain stamped fixture bricks');
  await worker.scheduled({ cron: '0 * * * *' }, { DB }, { waitUntil() {} });
  const after = await catBody(call);
  assert.deepStrictEqual(after, before, 'no sources must mean no changes (the synthetic jiggle is gone)');
});

// ── gpc-strict: gtin→brick resolver queue, stamping, GTIN capture ─────────

test('gtin queue: seeding enqueues eans.json, the drain resolves via the fixture and stamps HEADS', async () => {
  const DB = d1();
  const call = api({ DB });
  await catBody(call); // seeds — the eans.json bootstrap enqueues every alias gtin
  const body = await (await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS })).json();
  assert.ok(body.checked > 0, 'seeding queued gtins');
  assert.ok(body.resolved > 0, 'the fixture answers demo gtins');
  assert.ok(body.stamped > 0, 'resolved bricks land on products');
  assert.strictEqual(body.remaining, 0, 'one n=500 drain empties the demo queue');
  const by = Object.fromEntries((await catBody(call)).map(r => [r.id, r]));
  assert.strictEqual(by.airpods.brick, '10001181', 'airpods carry the real headphones brick');
  // iphone~256-blue's EAN routes to the CHILD id; the family walk stamps the head
  assert.strictEqual(by.iphone.brick, '10001198', 'a variant child EAN stamps its head');
  const child = await DB.prepare("SELECT meta FROM products WHERE id = 'iphone~256-blue'").first();
  assert.strictEqual(JSON.parse(child.meta).brick, undefined, 'children never carry brick');
});

test('resolver respects the man pin and refuses codes outside the taxonomy', async () => {
  const DB = d1();
  // 12345678 is no GPC code; note 99999999 IS one ("Temporary Classification")
  const env = { DB, GPC_FIXTURE: { 7012345678901: '10001400', 7000000000002: '12345678' } };
  const call = api(env);
  await catBody(call);
  await call('/api/ingest', { method: 'POST', token: OPS, body: [
    { product_id: 'ean-7012345678901', shop: 'TestShop', price: 999, name: 'Pinned Product', srcCat: 'TV-er' },
    { product_id: 'ean-7000000000002', shop: 'TestShop', price: 99, name: 'Bogus Brick Product', srcCat: 'TV-er' },
  ] });
  await call('/api/admin/products/ean-7012345678901', { method: 'PATCH', token: OPS, body: { man: 1 } });
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS });
  const metaOf = async (id) => JSON.parse((await DB.prepare('SELECT meta FROM products WHERE id = ?').bind(id).first()).meta);
  assert.strictEqual((await metaOf('ean-7012345678901')).brick, undefined, 'man pin blocks the resolver');
  assert.strictEqual((await metaOf('ean-7000000000002')).brick, undefined, 'an unknown code never stamps');
  const bogus = await DB.prepare("SELECT status, brick FROM gpc WHERE gtin = '7000000000002'").first();
  assert.deepStrictEqual({ status: bogus.status, brick: bogus.brick }, { status: 'none', brick: null }, 'a code outside the taxonomy records as none');
});

test('a scraped ean teaches a p-* product its GTIN (eans + meta.ean) and its brick follows', async () => {
  const DB = d1();
  const env = { DB, GPC_FIXTURE: { 7098765432109: '10005166' } };
  const call = api(env);
  await catBody(call);
  await call('/api/ingest', { method: 'POST', token: OPS, body: [
    { product_id: 'p-lego-test-set', shop: 'ShopA', price: 499, name: 'Lego Test Set', srcCat: 'Leker' },
  ] });
  // the next crawl carries the page's gtin
  await call('/api/ingest', { method: 'POST', token: OPS, body: [
    { product_id: 'p-lego-test-set', shop: 'ShopA', price: 489, name: 'Lego Test Set', ean: '7098765432109' },
  ] });
  const routed = await DB.prepare("SELECT product_id FROM eans WHERE ean = '7098765432109'").first();
  assert.strictEqual(routed.product_id, 'p-lego-test-set', 'captured gtin routes to the slug product');
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS });
  const meta = JSON.parse((await DB.prepare("SELECT meta FROM products WHERE id = 'p-lego-test-set'").first()).meta);
  assert.strictEqual(meta.ean, '7098765432109');
  assert.strictEqual(meta.brick, '10005166', 'the captured gtin resolves and stamps the slug row');
});

test('a product created AFTER its gtin resolved is stamped at ingest, not never', async () => {
  const DB = d1();
  const call = api({ DB });
  await catBody(call);
  // a gtin the resolver already answered, long before any product carries it
  await DB.prepare("INSERT INTO gpc (gtin, brick, status, source, checked_at) VALUES ('7011111111111', '10001400', 'resolved', 'stub', 1)").run();
  await call('/api/ingest', { method: 'POST', token: OPS, body: [
    { product_id: 'ean-7011111111111', shop: 'ShopA', price: 5000, name: 'Late TV' },
  ] });
  const meta = JSON.parse((await DB.prepare("SELECT meta FROM products WHERE id = 'ean-7011111111111'").first()).meta);
  assert.strictEqual(meta.brick, '10001400', 'ingest stamps already-resolved gtins itself');
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

test('dept tiles serve live histogram counts that equal their node page total', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/products?limit=1'); // seeds
  await call('/api/admin/gpc?n=500', { method: 'POST', token: OPS });
  const { meta } = await (await call('/api/products?limit=1')).json();
  const rules = meta.depts.flatMap(d => d.rules);
  assert.ok(rules.every(r => typeof r.n === 'number'), 'every tile carries a count — no cron needed, the histogram is live');
  // the count is the exact set the node page serves, so a browse tile number
  // and its page total can never disagree
  const tile = rules.find(r => r.b === '10001181');
  assert.ok(tile.n > 0, 'demo rows include headphones');
  const page = await (await call('/api/products?node=10001181&sort=best&dir=asc')).json();
  assert.strictEqual(tile.n, page.meta.total, 'tile n equals the node page total');
  // and the sum of bricks + uncat is the whole catalog (nothing double-hidden)
  assert.strictEqual(Object.values(meta.bricks).reduce((x, y) => x + y, 0) + meta.uncat, meta.products);
});

test('decodeXml survives out-of-range numeric refs (one bad entity must not freeze a feed)', async () => {
  const { decodeXml } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'sources.js')));
  assert.strictEqual(decodeXml('Eikenø&#248;kkel'), 'Eikenøøkkel');
  assert.strictEqual(decodeXml('a &#99999999999; b'), 'a &#99999999999; b', 'left verbatim, no throw');
  assert.strictEqual(decodeXml('&#x110000;'), '&#x110000;', 'hex out-of-range too');
});

test('stockOf: unrecognized feed wording is unknown, never out-of-stock', async () => {
  const { stockOf } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'sources.js')));
  assert.strictEqual(stockOf('in stock'), 1);
  assert.strictEqual(stockOf('http://schema.org/InStock'), 1);
  assert.strictEqual(stockOf('på lager'), 1);
  assert.strictEqual(stockOf('outofstock'), 0);
  assert.strictEqual(stockOf('utsolgt'), 0);
  assert.strictEqual(stockOf(null), 2);
  assert.strictEqual(stockOf('3-5 dager'), 2, 'unknown wording = unknown');
});

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

test('parseSitemapXml finds an index vs. a leaf sitemap and extracts every <loc>', () => {
  const index = parseSitemapXml(`<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>https://shop.no/product-sitemap.xml</loc></sitemap>
    <sitemap><loc>https://shop.no/page-sitemap.xml</loc></sitemap>
  </sitemapindex>`);
  assert.strictEqual(index.isIndex, true);
  assert.deepStrictEqual(index.locs, ['https://shop.no/product-sitemap.xml', 'https://shop.no/page-sitemap.xml']);

  const leaf = parseSitemapXml(`<?xml version="1.0"?><urlset>
    <url><loc>https://shop.no/produkt/a-og-b</loc></url>
    <url><loc><![CDATA[https://shop.no/produkt/c?x=1&y=2]]></loc></url>
  </urlset>`);
  assert.strictEqual(leaf.isIndex, false);
  assert.deepStrictEqual(leaf.locs, ['https://shop.no/produkt/a-og-b', 'https://shop.no/produkt/c?x=1&y=2']);
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
  assert.strictEqual(after.length, before.length + 1, 'a discovered product goes live at once (gpc-strict: Ukategorisert, not hidden)');

  const noob = after.find(p => p.id === 'ean-7091234567890');
  assert.ok(noob, 'an unknown feed EAN must create a product');
  assert.strictEqual(noob.name, 'Not in catalog');
  assert.strictEqual(noob.cat, 'Ukategorisert', 'no resolved brick yet — the honest bucket');
  assert.strictEqual(noob.auto, 1);
  assert.deepStrictEqual(noob.offers.map(o => [o.shop, o.price, o.stock]), [['Komplett', 999, false]]);
  // and its gtin queued for the resolver (the fixture doesn't know it → none)
  const q = await DB.prepare("SELECT status FROM gpc WHERE gtin = '7091234567890'").first();
  assert.ok(q, 'discovered gtins enqueue for brick resolution');

  const offer = after.find(p => p.id === pid).offers.find(o => o.shop === 'Komplett');
  assert.strictEqual(offer.price, 2490);
  assert.strictEqual(offer.ship, 'Fri frakt');
  assert.strictEqual(offer.stock, true);
  assert.strictEqual(offer.url, 'https://track.adtraction.com/t/?u=1&d=2', 'tracking deep link must survive entity decoding');

  // freeze: every offer not fed this run keeps its stored price
  for (const p of after) for (const o of p.offers) {
    if (p.id === pid && o.shop === 'Komplett') continue;
    if (p.id === 'ean-7091234567890') continue; // created this run
    const prev = before.find(q => q.id === p.id).offers.find(q => q.shop === o.shop);
    assert.strictEqual(o.price, prev.price, `${p.id}/${o.shop} had no feed row and must freeze`);
    assert.strictEqual(o.url, null, 'unfed offers have no deep link');
  }
});

test('scrape source: first-party JSON-LD product page updates the offer', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/products'); // seeds

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
  await call('/api/products'); // seeds

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
  // inclShip null: MCP watch_product doesn't set it — falsy either way
  assert.deepStrictEqual((await (await web('/api/me', { cookie })).json()).watches, [{ id: 'airpods', target: 1999, paused: 0, hit: 0, inclShip: null }]);

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

  assert.strictEqual((await api({ DB: d1(), INGEST_TOKEN: undefined })('/api/ingest', { method: 'POST', body: [] })).status, 503, 'no INGEST_TOKEN secret = endpoint disabled');
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

  const { meta, products } = await (await call('/api/catalog.json', { token: call.token })).json();
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

// Per-shop dailies (shop_prices) back the PDP's "Price at <shop>" chart line.
// Real observations only — the served hist must never be synthesized, and it
// rides detail (ids=) fetches only, like specs, so list pages stay lean.
test('per-shop price history: captured at ingest, day-min upserted, detail fetches only', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const push = (rows) => admin(env)('/api/ingest', 'POST', rows);

  const r = await push([
    { product_id: 'airpods', shop: 'Elkjøp', price: 1999 },
    { product_id: 'airpods', shop: 'Power', price: 2100 },
  ]);
  assert.strictEqual(r.status, 200, await r.text());
  let offers = (await prodOf(call, 'airpods')).offers;
  assert.deepStrictEqual(offers.find(o => o.shop === 'Elkjøp').hist, [1999]);
  assert.deepStrictEqual(offers.find(o => o.shop === 'Power').hist, [2100]);

  // same-day re-push: the day's point keeps the min, no second point
  await push([{ product_id: 'airpods', shop: 'Elkjøp', price: 2050 }]);
  offers = (await prodOf(call, 'airpods')).offers;
  assert.deepStrictEqual(offers.find(o => o.shop === 'Elkjøp').hist, [1999], "day's per-shop point keeps the day's minimum");

  // list queries never carry hist — lean rows, same rule as specs
  const listed = (await (await call('/api/products?q=airpods')).json()).products.find(p => p.id === 'airpods');
  assert.ok(listed.offers.length > 0);
  assert.ok(listed.offers.every(o => !('hist' in o)), 'per-shop hist must not ride list queries');

  // a shop we never observed serves no hist at all (upstream falls back)
  assert.ok((await prodOf(call, 'xm5')).offers.every(o => !('hist' in o)), 'no invented hist for unobserved shops');
});

// An ingest chunk used to read the WHOLE products table — id, the meta blob and
// a hidden flag — so its cost was FIXED per chunk (~55 ms of CPU at 22k
// products, the same for 50 rows as for 500). That is the shape that cannot be
// chunked or parallelised out of trouble, and it put 12 of a 29-chunk crawl over
// the Worker CPU ceiling, silently dropping 5,700 rows. This pins the property
// rather than the timing: what ingest reads must depend on the BATCH, not on how
// many products exist. See plans/read-path-whats-left.md §0.
test('POST /api/ingest reads by the batch\'s ids, not the whole products table', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'tok' };
  const call = api(env);
  await call('/api/products'); // let seedCatalog build the schema + seed

  // 400 extra products the batch never mentions
  for (let i = 0; i < 400; i++) {
    await DB.prepare('INSERT OR IGNORE INTO products (id, meta) VALUES (?, ?)')
      .bind(`filler-${i}`, JSON.stringify({ name: `Filler ${i}`, brand: 'Acme', cat: 'Toys', icon: 'toy-brick', kw: 'toys acme', auto: 1 })).run();
  }

  // count rows returned by every read of `products` during ONE ingest
  let productRowsRead = 0;
  const realPrepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    const st = realPrepare(sql);
    if (!/\bfrom products\b/i.test(sql) || /count\(/i.test(sql)) return st;
    const wrap = (o) => ({ ...o, all: async () => { const r = await o.all(); productRowsRead += r.results.length; return r; } });
    return { ...wrap(st), bind: (...a) => wrap(st.bind(...a)) };
  };

  const res = await worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
    body: JSON.stringify([{ product_id: 'airpods', shop: 'Power', price: 2599 }]),
  }), env);
  assert.strictEqual(res.status, 200);
  DB.prepare = realPrepare;

  // a 1-row batch may legitimately read a handful of rows (the row itself, the
  // eans table); it must NOT read anything proportional to the 400 fillers
  assert.ok(productRowsRead < 50,
    `ingest read ${productRowsRead} product rows for a 1-row batch — it is scanning the table again`);
});

// Discovery: an unknown `ean-<digits>` row carrying a name auto-creates a
// hidden product — invisible in every user-facing query until enriched
// (extra.json + deploy), listed for triage via ?hidden=1
test('POST /api/ingest discovery: unknown ean- rows go live in Ukategorisert; junk stays hidden', async () => {
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

  // gpc-strict: a named non-junk discovery is LIVE at once, honestly unsorted
  const { meta, products } = await (await call('/api/products')).json();
  const widget = products.find(p => p.id === 'ean-7099999999991');
  assert.ok(widget, 'the discovered product serves in the all-heads listing');
  assert.strictEqual(meta.products, before.products + 1, 'catMeta counts it');
  assert.strictEqual(meta.uncat, before.uncat + 1, 'it lands in the Ukategorisert bucket');
  assert.strictEqual(widget.cat, 'Ukategorisert');
  assert.strictEqual(widget.auto, 1);
  assert.strictEqual(widget.brand, 'Acme');
  assert.strictEqual(widget.ean, '7099999999991');
  assert.strictEqual(widget.best, 480, 'both shops merged onto one product');
  assert.strictEqual(widget.offers.length, 2);
  assert.deepStrictEqual(widget.history, [480], 'price history starts collecting from discovery');
  assert.ok((await (await call('/api/products?q=mystery')).json()).products.some(p => p.id === 'ean-7099999999991'), 'and it is searchable');
  assert.ok((await (await call('/api/products?node=uncat')).json()).products.some(p => p.id === 'ean-7099999999991'), 'the uncat node lists it');

  // junk (fees/gift cards sold as products) is the one gate left — stays hidden
  await push([{ product_id: 'ean-7099999999992', shop: 'Power', price: 49, name: 'Håndteringsavgift', brand: 'Power' }]);
  assert.ok(!(await (await call('/api/products')).json()).products.some(p => p.id === 'ean-7099999999992'), 'a fee is not a product');
  const hidden = (await (await call('/api/products?hidden=1', { token: call.token })).json()).products;
  assert.ok(hidden.some(p => p.id === 'ean-7099999999992'), 'junk sits in the ops backlog');
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
  assert.strictEqual((await (await call('/api/products?hidden=1', { token: call.token })).json()).products.length, 0, 'no hidden product for a mapped EAN');

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
  assert.strictEqual(xm5.offers.find(o => o.shop === 'Power').price,
    seed.find(p => p.id === 'xm5').offers.find(o => o.shop === 'Power').price,
    'a shop the target already has keeps the target\'s offer');
  assert.strictEqual((await (await call('/api/products?hidden=1', { token: call.token })).json()).products.length, 0, 'the orphan row is gone');
  assert.deepStrictEqual((await (await call('/api/me', { cookie })).json()).watches.map(w => w.id), ['xm5'], 'watches follow the migration');
  assert.deepStrictEqual((await prodOf(call, 'xm5')).offers.find(o => o.shop === 'Milrab').hist, [500], 'per-shop price history follows the migration');

  // future rows for that EAN land straight on the target
  await push([{ product_id: 'ean-7099999999991', shop: 'Elkjøp', price: 470, name: 'Mystery Widget 3000' }]);
  assert.strictEqual((await catBody(call)).find(p => p.id === 'xm5').offers.find(o => o.shop === 'Elkjøp').price, 470, 'runtime alias routes future ingests');
  assert.strictEqual((await (await call('/api/products?hidden=1', { token: call.token })).json()).products.length, 0);
});

test('admin PATCH: validated meta merge — brick pin, clear re-queues, demote without a deploy', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  await admin(env)('/api/ingest', 'POST', [{ product_id: 'ean-7099999999992', shop: 'Power', price: 900, name: 'Acme Soundbar S1', brand: 'Acme' }]);

  assert.strictEqual((await req('/api/admin/products/nope', 'PATCH', { brick: '10001436' })).status, 404);
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', {})).status, 400, 'empty patch');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { cat: 'Audio' })).status, 400, 'cat is gone — the brick owns categorization');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { brick: '12345678' })).status, 400, 'brick must exist in the shipped taxonomy');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { bogus: 'x' })).status, 400, 'unknown keys rejected');
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { name: null })).status, 400, 'name cannot be deleted');

  // brick pin: display derives from it, man pins against the resolver
  const res = await req('/api/admin/products/ean-7099999999992', 'PATCH', { brick: '10001436' });
  assert.strictEqual(res.status, 200);
  const pinned = (await (await call('/api/products?ids=ean-7099999999992')).json()).products.find(p => p.id === 'ean-7099999999992');
  assert.strictEqual(pinned.cat, 'Lyd og bilde', 'display cat derives from the pinned brick (segment name)');
  assert.strictEqual(pinned.man, 1, 'a hand-set brick pins against the resolver');
  assert.deepStrictEqual(pinned.facets, { type: 'Soundbars' }, 'the brick routes to the Audio ruleset, so the name derives a type');

  // brick: null hands the row back to the resolver and re-queues its gtin
  await DB.prepare("UPDATE gpc SET status = 'none', checked_at = 1 WHERE gtin = '7099999999992'").run();
  assert.strictEqual((await req('/api/admin/products/ean-7099999999992', 'PATCH', { brick: null })).status, 200);
  const cleared = (await (await call('/api/products?ids=ean-7099999999992', { token: call.token })).json()).products.find(p => p.id === 'ean-7099999999992');
  assert.strictEqual(cleared.brick, undefined);
  assert.strictEqual(cleared.man, undefined, 'clearing the brick clears the pin');
  assert.strictEqual((await DB.prepare("SELECT status FROM gpc WHERE gtin = '7099999999992'").first()).status, 'queued', 'the gtin re-queues for the resolver');

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
  assert.strictEqual((await (await call('/api/products?q=acme')).json()).products.length, 0, 'demoted product disappears');
});

test('full spec sheets: detail fetches only, spec text never matches search', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099999999993', shop: 'Power', price: 5999, name: 'Acme Frame 32', brand: 'Acme' }]);
  await req('/api/admin/products/ean-7099999999993', 'PATCH', { kw: 'frame acme' }); // row auto-promoted at ingest
  // self-describing groups form (what tools/fetch-specs.mjs emits) — 'zebrafisk'
  // appears nowhere else in the catalog
  const sheet = { groups: [{ label: 'Generelt', rows: [['Produsent', 'Acme'], ['Fisk', 'zebrafisk']] }] };
  assert.strictEqual((await req('/api/admin/products/ean-7099999999993', 'PATCH', { specs: sheet })).status, 200);

  const detail = (await (await call('/api/products?ids=ean-7099999999993')).json()).products[0];
  assert.deepStrictEqual(detail.specs, sheet, 'groups-form specs ride the ids= detail fetch');

  const byName = (await (await call('/api/products?q=frame')).json()).products;
  assert.strictEqual(byName.length, 1);
  assert.strictEqual(byName[0].specs, undefined, 'search rows are lean — no spec sheet');
  const byNode = (await (await call('/api/products?node=uncat')).json()).products;
  assert.ok(byNode.length && byNode.every(p => p.specs === undefined), 'node rows are lean — no spec sheet');
  const allHeads = (await (await call('/api/products')).json()).products;
  assert.ok(allHeads.length && allHeads.every(p => p.specs === undefined), 'all-heads rows are lean — no spec sheet');

  const bySpec = (await (await call('/api/products?q=zebrafisk')).json()).products;
  assert.strictEqual(bySpec.length, 0, 'spec sheet text must not pollute search matching');
});

test('uncat SQL fast path: filterless sort pages in SQL with total/brands/prange', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  // boot's mount prefetch shape — must not need the whole-node JS pass
  const body = await (await call('/api/products?node=uncat&sort=best&dir=asc')).json();
  const prices = body.products.map(p => p.best);
  const present = prices.filter(v => v != null);
  assert.ok(present.length, 'uncat has priced rows');
  assert.deepStrictEqual(present, [...present].sort((a, b) => a - b), 'sorted by best ascending');
  const firstBlank = prices.findIndex(v => v == null);
  if (firstBlank !== -1) assert.ok(prices.slice(firstBlank).every(v => v == null), 'blanks sort last');
  assert.ok(body.meta.total >= body.products.length, 'total counts the whole node');
  assert.ok(Array.isArray(body.meta.brands) && body.meta.brands.every(b => Array.isArray(b) && b.length === 2), 'brands served as [value, count] pairs');
  assert.ok(!body.meta.prange || (body.meta.prange[0] <= body.meta.prange[1]), 'prange is [lo, hi]');
});

test('filterless list memo invalidates on ingest: a new row reaches the page and the total at once', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  const list = async () => (await (await call('/api/products?node=uncat&sort=updated&dir=desc')).json());
  // warm the memo (first request seeds and returns no version, second caches)
  await list();
  const base = await list();
  // a discovered row lands in uncat; the ver bump must evict the memoised page
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099920000077', shop: 'Dyrebutikken', price: 149, name: 'Kattetunnel', brand: 'Acme' }]);
  const after = await list();
  assert.strictEqual(after.meta.total, base.meta.total + 1, 'total moves without waiting for a TTL');
  assert.ok(after.products.some(p => p.id === 'ean-7099920000077'), 'freshest-sorted page serves the new row, not the memoised one');
});

test('anonymous product GETs carry the edge TTL, ops requests never do', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const anon = await call('/api/products?node=uncat');
  assert.strictEqual(anon.headers.get('cache-control'), 'public, max-age=0, s-maxage=300', 'anonymous listings are edge-cacheable');
  const ops = await call('/api/products?node=uncat', { token: 'sekrit-token' });
  assert.strictEqual(ops.headers.get('cache-control'), null, 'a bearer response (hidden rows visible) must never be cached');
});

test('seed re-upsert merges meta: runtime specs/facets survive a deploy, seed keys still win', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // switch2 is a seed row (extra.json head) that ships without specs
  await req('/api/admin/products/switch2', 'PATCH', { specs: { screen: '7.9″ LCD' }, facets: { color: 'Yes' }, name: 'Renamed By Admin' });
  // stale the pinned hash so the next request re-runs the seed upsert
  await DB.prepare("UPDATE seed_meta SET hash = 'stale'").run();
  const row = (await (await call('/api/products?ids=switch2')).json()).products[0];
  assert.deepStrictEqual(row.specs, { screen: '7.9″ LCD' }, 'runtime specs must survive the seed re-upsert');
  assert.deepStrictEqual(row.facets, { type: 'Consoles', color: 'Yes' }, 'runtime facets must survive the seed re-upsert');
  assert.strictEqual(row.name, 'Nintendo Switch 2', 'seed-owned keys still win on re-upsert');
});

// gpc-strict promotion: visibility never waits for a category. The junk gate
// is the only content gate; demote-sticks and the ops PDP gating survive.
test('promotion: a named row goes live in Ukategorisert at once; junk stays hidden; demote sticks', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token', GPC_FIXTURE: { 7099999999996: '10001178' } };
  const call = api(env);
  const req = admin(env);
  const push = (rows) => req('/api/ingest', 'POST', rows);

  assert.strictEqual((await push([{ product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Pixel 9', srcCat: 42 }])).status, 400, 'non-string srcCat rejected');

  await push([
    { product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Google Pixel 9 128 GB', brand: 'Google', srcCat: 'Mobiltelefoner' },
    { product_id: 'ean-7099999999994', shop: 'Power', price: 990, name: 'Nameless Phone' },
    { product_id: 'p-bergans-slingsby-vindjakke', shop: 'Bergans', price: 1799, name: 'Bergans Slingsby Vindjakke', brand: 'Bergans', srcCat: 'Jakker og bukser' },
    { product_id: 'ean-7099999999996', shop: 'Power', price: 99, name: 'Pixel 9 deksel svart', brand: 'Google', srcCat: 'Mobiltilbehør' },
    { product_id: 'ean-7099999999997', shop: 'Power', price: 49, name: 'Gavekort 500 kr' },
    { product_id: 'ean-7099999999998', shop: 'Power', price: 49, name: 'Håndteringsavgift' },
  ]);
  const live = (await (await call('/api/products?q=pixel 9')).json()).products.find(p => p.id === 'ean-7099999999993');
  assert.ok(live, 'a named row is live and searchable at once');
  assert.strictEqual(live.cat, 'Ukategorisert', 'no resolved brick yet — the honest bucket, never a guess');
  assert.strictEqual(live.auto, 1);
  assert.strictEqual(live.srcCat, 'Mobiltelefoner', 'the breadcrumb is kept as diagnostics/facet input — it must NOT categorize');
  assert.ok(live.kw.includes('google') && live.kw.includes('pixel'), `kw covers name+brand: ${live.kw}`);
  const brandless = (await (await call('/api/products?q=nameless phone')).json()).products.find(p => p.id === 'ean-7099999999994');
  assert.strictEqual(brandless?.brand, 'Unspecified', 'no brand → best-effort placeholder, still live');
  const slug = (await (await call('/api/products?ids=p-bergans-slingsby-vindjakke')).json()).products.find(p => p.id === 'p-bergans-slingsby-vindjakke');
  assert.ok(slug, 'gtin-free slug rows promote the same way');

  // the fees/gift-cards gate is the ONE content gate left
  const hiddenIds = (await (await call('/api/products?hidden=1', { token: call.token })).json()).products.map(p => p.id);
  assert.deepStrictEqual(hiddenIds.sort(), ['ean-7099999999997', 'ean-7099999999998'], 'fees and gift cards stay hidden');

  // a resolved brick files the accessory under its REAL GPC brick, and the
  // ruleset types it Accessories off the name
  await call('/api/admin/gpc?n=500', { method: 'POST', token: call.token });
  const deksel = (await (await call('/api/products?ids=ean-7099999999996')).json()).products.find(p => p.id === 'ean-7099999999996');
  assert.strictEqual(deksel.brick, '10001178', 'Mobile Phone Cases — the resolver, not the name, categorized it');
  assert.strictEqual(deksel.facets?.type, 'Accessories', 'the Phones ruleset types it off the name');

  // a human demotion out-ranks the machine: auto:1 + hidden:1 never re-promotes
  await req('/api/admin/products/ean-7099999999993', 'PATCH', { hidden: 1 });
  await push([{ product_id: 'ean-7099999999993', shop: 'Power', price: 9990, name: 'Google Pixel 9 128 GB', brand: 'Google', srcCat: 'Mobiltelefoner' }]);
  assert.ok(!(await (await call('/api/products?q=pixel 9')).json()).products.some(p => p.id === 'ean-7099999999993'), 'demoted product must not re-promote');

  // …and demotion takes the PDP down too: hidden means NOT SERVED, anywhere,
  // except to the ops bearer
  const byId = async (opts) => (await (await call('/api/products?ids=ean-7099999999993', opts)).json()).products;
  assert.ok(!(await byId()).some(p => p.id === 'ean-7099999999993'), 'a demoted product must not be readable at its PDP url');
  assert.ok(!(await byId()).some(p => p.hidden === 1), 'no hidden row rides along in the PDP neighbour padding');
  assert.ok((await byId({ token: call.token })).some(p => p.id === 'ean-7099999999993'), 'the ops bearer still reads hidden rows by id');
  assert.strictEqual((await call('/api/products?hidden=1')).status, 401, 'the hidden listing is bearer-gated');
});

test('discover samples by default and only crawls in full when approved', async () => {
  const urls = Array.from({ length: 1000 }, (_, i) => `https://s.no/p/${i}`);
  const realFetch = globalThis.fetch;
  const pages = (cfg) => {
    globalThis.fetch = async (u) => new Response(String(u).endsWith('.xml')
      ? `<urlset>${urls.map(l => `<url><loc>${l}</loc></url>`).join('')}</urlset>`
      : '<html>no json-ld</html>'); // every page fails to parse; we only count visits
    let seen = 0;
    const f = globalThis.fetch;
    globalThis.fetch = async (u) => { if (!String(u).endsWith('.xml')) seen++; return f(u); };
    return discoverSource('S', { sitemap: 'https://s.no/s.xml', delayMs: 0, ...cfg }).then(() => seen);
  };
  try {
    // an integer stride only approximates the cap — what matters is that it
    // caps at all, and that a shop with no policy never gets crawled in full
    const sampled = await pages({});
    assert.ok(sampled > 0 && sampled <= 400, `no limit and no approval = a capped sample, got ${sampled} of 1000`);
    assert.strictEqual(await pages({ approved: 'operator, 2026-07-27' }), 1000, 'approved lifts the cap');
    assert.ok(await pages({ approved: 'x', limit: 10 }) <= 10, 'an explicit limit still wins (--limit on any shop)');
  } finally { globalThis.fetch = realFetch; }
});

// JSON.parse("null") succeeds, so a shop template emitting a literal-null
// JSON-LD block on every page must not TypeError past the parse catch —
// that scraped the whole shop as zero rows, indistinguishable from an outage
test('a literal null JSON-LD block does not abort the page scrape', async () => {
  const html = `<script type="application/ld+json">null</script>
    <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Stol',
    offers: { '@type': 'Offer', price: '1499', priceCurrency: 'NOK' },
  })}</script>`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html);
  try {
    const [row] = await scrapeSource('Chilli', { urls: { stol: 'https://www.chilli.no/stol' } });
    assert.strictEqual(row?.price, 1499, 'the real Product block after the null one still scrapes');
  } finally { globalThis.fetch = realFetch; }
  assert.strictEqual(breadcrumbCat('<script type="application/ld+json">null</script>', 'X'), null);
});

test('a self-referencing sitemapindex terminates instead of recursing forever', async () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;
  // every URL answers with an index pointing at more indexes — third-party
  // content, so the walk must be depth-bounded, not trust-bounded
  globalThis.fetch = async (u) => {
    fetches++;
    return new Response(`<sitemapindex><sitemap><loc>${u}product-a.xml</loc></sitemap><sitemap><loc>${u}product-b.xml</loc></sitemap></sitemapindex>`);
  };
  try {
    const rows = await discoverSource('S', { sitemap: 'https://s.no/s.xml', delayMs: 0 });
    assert.deepStrictEqual(rows, [], 'no product pages found');
    assert.ok(fetches <= 1 + 40, `bounded fetch count, got ${fetches}`);
  } finally { globalThis.fetch = realFetch; }
});

// A site-relative JSON-LD image is not fetchable, and queueing one only ever
// produces a failed drain — Obs/Trademax/Chilli/Kid Interiør/Zooservice ship
// exactly that, and it left 3,814 products image-less.
test('scrape resolves a site-relative JSON-LD image against the page URL', async () => {
  const page = (img) => `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Stol', image: img,
    offers: { '@type': 'Offer', price: '1499', priceCurrency: 'NOK' },
  })}</script>`;
  const realFetch = globalThis.fetch;
  const at = async (img) => {
    globalThis.fetch = async () => new Response(page(img));
    try {
      const [row] = await scrapeSource('Chilli', { urls: { stol: 'https://www.chilli.no/mobler/stol-x' } });
      return row.image;
    } finally { globalThis.fetch = realFetch; }
  };
  assert.strictEqual(await at('/assets/blobs/a.jpg'), 'https://www.chilli.no/assets/blobs/a.jpg');
  assert.strictEqual(await at('//cdn.chilli.no/a.jpg'), 'https://cdn.chilli.no/a.jpg', 'protocol-relative too');
  assert.strictEqual(await at('https://cdn.x/a.jpg'), 'https://cdn.x/a.jpg', 'absolute is left alone');
  assert.strictEqual(await at('javascript:'), null, 'unresolvable drops rather than queueing a doomed fetch');

  // Ringo's Product.image is a Yoast graph ref, so JSON-LD yields nothing
  globalThis.fetch = async () => new Response(
    '<meta property="og:image" content="/wp-content/a.jpg" /><meta property="og:image:width" content="1000" />'
    + page({ '@id': 'https://www.ringo.no/produkt/x/#primaryimage' }));
  try {
    const [row] = await scrapeSource('Ringo', { urls: { x: 'https://www.ringo.no/produkt/x/' } });
    assert.strictEqual(row.image, 'https://www.ringo.no/wp-content/a.jpg', 'falls back to og:image, resolved and not confused by og:image:width');
  } finally { globalThis.fetch = realFetch; }
});

test('breadcrumbCat reads microdata breadcrumbs, and a crumb that is the product name never counts', () => {
  const ld = (crumbs) => `<script type="application/ld+json">${JSON.stringify(
    { '@type': 'BreadcrumbList', itemListElement: crumbs.map((name, i) => ({ name, position: i + 1 })) })}</script>`;
  const micro = (inner) => `<ol itemscope itemtype="https://schema.org/BreadcrumbList">${inner}</ol>`;
  const span = (n) => `<li itemprop="itemListElement" itemtype="https://schema.org/ListItem"><a itemprop="item"><span itemprop="name"> ${n} </span></a></li>`;
  const meta = (n) => `<li itemprop="itemListElement" itemtype="https://schema.org/ListItem"><link itemprop="name" content="${n}" /></li>`;

  // JSON-LD still wins when present, and still drops a product-name leaf
  assert.strictEqual(breadcrumbCat(ld(['Hjem', 'Mobil', 'iPhone 15']), 'iPhone 15'), 'Hjem > Mobil');
  // microdata, both name markups, product-name leaf dropped → "Kamera" resolves
  const jp = micro(meta('Home') + span('Kamera') + span('Systemkamera') + span('Fujifilm X-H2 Hus Sort'));
  assert.strictEqual(breadcrumbCat(jp, 'Fujifilm X-H2 Hus Sort'), 'Home > Kamera > Systemkamera');
  // a product name MID-path counts for nothing either — this is the Bergans case
  assert.strictEqual(breadcrumbCat(micro(span('Ally Map Pocket') + span('Black')), 'Ally Map Pocket'), 'Black');
  // nothing to read at all
  assert.strictEqual(breadcrumbCat('<html><body>no crumbs</body></html>', 'X'), null);
  assert.strictEqual(breadcrumbCat(micro(span('Ally Map Pocket')), 'Ally Map Pocket'), null);
});

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
  assert.strictEqual((await (await call('/api/products?hidden=1', { token: call.token })).json()).products.length, 0, 'orphan gone');

  // future ingests of that EAN land on the child
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099999999997', shop: 'CDON', price: 11790, name: 'iPhone 15 256GB Teal' }]);
  const again = (await (await call('/api/products?ids=iphone')).json()).products.find(p => p.id === 'iphone~256-teal');
  assert.strictEqual(again.offers.find(o => o.shop === 'CDON').price, 11790);
});

// product images: ingest QUEUES the URL, POST /api/admin/images downloads it
// to R2 — one download per source URL, and none at all inside the ingest POST
test('ingest images: queued on ingest, drained on demand, served at /img/:id with etag revalidation', async () => {
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
  globalThis.fetch = async (url) => {
    fetched.push(url);
    if (url.includes('/gone.jpg')) return new Response('nope', { status: 404 });
    if (url.includes('/evil.svg')) return new Response('<svg><script>1</script></svg>', { headers: { 'content-type': 'image/svg+xml' } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  };
  const push = (rows) => worker.fetch(new Request('http://pricy.test/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(rows),
  }), env);
  const drain = async () => (await worker.fetch(new Request('http://pricy.test/api/admin/images', {
    method: 'POST', headers: { authorization: 'Bearer t' },
  }), env)).json();
  try {
    const row = { product_id: 'airpods', shop: 'Elkjøp', price: 1999, image: 'https://cdn.example/a.jpg' };
    assert.strictEqual((await push([{ ...row, image: 42 }])).status, 400, 'non-string image rejected');
    assert.strictEqual((await push([row])).status, 200);
    // the whole point: ingest must not spend its subrequest budget on images,
    // or a 500-row crawl POST silently drops every image past the cap
    assert.deepStrictEqual(fetched, [], 'ingest queues, it does not download');
    assert.strictEqual((await catBody(api(env))).find(p => p.id === 'airpods').img, undefined, 'queued but unfetched = no img link');

    assert.deepStrictEqual(await drain(), { done: 1, failed: 0, remaining: 0 });
    assert.deepStrictEqual(fetched, ['https://cdn.example/a.jpg'], 'the drain downloads it');
    assert.ok(store.has('products/airpods'), 'image landed in the bucket');

    await push([row]);
    assert.deepStrictEqual(await drain(), { done: 0, failed: 0, remaining: 0 }, 'same URL again = nothing queued');
    assert.strictEqual(fetched.length, 1, 'same URL again = no re-download');

    await push([{ ...row, image: 'https://cdn.example/b.jpg' }]);
    assert.strictEqual((await drain()).done, 1, 'changed URL = re-queued and fetched');
    assert.strictEqual(fetched.length, 2, 'changed URL = fresh download');

    // a dead URL must leave the queue, or the drain loop in crawl.mjs spins
    await push([{ product_id: 'xm5', shop: 'Elkjøp', price: 999, image: 'https://cdn.example/gone.jpg' }]);
    assert.deepStrictEqual(await drain(), { done: 0, failed: 1, remaining: 0 }, 'a failed download stops blocking the queue');
    assert.strictEqual((await catBody(api(env))).find(p => p.id === 'xm5').img, undefined, 'failed download = no img link');

    // scriptable formats are refused: an SVG served from /img/ would execute
    // same-origin — only raster types may land in the bucket
    await push([{ product_id: 'switch', shop: 'Elkjøp', price: 4499, image: 'https://cdn.example/evil.svg' }]);
    assert.deepStrictEqual(await drain(), { done: 0, failed: 2, remaining: 0 }, 'image/svg+xml is refused (gone.jpg retries alongside)');
    assert.ok(!store.has('products/switch'), 'no SVG bytes in the bucket');
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
  assert.strictEqual((await catBody(call)).find(p => p.id === 'switch').img, undefined, 'no image row = no img field');
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
  await call('/api/products'); // seeds
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
  await call('/api/products');
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no', password: 'correcthorse1' } }));
  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target: seedBest - 100, paused: true }], cookie: kari });
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods' }], cookie: ola }); // watch with no target
  await withLog(() => push([{ product_id: 'airpods', shop: 'Elkjøp', price: seedBest - 200, stock: 1 }]));
  assert.deepStrictEqual(await alerts(), []);
});

test('alerts: threshold minimum-drop is respected; an all-time low overrides it unless lows is off', async () => {
  const { call, push, alerts } = alertEnv();
  await call('/api/products');
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
  await call('/api/products');
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
  await call('/api/products'); // seeds
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

// catMeta is memoised per db, keyed on the seed_meta version counter that
// every write bumps (worker/index.js). A missed bump doesn't fail anything
// else in this suite — it just serves yesterday's product counts forever — so
// this walks all three write paths and asserts the SERVED meta moved each time.
test('served meta stays live across ingest, admin PATCH and alias (catMeta cache invalidation)', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  const meta = async () => (await (await call('/api/products?node=10000522&limit=1')).json()).meta;

  // twice: the first request seeds, and seedCatalog deliberately returns no
  // version on a request that just wrote, so only the second one caches. A
  // cold cache can't go stale — warm it or this test proves nothing.
  await meta();
  const base = await meta();

  // 1. ingest — a brand-new shop must show up in meta.shops, and the
  // auto-promoted discovery moves products + the uncat bucket at once
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099920000001', shop: 'Dyrebutikken', price: 349, name: 'Hundeseng Deluxe', brand: 'Acme' }]);
  const afterIngest = await meta();
  assert.strictEqual(afterIngest.shops, base.shops + 1, 'a new shop must reach meta.shops without waiting for a TTL');
  assert.strictEqual(afterIngest.products, base.products + 1, 'the discovered row goes live (Ukategorisert)');
  assert.strictEqual(afterIngest.uncat, base.uncat + 1, 'and the uncat count moves with it');

  // 2. admin PATCH — pinning a brick must move the histogram
  await req('/api/admin/products/ean-7099920000001', 'PATCH', { brick: '10000522' });
  const afterPatch = await meta();
  assert.strictEqual(afterPatch.bricks['10000522'] ?? 0, (base.bricks['10000522'] ?? 0) + 1, 'a brick pin must reach meta.bricks — this is what Browse counts');
  assert.strictEqual(afterPatch.uncat, base.uncat, 'and leave the uncat bucket');

  // 3. alias creating a target — another visible head
  await req('/api/admin/alias', 'POST', { ean: '7099920000002', product_id: 'hundeseng~xl', meta: { name: 'Hundeseng Deluxe XL' } });
  assert.strictEqual((await meta()).products, base.products + 2, 'an alias-created product must reach meta.products');
});

// The node= listing filters on json_extract(meta,'$.brick'), which is not a
// column — without the expression index SQLite scans every product to serve
// one brick. Nothing else fails if it disappears; the page just gets slower,
// which is exactly the kind of regression nobody notices.
test('the node= listing has an index to use, and uses it — and the cat index is gone', async () => {
  const DB = d1();
  const call = api({ DB });
  await call('/api/products?node=10001181&limit=1'); // ensureSchema + seed

  const idx = await DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_products_brick'").first();
  assert.ok(idx, 'idx_products_brick must be in SCHEMA');
  assert.strictEqual(await DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_products_cat'").first(), null,
    'the regex-era cat index must be dropped');

  // SQLite only matches an expression index when the query spells the
  // expression identically, so assert the PLAN, not just the index's existence
  const { results } = await DB.prepare(
    `EXPLAIN QUERY PLAN SELECT p.id FROM products p LEFT JOIN offers o ON o.product_id = p.id
     WHERE json_extract(p.meta, '$.family') IS NULL AND json_extract(p.meta, '$.hidden') IS NOT 1
       AND json_extract(p.meta,'$.brick') IN ('10001181') GROUP BY p.id`
  ).all();
  const plan = results.map(r => r.detail).join(' | ');
  assert.match(plan, /idx_products_brick/, `node= must SEARCH via the index, not SCAN products — got: ${plan}`);
});

// search_index is built by triggers, which only fire on writes that happen
// AFTER they exist. Prod had 14,059 products before any of this, so the
// one-time backfill is what makes search work there at all — and nothing else
// in this suite touches it: with the backfill deleted the whole suite still
// passed, while prod would have served zero search results for every query.
test('search finds products that predate the index (the prod migration)', async () => {
  const DB = d1();
  // rows in place before any request — no triggers exist yet, exactly like prod
  DB.exec('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, meta TEXT NOT NULL)');
  await DB.prepare('INSERT INTO products (id, meta) VALUES (?, ?)')
    .bind('legacy-1', JSON.stringify({ name: 'Trådløs Grønnkål Legacy', brand: 'Oldco', kw: 'legacy' })).run();

  const call = api({ DB });
  const ids = async (q) => (await (await call('/api/products?q=' + encodeURIComponent(q))).json()).products.map(p => p.id);
  assert.deepStrictEqual(await ids('legacy'), ['legacy-1'], 'a pre-existing row must be backfilled into search_index');
  assert.deepStrictEqual(await ids('gronnkal'), ['legacy-1'], 'and folded, so the ASCII-typed query still finds it');

  const n = await DB.prepare('SELECT COUNT(*) AS n FROM search_index').first();
  assert.ok(n.n > 0, 'search_index must be populated');
});

// The alias route deletes the orphan product row; its search text has to go
// with it, or the table grows a leak nothing ever collects.
test('deleting a product drops its search_index row', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  await req('/api/ingest', 'POST', [{ product_id: 'ean-7099930000001', shop: 'Power', price: 99, name: 'Slettes Snart', brand: 'Acme' }]);
  assert.ok(await DB.prepare("SELECT 1 FROM search_index WHERE product_id = 'ean-7099930000001'").first(), 'ingest-created row must be indexed');

  await req('/api/admin/alias', 'POST', { ean: '7099930000001', product_id: 'airpods' });
  assert.strictEqual(
    await DB.prepare("SELECT 1 FROM search_index WHERE product_id = 'ean-7099930000001'").first(), null,
    'the deleted orphan must not leave search text behind');
  await call('/api/products?q=slettes'); // must not 500 on the now-missing row
});

// ── Shipping-inclusive totals (plans/shipping-totals.md, upstream PROMPT 01) ──

test('shipCost: ship string wins, registry falls back, freeOver waives, unknown stays null', () => {
  assert.strictEqual(shipCost('X', 100, 'Free shipping'), 0);
  assert.strictEqual(shipCost('X', 100, 'kr 79 shipping'), 79);
  assert.strictEqual(shipCost('X', 100, 'kr 109.00 shipping'), 109, 'prod has decimal rates');
  assert.strictEqual(shipCost('X', 100, 'gratis frakt'), null, 'an unnormalised string is unknown, not free');
  const reg = { Obs: { flat: 99, freeOver: 500 } };
  assert.strictEqual(shipCost('Obs', 100, null, reg), 99, 'registry flat rate below the threshold');
  assert.strictEqual(shipCost('Obs', 500, null, reg), 0, 'freeOver waives at the threshold');
  assert.strictEqual(shipCost('Obs', 100, 'Free shipping', reg), 0, 'the offer string beats the registry');
  assert.strictEqual(shipCost('Nope', 100, null, reg), null, 'no data anywhere = unknown, never free');
});

test('GET /api/products: offers carry shipCost/total, rows bestTotal; total sort and availability filters run server-side', async () => {
  const DB = d1();
  const env = { DB, INGEST_TOKEN: 'sekrit-token' };
  const call = api(env);
  const req = admin(env);
  // A: cheapest by ITEM at Power, cheapest by TOTAL at Elkjøp — the PROMPT 01
  // headline case. B: no shipping data anywhere. C: free shipping, slow eta.
  const rows = [
    { ean: '7099932000001', name: 'Kaffekvern Stor', offers: [['Power', 1990, 'kr 149 shipping', '2–6 days'], ['Elkjøp', 2040, 'Free shipping', 'In stock']] },
    // B's second offer has a fast eta but is OUT of stock — upstream's 'fast'
    // def only counts in-stock offers, so it must not satisfy maxeta
    { ean: '7099932000002', name: 'Kaffekvern Liten', offers: [['Obs', 500, null, null], ['Power', 520, null, '1–2 days', 0]] },
    { ean: '7099932000003', name: 'Kaffekvern Medium', offers: [['Komplett', 2000, 'Free shipping', '5–10 days']] },
  ];
  for (const r of rows) {
    await req('/api/ingest', 'POST', r.offers.map(([shop, price, ship, eta, stock = 1]) =>
      ({ product_id: 'ean-' + r.ean, shop, price, ship, eta, stock, name: r.name, brand: 'Acme' })));
    await req('/api/admin/products/ean-' + r.ean, 'PATCH', { brick: '10002011' });
  }
  const id = (n) => 'ean-709993200000' + n;
  const get = async (qs) => (await (await call('/api/products?' + qs)).json());
  const ids = async (qs) => (await get(qs)).products.map(p => p.id);

  const a = (await get('ids=' + id(1))).products[0];
  assert.strictEqual(a.offers.find(o => o.shop === 'Power').shipCost, 149);
  assert.strictEqual(a.offers.find(o => o.shop === 'Power').total, 2139);
  assert.strictEqual(a.offers.find(o => o.shop === 'Elkjøp').total, 2040);
  assert.strictEqual(a.best, 1990, 'item best stays Power');
  assert.strictEqual(a.bestTotal, 2040, 'shipping-inclusive best is Elkjøp — the falsifiable-claim fix');
  assert.strictEqual(a.bestTotalShop, 'Elkjøp');
  const b = (await get('ids=' + id(2))).products[0];
  assert.strictEqual(b.offers[0].shipCost, undefined, 'unknown shipping is unknown, not free');
  assert.strictEqual(b.bestTotal, undefined, 'no known-shipping offer, no bestTotal');

  // Totalpris sort: A (item 1990 / total 2040) and C (item 2000 / total 2000)
  // swap places between the two sorts; unknown-shipping B rides its item price.
  assert.deepStrictEqual(await ids('node=10002011&sort=best&dir=asc'), [id(2), id(1), id(3)]);
  assert.deepStrictEqual(await ids('node=10002011&sort=total&dir=asc'), [id(2), id(3), id(1)],
    'total sort must order by shipping-inclusive price where known, item price where not');

  // availability filters, whole-category, with meta.total riding along
  assert.deepStrictEqual((await ids('node=10002011&freeship=1')).sort(), [id(1), id(3)].sort(), 'freeship = a KNOWN free offer');
  assert.strictEqual((await get('node=10002011&freeship=1')).meta.total, 2);
  assert.deepStrictEqual(await ids('node=10002011&maxeta=2'), [id(1)], '"In stock" and "2–6 days" pass ≤2; no eta fails; an OUT-of-stock fast eta does not count');
  assert.deepStrictEqual((await ids('node=10002011&maxeta=5')).sort(), [id(1), id(3)].sort());
  assert.deepStrictEqual(await ids('node=10002011&freeship=1&maxeta=2'), [id(1)], 'availability filters stack');

  // the rail's availability counts, whole-category and unfiltered (upstream's
  // own availCounts convention): B's fast eta is out of stock so it counts
  // nowhere, and an active filter must not change the numbers
  assert.deepStrictEqual((await get('node=10002011')).meta.acounts, { instock: 3, freeship: 2, fast: 1 });
  assert.deepStrictEqual((await get('node=10002011&freeship=1')).meta.acounts, { instock: 3, freeship: 2, fast: 1 },
    'counts ignore the active filters, like the screen counting its unfiltered pool');
  assert.strictEqual((await get('')).meta.acounts, undefined, 'no category, no rail, no counts');
});

test('alerts: inclShip watches fire on the total crossing, arm on totals, and round-trip through PUT/me', async () => {
  const { call, push, alerts } = alertEnv();
  await call('/api/products'); // seeds
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  const pid = 'ean-7099933000001';
  const row = (price) => ({ product_id: pid, shop: 'Power', price, ship: 'kr 149 shipping', stock: 1, name: 'Vaffeljern Test', brand: 'Acme' });
  await withLog(() => push([row(1200)])); // product + offer exist before the watch
  assert.strictEqual((await call('/api/watches', { method: 'PUT', body: [{ id: pid, target: 1000, inclShip: 'yes' }], cookie })).status, 400,
    'inclShip must be boolean');
  await call('/api/watches', { method: 'PUT', body: [{ id: pid, target: 1000, inclShip: true }], cookie });

  // item price crosses the target, total does not: 950 + 149 = 1099 > 1000
  await withLog(() => push([row(950)]));
  assert.strictEqual((await alerts()).length, 0, 'item price below target must NOT fire while the total is above');

  // the watch stayed ARMED through that (item price below, total above):
  // 850 + 149 = 999 ≤ 1000 fires — the band a prev-item-price arming filter dropped
  await withLog(() => push([row(850)]));
  const fired = await alerts();
  assert.strictEqual(fired.length, 1, 'the TOTAL crossing fires');
  assert.strictEqual(fired[0].price, 850, 'the alert row records the item offer');

  await withLog(() => push([row(840)]));
  assert.strictEqual((await alerts()).length, 1, 'no refire while the total stays below');

  const me = await (await call('/api/me', { cookie })).json();
  assert.strictEqual(me.watches[0].inclShip, 1, 'inclShip survives the PUT → me round trip');
});

// Web Push: the encryption is hand-rolled (worker/push.js), so pin it to the
// spec's own vector — RFC 8291 Appendix A, fixed keys + salt → exact bytes.
test('web push: encrypt matches the RFC 8291 Appendix A vector', async () => {
  const { encrypt } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'push.js')));
  const unb64u = (s) => Uint8Array.from(Buffer.from(s, 'base64url'));
  const asPub = unb64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    x: Buffer.from(asPub.slice(1, 33)).toString('base64url'),
    y: Buffer.from(asPub.slice(33)).toString('base64url'),
  };
  const out = await encrypt('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { jwk, salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw') });
  assert.strictEqual(Buffer.from(out).toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('web push: subscribe is session-bound, admin push sends VAPID-signed posts and prunes dead endpoints', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const env = {
    DB: d1(),
    VAPID_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url'),
    VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)),
  };
  const call = api(env);
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  assert.strictEqual((await (await call('/api/push/key')).json()).key, env.VAPID_PUBLIC_KEY);

  // browser-side subscription keys: any P-256 point + 16-byte auth secret
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const keys = {
    p256dh: Buffer.from(await crypto.subtle.exportKey('raw', ua.publicKey)).toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  };
  assert.strictEqual((await call('/api/push/subscribe', { method: 'POST', body: { endpoint: 'https://push.test/a', keys } })).status, 401, 'session required');
  assert.strictEqual((await call('/api/push/subscribe', { method: 'POST', body: { endpoint: 'http://push.test/a', keys }, cookie })).status, 400, 'https endpoints only');
  assert.strictEqual((await call('/api/push/subscribe', { method: 'POST', body: { endpoint: 'https://push.test/a', keys }, cookie })).status, 200);
  await call('/api/push/subscribe', { method: 'POST', body: { endpoint: 'https://push.test/gone', keys }, cookie });

  const posts = [];
  const res = await withFetch(async (u, init) => {
    posts.push({ url: String(u), init });
    return new Response(null, { status: String(u).endsWith('/gone') ? 410 : 201 });
  }, () => call('/api/admin/push', { method: 'POST', body: { title: 'Hei', body: 'Test', url: '/deals' }, token: OPS }));
  const out = await res.json();
  assert.deepStrictEqual({ devices: out.devices, sent: out.sent, pruned: out.pruned, failed: out.failed },
    { devices: 2, sent: 1, pruned: 1, failed: 0 });
  const p = posts.find((x) => x.url === 'https://push.test/a');
  assert.match(p.init.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/, 'VAPID JWT rides the send');
  assert.strictEqual(p.init.headers['content-encoding'], 'aes128gcm');
  assert.ok(p.init.body.length > 103, 'encrypted body: 86-byte header + ciphertext');

  // the 410 device is gone — a second send only reaches the live one
  const res2 = await withFetch(async () => new Response(null, { status: 201 }),
    () => call('/api/admin/push', { method: 'POST', body: { title: 'Igjen' }, token: OPS }));
  assert.strictEqual((await res2.json()).devices, 1);
  assert.strictEqual((await call('/api/admin/push', { method: 'POST', body: { title: 'X' } })).status, 401, 'send is bearer-gated');
});

test('alerts: push channel sends to the subscribed devices and marks delivered', async () => {
  const { call, push, alerts, env } = alertEnv();
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  env.VAPID_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  env.VAPID_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));

  await call('/api/products'); // seeds
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  // email channel OFF, push ON — delivered_at must come from the push send
  await call('/api/settings', { method: 'PUT', body: { email: false, push: true }, cookie });
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  await call('/api/push/subscribe', { method: 'POST', body: { endpoint: 'https://push.test/dev1', keys: {
    p256dh: Buffer.from(await crypto.subtle.exportKey('raw', ua.publicKey)).toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  } }, cookie });

  const target = seedBest - 100;
  await call('/api/watches', { method: 'PUT', body: [{ id: 'airpods', target }], cookie });
  const posts = [];
  await withFetch(async (u) => { posts.push(String(u)); return new Response(null, { status: 201 }); },
    () => push([{ product_id: 'airpods', shop: 'Power', price: target - 10, stock: 1 }]));
  assert.deepStrictEqual(posts, ['https://push.test/dev1'], 'one push to the subscribed device, nothing else fetched');
  const rows = await alerts();
  assert.strictEqual(rows.length, 1, 'the crossing fired');
  assert.ok(rows[0].delivered_at > 0, 'push delivery marks the alert delivered even with email off');

  // toggle off → next crossing records the alert but sends nothing
  await call('/api/settings', { method: 'PUT', body: { email: false, push: false }, cookie });
  await push([{ product_id: 'airpods', shop: 'Power', price: target + 50, stock: 1 }]); // re-arm above target
  await withFetch(async (u) => { posts.push(String(u)); return new Response(null, { status: 201 }); },
    () => push([{ product_id: 'airpods', shop: 'Power', price: target - 20, stock: 1 }]));
  assert.strictEqual(posts.length, 1, 'no push after the opt-out');
  assert.strictEqual((await alerts()).length, 2, 'the alert row still lands');
});

// shared makers for the push tests below
const vapidEnv = async (env) => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  env.VAPID_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  env.VAPID_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
  return env;
};
const subscribeDevice = async (call, cookie, endpoint) => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  await call('/api/push/subscribe', { method: 'POST', body: { endpoint, keys: {
    p256dh: Buffer.from(await crypto.subtle.exportKey('raw', ua.publicKey)).toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  } }, cookie });
};
// runs fn with the push service mocked; resolves to the endpoints hit
const pushesDuring = (fn) => {
  const posts = [];
  return withFetch(async (u) => { posts.push(String(u)); return new Response(null, { status: 201 }); }, fn).then(() => posts);
};

test('lists: joining pushes the owner, bought pushes the other members — never the owner or buyer', async () => {
  const env = await vapidEnv({ DB: d1() });
  const call = api(env);
  const account = async (email, endpoint) => {
    const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email, password: 'correcthorse1' } }));
    await call('/api/settings', { method: 'PUT', body: { push: true }, cookie });
    await subscribeDevice(call, cookie, endpoint);
    return cookie;
  };
  const owner = await account('eier@x.no', 'https://push.test/owner');
  const m1 = await account('venn1@x.no', 'https://push.test/m1');
  const m2 = await account('venn2@x.no', 'https://push.test/m2');

  await call('/api/lists', { method: 'PUT', body: [{ id: 'l1', name: 'Bursdag', items: ['airpods'] }], cookie: owner });
  const { url: shareUrl } = await (await call('/api/lists/l1/share', { method: 'POST', cookie: owner })).json();
  const tok = shareUrl.split('/l/')[1];

  assert.deepStrictEqual(await pushesDuring(() => call('/api/l/' + tok, { cookie: m1 })),
    ['https://push.test/owner'], 'first join pushes the owner');
  assert.deepStrictEqual(await pushesDuring(() => call('/api/l/' + tok, { cookie: m1 })),
    [], 'a revisit does not re-push');
  await pushesDuring(() => call('/api/l/' + tok, { cookie: m2 })); // m2 joins too

  assert.deepStrictEqual(await pushesDuring(() => call('/api/l/' + tok, { method: 'POST', body: { product_id: 'airpods', bought: true }, cookie: m1 })),
    ['https://push.test/m2'], 'bought goes to the other members only');
  assert.deepStrictEqual(await pushesDuring(() => call('/api/l/' + tok, { method: 'POST', body: { product_id: 'airpods', bought: true }, cookie: m2 })),
    [], 'marking an already-bought item is a no-op');
  assert.deepStrictEqual(await pushesDuring(() => call('/api/l/' + tok, { method: 'POST', body: { product_id: 'airpods', bought: false }, cookie: m1 })),
    [], 'unmarking pushes nothing');
});

test('alerts: push-only extras — back in stock, and all-time low for target-less watches', async () => {
  const { call, push, alerts, env } = alertEnv();
  await vapidEnv(env);
  await call('/api/products'); // seeds
  const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no', password: 'correcthorse1' } }));
  await call('/api/settings', { method: 'PUT', body: { email: false, push: true }, cookie });
  await subscribeDevice(call, cookie, 'https://push.test/dev1');

  const pid = 'ean-7099933000001';
  const row = (price, stock = 1) => ({ product_id: pid, shop: 'Power', price, stock, name: 'Vaffeljern Test', brand: 'Acme' });
  await push([row(1200)]); // product + offer exist before the watch
  await call('/api/watches', { method: 'PUT', body: [{ id: pid }], cookie }); // watch WITHOUT a target

  assert.strictEqual((await pushesDuring(() => push([row(1100)]))).length, 1, 'a new all-time low pushes a target-less watch');
  assert.strictEqual((await pushesDuring(() => push([row(1150)]))).length, 0, 'not a new low — no push');
  assert.strictEqual((await pushesDuring(() => push([row(1150, 0)]))).length, 0, 'going out of stock pushes nothing');
  assert.strictEqual((await pushesDuring(() => push([row(1150)]))).length, 1, 'coming back in stock pushes');
  assert.strictEqual((await alerts()).length, 0, 'push-only events write no alerts-feed rows');
});
