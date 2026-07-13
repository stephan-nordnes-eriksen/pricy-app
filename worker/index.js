// Pricy API (Phase 4b/4c): magic-link auth, HttpOnly session cookie, /api/me,
// persisted watchlist, and the dynamic catalog (products/offers/price_points
// on D1, seeded from the build-generated seed.json) — /api/catalog.json is a
// Worker route now, no static file shadows it.

import seed from './seed.json' with { type: 'json' };

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS watches (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, target INTEGER, paused INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, product_id))',
  'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, meta TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS offers (product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, ship TEXT, stock INTEGER NOT NULL DEFAULT 1, eta TEXT, PRIMARY KEY (product_id, shop))',
  'CREATE TABLE IF NOT EXISTS price_points (product_id TEXT NOT NULL, day TEXT NOT NULL, price INTEGER NOT NULL, PRIMARY KEY (product_id, day))',
].join(';\n'); // one statement per line (D1 exec splits on \n), ;-terminated (sqlite)
// ponytail: schema bootstraps once per database; move to d1 migrations
// when the schema first has to *change* on the deployed db
const schemaReady = new WeakMap();
async function ensureSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, db.exec(SCHEMA));
  await schemaReady.get(db);
}

const SESSION_DAYS = 30;
const TOKEN_MINUTES = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = 'pricy_session';

const hex = (bytes) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function sha(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}
async function bodyEmail(request) {
  const email = String(((await request.json().catch(() => ({}))).email || '')).trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function displayName(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || email;
}
const initials = (name) => name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');

async function upsertUser(db, email) {
  // the no-op DO UPDATE makes RETURNING yield the row on conflict too
  return db.prepare(
    'INSERT INTO users (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id, email, name'
  ).bind(email, displayName(email)).first();
}

async function startSession(db, userId) {
  const token = newToken();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha(token), userId, Date.now() + SESSION_DAYS * 86400e3).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// products.meta = the static display fields; offers/history live in their
// tables and best/drop/shops/stock are derived on read (see catalogBody)
async function seedIfEmpty(db) {
  if (await db.prepare('SELECT 1 FROM products LIMIT 1').first()) return;
  const stmts = []; // OR IGNORE: two racing first requests must not fail
  for (const { id, offers, history, best, drop, shops, stock, ...meta } of seed) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO products (id, meta) VALUES (?, ?)').bind(id, JSON.stringify(meta)));
    for (const o of offers) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO offers (product_id, shop, price, ship, stock, eta) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, o.shop, o.price, o.ship ?? null, o.stock ? 1 : 0, o.eta ?? null));
    }
    history.forEach((price, i) => stmts.push(
      db.prepare('INSERT OR IGNORE INTO price_points (product_id, day, price) VALUES (?, ?, ?)')
        .bind(id, dayOf(Date.now() - (history.length - 1 - i) * 86400e3), price)));
  }
  await db.batch(stmts);
}

// ponytail: synthetic feed — THE swap point for a real price source
// (affiliate/partner feeds, per PLAN.md 4c); everything around it is the
// real pipeline and doesn't change when this does
async function syntheticFeed(db) {
  const { results } = await db.prepare('SELECT product_id, shop, price, ship, stock, eta FROM offers').all();
  return results.map(o => ({
    ...o,
    price: Math.max(1, Math.round(o.price * (0.97 + Math.random() * 0.06))),
    stock: Math.random() < 0.05 ? (o.stock ? 0 : 1) : o.stock,
  }));
}

async function ingest(db, rows) {
  const today = dayOf(Date.now());
  const best = {};
  for (const r of rows) best[r.product_id] = Math.min(best[r.product_id] ?? Infinity, r.price);
  await db.batch([
    ...rows.map(r => db.prepare(
      'INSERT INTO offers (product_id, shop, price, ship, stock, eta) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(product_id, shop) DO UPDATE SET price = excluded.price, ship = excluded.ship, stock = excluded.stock, eta = excluded.eta'
    ).bind(r.product_id, r.shop, r.price, r.ship ?? null, r.stock ? 1 : 0, r.eta ?? null)),
    ...Object.entries(best).map(([id, price]) => db.prepare(
      'INSERT INTO price_points (product_id, day, price) VALUES (?, ?, ?) ON CONFLICT(product_id, day) DO UPDATE SET price = MIN(price, excluded.price)'
    ).bind(id, today, price)),
  ]);
}

async function catalogBody(db) {
  await seedIfEmpty(db);
  const prods = await db.prepare('SELECT id, meta FROM products ORDER BY rowid').all();
  const offs = await db.prepare('SELECT product_id, shop, price, ship, stock, eta FROM offers ORDER BY price').all();
  const pts = await db.prepare('SELECT product_id, price FROM price_points ORDER BY day').all();
  const group = (rows, f) => rows.reduce((m, r) => (((m[r.product_id] ??= []).push(f(r))), m), {});
  const offers = group(offs.results, o => ({ shop: o.shop, price: o.price, ship: o.ship, stock: !!o.stock, eta: o.eta }));
  const history = group(pts.results, p => p.price);
  return prods.results.map(({ id, meta }) => {
    const m = JSON.parse(meta);
    const po = offers[id] || [];
    const best = po[0]?.price; // po is price-ordered
    return {
      id, ...m,
      best,
      drop: m.was && best ? Math.round((1 - best / m.was) * 100) : undefined,
      shops: po.length,
      stock: po.some(o => o.stock),
      offers: po,
      history: (history[id] || []).slice(-24), // the demo shape's window
    };
  });
}

async function meBody(db, user) {
  const { results } = await db.prepare('SELECT product_id AS id, target, paused FROM watches WHERE user_id = ? ORDER BY rowid').bind(user.id).all(); // rowid = the order the client PUT them in
  return { user: { email: user.email, name: user.name, initials: initials(user.name) }, watches: results };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
    }
    const db = env.DB;
    await ensureSchema(db);
    const route = request.method + ' ' + url.pathname;

    if (route === 'GET /api/catalog.json') {
      return json(await catalogBody(db));
    }

    if (route === 'POST /api/auth/request') {
      const email = await bodyEmail(request);
      if (!email) return json({ error: 'invalid email' }, 400);
      const token = newToken();
      await db.prepare('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
        .bind(await sha(token), email, Date.now() + TOKEN_MINUTES * 60e3).run();
      // ponytail: no email infra yet (local-only) — log the link. At deploy,
      // send it via a Cloudflare Email Service binding instead (load the
      // cloudflare-email-service skill for the wiring); never return it.
      console.log(`magic link for ${email}: ${url.origin}/api/auth/verify?token=${token}`);
      return json({ ok: true });
    }

    if (route === 'GET /api/auth/verify') {
      const hash = await sha(url.searchParams.get('token') || '');
      // DELETE … RETURNING = atomic single-use check
      const row = await db.prepare('DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email')
        .bind(hash, Date.now()).first();
      if (!row) return new Response(null, { status: 302, headers: { location: url.origin + '/login' } });
      const user = await upsertUser(db, row.email);
      return new Response(null, { status: 302, headers: { location: url.origin + '/', 'set-cookie': await startSession(db, user.id) } });
    }

    // Demo bridges — the prototype's AuthCard fake-validates (password
    // theatre, fake BankID per plan) and expects an instant session. Real
    // login is request+verify above; drop both when the upstream Login
    // actually waits for the emailed link.
    // login = existing accounts only; signup = create-or-log-in (same
    // upsert semantics as a verified magic link, which is also a signup).
    if (route === 'POST /api/auth/login' || route === 'POST /api/auth/signup') {
      const email = await bodyEmail(request);
      if (!email) return json({ error: 'invalid email' }, 400);
      const user = route.endsWith('signup')
        ? await upsertUser(db, email)
        : await db.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'no account for this email' }, 401);
      return json(await meBody(db, user), 200, { 'set-cookie': await startSession(db, user.id) });
    }

    const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
    const user = token && await db.prepare(
      'SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
    ).bind(await sha(token), Date.now()).first();

    if (route === 'GET /api/me') {
      return user ? json(await meBody(db, user)) : json({ error: 'unauthenticated' }, 401);
    }

    if (route === 'POST /api/logout') {
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha(token)).run();
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    }

    if (route === 'PUT /api/watches') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const list = await request.json().catch(() => null);
      const bad = !Array.isArray(list) || list.length > 200
        || list.some(w => typeof w.id !== 'string' || (w.target != null && typeof w.target !== 'number'))
        || new Set(list.map(w => w.id)).size !== list.length;
      if (bad) return json({ error: 'bad watchlist' }, 400);
      // ponytail: whole-list replace — the client (WatchStore) owns the list;
      // per-item endpoints when lists get big or multi-device concurrent
      await db.batch([
        db.prepare('DELETE FROM watches WHERE user_id = ?').bind(user.id),
        ...list.map(w => db.prepare('INSERT INTO watches (user_id, product_id, target, paused) VALUES (?, ?, ?, ?)')
          .bind(user.id, w.id, w.target ?? null, w.paused ? 1 : 0)),
      ]);
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },

  // cron (wrangler.jsonc triggers): refresh offers and record today's best
  async scheduled(event, env) {
    const db = env.DB;
    await ensureSchema(db);
    await seedIfEmpty(db);
    await ingest(db, await syntheticFeed(db));
  },
};
