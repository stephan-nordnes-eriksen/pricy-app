// Pricy API (Phase 4b/4c): magic-link auth, HttpOnly session cookie, /api/me,
// persisted watchlist, and the dynamic catalog (products/offers/price_points
// on D1, seeded from the build-generated seed.json) — /api/catalog.json is a
// Worker route now, no static file shadows it.

import seed from './seed.json' with { type: 'json' };
import { collectRows } from './sources.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT, settings TEXT, autobuy TEXT, created_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS watches (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, target INTEGER, paused INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, product_id))',
  'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, meta TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS offers (product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, ship TEXT, stock INTEGER NOT NULL DEFAULT 1, eta TEXT, url TEXT, updated_at INTEGER, PRIMARY KEY (product_id, shop))',
  'CREATE TABLE IF NOT EXISTS price_points (product_id TEXT NOT NULL, day TEXT NOT NULL, price INTEGER NOT NULL, PRIMARY KEY (product_id, day))',
  'CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, prev_price INTEGER, target INTEGER NOT NULL, created_at INTEGER NOT NULL, delivered_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT, reason TEXT NOT NULL, text TEXT, created_at INTEGER NOT NULL)',
].join(';\n'); // one statement per line (D1 exec splits on \n), ;-terminated (sqlite)
// ponytail: schema bootstraps once per database; move to d1 migrations
// when the schema first has to *change* on the deployed db
const schemaReady = new WeakMap();
async function ensureSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, (async () => {
    await db.exec(SCHEMA);
    // migration for DBs created before password auth / settings existed
    await db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run().catch(() => {});
    await db.prepare('ALTER TABLE users ADD COLUMN settings TEXT').run().catch(() => {});
    await db.prepare('ALTER TABLE users ADD COLUMN autobuy TEXT').run().catch(() => {});
    // honest metrics: signup date for "Member since" (pre-existing rows stay NULL)
    await db.prepare('ALTER TABLE users ADD COLUMN created_at INTEGER').run().catch(() => {});
    // 4d: real-source offers carry a deep link and a freshness stamp
    await db.prepare('ALTER TABLE offers ADD COLUMN url TEXT').run().catch(() => {});
    await db.prepare('ALTER TABLE offers ADD COLUMN updated_at INTEGER').run().catch(() => {});
  })());
  await schemaReady.get(db);
}

const SESSION_DAYS = 30;
const TOKEN_MINUTES = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = 'pricy_session';

const hex = (bytes) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map(b => parseInt(b, 16)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function sha(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

// Password storage: PBKDF2-HMAC-SHA256, native Web Crypto (Workers + Node
// both implement it, no dependency). ponytail: OWASP's 2023 guidance is
// 600k iterations for PBKDF2-SHA256, but Workers' WebCrypto hard-caps
// PBKDF2 at 100k iterations (throws NotSupportedError above that) — this
// is the platform ceiling, not a tuning choice.
const PBKDF2_ITERATIONS = 100_000;
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(digest)}`;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyPassword(password, stored) {
  const [scheme, iterations, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !hashHex) return false;
  const digest = await pbkdf2(password, unhex(saltHex), Number(iterations));
  return timingSafeEqual(hex(digest), hashHex);
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}
async function bodyEmail(request) {
  const email = String(((await request.json().catch(() => ({}))).email || '')).trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}
const MIN_PASSWORD_LEN = 8;
async function bodyEmailAndPassword(request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password == null ? null : String(body.password);
  return { email: EMAIL_RE.test(email) ? email : null, password };
}

function displayName(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || email;
}
const initials = (name) => name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');

async function upsertUser(db, email, passwordHash = null) {
  // the DO UPDATE makes RETURNING yield the row on conflict too, but never
  // touches password_hash: passwordless rows are real magic-link accounts
  // now, so letting a password-signup attach a password to one would be an
  // account takeover. Setting a password on an existing account goes through
  // the logged-in path (POST /api/account/password) instead; signup callers
  // verify the returned hash to tell "created" from "already existed".
  return db.prepare(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id, email, name, password_hash, settings, autobuy, created_at'
  ).bind(email, displayName(email), passwordHash, Date.now()).first();
}

async function createSession(db, userId) {
  const token = newToken();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha(token), userId, Date.now() + SESSION_DAYS * 86400e3).run();
  return token;
}
async function startSession(db, userId) {
  return `${COOKIE}=${await createSession(db, userId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

// shared by the MCP login/signup tools and the OAuth /authorize form.
// login is strict; signup upserts but must verify the resulting password —
// upsert never touches an existing row's hash, so signup on an existing
// account (passworded or magic-link) fails here instead of hijacking it.
async function passwordAuth(db, action, email, password) {
  if (!EMAIL_RE.test(email)) return { error: 'invalid email' };
  if (action === 'signup') {
    if (password.length < MIN_PASSWORD_LEN) return { error: `password must be at least ${MIN_PASSWORD_LEN} characters` };
    const user = await upsertUser(db, email, await hashPassword(password));
    if (!user.password_hash) return { error: 'this account has no password — log in on pricy.no and set one under Account first' };
    if (!(await verifyPassword(password, user.password_hash))) return { error: 'an account with this email already exists — log in with its password' };
    return { user };
  }
  const user = await db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').bind(email).first();
  if (!user) return { error: 'no account for this email — create one first' };
  if (!user.password_hash) return { error: 'this account has no password — set one on pricy.no (Account → Set password) first' };
  if (!(await verifyPassword(password, user.password_hash))) return { error: 'incorrect password' };
  return { user };
}

// one lookup for both auth surfaces: the web cookie and the MCP session id
async function sessionUser(db, token) {
  if (!token) return null;
  return db.prepare(
    'SELECT u.id, u.email, u.name, u.password_hash, u.settings, u.autobuy, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).bind(await sha(token), Date.now()).first();
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

// per-product best in-stock offer — the alert hook reads it after every
// ingest; AUTOBUY-PLAN AB-1's trigger engine reuses this from the same spot
async function bestOffer(db, productId) {
  return db.prepare('SELECT shop, price FROM offers WHERE product_id = ? AND stock = 1 ORDER BY price LIMIT 1').bind(productId).first();
}

async function ingest(db, rows, env) {
  const today = dayOf(Date.now());
  const best = {};
  for (const r of rows) best[r.product_id] = Math.min(best[r.product_id] ?? Infinity, r.price);
  // snapshot before the upsert: the crossing check and the all-time-low check
  // both need the "before" state. ponytail: per-product query loop, fine at
  // catalog scale (≤500 rows/push); batch the reads if the catalog ever isn't
  const before = {};
  for (const pid of Object.keys(best)) {
    before[pid] = {
      best: (await bestOffer(db, pid))?.price ?? null,
      low: (await db.prepare('SELECT MIN(price) AS low FROM price_points WHERE product_id = ?').bind(pid).first())?.low ?? null,
    };
  }
  await db.batch([
    ...rows.map(r => db.prepare(
      'INSERT INTO offers (product_id, shop, price, ship, stock, eta, url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(product_id, shop) DO UPDATE SET price = excluded.price, ship = excluded.ship, stock = excluded.stock, eta = excluded.eta, url = excluded.url, updated_at = excluded.updated_at'
    ).bind(r.product_id, r.shop, r.price, r.ship ?? null, r.stock ? 1 : 0, r.eta ?? null, r.url ?? null, Date.now())),
    ...Object.entries(best).map(([id, price]) => db.prepare(
      'INSERT INTO price_points (product_id, day, price) VALUES (?, ?, ?) ON CONFLICT(product_id, day) DO UPDATE SET price = MIN(price, excluded.price)'
    ).bind(id, today, price)),
  ]);
  await fireAlerts(db, env, before);
}

// Price-drop alerts, fired from ingest() — the single choke point both the
// cron and POST /api/ingest route through (AB-1's trigger engine hangs here
// too). ponytail: armed/fired state is derived, not stored — a "crossing" is
// prev best above target, new best at/below. While the price stays below,
// prev <= target so nothing refires; rising back above re-arms for free.
// Ceiling: a watch created while the price is already below its target never
// fires until the price rises above the target and crosses again.
async function fireAlerts(db, env, before) {
  for (const [pid, prev] of Object.entries(before)) {
    const offer = await bestOffer(db, pid);
    if (!offer) continue;
    const { results } = await db.prepare(
      'SELECT w.user_id, w.target, u.email, u.settings FROM watches w JOIN users u ON u.id = w.user_id WHERE w.product_id = ? AND w.paused = 0 AND w.target IS NOT NULL AND w.target >= ? AND (? IS NULL OR ? > w.target)'
    ).bind(pid, offer.price, prev.best, prev.best).all();
    if (!results.length) continue;
    const meta = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(pid).first();
    const name = meta ? JSON.parse(meta.meta).name : pid;
    const dropPct = prev.best ? ((prev.best - offer.price) / prev.best) * 100 : 100;
    const isLow = prev.low != null && offer.price < prev.low; // new all-time low
    for (const w of results) {
      const s = w.settings ? JSON.parse(w.settings) : {};
      // threshold = minimum drop % ("any"|"5"|"10"); lows = always alert on
      // an all-time low, even below the threshold (both default permissive)
      if (Number(s.threshold) > dropPct && !(isLow && s.lows !== false)) continue;
      let delivered = null;
      if (s.email !== false) { // channel toggle: record the hit, skip the send
        if (env?.SEND_EMAIL) {
          try {
            await env.SEND_EMAIL.send({
              to: w.email,
              from: { email: 'alerts@pricy.no', name: 'pricy.no' },
              subject: `Price drop: ${name} is now ${offer.price} kr`,
              html: `<p>${name} dropped to <b>${offer.price} kr</b> at ${offer.shop} — at or below your target of ${w.target} kr.</p><p><a href="https://pricy.no/product/${pid}">See the offer</a></p>`,
              text: `${name} dropped to ${offer.price} kr at ${offer.shop} — at or below your target of ${w.target} kr.\n\nhttps://pricy.no/product/${pid}`,
            });
            delivered = Date.now();
          } catch (e) {
            console.error(`price alert send failed for ${w.email}: ${e.code || ''} ${e.message}`);
          }
        } else {
          // ponytail: no SEND_EMAIL binding (tests / local dev) — log it, same as magic links
          console.log(`price alert for ${w.email}: ${name} ${offer.price} kr at ${offer.shop} (target ${w.target})`);
          delivered = Date.now();
        }
      }
      await db.prepare('INSERT INTO alerts (user_id, product_id, shop, price, prev_price, target, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(w.user_id, pid, offer.shop, offer.price, prev.best, w.target, Date.now(), delivered).run();
    }
  }
}

async function catalogBody(db) {
  await seedIfEmpty(db);
  const prods = await db.prepare('SELECT id, meta FROM products ORDER BY rowid').all();
  const offs = await db.prepare('SELECT product_id, shop, price, ship, stock, eta, url, updated_at FROM offers ORDER BY price').all();
  const pts = await db.prepare('SELECT product_id, price FROM price_points ORDER BY day').all();
  const group = (rows, f) => rows.reduce((m, r) => (((m[r.product_id] ??= []).push(f(r))), m), {});
  const offers = group(offs.results, o => ({ shop: o.shop, price: o.price, ship: o.ship, stock: !!o.stock, eta: o.eta, url: o.url, updated_at: o.updated_at }));
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

async function purchasesBody(db, userId) {
  const { results } = await db.prepare(
    'SELECT pu.id, pu.product_id, pu.shop, pu.price, pu.created_at, pr.meta FROM purchases pu LEFT JOIN products pr ON pr.id = pu.product_id WHERE pu.user_id = ? ORDER BY pu.id DESC'
  ).bind(userId).all();
  return results.map(r => ({ order_id: r.id, product_id: r.product_id, product: r.meta ? JSON.parse(r.meta).name : null, shop: r.shop, price_nok: r.price, purchased_at: new Date(r.created_at).toISOString() }));
}

// activity feed rows, joined to the product title. ponytail: hard LIMIT 50
// for the feed, no paging — add offset paging if anyone's history ever needs
// to scroll past it; export passes -1 (sqlite: no limit) for completeness
async function alertsBody(db, userId, limit = 50) {
  const { results } = await db.prepare(
    'SELECT a.product_id, a.shop, a.price, a.prev_price, a.target, a.created_at, pr.meta FROM alerts a LEFT JOIN products pr ON pr.id = a.product_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT ?'
  ).bind(userId, limit).all();
  return results.map(r => ({ product_id: r.product_id, product: r.meta ? JSON.parse(r.meta).name : null, shop: r.shop, price: r.price, prev_price: r.prev_price, target: r.target, created_at: r.created_at }));
}

async function meBody(db, user) {
  // hit = an alert fired for this watch and the price is still at/below the
  // target (rising back above re-arms the watch and clears the flag)
  const { results } = await db.prepare(
    'SELECT product_id AS id, target, paused, COALESCE(EXISTS(SELECT 1 FROM alerts a WHERE a.user_id = watches.user_id AND a.product_id = watches.product_id) AND target >= (SELECT MIN(price) FROM offers o WHERE o.product_id = watches.product_id AND o.stock = 1), 0) AS hit FROM watches WHERE user_id = ? ORDER BY rowid'
  ).bind(user.id).all(); // rowid = the order the client PUT them in
  return { user: { email: user.email, name: user.name, initials: initials(user.name), hasPassword: !!user.password_hash, createdAt: user.created_at ?? null }, watches: results, settings: user.settings ? JSON.parse(user.settings) : {}, autobuy: user.autobuy ? JSON.parse(user.autobuy) : null, purchases: await purchasesBody(db, user.id) };
}

// ── MCP (experiment) ───────────────────────────────────────────────────────
// Streamable-HTTP MCP server, hand-rolled: single JSON-RPC POST endpoint at
// /mcp, plain-JSON responses (no SSE stream — the spec allows 405 on GET).
// Auth: the Mcp-Session-Id header minted at initialize doubles as a pricy
// session token — the login/signup tools bind it to a user in the same
// `sessions` table the web cookie uses, so every later tool call is
// authenticated by the header the MCP client echoes back anyway.
// ponytail: no OAuth, no Agents SDK, no Durable Objects — add the OAuth
// dance when a client that requires it shows up.
const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required });
const str = (description) => ({ type: 'string', description });
const MCP_TOOLS = [
  { name: 'login', description: 'Log in to an existing pricy.no account. Only for clients not connected via OAuth — if this tool is listed, the user is not logged in yet.', inputSchema: obj({ email: str('account email'), password: str('account password') }, ['email', 'password']) },
  { name: 'signup', description: 'Create a pricy.no account (and log in). Only for clients not connected via OAuth. If the account already exists, the password must match.', inputSchema: obj({ email: str('email'), password: str(`password, min ${MIN_PASSWORD_LEN} characters`) }, ['email', 'password']) },
  { name: 'search_products', description: 'Search the pricy.no catalog (Norwegian shops, prices in NOK). Returns matching products with their current best price.', inputSchema: obj({ query: str('free-text search, e.g. "headphones" or "sony tv"') }, ['query']) },
  { name: 'get_product', description: 'Full detail for one product: every shop offer (price, shipping, stock, link) and recent price history.', inputSchema: obj({ product_id: str('id from search_products') }, ['product_id']) },
  { name: 'buy_now', description: 'Buy the product immediately at the current cheapest in-stock price (or from a specific shop). Returns the order with the exact price charged.', inputSchema: obj({ product_id: str('id from search_products'), shop: str('optional: buy from this shop instead of the cheapest') }, ['product_id']) },
  { name: 'watch_product', description: 'Add a product to your watchlist, optionally with a target price in NOK to be notified at.', inputSchema: obj({ product_id: str('id from search_products'), target_price: { type: 'number', description: 'optional target price in NOK' } }, ['product_id']) },
  { name: 'unwatch_product', description: 'Remove a product from your watchlist.', inputSchema: obj({ product_id: str('id from search_products') }, ['product_id']) },
  { name: 'list_watches', description: 'Your watchlist with current best prices.', inputSchema: obj() },
  { name: 'list_purchases', description: 'Your buy_now order history.', inputSchema: obj() },
];

async function mcpTool(db, sid, name, a) {
  if (!MCP_TOOLS.some(t => t.name === name)) throw new Error(`unknown tool: ${name}`);

  if (name === 'login' || name === 'signup') {
    if (!sid) throw new Error('no MCP session id — reconnect to the server and try again');
    const { user, error } = await passwordAuth(db, name, String(a.email || '').trim().toLowerCase(), String(a.password || ''));
    if (error) throw new Error(error);
    await db.prepare('INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha(sid), user.id, Date.now() + SESSION_DAYS * 86400e3).run();
    return { ok: true, user: { email: user.email, name: user.name } };
  }

  const user = await sessionUser(db, sid);
  if (!user) throw new Error('not logged in — use the login tool (or signup to create an account)');
  await seedIfEmpty(db);

  const brief = (p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.cat, best_price_nok: p.best, was_nok: p.was, drop_pct: p.drop, shops: p.shops, in_stock: p.stock });

  if (name === 'search_products') {
    const terms = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) throw new Error('query required');
    const cat = await catalogBody(db);
    const scored = cat
      .map(p => [terms.filter(t => `${p.name} ${p.brand ?? ''} ${p.cat ?? ''} ${p.icon ?? ''}`.toLowerCase().includes(t)).length, p])
      .filter(([s]) => s > 0)
      .sort((x, y) => y[0] - x[0]);
    if (!scored.length) return { results: [], hint: 'no matches — categories: ' + [...new Set(cat.map(p => p.cat))].join(', ') };
    return { results: scored.slice(0, 8).map(([, p]) => brief(p)) };
  }

  if (name === 'get_product') {
    const p = (await catalogBody(db)).find(q => q.id === String(a.product_id || ''));
    if (!p) throw new Error('unknown product_id');
    return { ...brief(p), offers: p.offers, price_history_nok: p.history };
  }

  if (name === 'buy_now') {
    const pid = String(a.product_id || '');
    const prod = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(pid).first();
    if (!prod) throw new Error('unknown product_id');
    const offer = a.shop
      ? await db.prepare('SELECT shop, price, stock, url FROM offers WHERE product_id = ? AND shop = ?').bind(pid, String(a.shop)).first()
      : await db.prepare('SELECT shop, price, stock, url FROM offers WHERE product_id = ? AND stock = 1 ORDER BY price LIMIT 1').bind(pid).first();
    if (!offer) throw new Error(a.shop ? 'no offer from that shop' : 'no in-stock offer for this product');
    if (!offer.stock) throw new Error(`${offer.shop} is out of stock`);
    const order = await db.prepare('INSERT INTO purchases (user_id, product_id, shop, price, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, created_at')
      .bind(user.id, pid, offer.shop, offer.price, Date.now()).first();
    // ponytail: MVP order record only — payment/fulfillment assumed handled
    return { ok: true, order_id: order.id, product_id: pid, product: JSON.parse(prod.meta).name, shop: offer.shop, price_nok: offer.price, purchased_at: new Date(order.created_at).toISOString() };
  }

  if (name === 'watch_product') {
    const pid = String(a.product_id || '');
    if (!(await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(pid).first())) throw new Error('unknown product_id');
    const target = a.target_price == null ? null : Math.round(Number(a.target_price));
    if (target !== null && !(target > 0)) throw new Error('target_price must be a positive number');
    await db.prepare('INSERT INTO watches (user_id, product_id, target, paused) VALUES (?, ?, ?, 0) ON CONFLICT(user_id, product_id) DO UPDATE SET target = excluded.target, paused = 0')
      .bind(user.id, pid, target).run();
    return { ok: true, watching: pid, target_price_nok: target };
  }

  if (name === 'unwatch_product') {
    const row = await db.prepare('DELETE FROM watches WHERE user_id = ? AND product_id = ? RETURNING product_id')
      .bind(user.id, String(a.product_id || '')).first();
    return { ok: true, removed: !!row };
  }

  if (name === 'list_watches') {
    const byId = Object.fromEntries((await catalogBody(db)).map(p => [p.id, p]));
    const { results } = await db.prepare('SELECT product_id, target, paused FROM watches WHERE user_id = ? ORDER BY rowid').bind(user.id).all();
    return { watches: results.map(w => ({ product_id: w.product_id, name: byId[w.product_id]?.name, best_price_nok: byId[w.product_id]?.best, target_price_nok: w.target, paused: !!w.paused })) };
  }

  // list_purchases
  return { purchases: await purchasesBody(db, user.id) };
}

// ── OAuth for MCP clients ──────────────────────────────────────────────────
// claude.ai forces OAuth + Dynamic Client Registration on custom connectors
// (no anonymous fallback — anthropics/claude-ai-mcp#457), so we serve the
// minimum: RFC 8414 metadata, /register, /authorize (a real pricy login
// page), /token with PKCE. The access token is a plain pricy session token
// in the same `sessions` table the cookie and Mcp-Session-Id use.
// ponytail: no refresh tokens (the 30-day session just expires; the client
// reconnects), no scopes, no client table — redirect_uris are allowlisted
// to known AI-client callbacks instead; extend the list per new client.
const OAUTH_CODE_MINUTES = 5;
const redirectAllowed = (u) =>
  ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'].includes(u)
  || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u); // MCP inspector / local dev

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function oauthWellKnown(url) {
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return json({ resource: url.origin + '/mcp', authorization_servers: [url.origin] });
  }
  if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) {
    return json({
      issuer: url.origin,
      authorization_endpoint: url.origin + '/authorize',
      token_endpoint: url.origin + '/token',
      registration_endpoint: url.origin + '/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  }
  // anything else under /.well-known/ must 404 as JSON, never the SPA shell
  return json({ error: 'not found' }, 404);
}

// design tokens hand-copied from colors_and_type.css (ink-900, green-500,
// shadow-green, Space Grotesk) — the page is standalone by design, it must
// not pull the whole SPA in
function authorizePage(q, error) {
  const hidden = ['redirect_uri', 'state', 'code_challenge']
    .map(k => `<input type="hidden" name="${k}" value="${esc(q[k] || '')}">`).join('');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to pricy.no</title>
<link rel="icon" href="/assets/logo-mark.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ink: #0E0E0E; --green: #00B964; --green-100: #D8F8E6; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Space Grotesk', system-ui, sans-serif; color: var(--ink); background: #fff; display: grid; place-items: center; min-height: 100vh; padding: 1rem; }
  .card { width: 100%; max-width: 24rem; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--green); padding: 2rem 1.5rem; }
  .brand { display: flex; align-items: center; gap: .5rem; font-weight: 700; font-size: 1.4rem; margin-bottom: .25rem; }
  .brand img { width: 1.6rem; height: 1.6rem; }
  p.sub { margin-bottom: 1.25rem; color: #2E2E2C; }
  .err { border: 2px solid var(--ink); background: #FFE9E6; padding: .6rem; margin-bottom: 1rem; font-size: .9rem; }
  form { display: grid; gap: .6rem; }
  input { padding: .7rem; border: 2px solid var(--ink); font: inherit; }
  input:focus { outline: 3px solid var(--green); outline-offset: 0; }
  button { padding: .75rem; border: 2px solid var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .primary { background: var(--ink); color: #fff; }
  .primary:hover { background: var(--green); color: var(--ink); }
  .secondary { background: #fff; }
  .secondary:hover { background: var(--green-100); }
</style></head><body>
<main class="card">
<div class="brand"><img src="/assets/logo-mark.svg" alt="">pricy.no</div>
<p class="sub">Log in to connect your pricy.no account.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post">${hidden}
<input name="email" type="email" placeholder="email" required autofocus autocomplete="email">
<input name="password" type="password" placeholder="password" required minlength="${MIN_PASSWORD_LEN}" autocomplete="current-password">
<button class="primary" name="action" value="login">Log in</button>
<button class="secondary" name="action" value="signup">Create account</button>
</form>
</main></body></html>`, { status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function oauth(request, db, url) {
  const route = request.method + ' ' + url.pathname;

  if (route === 'POST /register') {
    const body = await request.json().catch(() => ({}));
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (!uris.length || !uris.every(redirectAllowed)) return json({ error: 'invalid_redirect_uri' }, 400);
    // no client table: the allowlist is the registration. client_id is opaque.
    return json({
      client_id: newToken(),
      redirect_uris: uris,
      grant_types: body.grant_types ?? ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(body.client_name ? { client_name: String(body.client_name) } : {}),
    }, 201);
  }

  if (url.pathname === '/authorize' && (request.method === 'GET' || request.method === 'POST')) {
    const q = request.method === 'GET'
      ? Object.fromEntries(url.searchParams)
      : Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
    // re-validated on POST too — the hidden fields are attacker-writable
    if (!redirectAllowed(String(q.redirect_uri || ''))) return json({ error: 'invalid redirect_uri' }, 400);
    if (!q.code_challenge) return json({ error: 'code_challenge (PKCE S256) required' }, 400);
    if (request.method === 'GET') {
      if (q.response_type !== 'code' || (q.code_challenge_method || 'S256') !== 'S256') {
        return json({ error: 'only response_type=code with S256 PKCE is supported' }, 400);
      }
      return authorizePage(q);
    }
    const { user, error } = await passwordAuth(db, q.action === 'signup' ? 'signup' : 'login',
      String(q.email || '').trim().toLowerCase(), String(q.password || ''));
    if (error) return authorizePage(q, error);
    const code = newToken();
    await db.prepare('INSERT INTO oauth_codes (code_hash, user_id, redirect_uri, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha(code), user.id, q.redirect_uri, q.code_challenge, Date.now() + OAUTH_CODE_MINUTES * 60e3).run();
    const loc = new URL(q.redirect_uri);
    loc.searchParams.set('code', code);
    if (q.state) loc.searchParams.set('state', q.state);
    // 303, not 307 — the client must GET the callback, not replay the POST
    return new Response(null, { status: 303, headers: { location: loc.toString() } });
  }

  if (route === 'POST /token') {
    const form = Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
    // both tokens are plain session rows; the "refresh" token just never
    // reaches the MCP endpoint, it only mints fresh access tokens here
    const grant = async (userId, refreshToken) => json({
      access_token: await createSession(db, userId),
      token_type: 'Bearer',
      expires_in: SESSION_DAYS * 86400,
      refresh_token: refreshToken ?? await createSession(db, userId),
    });
    if (form.grant_type === 'refresh_token') {
      const user = await sessionUser(db, String(form.refresh_token || ''));
      if (!user) return json({ error: 'invalid_grant' }, 400);
      return grant(user.id, String(form.refresh_token));
    }
    if (form.grant_type !== 'authorization_code') return json({ error: 'unsupported_grant_type' }, 400);
    // DELETE … RETURNING = atomic single-use, like login_tokens
    const row = await db.prepare('DELETE FROM oauth_codes WHERE code_hash = ? AND expires_at > ? RETURNING user_id, redirect_uri, code_challenge')
      .bind(await sha(String(form.code || '')), Date.now()).first();
    const challenge = row && b64url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(form.code_verifier || '')))));
    if (!row || challenge !== row.code_challenge || (form.redirect_uri && form.redirect_uri !== row.redirect_uri)) {
      return json({ error: 'invalid_grant' }, 400);
    }
    return grant(row.user_id);
  }

  return json({ error: 'not found' }, 404);
}

async function mcp(request, db) {
  if (request.method === 'DELETE') return new Response(null, { status: 204 }); // session end — nothing to tear down
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, DELETE' } });
  const msg = await request.json().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400);
  }
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notifications need no reply
  // OAuth-connected clients (claude.ai) send a bearer session token; bare
  // clients fall back to the Mcp-Session-Id + login-tool dance
  const sid = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    || request.headers.get('mcp-session-id');
  const reply = (body, headers = {}) => json({ jsonrpc: '2.0', id: msg.id, ...body }, 200, headers);

  if (msg.method === 'initialize') {
    const v = msg.params?.protocolVersion;
    const authed = await sessionUser(db, sid); // OAuth clients are logged in before they ever initialize
    return reply({ result: {
      protocolVersion: MCP_VERSIONS.includes(v) ? v : MCP_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'pricy.no', version: '0.1.0' },
      instructions: authed
        ? `pricy.no — Norwegian price comparison. The user is already logged in as ${authed.email}; never ask for credentials. Use search_products, get_product, watch_product, and buy_now. All prices are NOK.`
        : 'pricy.no — Norwegian price comparison. Log in with the login tool (or signup to create an account) first; then search_products, get_product, watch_product, and buy_now. All prices are NOK.',
    } }, { 'mcp-session-id': newToken() });
  }
  if (msg.method === 'ping') return reply({ result: {} });
  if (msg.method === 'tools/list') {
    // an authenticated client must not see login/signup at all — a listed
    // login tool reads as "ask the user for their password in chat"
    const authed = await sessionUser(db, sid);
    return reply({ result: { tools: authed ? MCP_TOOLS.filter(t => t.name !== 'login' && t.name !== 'signup') : MCP_TOOLS } });
  }
  if (msg.method === 'tools/call') {
    try {
      const out = await mcpTool(db, sid, msg.params?.name, msg.params?.arguments || {});
      return reply({ result: { content: [{ type: 'text', text: JSON.stringify(out) }] } });
    } catch (e) {
      return reply({ result: { content: [{ type: 'text', text: e.message }], isError: true } });
    }
  }
  return reply({ error: { code: -32601, message: 'method not found' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.pricy.no') {
      url.hostname = 'pricy.no';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/mcp') {
      await ensureSchema(env.DB);
      return mcp(request, env.DB);
    }
    if (url.pathname.startsWith('/.well-known/')) {
      return oauthWellKnown(url);
    }
    if (['/authorize', '/token', '/register'].includes(url.pathname)) {
      await ensureSchema(env.DB);
      return oauth(request, env.DB, url);
    }
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
    }
    const db = env.DB;
    await ensureSchema(db);
    const route = request.method + ' ' + url.pathname;

    if (route === 'GET /api/catalog.json') {
      // honest metrics: real aggregates ride along — freshest is null until
      // an ingest has stamped an offer (seed rows carry no updated_at)
      const products = await catalogBody(db);
      const stamps = products.flatMap(p => p.offers.map(o => o.updated_at)).filter(Boolean);
      const meta = {
        products: products.length,
        shops: new Set(products.flatMap(p => p.offers.map(o => o.shop))).size,
        freshest: stamps.length ? Math.max(...stamps) : null,
      };
      return json({ meta, products });
    }

    // 4d interim: the laptop crawler (tools/crawl.mjs) pushes ingest()-shaped
    // rows here, bearer-gated on the INGEST_TOKEN secret
    if (route === 'POST /api/ingest') {
      if (!env.INGEST_TOKEN) return json({ error: 'ingest disabled (no INGEST_TOKEN secret)' }, 503);
      const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!bearer || !timingSafeEqual(bearer, env.INGEST_TOKEN)) return json({ error: 'unauthorized' }, 401);
      const rows = await request.json().catch(() => null);
      const bad = !Array.isArray(rows) || !rows.length || rows.length > 500 || rows.some(r =>
        !r || typeof r.product_id !== 'string' || typeof r.shop !== 'string' || !r.shop.trim()
        || !Number.isInteger(r.price) || r.price <= 0 || r.price > 10_000_000
        || (r.ship != null && typeof r.ship !== 'string') || (r.eta != null && typeof r.eta !== 'string')
        || (r.url != null && typeof r.url !== 'string'));
      if (bad) return json({ error: 'bad rows' }, 400);
      await seedIfEmpty(db);
      const known = new Set((await db.prepare('SELECT id FROM products').all()).results.map(p => p.id));
      const unknown = [...new Set(rows.filter(r => !known.has(r.product_id)).map(r => r.product_id))];
      if (unknown.length) return json({ error: 'unknown product_id', ids: unknown }, 400);
      await ingest(db, rows, env);
      return json({ ok: true, ingested: rows.length });
    }

    if (route === 'POST /api/auth/request') {
      const email = await bodyEmail(request);
      if (!email) return json({ error: 'invalid email' }, 400);
      const token = newToken();
      await db.prepare('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
        .bind(await sha(token), email, Date.now() + TOKEN_MINUTES * 60e3).run();
      const link = `${url.origin}/api/auth/verify?token=${token}`;
      if (env.SEND_EMAIL) {
        try {
          await env.SEND_EMAIL.send({
            to: email,
            from: { email: 'login@pricy.no', name: 'pricy.no' },
            subject: 'Log in to pricy.no',
            html: `<p>Click to log in to pricy.no:</p><p><a href="${link}">Log in</a></p><p>The link expires in ${TOKEN_MINUTES} minutes. If you didn't request it, ignore this email.</p>`,
            text: `Log in to pricy.no: ${link}\n\nThe link expires in ${TOKEN_MINUTES} minutes. If you didn't request it, ignore this email.`,
          });
        } catch (e) {
          console.error(`magic link send failed for ${email}: ${e.code || ''} ${e.message}`);
          return json({ error: 'could not send the email — try again' }, 502);
        }
      } else {
        // ponytail: no SEND_EMAIL binding (tests / local dev) — log the link; never return it.
        console.log(`magic link for ${email}: ${link}`);
      }
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

    // Real password login/signup. The old passwordless-signup demo bridge is
    // gone (magic links go through request+verify above) — the only
    // passwordless signup left is the fake BankID button's shared demo
    // account, pinned here so arbitrary accounts can't be upserted.
    // login = existing accounts only; signup = create-or-log-in.
    if (route === 'POST /api/auth/login' || route === 'POST /api/auth/signup') {
      const { email, password } = await bodyEmailAndPassword(request);
      if (!email) return json({ error: 'invalid email' }, 400);

      if (route.endsWith('signup')) {
        if (password == null && email !== 'demo@pricy.no') {
          return json({ error: 'signup needs a password — or use the magic link' }, 400);
        }
        if (password != null && password.length < MIN_PASSWORD_LEN) {
          return json({ error: `password must be at least ${MIN_PASSWORD_LEN} characters` }, 400);
        }
        const user = await upsertUser(db, email, password ? await hashPassword(password) : null);
        if (password != null) {
          // existing row → upsert left its hash alone; verify or refuse, same
          // as the MCP signup tool (no session for someone else's account)
          if (!user.password_hash) return json({ error: 'this account uses the magic link — log in that way, then set a password under Account' }, 401);
          if (!(await verifyPassword(password, user.password_hash))) return json({ error: 'an account with this email already exists — log in with its password' }, 401);
        }
        return json(await meBody(db, user), 200, { 'set-cookie': await startSession(db, user.id) });
      }

      const user = await db.prepare('SELECT id, email, name, password_hash, settings, autobuy, created_at FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'no account for this email' }, 401);
      if (!password) return json({ error: 'enter your password' }, 400);
      if (!user.password_hash) return json({ error: 'this account has no password — use magic link or BankID' }, 401);
      if (!(await verifyPassword(password, user.password_hash))) return json({ error: 'incorrect password' }, 401);
      return json(await meBody(db, user), 200, { 'set-cookie': await startSession(db, user.id) });
    }

    const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
    const user = await sessionUser(db, token);

    if (route === 'GET /api/me') {
      return user ? json(await meBody(db, user)) : json({ error: 'unauthenticated' }, 401);
    }

    if (route === 'GET /api/alerts') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      return json(await alertsBody(db, user.id));
    }

    if (route === 'POST /api/logout') {
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha(token)).run();
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    }

    const MAX_NAME_LEN = 100;
    if (route === 'PATCH /api/account') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const name = String(((await request.json().catch(() => ({}))).name || '')).trim();
      if (!name || name.length > MAX_NAME_LEN) return json({ error: 'invalid name' }, 400);
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
      return json({ user: { email: user.email, name, initials: initials(name) } });
    }

    // GDPR export: everything /api/me returns (user minus password hash,
    // watches, settings, autobuy, purchases) plus the full alert history,
    // served as a direct download
    if (route === 'GET /api/account/export') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const reports = (await db.prepare('SELECT product_id, shop, reason, text, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC, id DESC').bind(user.id).all()).results;
      return json({ ...await meBody(db, user), alerts: await alertsBody(db, user.id, -1), reports }, 200,
        { 'content-disposition': 'attachment; filename="pricy-export.json"' });
    }

    // GDPR delete: every row keyed to the user dies (settings/autobuy blobs
    // live on the users row), and the session cookie is expired
    if (route === 'DELETE /api/account') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      await db.batch([
        db.prepare('DELETE FROM alerts WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM reports WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM purchases WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM watches WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM oauth_codes WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM login_tokens WHERE email = ?').bind(user.email),
        db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
      ]);
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    }

    if (route === 'POST /api/account/password') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const body = await request.json().catch(() => ({}));
      const currentPassword = body.currentPassword == null ? null : String(body.currentPassword);
      const newPassword = body.newPassword == null ? null : String(body.newPassword);
      if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
        return json({ error: `password must be at least ${MIN_PASSWORD_LEN} characters` }, 400);
      }
      if (user.password_hash) {
        if (!currentPassword) return json({ error: 'enter your current password' }, 400);
        if (!(await verifyPassword(currentPassword, user.password_hash))) return json({ error: 'current password is incorrect' }, 401);
      }
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), user.id).run();
      return json({ ok: true });
    }

    // ponytail: whole-object replace, same seam as PUT /api/watches — the
    // client owns the settings shape, we just persist whatever it sends
    if (route === 'PUT /api/settings') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const settings = await request.json().catch(() => null);
      const bad = !settings || typeof settings !== 'object' || Array.isArray(settings) || JSON.stringify(settings).length > 2000;
      if (bad) return json({ error: 'bad settings' }, 400);
      await db.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(JSON.stringify(settings), user.id).run();
      return json({ ok: true });
    }

    // ponytail: same JSON-blob seam as PUT /api/settings — the client owns
    // the fullmakt + active-orders shape and round-trips it verbatim.
    // Executed orders are NOT in here; they live in the purchases table.
    if (route === 'PUT /api/autobuy') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const ab = await request.json().catch(() => null);
      const bad = !ab || typeof ab !== 'object' || Array.isArray(ab) || !Array.isArray(ab.orders)
        || ab.orders.length > 200 || JSON.stringify(ab).length > 8000;
      if (bad) return json({ error: 'bad autobuy state' }, 400);
      await db.prepare('UPDATE users SET autobuy = ? WHERE id = ?').bind(JSON.stringify(ab), user.id).run();
      return json({ ok: true });
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

    // "Report a problem" on a product page (plans/report-product-error.md).
    // No admin UI — `wrangler d1 execute pricy-app --command "select * from
    // reports order by created_at desc limit 20"` is the triage view.
    if (route === 'POST /api/report') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const b = await request.json().catch(() => ({}));
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      const text = b.text == null ? null : String(b.text);
      const shop = b.shop == null ? null : String(b.shop);
      if (typeof b.productId !== 'string' || !reason || reason.length > 40
        || (text && text.length > 1000) || (shop && shop.length > 100)) {
        return json({ error: 'bad report' }, 400);
      }
      await seedIfEmpty(db);
      const known = await db.prepare('SELECT id FROM products WHERE id = ?').bind(b.productId).first();
      if (!known) return json({ error: 'unknown product' }, 400);
      // ponytail: 20/user/day is the whole rate limit — real abuse tooling when abuse exists
      const { n } = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND created_at > ?')
        .bind(user.id, Date.now() - 864e5).first();
      if (n >= 20) return json({ error: 'too many reports today' }, 429);
      await db.prepare('INSERT INTO reports (user_id, product_id, shop, reason, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, b.productId, shop, reason, text, Date.now()).run();
      return json({ ok: true });
    }

    // Web Buy now — the exact MCP buy_now path (the session cookie token
    // lives in the same sessions table as Mcp-Session-Id, so mcpTool's
    // own auth lookup just works)
    if (route === 'POST /api/buy') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const body = await request.json().catch(() => ({}));
      try {
        return json(await mcpTool(db, token, 'buy_now', { product_id: body.id, shop: body.shop }));
      } catch (e) {
        return json({ error: e.message }, 400);
      }
    }

    return json({ error: 'not found' }, 404);
  },

  // cron (wrangler.jsonc triggers): refresh offers from the configured
  // sources (env.SOURCES) and record today's best. Shops without rows this
  // run keep their stored offers; no sources configured = no-op (the
  // manual-crawl interim pushes rows via POST /api/ingest instead).
  async scheduled(event, env) {
    const db = env.DB;
    await ensureSchema(db);
    await seedIfEmpty(db);
    const rows = await collectRows(env);
    if (rows.length) await ingest(db, rows, env);
  },
};
