// Pricy API (Phase 4b/4c): magic-link auth, HttpOnly session cookie, /api/me,
// persisted watchlist, and the dynamic catalog (products/offers/price_points
// on D1, seeded from the build-generated seed.json) — /api/catalog.json is a
// Worker route now, no static file shadows it.

import seed from './seed.json' with { type: 'json' };
import eansFile from './eans.json' with { type: 'json' };
import CATS from './cats.json' with { type: 'json' }; // category registry: { cat: default icon } — THE list of valid cats, served to the UI via catMeta
import FACETS from './facets.json' with { type: 'json' }; // facet registry: { cat: [facet defs] } — served via catMeta, drives the Results filter UI (FILTERS-PLAN.md)
import { collectRows, BROWSER_UA, eanKey } from './sources.js';

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
  'CREATE TABLE IF NOT EXISTS seed_meta (id INTEGER PRIMARY KEY, hash TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS images (product_id TEXT PRIMARY KEY, src TEXT NOT NULL, fetched_at INTEGER NOT NULL)',
  // EAN → product routing (OPEN-CATALOG-PLAN A1): bootstrapped from
  // worker/eans.json, extended at runtime via POST /api/admin/alias.
  // ean is eanKey-normalized (digits, no leading zeros).
  'CREATE TABLE IF NOT EXISTS eans (ean TEXT PRIMARY KEY, product_id TEXT NOT NULL)',
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
// bearer gate shared by /api/ingest and the /api/admin/* surface;
// returns the error Response, or null when authorized
function ingestAuth(request, env) {
  if (!env.INGEST_TOKEN) return json({ error: 'disabled (no INGEST_TOKEN secret)' }, 503);
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer || !timingSafeEqual(bearer, env.INGEST_TOKEN)) return json({ error: 'unauthorized' }, 401);
  return null;
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
// tables and best/drop/shops/stock are derived on read (see catalogBody).
// Seed evolution (4e): seed_meta pins the hash of the shipped seed.json — on a
// new seed, meta is json_patch-merged for every row (seed keys win, runtime
// enrichment like admin-PATCHed specs/facets/hidden survives the deploy) and
// rows new to the DB (e.g. variant children) get their demo offers/history;
// existing offers/price_points are never touched, and rows dropped upstream
// stay (purchases/watches reference them).
let seedHash;
async function seedCatalog(db) {
  // hash covers eans.json too: an eans-only change must re-run seeding so the
  // new file rows land in the eans table (OR IGNORE — runtime aliases win)
  seedHash ??= await sha(JSON.stringify(seed) + JSON.stringify(eansFile));
  if ((await db.prepare('SELECT hash FROM seed_meta WHERE id = 1').first())?.hash === seedHash) return;
  const known = new Set((await db.prepare('SELECT id FROM products').all()).results.map(r => r.id));
  // Demo offers/history are for virgin DBs only (local dev, tests): once a
  // real source has ever stamped an offer (updated_at set — seeding never
  // sets it), new rows start honest with "No offers yet" instead of fake
  // prices/links. Prod's original demo data was purged 2026-07-22.
  const virgin = !(await db.prepare('SELECT 1 FROM offers WHERE updated_at IS NOT NULL LIMIT 1').first());
  const stmts = []; // OR IGNORE / upserts: two racing requests must not fail
  for (const [pid, list] of Object.entries(eansFile)) {
    for (const e of list) stmts.push(db.prepare('INSERT OR IGNORE INTO eans (ean, product_id) VALUES (?, ?)').bind(eanKey(e), pid));
  }
  for (const { id, offers, history, best, drop, shops, stock, ...meta } of seed) {
    stmts.push(db.prepare('INSERT INTO products (id, meta) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET meta = json_patch(meta, excluded.meta)').bind(id, JSON.stringify(meta)));
    if (known.has(id) || !virgin) continue; // meta refresh only — real offers/history stay
    for (const o of offers) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO offers (product_id, shop, price, ship, stock, eta) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, o.shop, o.price, o.ship ?? null, stockVal(o.stock), o.eta ?? null));
    }
    history.forEach((price, i) => stmts.push(
      db.prepare('INSERT OR IGNORE INTO price_points (product_id, day, price) VALUES (?, ?, ?)')
        .bind(id, dayOf(Date.now() - (history.length - 1 - i) * 86400e3), price)));
  }
  stmts.push(db.prepare('INSERT INTO seed_meta (id, hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash').bind(seedHash));
  await db.batch(stmts);
}

// per-product best in-stock offer — the alert hook reads it after every
// ingest; AUTOBUY-PLAN AB-1's trigger engine reuses this from the same spot
async function bestOffer(db, productId) {
  return db.prepare('SELECT shop, price FROM offers WHERE product_id = ? AND stock = 1 ORDER BY price LIMIT 1').bind(productId).first();
}

// stock column: 0 = out, 1 = in, 2 = never checked (catalogBody omits the
// key so the UI's StockBadge shows "Unknown"). NOT NULL stays — 2 avoids a
// prod table rebuild that allowing NULL would need.
const stockVal = (s) => s == null || s === 2 ? 2 : s ? 1 : 0;

// a row for a product we don't have yet, carrying enough identity to create it
const autoAdd = (r) => /^ean-\d+$/.test(r.product_id) && typeof r.name === 'string' && !!r.name.trim();

// Auto-promotion bits (OPEN-CATALOG-PLAN B3): CATS (cats.json) gates valid
// categories + default icons, an accessory blocklist keeps junk hidden
// regardless of category mapping, and kw = distinct name/brand/cat tokens.
const JUNK_RE = /\b(deksel|etui|case|cover|skjermbeskytter|screen ?protector|panzerglass|strap|reim|armbånd|refill|reservedel|spare ?part|lader|charger|kabel|cable|adapter|veske|sleeve|hylster)\b/i;
const kwOf = (...parts) => [...new Set(parts.join(' ').toLowerCase().match(/[\p{L}\d]+/gu) || [])].filter(t => t.length > 1).join(' ');

async function ingest(db, rows, env) {
  // EAN aliasing (OPEN-CATALOG-PLAN A2): `ean-*` ids re-map through the eans
  // table, so a variant/duplicate EAN lands on its real product without a
  // deploy. ponytail: full table read per ingest, same scale note as below.
  const alias = Object.fromEntries((await db.prepare('SELECT ean, product_id FROM eans').all()).results.map(r => [r.ean, r.product_id]));
  rows = rows.map(r => {
    const m = /^ean-(\d+)$/.exec(r.product_id);
    return m && alias[m[1]] ? { ...r, product_id: alias[m[1]] } : r;
  });
  // Discovery: any source row whose product we don't have (unknown `ean-<digits>`
  // id derived from a feed/JSON-LD EAN, plus a name) creates the product on the
  // spot, hidden until enriched — by auto-promotion below, or manually via
  // PATCH /api/admin/products/:id. Unknown rows without identity drop.
  // ponytail: full id scan per ingest, fine to ~50k products; index a discovery
  // column when it isn't
  const prods = (await db.prepare(`SELECT id, meta, json_extract(meta, '$.hidden') AS hidden FROM products`).all()).results;
  const known = new Set(prods.map(p => p.id));
  const stillHidden = new Set(prods.filter(p => p.hidden === 1).map(p => p.id));
  const metaOf = Object.fromEntries(prods.filter(p => p.hidden === 1).map(p => [p.id, JSON.parse(p.meta)]));
  const creates = {};
  for (const r of rows) {
    if (known.has(r.product_id) || !autoAdd(r)) continue;
    creates[r.product_id] ??= { name: r.name.trim(), ...(r.brand ? { brand: String(r.brand) } : {}), ...(r.srcCat ? { srcCat: String(r.srcCat) } : {}), ean: r.product_id.slice(4), hidden: 1 };
    stillHidden.add(r.product_id);
    metaOf[r.product_id] = creates[r.product_id];
  }
  rows = rows.filter(r => known.has(r.product_id) || creates[r.product_id]);
  if (Object.keys(creates).length) {
    await db.batch(Object.entries(creates).map(([id, meta]) =>
      db.prepare('INSERT OR IGNORE INTO products (id, meta) VALUES (?, ?)').bind(id, JSON.stringify(meta))));
  }
  // Auto-promotion (B3): a hidden row goes live the moment a source supplies
  // name + brand + a source category that env.CATMAP (JSON var, per-shop
  // { "<shop>": { "<raw srcCat>": "<cat>" } }) maps to one of ours. meta.auto
  // marks it machine-promoted; auto + still hidden = a human demoted it,
  // never re-promote. Unmapped or blocklisted rows just stay hidden.
  const catmap = typeof env.CATMAP === 'string' ? JSON.parse(env.CATMAP) : (env.CATMAP || {});
  const promoted = {};
  for (const r of rows) {
    const meta = metaOf[r.product_id];
    if (!meta || !stillHidden.has(r.product_id) || meta.family || meta.auto) continue;
    const brand = meta.brand ?? (r.brand ? String(r.brand) : null);
    const cat = catmap[r.shop]?.[r.srcCat ?? meta.srcCat];
    if (!meta.name || !brand || !CATS[cat] || JUNK_RE.test(meta.name)) continue;
    const { hidden, ...rest } = meta;
    promoted[r.product_id] = { ...rest, brand, cat, icon: CATS[cat], kw: kwOf(meta.name, brand, cat), auto: 1 };
    stillHidden.delete(r.product_id);
  }
  if (Object.keys(promoted).length) {
    await db.batch(Object.entries(promoted).map(([id, meta]) =>
      db.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), id)));
  }
  const today = dayOf(Date.now());
  const best = {};
  for (const r of rows) best[r.product_id] = Math.min(best[r.product_id] ?? Infinity, r.price);
  // snapshot before the upsert: the crossing check and the all-time-low check
  // both need the "before" state. Watched products only — alerts can't exist
  // for the rest, and a full brand feed carries thousands of rows.
  const watched = new Set((await db.prepare('SELECT DISTINCT product_id FROM watches').all()).results.map(r => r.product_id));
  const before = {};
  for (const pid of Object.keys(best)) {
    if (!watched.has(pid)) continue;
    before[pid] = {
      best: (await bestOffer(db, pid))?.price ?? null,
      low: (await db.prepare('SELECT MIN(price) AS low FROM price_points WHERE product_id = ?').bind(pid).first())?.low ?? null,
    };
  }
  const stmts = [
    // ship/eta/url: COALESCE so a source that doesn't know a field (crawlers
    // never know delivery time) can't erase a stored value with null
    ...rows.map(r => db.prepare(
      'INSERT INTO offers (product_id, shop, price, ship, stock, eta, url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(product_id, shop) DO UPDATE SET price = excluded.price, ship = COALESCE(excluded.ship, ship), stock = excluded.stock, eta = COALESCE(excluded.eta, eta), url = COALESCE(excluded.url, url), updated_at = excluded.updated_at'
    ).bind(r.product_id, r.shop, r.price, r.ship ?? null, stockVal(r.stock), r.eta ?? null, r.url ?? null, Date.now())),
    ...Object.entries(best).map(([id, price]) => db.prepare(
      'INSERT INTO price_points (product_id, day, price) VALUES (?, ?, ?) ON CONFLICT(product_id, day) DO UPDATE SET price = MIN(price, excluded.price)'
    ).bind(id, today, price)),
  ];
  // ponytail: 200-statement chunks — one giant batch trips D1 limits on a
  // full-feed run; the upserts are idempotent so losing cross-chunk atomicity is fine
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  await fireAlerts(db, env, before);
  // hidden rows skip image sync — no UI shows them; the download happens on
  // the first ingest after enrichment unhides the product
  await syncImages(db, env, rows.filter(r => !stillHidden.has(r.product_id))).catch(e => console.error(`image sync failed: ${e.message}`));
}

// Product images live in R2 (IMAGES bucket), served at GET /img/:id. The
// images row pins the source URL last stored — a product's image only
// downloads when its source URL is new or changed (shop CDNs version image
// URLs, so same URL = same bytes). A failed fetch keeps the old object and
// retries naturally on the next ingest.
async function syncImages(db, env, rows) {
  if (!env.IMAGES) return; // no bucket bound (tests/local) — prices still land
  const want = {};
  for (const r of rows) if (r.image) want[r.product_id] ??= r.image;
  for (const [pid, src] of Object.entries(want)) {
    const cur = await db.prepare('SELECT src FROM images WHERE product_id = ?').bind(pid).first();
    if (cur?.src === src) continue;
    try {
      const res = await fetch(src, { headers: { 'user-agent': BROWSER_UA, accept: 'image/*' } });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) throw new Error(`http ${res.status} ${type}`);
      const body = await res.arrayBuffer();
      if (body.byteLength > 5 << 20) throw new Error(`too big: ${body.byteLength} bytes`);
      await env.IMAGES.put(`products/${pid}`, body, { httpMetadata: { contentType: type } });
      await db.prepare('INSERT INTO images (product_id, src, fetched_at) VALUES (?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET src = excluded.src, fetched_at = excluded.fetched_at')
        .bind(pid, src, Date.now()).run();
    } catch (e) {
      console.warn(`image ${pid}: ${e.message}`);
    }
  }
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

function shapeRows(prods, offs, pts, imgSet) {
  const group = (rows, f) => rows.reduce((m, r) => (((m[r.product_id] ??= []).push(f(r))), m), {});
  const offers = group(offs, o => ({ shop: o.shop, price: o.price, ship: o.ship, stock: o.stock === 2 ? undefined : !!o.stock, eta: o.eta, url: o.url, updated_at: o.updated_at }));
  const history = group(pts, p => p.price);
  return prods.map(({ id, meta }) => {
    const m = JSON.parse(meta);
    const po = offers[id] || [];
    const best = po[0]?.price; // po is price-ordered
    return {
      id, ...m,
      img: imgSet.has(id) ? `/img/${id}` : undefined,
      best,
      drop: m.was && best ? Math.round((1 - best / m.was) * 100) : undefined,
      shops: po.length,
      stock: po.some(o => o.stock),
      offers: po,
      history: (history[id] || []).slice(-24), // the demo shape's window
    };
  });
}

async function catalogBody(db) {
  await seedCatalog(db);
  const prods = await db.prepare(`SELECT id, meta FROM products WHERE ${visible()} ORDER BY rowid`).all();
  const offs = await db.prepare(`SELECT o.product_id, o.shop, o.price, o.ship, o.stock, o.eta, o.url, o.updated_at FROM offers o JOIN products p ON p.id = o.product_id WHERE ${visible('p.meta')} ORDER BY o.price`).all();
  const pts = await db.prepare(`SELECT t.product_id, t.price FROM price_points t JOIN products p ON p.id = t.product_id WHERE ${visible('p.meta')} ORDER BY t.day`).all();
  const withImg = new Set((await db.prepare('SELECT product_id FROM images').all()).results.map(r => r.product_id));
  return shapeRows(prods.results, offs.results, pts.results, withImg);
}

// ── Query-based catalog (no eager full load) ───────────────────────────────
// Helpers are pure (no seeding) — route handlers call seedCatalog first.
const ph = (arr) => arr.map(() => '?').join(',');

// D1 caps bound parameters at 100 per statement — every query over an
// unbounded id list must be paged or it 1101s once a category outgrows the
// cap (Audio crossed 124 heads on 2026-07-23 and killed its cat slice).
// size 45: the expand query binds the list twice. Per-product result order
// survives concatenation (a product's offers/points land in one chunk).
const chunked = async (ids, run, size = 45) => {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...await run(ids.slice(i, i + size)));
  return out;
};

// auto-discovered products carry meta.hidden = 1 until enriched — every
// user-facing query excludes them; direct id fetches (rowsFor) still work
// so ops/enrichment can inspect them
const visible = (col = 'meta') => `json_extract(${col}, '$.hidden') IS NOT 1`;

// Rows for a set of product ids, in the catalog.json row shape. expand=true
// (the PDP/watchlist case) resolves child ids (`head~combo`) to their head,
// includes every child of each head, and adds ≤4 same-category head
// neighbors so the PDP's "More in {cat}" has rows to show.
async function rowsFor(db, ids, { expand = true } = {}) {
  const heads = [...new Set(ids.map(id => id.includes('~') ? id.slice(0, id.indexOf('~')) : id))];
  if (!heads.length) return [];
  const prods = expand
    ? await chunked(heads, async c => (await db.prepare(`SELECT id, meta FROM products WHERE id IN (${ph(c)}) OR json_extract(meta, '$.family') IN (${ph(c)}) ORDER BY rowid`).bind(...c, ...c).all()).results)
    : (await chunked(heads, async c => (await db.prepare(`SELECT id, meta FROM products WHERE id IN (${ph(c)})`).bind(...c).all()).results))
        .sort((a, b) => heads.indexOf(a.id) - heads.indexOf(b.id)); // caller's order is the ranking (sort=drop)
  if (expand) {
    const cats = [...new Set(prods.filter(r => heads.includes(r.id)).map(r => JSON.parse(r.meta).cat).filter(Boolean))];
    for (const cat of cats) {
      const got = new Set(prods.map(r => r.id));
      // NOT IN can't be paged under the param cap — over-fetch by rowid
      // (≤ got.size rows can collide) and drop the ones already present
      const cand = (await db.prepare(
        `SELECT id, meta FROM products WHERE json_extract(meta, '$.cat') = ? AND json_extract(meta, '$.family') IS NULL AND ${visible()} ORDER BY rowid LIMIT ?`
      ).bind(cat, got.size + 4).all()).results;
      prods.push(...cand.filter(r => !got.has(r.id)).slice(0, 4));
    }
  }
  const all = prods.map(r => r.id);
  const offs = await chunked(all, async c => (await db.prepare(`SELECT product_id, shop, price, ship, stock, eta, url, updated_at FROM offers WHERE product_id IN (${ph(c)}) ORDER BY price`).bind(...c).all()).results);
  const pts = await chunked(all, async c => (await db.prepare(`SELECT product_id, price FROM price_points WHERE product_id IN (${ph(c)}) ORDER BY day`).bind(...c).all()).results);
  const withImg = new Set((await chunked(all, async c => (await db.prepare(`SELECT product_id FROM images WHERE product_id IN (${ph(c)})`).bind(...c).all()).results)).map(r => r.product_id));
  const rows = shapeRows(prods, offs, pts, withImg);
  // full spec sheets (Icecat-sized, ~100 rows) only ride detail fetches —
  // list queries stay lean; boot's Object.assign merge never wipes a
  // previously hydrated sheet with a lean row
  if (!expand) rows.forEach(r => delete r.specs);
  return rows;
}

// Broad candidate match for free-text search: LIKE over the whole meta JSON
// (name/brand/cat/kw all live there). Deliberately broader than the client's
// searchCatalog — the SPA re-filters exactly, MCP re-scores; never return
// these raw. Token semantics mirror the client: ≥2 chars, OR, '' ≠ 'a'
// (a query with no valid tokens matches nothing, an absent query everything).
// ponytail: sqlite lower() is ASCII-only, so an æ/ø/å token misses uppercase
// matches — FTS or a normalized search column when Norwegian queries suffer.
async function searchIds(db, q) {
  const toks = String(q).toLowerCase().split(/\s+/)
    .filter(t => t.length >= 2).slice(0, 8)
    .map(t => t.replace(/[\\%_]/g, c => '\\' + c));
  if (!toks.length) return [];
  const { results } = await db.prepare(
    `SELECT id FROM products WHERE json_extract(meta, '$.family') IS NULL AND ${visible()} AND (${toks.map(() => "lower(json_remove(meta, '$.specs')) LIKE ? ESCAPE '\\'").join(' OR ')}) LIMIT 100`
  ).bind(...toks.map(t => `%${t}%`)).all();
  return results.map(r => r.id);
}

// Heads ranked by drop% (1 - best/was). perCat keeps the top `limit` per
// category (browse) instead of just the global top (home sidecard).
// ponytail: full head scan per call, fine to ~2k heads; store a drop column
// when it isn't.
async function topDropIds(db, { limit = 4, perCat = false } = {}) {
  const { results } = await db.prepare(
    `SELECT p.id, json_extract(p.meta, '$.cat') AS cat FROM products p JOIN offers o ON o.product_id = p.id WHERE json_extract(p.meta, '$.family') IS NULL AND ${visible('p.meta')} AND json_extract(p.meta, '$.was') > 0 GROUP BY p.id ORDER BY 1.0 - MIN(o.price) * 1.0 / json_extract(p.meta, '$.was') DESC`
  ).all();
  if (!perCat) return results.slice(0, limit).map(r => r.id);
  const per = {};
  const ids = results.slice(0, limit).map(r => r.id);
  for (const r of results) if (r.cat && (per[r.cat] = (per[r.cat] || 0) + 1) <= limit) ids.push(r.id);
  return [...new Set(ids)];
}

// Global aggregates + per-category head counts — served as meta on every
// /api/products response so the UI can show real totals off a partial cache.
async function catMeta(db) {
  const products = (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE json_extract(meta, '$.family') IS NULL AND ${visible()}`).first()).n;
  const shops = (await db.prepare('SELECT COUNT(DISTINCT shop) AS n FROM offers').first()).n;
  const freshest = (await db.prepare('SELECT MAX(updated_at) AS t FROM offers').first()).t ?? null;
  const { results } = await db.prepare(`SELECT json_extract(meta, '$.cat') AS cat, COUNT(*) AS n FROM products WHERE json_extract(meta, '$.family') IS NULL AND ${visible()} GROUP BY 1`).all();
  // per-cat sub-category counts (facets.type) — Browse's type chips read
  // these off CATALOG.meta so they don't depend on which rows are hydrated
  const tr = (await db.prepare(`SELECT json_extract(meta, '$.cat') AS cat, json_extract(meta, '$.facets.type') AS t, COUNT(*) AS n FROM products WHERE json_extract(meta, '$.family') IS NULL AND ${visible()} AND json_extract(meta, '$.facets.type') IS NOT NULL GROUP BY 1, 2`).all()).results;
  const types = {};
  for (const r of tr) if (r.cat) (types[r.cat] ??= {})[r.t] = r.n;
  return { products, shops, freshest, icons: CATS, facets: FACETS, types, cats: Object.fromEntries(results.filter(r => r.cat).map(r => [r.cat, r.n])) };
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

async function meBody(db, user, hideAutobuy) {
  // hit = an alert fired for this watch and the price is still at/below the
  // target (rising back above re-arms the watch and clears the flag)
  const { results } = await db.prepare(
    'SELECT product_id AS id, target, paused, COALESCE(EXISTS(SELECT 1 FROM alerts a WHERE a.user_id = watches.user_id AND a.product_id = watches.product_id) AND target >= (SELECT MIN(price) FROM offers o WHERE o.product_id = watches.product_id AND o.stock = 1), 0) AS hit FROM watches WHERE user_id = ? ORDER BY rowid'
  ).bind(user.id).all(); // rowid = the order the client PUT them in
  // hideAutobuy (env.HIDE_AUTOBUY): the feature is invisible — no autobuy blob,
  // no purchase history in the me payload. The data export passes false: a
  // user's own data stays complete regardless of what the UI shows.
  return { user: { email: user.email, name: user.name, initials: initials(user.name), hasPassword: !!user.password_hash, createdAt: user.created_at ?? null }, watches: results, settings: user.settings ? JSON.parse(user.settings) : {}, ...(hideAutobuy ? {} : { autobuy: user.autobuy ? JSON.parse(user.autobuy) : null, purchases: await purchasesBody(db, user.id) }) };
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
  { name: 'get_product', description: 'Full detail for one product: every shop offer (price, shipping, stock, link) and recent price history. Products sold in variants (storage/colour) list them under `variants` — use a variant id with get_product, buy_now or watch_product for that exact configuration.', inputSchema: obj({ product_id: str('id from search_products') }, ['product_id']) },
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
  await seedCatalog(db);

  const brief = (p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.cat, best_price_nok: p.best, was_nok: p.was, drop_pct: p.drop, shops: p.shops, in_stock: p.stock });

  if (name === 'search_products') {
    const terms = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) throw new Error('query required');
    // 4e: variant children (meta.family) are configurations — search stays
    // head-only; get_product on the head lists them. searchIds is a broad
    // candidate match (LIKE over meta) — the scoring below stays authoritative,
    // its hay (name/brand/cat/icon) is a strict subset of meta.
    const cands = await rowsFor(db, await searchIds(db, a.query), { expand: false });
    const scored = cands
      .map(p => [terms.filter(t => `${p.name} ${p.brand ?? ''} ${p.cat ?? ''} ${p.icon ?? ''}`.toLowerCase().includes(t)).length, p])
      .filter(([s]) => s > 0)
      .sort((x, y) => y[0] - x[0]);
    if (!scored.length) return { results: [], hint: 'no matches — categories: ' + Object.keys((await catMeta(db)).cats).join(', ') };
    return { results: scored.slice(0, 8).map(([, p]) => brief(p)) };
  }

  if (name === 'get_product') {
    const all = await rowsFor(db, [String(a.product_id || '')]);
    const p = all.find(q => q.id === String(a.product_id || ''));
    if (!p) throw new Error('unknown product_id');
    const out = { ...brief(p), offers: p.offers, price_history_nok: p.history };
    // a head lists its variant children — their ids work with every tool
    const variants = all.filter(q => q.family === p.id).map(q => ({ id: q.id, variant: q.vlabel, best_price_nok: q.best }));
    if (variants.length) out.variants = variants;
    return out;
  }

  if (name === 'buy_now') {
    const pid = String(a.product_id || '');
    const prod = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(pid).first();
    if (!prod) throw new Error('unknown product_id');
    const offer = a.shop
      ? await db.prepare('SELECT shop, price, stock, url FROM offers WHERE product_id = ? AND shop = ?').bind(pid, String(a.shop)).first()
      : await db.prepare('SELECT shop, price, stock, url FROM offers WHERE product_id = ? AND stock = 1 ORDER BY price LIMIT 1').bind(pid).first();
    if (!offer) throw new Error(a.shop ? 'no offer from that shop' : 'no in-stock offer for this product');
    if (offer.stock !== 1) throw new Error(offer.stock === 2 ? `${offer.shop} stock is unknown` : `${offer.shop} is out of stock`);
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
    const { results } = await db.prepare('SELECT product_id, target, paused FROM watches WHERE user_id = ? ORDER BY rowid').bind(user.id).all();
    const byId = Object.fromEntries((await rowsFor(db, results.map(w => w.product_id))).map(p => [p.id, p]));
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

// env.HIDE_AUTOBUY: buy_now/list_purchases don't list, don't call, and no
// tool description or instruction text mentions buying
const HIDDEN_MCP_TOOLS = ['buy_now', 'list_purchases'];
const mcpToolList = (hide) => hide
  ? MCP_TOOLS.filter(t => !HIDDEN_MCP_TOOLS.includes(t.name)).map(t => ({ ...t, description: t.description.replace(', buy_now', '') }))
  : MCP_TOOLS;

async function mcp(request, db, hideAutobuy) {
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
    let instructions = authed
      ? `pricy.no — Norwegian price comparison. The user is already logged in as ${authed.email}; never ask for credentials. Use search_products, get_product, watch_product, and buy_now. All prices are NOK.`
      : 'pricy.no — Norwegian price comparison. Log in with the login tool (or signup to create an account) first; then search_products, get_product, watch_product, and buy_now. All prices are NOK.';
    if (hideAutobuy) instructions = instructions.replace(', and buy_now', '');
    return reply({ result: {
      protocolVersion: MCP_VERSIONS.includes(v) ? v : MCP_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'pricy.no', version: '0.1.0' },
      instructions,
    } }, { 'mcp-session-id': newToken() });
  }
  if (msg.method === 'ping') return reply({ result: {} });
  if (msg.method === 'tools/list') {
    // an authenticated client must not see login/signup at all — a listed
    // login tool reads as "ask the user for their password in chat"
    const authed = await sessionUser(db, sid);
    const tools = mcpToolList(hideAutobuy);
    return reply({ result: { tools: authed ? tools.filter(t => t.name !== 'login' && t.name !== 'signup') : tools } });
  }
  if (msg.method === 'tools/call') {
    try {
      const name = msg.params?.name;
      if (hideAutobuy && HIDDEN_MCP_TOOLS.includes(name)) throw new Error(`unknown tool: ${name}`);
      const out = await mcpTool(db, sid, name, msg.params?.arguments || {});
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
      return mcp(request, env.DB, !!env.HIDE_AUTOBUY);
    }
    if (url.pathname.startsWith('/.well-known/')) {
      return oauthWellKnown(url);
    }
    if (['/authorize', '/token', '/register'].includes(url.pathname)) {
      await ensureSchema(env.DB);
      return oauth(request, env.DB, url);
    }
    if (url.pathname.startsWith('/img/') && request.method === 'GET') {
      // onlyIf: browser revalidations (If-None-Match) come back body-less → 304
      const obj = await env.IMAGES?.get(`products/${decodeURIComponent(url.pathname.slice(5))}`, { onlyIf: request.headers });
      if (!obj) return new Response('not found', { status: 404 });
      const headers = { etag: obj.httpEtag, 'cache-control': 'public, max-age=86400' };
      if (!obj.body) return new Response(null, { status: 304, headers });
      return new Response(obj.body, { headers: { ...headers, 'content-type': obj.httpMetadata?.contentType || 'image/jpeg' } });
    }
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
    }
    const db = env.DB;
    await ensureSchema(db);
    const route = request.method + ' ' + url.pathname;

    if (route === 'GET /api/catalog.json') {
      // full dump — kept for ops/tools/debugging; the SPA uses /api/products.
      // ponytail: cap it when the catalog outgrows one response
      const products = await catalogBody(db);
      return json({ meta: await catMeta(db), products });
    }

    // Query-based catalog: the SPA's lazy cache fetches slices from here.
    // Precedence ids > q > cat > sort; no params = all heads.
    // ponytail: the no-param and cat cases are uncapped at current scale —
    // add limit+paging when the catalog outgrows one response
    if (route === 'GET /api/products') {
      await seedCatalog(db);
      const p = url.searchParams;
      const limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 4));
      let products;
      if (p.get('hidden') === '1') {
        // enrichment listing (tools/enrich.mjs): auto-discovered rows awaiting
        // a hand-written worker/extra.json entry. Not used by the SPA.
        const { results } = await db.prepare(`SELECT id FROM products WHERE json_extract(meta, '$.hidden') = 1 ORDER BY rowid LIMIT 200`).all();
        // 90-id chunks: D1 caps bound parameters at 100 per statement
        products = [];
        for (let i = 0; i < results.length; i += 90) {
          products.push(...await rowsFor(db, results.slice(i, i + 90).map(r => r.id), { expand: false }));
        }
      } else if (p.get('ids') != null) {
        const ids = p.get('ids').split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length > 100) return json({ error: 'too many ids (max 100)' }, 400);
        products = await rowsFor(db, ids);
      } else if (p.get('q') != null) {
        products = await rowsFor(db, await searchIds(db, p.get('q')), { expand: false });
      } else if (p.get('cat') != null) {
        const { results } = await db.prepare(`SELECT id FROM products WHERE json_extract(meta, '$.cat') = ? AND json_extract(meta, '$.family') IS NULL AND ${visible()}`).bind(p.get('cat')).all();
        products = await rowsFor(db, results.map(r => r.id), { expand: false });
      } else if (p.get('sort') === 'drop') {
        products = await rowsFor(db, await topDropIds(db, { limit, perCat: p.get('perCat') === '1' }), { expand: false });
      } else {
        products = (await catalogBody(db)).filter(x => !x.family); // all heads
        products.forEach(x => delete x.specs); // lean like every list query
      }
      return json({ meta: await catMeta(db), products });
    }

    // 4d interim: the laptop crawler (tools/crawl.mjs) pushes ingest()-shaped
    // rows here, bearer-gated on the INGEST_TOKEN secret
    if (route === 'POST /api/ingest') {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      const rows = await request.json().catch(() => null);
      const bad = !Array.isArray(rows) || !rows.length || rows.length > 500 || rows.some(r =>
        !r || typeof r.product_id !== 'string' || typeof r.shop !== 'string' || !r.shop.trim()
        || !Number.isInteger(r.price) || r.price <= 0 || r.price > 10_000_000
        || (r.ship != null && typeof r.ship !== 'string') || (r.eta != null && typeof r.eta !== 'string')
        || (r.url != null && typeof r.url !== 'string') || (r.image != null && typeof r.image !== 'string')
        || (r.name != null && typeof r.name !== 'string') || (r.brand != null && typeof r.brand !== 'string')
        || (r.srcCat != null && typeof r.srcCat !== 'string'));
      if (bad) return json({ error: 'bad rows' }, 400);
      await seedCatalog(db);
      const known = new Set((await db.prepare('SELECT id FROM products').all()).results.map(p => p.id));
      // aliased EANs resolve inside ingest(); their derived ids are known here
      for (const r of (await db.prepare('SELECT ean FROM eans').all()).results) known.add('ean-' + r.ean);
      // discovery rows (ean-derived id + name) pass through — ingest creates them hidden
      const unknown = [...new Set(rows.filter(r => !known.has(r.product_id) && !autoAdd(r)).map(r => r.product_id))];
      if (unknown.length) return json({ error: 'unknown product_id', ids: unknown }, 400);
      await ingest(db, rows, env);
      return json({ ok: true, ingested: rows.length });
    }

    // Admin surface (OPEN-CATALOG-PLAN A3, bearer = INGEST_TOKEN, same trust
    // as /api/ingest): enrichment/triage writes land in D1 directly — no
    // extra.json row, no deploy. tools/enrich.mjs and tools/group.mjs print
    // ready-to-run curls against these.
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/admin/products/')) {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      await seedCatalog(db);
      const id = decodeURIComponent(url.pathname.slice('/api/admin/products/'.length));
      const cur = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(id).first();
      if (!cur) return json({ error: 'unknown product' }, 404);
      const patch = await request.json().catch(() => null);
      const STR = ['name', 'brand', 'cat', 'icon', 'kw', 'family', 'vlabel'];
      const ok = patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length
        && Object.entries(patch).every(([k, v]) =>
          (v === null && k !== 'name') // null deletes a key; a product always keeps a name
          || (STR.includes(k) && typeof v === 'string' && v.trim())
          || (k === 'was' && Number.isInteger(v) && v > 0)
          || ((k === 'hidden' || k === 'auto') && v === 1)
          || ((k === 'variants' || k === 'facets' || k === 'specs') && typeof v === 'object' && !Array.isArray(v)));
      if (!ok) return json({ error: 'bad patch' }, 400);
      if (typeof patch.cat === 'string' && !CATS[patch.cat]) return json({ error: 'unknown cat', cats: Object.keys(CATS).sort() }, 400);
      const meta = JSON.parse(cur.meta);
      for (const [k, v] of Object.entries(patch)) v === null ? delete meta[k] : meta[k] = typeof v === 'string' ? v.trim() : v;
      await db.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), id).run();
      return json({ ok: true, id, meta });
    }

    // Map an EAN to a product (variant/duplicate triage). Migrates the
    // orphaned auto-discovered `ean-<key>` row's collected offers/history/
    // watches/purchases to the target instead of throwing them away, then
    // deletes the orphan. Pass meta {name, family, vlabel, …} to create the
    // target on the spot (group.mjs re-homing to a new variant child).
    if (route === 'POST /api/admin/alias') {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      await seedCatalog(db);
      const b = await request.json().catch(() => null);
      const key = eanKey(b?.ean);
      const target = typeof b?.product_id === 'string' ? b.product_id.trim() : '';
      if (!key || !target) return json({ error: 'need ean and product_id' }, 400);
      if (!await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(target).first()) {
        if (typeof b.meta?.name !== 'string' || !b.meta.name.trim()) return json({ error: 'unknown product_id (pass meta.name to create it)' }, 404);
        await db.prepare('INSERT INTO products (id, meta) VALUES (?, ?)').bind(target, JSON.stringify({ ...b.meta, ean: key })).run();
      }
      await db.prepare('INSERT INTO eans (ean, product_id) VALUES (?, ?) ON CONFLICT(ean) DO UPDATE SET product_id = excluded.product_id').bind(key, target).run();
      const orphan = `ean-${key}`;
      let migrated = false;
      if (orphan !== target && await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(orphan).first()) {
        migrated = true;
        await db.batch([
          // OR IGNORE: where the target already has the shop/day/user row,
          // the target's wins and the orphan's leftover is deleted below
          db.prepare('UPDATE OR IGNORE offers SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE OR IGNORE price_points SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE OR IGNORE watches SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE purchases SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('DELETE FROM offers WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM price_points WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM watches WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM images WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM products WHERE id = ?').bind(orphan),
        ]);
        // the image re-fetches under the target id on the next ingest
        try { await env.IMAGES?.delete(`products/${orphan}`); } catch {}
      }
      return json({ ok: true, ean: key, product_id: target, migrated });
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
        return json(await meBody(db, user, !!env.HIDE_AUTOBUY), 200, { 'set-cookie': await startSession(db, user.id) });
      }

      const user = await db.prepare('SELECT id, email, name, password_hash, settings, autobuy, created_at FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'no account for this email' }, 401);
      if (!password) return json({ error: 'enter your password' }, 400);
      if (!user.password_hash) return json({ error: 'this account has no password — use magic link or BankID' }, 401);
      if (!(await verifyPassword(password, user.password_hash))) return json({ error: 'incorrect password' }, 401);
      return json(await meBody(db, user, !!env.HIDE_AUTOBUY), 200, { 'set-cookie': await startSession(db, user.id) });
    }

    const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
    const user = await sessionUser(db, token);

    if (route === 'GET /api/me') {
      return user ? json(await meBody(db, user, !!env.HIDE_AUTOBUY)) : json({ error: 'unauthenticated' }, 401);
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
      if (env.HIDE_AUTOBUY) return json({ error: 'not found' }, 404);
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
      await seedCatalog(db);
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
      if (env.HIDE_AUTOBUY) return json({ error: 'not found' }, 404);
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
    await seedCatalog(db);
    const rows = await collectRows(env);
    if (rows.length) await ingest(db, rows, env);
  },
};
