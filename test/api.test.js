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

test('fullmakt + active auto-buy orders persist per user via PUT /api/autobuy', async () => {
  const call = api({ DB: d1() });
  const blob = {
    signed: true, signedAt: '11 Jul 2026, 09:12', cap: 20000, payment: 'vipps',
    orders: [{ id: 'xm5', max: 2800, expires: '10 Aug 2026', shops: 'Any shop' }],
  };
  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: blob })).status, 401, 'PUT without session must 401');

  const ola = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } }));
  assert.strictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, null, 'a new user has signed nothing');

  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: blob, cookie: ola })).status, 200);
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, blob, 'the blob must round-trip verbatim');

  // revoke: signed false, no armed orders — also round-trips
  const revoked = { signed: false, signedAt: null, cap: 20000, payment: 'vipps', orders: [] };
  await call('/api/autobuy', { method: 'PUT', body: revoked, cookie: ola });
  assert.deepStrictEqual((await (await call('/api/me', { cookie: ola })).json()).autobuy, revoked);

  // another user is untouched
  const kari = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { email: 'kari@example.no' } }));
  assert.strictEqual((await (await call('/api/me', { cookie: kari })).json()).autobuy, null);

  for (const bad of [[], 'nope', { signed: true }, { orders: 'nope' }]) {
    assert.strictEqual((await call('/api/autobuy', { method: 'PUT', body: bad, cookie: ola })).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await call('/api/autobuy', { method: 'PUT', cookie: ola })).status, 400, 'missing body must 400');
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

test('scheduled with no sources configured is a no-op — prices freeze until real rows arrive', async () => {
  const DB = d1();
  const call = api({ DB });
  const before = await (await call('/api/catalog.json')).json(); // seeds
  await worker.scheduled({ cron: '0 * * * *' }, { DB }, { waitUntil() {} });
  const after = await (await call('/api/catalog.json')).json();
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

test('adtraction source: EAN-matched feed rows update offers with deep link; unknown EANs are dropped', async () => {
  const entries = Object.entries(eans);
  assert.ok(entries.length, 'worker/eans.json is empty — 4d ingestion needs the product EAN map');
  const [pid, [ean]] = entries[0];

  const DB = d1();
  const call = api({ DB });
  const before = await (await call('/api/catalog.json')).json(); // seeds

  const xml = `<?xml version="1.0" encoding="UTF-8"?><products>
    <product><SKU>a1</SKU><Name><![CDATA[Matched & sold]]></Name><Ean>${ean}</Ean><Price>2 490,00</Price><Shipping>Fri frakt</Shipping><Instock>yes</Instock><TrackingUrl>https://track.adtraction.com/t/?u=1&amp;d=2</TrackingUrl></product>
    <product><SKU>a2</SKU><Name>Not in catalog</Name><Ean>7091234567890</Ean><Price>999.00</Price><Instock>no</Instock><TrackingUrl>https://track.adtraction.com/t/?u=9</TrackingUrl></product>
  </products>`;
  const env = { DB, SOURCES: { Komplett: { type: 'adtraction' } }, ADTRACTION_FEEDS: JSON.stringify({ Komplett: 'https://feed.test/komplett.xml' }) };
  await withFetch(async (url) => {
    assert.strictEqual(String(url), 'https://feed.test/komplett.xml');
    return new Response(xml, { status: 200 });
  }, () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));

  const after = await (await call('/api/catalog.json')).json();
  assert.strictEqual(after.length, before.length, 'unknown EANs must not create products');

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
     "offers":{"@type":"Offer","price":"2349.00","priceCurrency":"NOK","availability":"https://schema.org/InStock"}}]}
  </script></head><body>hi</body></html>`;
  const env = { DB, SOURCES: { Power: { type: 'scrape', urls: { airpods: 'https://www.power.no/airpods-pro' } } } };
  await withFetch(async () => new Response(html, { status: 200 }), () => worker.scheduled({ cron: '0 * * * *' }, env, ctl));

  const cat = await (await call('/api/catalog.json')).json();
  const offer = cat.find(p => p.id === 'airpods').offers.find(o => o.shop === 'Power');
  assert.strictEqual(offer.price, 2349);
  assert.strictEqual(offer.stock, true);
  assert.strictEqual(offer.url, 'https://www.power.no/airpods-pro', 'scraped offers link the shop page');
});

test('a failing source freezes its shop without aborting the others', async () => {
  const DB = d1();
  const call = api({ DB });
  const before = await (await call('/api/catalog.json')).json(); // seeds

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

  const after = await (await call('/api/catalog.json')).json();
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
  const cat = await (await call('/api/catalog.json')).json();
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
  const cookie = cookieOf(await web('/api/auth/signup', { method: 'POST', body: { email: 'ola@nordmann.no' } }));
  assert.deepStrictEqual((await (await web('/api/me', { cookie })).json()).watches, [{ id: 'airpods', target: 1999, paused: 0 }]);

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

  const before = await (await call('/api/catalog.json')).json();
  const baseline = before.find(p => p.id === 'airpods');

  const ok = await push([row], 'sekrit-token');
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(await ok.json(), { ok: true, ingested: 1 });

  let airpods = (await (await call('/api/catalog.json')).json()).find(p => p.id === 'airpods');
  let offer = airpods.offers.find(o => o.shop === 'Elkjøp');
  assert.strictEqual(offer.price, 1999);
  assert.strictEqual(offer.url, 'https://www.elkjop.no/airpods');
  assert.strictEqual(airpods.best, 1999, 'pushed price becomes best');
  assert.strictEqual(airpods.history.length, baseline.history.length, "today's point is upserted, not appended");
  assert.strictEqual(airpods.history.at(-1), 1999, "today's point tracks the pushed best");

  // a second, higher push the same day: offer follows, the day's point keeps the min
  await push([{ ...row, price: 2050 }], 'sekrit-token');
  airpods = (await (await call('/api/catalog.json')).json()).find(p => p.id === 'airpods');
  assert.strictEqual(airpods.offers.find(o => o.shop === 'Elkjøp').price, 2050);
  assert.strictEqual(airpods.history.at(-1), 1999, "the day's price point keeps the day's minimum");
  assert.strictEqual(airpods.history.length, baseline.history.length, 'still one point per day');
});
