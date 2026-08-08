// Pricy API (Phase 4b/4c): magic-link auth, HttpOnly session cookie, /api/me,
// persisted watchlist, and the dynamic catalog (products/offers/price_points
// on D1, seeded from the build-generated seed.json) — /api/catalog.json is a
// Worker route now, no static file shadows it.

import seed from './seed.json' with { type: 'json' };
import eansFile from './eans.json' with { type: 'json' };
import FACETS from './facets.json' with { type: 'json' }; // facet registry: { rulesetId: [facet defs] } — served via catMeta, drives the Results filter UI; keys are facet RULESET ids since gpc-strict (gpcno.json facetKeys maps GPC codes onto them)
import SHIPPING from './shipping.json' with { type: 'json' }; // per-shop shipping fallback: { shop: { flat, freeOver? } } — curated from shop terms pages, never guessed (plans/shipping-totals.md). Offer-level ship strings win; measured 2026-08-03 they cover 0.3% of offers, so this registry is the real source.
import { deriveFacets } from './facetrules.js'; // facet VALUES read off the product name — most rows have no other data (shapeRows)
import { collectRows, BROWSER_UA, eanKey } from './sources.js';
import { sendPush } from './push.js';
import GPC from './gpc.json' with { type: 'json' }; // condensed GS1 GPC taxonomy (tools/gpc-build.mjs) — segs/fams/classes/bricks, the ONLY category vocabulary (gpc-strict)
import NO from './gpcno.json' with { type: 'json' }; // curated Norwegian overlay: names/icons/syn per GPC code, browse dept tiles, facetKeys (GPC code → facet ruleset id)
import { resolveGtins, RESOLVER_SOURCE } from './gpc-resolver.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT, settings TEXT, autobuy TEXT, lists TEXT, created_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS watches (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, target INTEGER, paused INTEGER NOT NULL DEFAULT 0, inclShip INTEGER, PRIMARY KEY (user_id, product_id))',
  'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, meta TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS offers (product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, ship TEXT, stock INTEGER NOT NULL DEFAULT 1, eta TEXT, url TEXT, updated_at INTEGER, PRIMARY KEY (product_id, shop))',
  'CREATE TABLE IF NOT EXISTS price_points (product_id TEXT NOT NULL, day TEXT NOT NULL, price INTEGER NOT NULL, PRIMARY KEY (product_id, day))',
  // per-shop dailies for the PDP's "Price at <shop>" chart line — real
  // observations only, never synthesized (the prototype's genShopHist is
  // demo-only). Accumulates from first deploy; rows before that don't exist.
  'CREATE TABLE IF NOT EXISTS shop_prices (product_id TEXT NOT NULL, shop TEXT NOT NULL, day TEXT NOT NULL, price INTEGER NOT NULL, PRIMARY KEY (product_id, shop, day))',
  'CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT NOT NULL, price INTEGER NOT NULL, prev_price INTEGER, target INTEGER NOT NULL, created_at INTEGER NOT NULL, delivered_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, shop TEXT, reason TEXT NOT NULL, text TEXT, created_at INTEGER NOT NULL)',
  // List sharing (plans/list-sharing-backend.md): one active share token per
  // (owner, list) — reissue replaces. Members and bought-marks live here, NOT
  // in the owner's users.lists blob, so the owner's payload physically cannot
  // carry who-bought-what on a gift list.
  'CREATE TABLE IF NOT EXISTS list_shares (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, list_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS list_members (owner_id INTEGER NOT NULL, list_id TEXT NOT NULL, user_id INTEGER NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (owner_id, list_id, user_id))',
  'CREATE TABLE IF NOT EXISTS list_bought (owner_id INTEGER NOT NULL, list_id TEXT NOT NULL, product_id TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (owner_id, list_id, product_id))',
  // UGC reviews (plans/folkedommen-reviews.md): product_id XOR shop targets —
  // the shop column is reserved for shop-rating v2, no endpoint accepts it yet
  // (buy_shop is where the REVIEWER bought it, free text, never our registry).
  // One review per (user, target) via the partial unique indexes; hidden is
  // the moderation switch (admin PATCH, same bearer as product triage).
  // `claims` is upstream's own 'ynu' encoding, in CLAIM_KEYS order — a 3-char
  // string needs no parse. `rating` is dead since Folkedommen (no numbers
  // anywhere in the UI); it stays NOT NULL and is written 0.
  // ponytail: dead rating column kept — drop it if the table is ever rebuilt
  'CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT, shop TEXT, rating INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, claims TEXT, plus TEXT, minus TEXT, buy_shop TEXT, paid INTEGER, show_paid INTEGER NOT NULL DEFAULT 0, updated_at INTEGER)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_prod ON reviews(user_id, product_id) WHERE product_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(user_id, shop) WHERE shop IS NOT NULL',
  'CREATE TABLE IF NOT EXISTS review_votes (review_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (review_id, user_id))',
  // Web Push subscriptions (one row per browser/device; endpoint is the
  // push service's unique URL). Pruned when the service says 404/410.
  'CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS seed_meta (id INTEGER PRIMARY KEY, hash TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS images (product_id TEXT PRIMARY KEY, src TEXT NOT NULL, fetched_at INTEGER NOT NULL)',
  // EAN → product routing (OPEN-CATALOG-PLAN A1): bootstrapped from
  // worker/eans.json, extended at runtime via POST /api/admin/alias.
  // ean is eanKey-normalized (digits, no leading zeros).
  'CREATE TABLE IF NOT EXISTS eans (ean TEXT PRIMARY KEY, product_id TEXT NOT NULL)',
  // gtin → GPC brick, written only by worker/gpc-resolver.js drains
  // (resolveGpcQueue). status: queued | resolved | none ('none' = the source
  // answered and knows no brick — the future VbG branch re-queues these).
  // These FIVE columns are the licensing boundary (see gpc-resolver.js):
  // never store any other field a resolver returns.
  'CREATE TABLE IF NOT EXISTS gpc (gtin TEXT PRIMARY KEY, brick TEXT, status TEXT NOT NULL DEFAULT \'queued\', source TEXT, checked_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_gpc_status ON gpc(status)',
  // Pre-folded search text, one row per product, maintained by triggers (see
  // SEARCH_SQL). searchIds used to build the diacritic fold — 18 nested
  // replace() calls — per row per token, at query time. Measured on prod D1
  // over the 14k-row scan: raw `meta LIKE` 15 ms, +json_remove 21, +lower 25,
  // +the folds 85-100. The scan was never the problem; the folds were.
  'CREATE TABLE IF NOT EXISTS search_index (product_id TEXT PRIMARY KEY, sk TEXT NOT NULL, nm TEXT NOT NULL, br TEXT NOT NULL)',
  // Expression index on the BRICK (gpc-strict — replaces idx_products_cat).
  // Every node= listing filters on json_extract(meta,'$.brick'), which is not
  // a column, so without this SQLite scans every product to find one brick's
  // rows. Same rule as the old cat index: SQLite matches an expression index
  // only when the query spells the expression identically — keep this and
  // listIds'/rowsFor's WHEREs in sync (EXPLAIN-guarded in test/api.test.js).
  'DROP INDEX IF EXISTS idx_products_cat',
  `CREATE INDEX IF NOT EXISTS idx_products_brick ON products(json_extract(meta,'$.brick'))`,
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
    await db.prepare('ALTER TABLE users ADD COLUMN lists TEXT').run().catch(() => {});
    // honest metrics: signup date for "Member since" (pre-existing rows stay NULL)
    await db.prepare('ALTER TABLE users ADD COLUMN created_at INTEGER').run().catch(() => {});
    // 4d: real-source offers carry a deep link and a freshness stamp
    await db.prepare('ALTER TABLE offers ADD COLUMN url TEXT').run().catch(() => {});
    await db.prepare('ALTER TABLE offers ADD COLUMN updated_at INTEGER').run().catch(() => {});
    await db.prepare('ALTER TABLE watches ADD COLUMN inclShip INTEGER').run().catch(() => {});
    // Folkedommen: stars became three claims + traits + what people paid
    for (const col of ['claims TEXT', 'plus TEXT', 'minus TEXT', 'buy_shop TEXT', 'paid INTEGER',
      'show_paid INTEGER NOT NULL DEFAULT 0', 'updated_at INTEGER']) {
      await db.prepare(`ALTER TABLE reviews ADD COLUMN ${col}`).run().catch(() => {});
    }
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
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id, email, name, password_hash, settings, autobuy, lists, created_at'
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
    'SELECT u.id, u.email, u.name, u.password_hash, u.settings, u.autobuy, u.lists, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
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
// Catalog version: seed_meta row 2 is a counter every write to products/offers
// bumps. catMeta's cache is keyed on it, so an ingest in ONE isolate
// invalidates the cache in ALL of them — the reason this isn't a guessed TTL
// (a stale meta.cats shows up as wrong product counts on Browse).
// Text column, so CAST both ways; starts at 1 on the first write.
const bumpVer = (db) => db.prepare(
  `INSERT INTO seed_meta (id, hash) VALUES (2, '1') ON CONFLICT(id) DO UPDATE SET hash = CAST(CAST(hash AS INTEGER) + 1 AS TEXT)`
);

let seedHash;
// returns the catalog version for catMeta's cache, or '' meaning "don't cache
// this request" (we just wrote, so the value we read is already behind)
async function seedCatalog(db) {
  // hash covers eans.json too: an eans-only change must re-run seeding so the
  // new file rows land in the eans table (OR IGNORE — runtime aliases win)
  seedHash ??= await sha(JSON.stringify(seed) + JSON.stringify(eansFile));
  searchVer ??= await sha(SEARCH_SQL.join('|'));
  // one round trip for both markers: row 1 pins the seed hash, row 2 the
  // catalog version. This SELECT is on every request already — reading the
  // version here is what makes a catMeta cache hit cost nothing.
  const mark = Object.fromEntries((await db.prepare('SELECT id, hash FROM seed_meta WHERE id <= 5').all()).results.map(r => [r.id, String(r.hash)]));
  // Row 3 pins the search-index build. Mismatched (fresh db, or FOLD/searchCols
  // edited) = install the triggers and refold every row, once, globally. Must
  // run BEFORE seeding below, or the seed's inserts predate the triggers.
  // Concurrent requests can both do it; the upsert makes that harmless.
  if (mark[3] !== searchVer) {
    for (const sql of SEARCH_SQL) await db.prepare(sql).run();
    await db.prepare('INSERT INTO seed_meta (id, hash) VALUES (3, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash').bind(searchVer).run();
  }
  // gpc-strict one-shot (marker row 5): strip the regex-era category layer —
  // stored cat/icon, the dead demo meta.brick rows (0 overlap with any real
  // registry — leaving them would put products in WRONG GPC categories),
  // cat-era man pins, and kw (it baked cat tokens into the search blob).
  // AFTER the search-trigger block, so the meta rewrite refolds every search
  // row. On a populated prod db this is one UPDATE over every row — pre-run
  // the same statement (and the marker insert) via `wrangler d1 execute`
  // before deploying if cold-start CPU is a concern; the marker makes the
  // in-Worker copy a no-op. seed_meta row 4 (dept slice counts) is dead and
  // simply never read again.
  if (mark[5] !== 'gpc1') {
    await db.prepare(`UPDATE products SET meta = json_remove(meta, '$.cat', '$.icon', '$.brick', '$.man', '$.kw')`).run();
    await db.prepare("INSERT INTO seed_meta (id, hash) VALUES (5, 'gpc1') ON CONFLICT(id) DO UPDATE SET hash = excluded.hash").run();
  }
  // No version row yet = a db seeded before versioning existed (prod, on the
  // deploy that adds this) and not written since. Fall back to the seed hash:
  // stable, so the cache still works, and the first write replaces it with a
  // counter that can never collide with a sha. Cheaper than writing the row
  // from a read path.
  if (mark[1] === seedHash) return mark[2] ?? seedHash;
  const known = new Set((await db.prepare('SELECT id FROM products').all()).results.map(r => r.id));
  // Demo offers/history are for virgin DBs only (local dev, tests): once a
  // real source has ever stamped an offer (updated_at set — seeding never
  // sets it), new rows start honest with "No offers yet" instead of fake
  // prices/links. Prod's original demo data was purged 2026-07-22.
  const virgin = !(await db.prepare('SELECT 1 FROM offers WHERE updated_at IS NOT NULL LIMIT 1').first());
  const stmts = []; // OR IGNORE / upserts: two racing requests must not fail
  for (const [pid, list] of Object.entries(eansFile)) {
    for (const e of list) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO eans (ean, product_id) VALUES (?, ?)').bind(eanKey(e), pid));
      // every known GTIN queues for brick resolution (OR IGNORE — answered rows keep their answer)
      stmts.push(db.prepare("INSERT OR IGNORE INTO gpc (gtin, status) VALUES (?, 'queued')").bind(eanKey(e)));
    }
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
  stmts.push(bumpVer(db));
  await db.batch(stmts);
  return '';
}

// per-product best in-stock offer — the alert hook reads it after every
// ingest; AUTOBUY-PLAN AB-1's trigger engine reuses this from the same spot
async function bestOffer(db, productId) {
  return db.prepare('SELECT shop, price, ship FROM offers WHERE product_id = ? AND stock = 1 ORDER BY price LIMIT 1').bind(productId).first();
}

// Cheapest shipping-INCLUSIVE in-stock offer, for "Inkluder frakt" watches.
// Unknown shipping counts as the item price (sc ?? 0): a watch on a shop we
// can't price shipping for still fires on the item price rather than never.
async function bestTotalOffer(db, productId) {
  const { results } = await db.prepare('SELECT shop, price, ship FROM offers WHERE product_id = ? AND stock = 1').bind(productId).all();
  let bo = null;
  for (const o of results) {
    const t = o.price + (shipCost(o.shop, o.price, o.ship) ?? 0);
    if (!bo || t < bo.total) bo = { shop: o.shop, price: o.price, total: t };
  }
  return bo;
}

// stock column: 0 = out, 1 = in, 2 = never checked (catalogBody omits the
// key so the UI's StockBadge shows "Unknown"). NOT NULL stays — 2 avoids a
// prod table rebuild that allowing NULL would need.
const stockVal = (s) => s == null || s === 2 ? 2 : s ? 1 : 0;

// a row for a product we don't have yet, carrying enough identity to create it:
// an EAN-derived id, or (shops that publish no gtin) the brand+name slug
// sources.js slugId() derives — see the note there on why both exist
const autoAdd = (r) => /^(ean-\d+|p-[a-z0-9-]+)$/.test(r.product_id) && typeof r.name === 'string' && !!r.name.trim();

// Auto-promotion bits (OPEN-CATALOG-PLAN B3): CATS (cats.json) gates valid
// categories + default icons, and kw = distinct name/brand/cat tokens.
// JUNK_RE blocks only the NON-PRODUCTS a full-catalog sitemap crawl picks up:
// shops sell handling fees, gift cards and freight as priced "products".
// Accessory names are NOT blocked anymore (2026-08-01): they promote and
// facetrules' ACC pass types them `Accessories` — the old accessory
// blocklist was hiding every English "Long Sleeve" shirt and the Marvel
// comic "Cable" along with the phone cases.
// Deliberately NOT \b-anchored: Norwegian compounds glue the words together
// ("Håndteringsavgift", "Fraktkostnad"), so \bavgift\b misses every real
// occurrence. Keep these terms narrow for the same reason — "ekspedisjon"
// was in here until it ate a LEGO "ørkenekspedisjon"; the fee sense of it
// is "ekspedisjonsgebyr", which `gebyr` already covers.
const JUNK_RE = /avgift|gebyr|gavekort|frakt|service ?fee|håndtering/i;
const kwOf = (...parts) => [...new Set(parts.join(' ').toLowerCase().match(/[\p{L}\d]+/gu) || [])].filter(t => t.length > 1).join(' ');

// ── GPC taxonomy helpers (gpc-strict) ──────────────────────────────────────
// A product's category IS its 8-digit GPC brick (meta.brick), written only by
// the resolver (worker/gpc-resolver.js) or an admin pin — never derived from
// names or breadcrumbs. Everything display-shaped resolves at read time from
// the condensed taxonomy (worker/gpc.json) + Norwegian overlay
// (worker/gpcno.json). GPC codes are NOT prefix-hierarchical: every rollup
// walks parent pointers through the taxonomy map.
const gpcParent = (c) => GPC.bricks[c]?.[1] ?? GPC.classes[c]?.[1] ?? GPC.fams[c]?.[1];
const gpcTitle = (c) => GPC.bricks[c]?.[0] ?? GPC.classes[c]?.[0] ?? GPC.fams[c]?.[0] ?? GPC.segs[c];
const gpcName = (c) => NO.names[c]?.name ?? gpcTitle(c);
// a row's display `cat` is its SEGMENT's display name — coarse on purpose:
// it is what row badges, client cat pools (p.cat === cat), CATEGORIES and
// compare grouping all key on, and the segment level is the one that stays
// stable across the 5,318-brick tail. Fine labels live on brick pages.
const gpcSegName = (brick) => { let c = brick, s = brick; while ((c = gpcParent(c))) s = c; return gpcName(s); };
// display icon: the code's own overlay entry, else its nearest curated
// ancestor's, else the generic tag
const gpcIcon = (c) => { for (let x = c; x; x = gpcParent(x)) if (NO.names[x]?.icon) return NO.names[x].icon; return 'tag'; };
// "Segment › Family › Class" display trail for a brick (partial for higher levels)
const gpcPath = (c) => { const t = []; for (let x = gpcParent(c); x; x = gpcParent(x)) t.unshift(gpcTitle(x)); return t.join(' \u203a ') || undefined; };
// facet RULESET id for any GPC code: nearest facetKeys mapping walking up
// brick → class → family → segment (worker/gpcno.json). The ids are
// facets.json keys; a code with no mapping gets no facet rail.
const facetKeyOf = (code) => { for (let c = code; c; c = gpcParent(c)) if (NO.facetKeys[c]) return NO.facetKeys[c]; return undefined; };
// Expand a node= param (one or more GPC codes, comma-joined, any level) to
// the set of STOCKED bricks it covers. `stocked` is the brick histogram's
// keys — expansion via stocked-only keeps IN lists proportional to the
// catalog, not to the taxonomy's 5,318 bricks.
function bricksUnder(node, stocked) {
  const out = new Set();
  for (const code of String(node).split(',').map(c => c.trim()).filter(Boolean)) {
    if (GPC.bricks[code]) { out.add(code); continue; }
    for (const b of stocked) { for (let c = gpcParent(b); c; c = gpcParent(c)) if (c === code) { out.add(b); break; } }
  }
  return [...out];
}

async function ingest(db, rows, env) {
  // gpc-strict: every GTIN that enters the system queues for brick resolution
  // (OR IGNORE — answered rows keep their answer). Collected off the RAW rows
  // so `ean-*` ids count before the alias remap rewrites them.
  const gtins = new Set();
  for (const r of rows) {
    const m = /^ean-(\d+)$/.exec(r.product_id);
    if (m) gtins.add(m[1]);
    const k = eanKey(r.ean);
    if (k) gtins.add(k);
  }
  if (gtins.size) await db.batch([...gtins].map(g => db.prepare("INSERT OR IGNORE INTO gpc (gtin, status) VALUES (?, 'queued')").bind(g)));
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
  // Everything ingest needs to know about existing products, fetched BY THE
  // BATCH'S OWN IDS — existence (`known`), the meta blob (`metaOf`, promotion
  // and re-classification read it) and the hidden flag, in one round trip.
  //
  // This used to be `SELECT id, meta, json_extract(meta,'$.hidden') FROM
  // products` — the WHOLE table, on EVERY chunk. It only parsed the batch's
  // share of the blobs, but D1 still transferred all of them: ~5 MB at 22k
  // products. Measured in process (2026-07-26) that cost ~55 ms of CPU per
  // chunk **flat in chunk size** — 50 rows cost the same as 500 — which is what
  // put 12 of a 29-chunk crawl over the free plan's CPU ceiling and silently
  // dropped 5,700 rows. A fixed per-chunk cost is immune to smaller chunks and
  // to running them in parallel (the limit is per invocation): the only fix is
  // not to read what the chunk does not need. Every use of `known` and
  // `stillHidden` below is a lookup of a row that IS in the batch, so nothing
  // outside it was ever needed.
  const wanted = [...new Set(rows.map(r => r.product_id))];
  const slices = [];
  // 100 is D1's bound-parameter cap; one db.batch() is one round trip
  for (let i = 0; i < wanted.length; i += 100) slices.push(wanted.slice(i, i + 100));
  const metaOf = {};
  const stillHidden = new Set();
  if (slices.length) {
    for (const res of await db.batch(slices.map(s =>
      db.prepare(`SELECT id, meta FROM products WHERE id IN (${s.map(() => '?').join(',')})`).bind(...s)))) {
      for (const p of res.results) {
        const m = JSON.parse(p.meta);
        metaOf[p.id] = m;
        if (m.hidden === 1) stillHidden.add(p.id);
      }
    }
  }
  const known = new Set(Object.keys(metaOf));
  const creates = {};
  for (const r of rows) {
    if (known.has(r.product_id) || !autoAdd(r)) continue;
    const ean = r.product_id.startsWith('ean-') ? r.product_id.slice(4) : eanKey(r.ean) || null;
    creates[r.product_id] ??= { name: r.name.trim(), ...(r.brand ? { brand: String(r.brand) } : {}), ...(r.srcCat ? { srcCat: String(r.srcCat) } : {}), ...(ean ? { ean } : {}), hidden: 1 };
    stillHidden.add(r.product_id);
    metaOf[r.product_id] = creates[r.product_id];
  }
  rows = rows.filter(r => known.has(r.product_id) || creates[r.product_id]);
  if (Object.keys(creates).length) {
    await db.batch(Object.entries(creates).map(([id, meta]) =>
      db.prepare('INSERT OR IGNORE INTO products (id, meta) VALUES (?, ?)').bind(id, JSON.stringify(meta))));
  }
  // GTIN capture (gpc-strict): a scraped row carrying an ean teaches a known
  // product (typically a p-<slug> row from a gtin-less first crawl) its GTIN —
  // an eans routing row (OR IGNORE: curated aliases win) plus meta.ean. The
  // in-memory meta is updated too so a promotion write this batch keeps it;
  // the SQL guard keeps a concurrent writer from clobbering a stored value.
  const learn = {};
  for (const r of rows) {
    const k = eanKey(r.ean);
    const meta = metaOf[r.product_id];
    if (!k || !meta || meta.ean) continue;
    meta.ean = k;
    learn[r.product_id] = k;
  }
  if (Object.keys(learn).length) {
    await db.batch(Object.entries(learn).flatMap(([id, k]) => [
      db.prepare('INSERT OR IGNORE INTO eans (ean, product_id) VALUES (?, ?)').bind(k, id),
      db.prepare(`UPDATE products SET meta = json_patch(meta, ?) WHERE id = ? AND json_extract(meta, '$.ean') IS NULL`).bind(JSON.stringify({ ean: k }), id),
    ]));
  }
  // Promotion (gpc-strict): visibility no longer waits for a category — the
  // brick comes from the resolver (or an admin pin), and until it does the
  // row sits honestly in Ukategorisert. The junk gate (fees/gift cards/
  // freight sold as "products") is the only content gate. Unchanged from the
  // regex era: meta.man outranks everything, auto + still-hidden = a human
  // demoted it (never re-promote), live + !auto = seeded/hand-written rows
  // are not ours to touch, and variant children never promote on their own.
  // srcCat is still captured — it feeds deriveFacets and ops diagnostics —
  // but it must NEVER influence categorization; that is the whole point.
  const promoted = {};
  for (const r of rows) {
    const meta = metaOf[r.product_id];
    if (!meta || meta.family) continue;
    const hidden = stillHidden.has(r.product_id);
    if (meta.man || (meta.auto ? hidden : !hidden)) continue;
    if (!meta.name || JUNK_RE.test(meta.name)) continue;
    const brand = meta.brand ?? (r.brand ? String(r.brand) : null) ?? 'Unspecified';
    const srcCat = r.srcCat ?? meta.srcCat;
    // already live with an unchanged breadcrumb — don't rewrite 14k rows per crawl
    if (!hidden && (srcCat == null || meta.srcCat === srcCat)) continue;
    const { hidden: _, ...rest } = meta;
    promoted[r.product_id] = { ...rest, brand, ...(srcCat ? { srcCat } : {}), kw: kwOf(meta.name, brand), auto: 1 };
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
      bestTotal: (await bestTotalOffer(db, pid))?.total ?? null,
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
    ...rows.map(r => db.prepare(
      'INSERT INTO shop_prices (product_id, shop, day, price) VALUES (?, ?, ?, ?) ON CONFLICT(product_id, shop, day) DO UPDATE SET price = MIN(price, excluded.price)'
    ).bind(r.product_id, r.shop, today, r.price)),
  ];
  // ponytail: 200-statement chunks — one giant batch trips D1 limits on a
  // full-feed run; the upserts are idempotent so losing cross-chunk atomicity is fine
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  // gpc-strict: gtins in this batch that ALREADY resolved get their brick
  // stamped now — a product created after its gtin resolved must not wait
  // for a resolver pass that will never re-answer it.
  if (gtins.size) {
    const done = await chunked([...gtins], async c => (await db.prepare(
      `SELECT gtin, brick FROM gpc WHERE status = 'resolved' AND gtin IN (${c.map(() => '?').join(',')})`).bind(...c).all()).results);
    await stampBricks(db, Object.fromEntries(done.map(r => [r.gtin, r.brick])));
  }
  // one bump covers this whole ingest — creates, promotions, learns, stamps, offers, points
  await bumpVer(db).run();
  await fireAlerts(db, env, before);
  // hidden rows skip images — no UI shows them; the URL is queued on the
  // first ingest after enrichment unhides the product
  await queueImages(db, rows.filter(r => !stillHidden.has(r.product_id))).catch(e => console.error(`image queue failed: ${e.message}`));
}

// gpc-strict: stamp meta.brick on the products owning these gtins.
// Routing: the eans table maps a gtin to its product (else the derived
// ean-<gtin> id). A variant child (meta.family) forwards to its HEAD —
// children never carry brick. meta.man (admin pin) blocks the resolver;
// a no-op stamp is skipped. Returns how many rows changed; the CALLER
// bumps the catalog version (ingest's bump covers its own call).
async function stampBricks(db, valid) {
  const gtins = Object.keys(valid);
  if (!gtins.length) return 0;
  const routed = new Map(await chunked(gtins, async c => (await db.prepare(
    `SELECT ean, product_id FROM eans WHERE ean IN (${c.map(() => '?').join(',')})`).bind(...c).all()).results.map(r => [r.ean, r.product_id])));
  const brickOf = {};
  for (const g of gtins) brickOf[routed.get(g) ?? `ean-${g}`] = String(valid[g]);
  // two meta fetches: the routed ids, then any heads the family walk adds
  const metas = {};
  const fetchMetas = async (ids) => {
    const need = ids.filter(id => !(id in metas));
    for (const r of await chunked(need, async c => (await db.prepare(
      `SELECT id, meta FROM products WHERE id IN (${c.map(() => '?').join(',')})`).bind(...c).all()).results)) metas[r.id] = JSON.parse(r.meta);
    for (const id of need) metas[id] ??= null; // unknown id — nothing to stamp
  };
  await fetchMetas(Object.keys(brickOf));
  for (const [id, brick] of Object.entries(brickOf)) {
    const head = metas[id]?.family;
    if (head) { delete brickOf[id]; brickOf[head] ??= brick; }
  }
  await fetchMetas(Object.keys(brickOf));
  const writes = Object.entries(brickOf).filter(([id, brick]) => {
    const m = metas[id];
    return m && !m.man && m.brick !== brick;
  });
  if (writes.length) {
    await db.batch(writes.map(([id, brick]) =>
      db.prepare('UPDATE products SET meta = json_patch(meta, ?) WHERE id = ?').bind(JSON.stringify({ brick }), id)));
  }
  return writes.length;
}

// Drain the gtin→brick queue through the resolver seam (worker/gpc-resolver.js)
// and stamp the owning heads. Hourly from scheduled(); POST /api/admin/gpc is
// the bearer fast lane after a big crawl. A resolver answer outside the
// shipped taxonomy records as 'none' — never stamp a code we can't display.
async function resolveGpcQueue(db, env, n = 200) {
  const queued = (await db.prepare("SELECT gtin FROM gpc WHERE status = 'queued' LIMIT ?").bind(n).all()).results.map(r => r.gtin);
  let resolved = 0, stamped = 0;
  if (queued.length) {
    const answers = await resolveGtins(queued, env);
    const now = Date.now();
    const valid = {};
    await db.batch(queued.map(g => {
      const raw = answers.get(g);
      const b = raw != null && GPC.bricks[String(raw)] ? String(raw) : null;
      if (b) { valid[g] = b; resolved++; }
      return db.prepare('UPDATE gpc SET brick = ?, status = ?, source = ?, checked_at = ? WHERE gtin = ?')
        .bind(b, b ? 'resolved' : 'none', RESOLVER_SOURCE, now, g);
    }));
    stamped = await stampBricks(db, valid);
    if (stamped) await bumpVer(db).run();
  }
  const remaining = (await db.prepare("SELECT COUNT(*) AS n FROM gpc WHERE status = 'queued'").first()).n;
  return { checked: queued.length, resolved, stamped, remaining, done: remaining === 0 };
}

// Product images live in R2 (IMAGES bucket), served at GET /img/:id. The
// images row pins the source URL last stored — a product's image only
// downloads when its source URL is new or changed (shop CDNs version image
// URLs, so same URL = same bytes). fetched_at is the state machine:
//   0 = queued (src known, bytes not fetched)   >0 = stored   -1 = failed
//
// Ingest only QUEUES. Downloading inline is what capped a crawl POST at 40
// rows (one external fetch per image against the free plan's ~50-subrequest
// budget), which is why every full-catalog shop was crawled --no-images and
// ended up with none at all — 21.5k of 22.1k products on 2026-07-26.
// drainImages() does the fetching, from the cron and POST /api/admin/images.
async function queueImages(db, rows) {
  const want = {};
  for (const r of rows) if (r.image) want[r.product_id] ??= r.image;
  const ids = Object.keys(want);
  if (!ids.length) return;
  const have = new Map((await chunked(ids, async c =>
    (await db.prepare(`SELECT product_id, src FROM images WHERE product_id IN (${ph(c)})`).bind(...c).all()).results))
    .map(r => [r.product_id, r.src]));
  // same src = same bytes: leave stored rows alone, and leave an already
  // queued row queued (re-upserting would just reset it to the same 0)
  const todo = ids.filter(id => have.get(id) !== want[id]);
  for (let i = 0; i < todo.length; i += 200) await db.batch(todo.slice(i, i + 200).map(id =>
    db.prepare('INSERT INTO images (product_id, src, fetched_at) VALUES (?, ?, 0) ON CONFLICT(product_id) DO UPDATE SET src = excluded.src, fetched_at = 0').bind(id, want[id])));
}

// Drain the queue: queued (0) before previously failed (-1), so a permanently
// broken URL still retries but never starves fresh work. `n` is the free
// plan's subrequest budget — one external fetch each, so it stays under ~50.
// ponytail: 8 at a time, matching CRAWL_CONC — the queue is written in crawl
// order, so a batch is often one shop's CDN and 40-wide would be rude.
async function drainImages(db, env, n = 40) {
  const remaining = async () => (await db.prepare('SELECT COUNT(*) AS n FROM images WHERE fetched_at = 0').first())?.n ?? 0;
  if (!env.IMAGES) return { done: 0, failed: 0, remaining: await remaining() }; // no bucket bound (tests/local)
  const { results } = await db.prepare('SELECT product_id, src FROM images WHERE fetched_at < 1 ORDER BY fetched_at DESC LIMIT ?').bind(n).all();
  const marks = [];
  const one = async ({ product_id: pid, src }) => {
    try {
      const res = await fetch(src, { headers: { 'user-agent': BROWSER_UA, accept: 'image/*' } });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) throw new Error(`http ${res.status} ${type}`);
      // stream body → R2: pulling 40 images through the isolate as
      // arrayBuffers is per-byte CPU, and it tripped the free plan's ceiling
      // (503) 115 drains into the 2026-07-26 backfill. Missing content-length
      // just means no guard — R2's own limit backstops it.
      if (Number(res.headers.get('content-length')) > 5 << 20) throw new Error(`too big: ${res.headers.get('content-length')} bytes`);
      await env.IMAGES.put(`products/${pid}`, res.body, { httpMetadata: { contentType: type } });
      marks.push([pid, Date.now()]);
    } catch (e) {
      console.warn(`image ${pid}: ${e.message}`);
      marks.push([pid, -1]);
    }
  };
  for (let i = 0; i < results.length; i += 8) await Promise.all(results.slice(i, i + 8).map(one));
  if (marks.length) await db.batch(marks.map(([pid, at]) =>
    db.prepare('UPDATE images SET fetched_at = ? WHERE product_id = ?').bind(at, pid)));
  const done = marks.filter(([, at]) => at > 0).length;
  return { done, failed: marks.length - done, remaining: await remaining() };
}

// Web Push to every device a user subscribed; prunes dead endpoints. The
// caller owns the settings gate (s.push === true — upstream NotifSection
// toggle, default off; boot flips it on when the enable chip's subscribe
// succeeds). Returns whether at least one device took the payload.
async function pushToUser(db, env, userId, payload) {
  if (!env?.VAPID_PRIVATE_KEY) return false;
  const { results } = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').bind(userId).all();
  let delivered = false;
  for (const sub of results) {
    const status = await sendPush(env, sub, payload).catch(() => 0);
    if (status === 404 || status === 410) {
      await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
    } else if (status >= 200 && status < 300) delivered = true;
  }
  return delivered;
}

// Price-drop alerts, fired from ingest() — the single choke point both the
// cron and POST /api/ingest route through (AB-1's trigger engine hangs here
// too). ponytail: armed/fired state is derived, not stored — a "crossing" is
// prev best above target, new best at/below. While the price stays below,
// prev <= target so nothing refires; rising back above re-arms for free.
// Ceiling: a watch created while the price is already below its target never
// fires until the price rises above the target and crosses again.
// Two push-only extras ride the same loop for every active watch: back in
// stock (no buyable offer before this batch, one now — also covers a watched
// offer-less head getting its first offer) and, for target-less watches, a
// new all-time low. Neither writes an alerts-feed row — the table requires a
// target; give them one when the feed should show non-price events.
async function fireAlerts(db, env, before) {
  for (const [pid, prev] of Object.entries(before)) {
    const offer = await bestOffer(db, pid);
    if (!offer) continue;
    const { results } = await db.prepare(
      'SELECT w.user_id, w.target, w.inclShip, u.email, u.settings FROM watches w JOIN users u ON u.id = w.user_id WHERE w.product_id = ? AND w.paused = 0'
    ).bind(pid).all();
    if (!results.length) continue;
    const totNow = results.some(w => w.inclShip && w.target != null) ? await bestTotalOffer(db, pid) : null;
    const meta = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(pid).first();
    const name = meta ? JSON.parse(meta.meta).name : pid;
    const dropPct = prev.best ? ((prev.best - offer.price) / prev.best) * 100 : 100;
    const isLow = prev.low != null && offer.price < prev.low; // new all-time low
    const restocked = prev.best == null; // bestOffer is stock=1 only
    for (const w of results) {
      const s = w.settings ? JSON.parse(w.settings) : {};
      const push = (title, body) => pushToUser(db, env, w.user_id, { title, body, url: `/product/${pid}` });
      // price-target crossing: email + push + the alerts-feed row.
      // target >= item price is a valid pre-filter for BOTH bases (a total is
      // never below its item price); arming compares on the watch's own basis
      // — an inclShip watch whose item price already sat below target but
      // whose TOTAL was still above must stay armed.
      // threshold = minimum drop % ("any"|"5"|"10"); lows = always alert on
      // an all-time low, even below the threshold (both default permissive)
      if (w.target != null && w.target >= offer.price
        && !(Number(s.threshold) > dropPct && !(isLow && s.lows !== false))) {
        const now = w.inclShip ? totNow.total : offer.price;
        const prevP = w.inclShip ? prev.bestTotal : prev.best;
        if (w.target >= now && !(prevP != null && prevP <= w.target)) {
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
          if (s.push === true
            && await push(`Price drop: ${name}`, `${offer.price} kr at ${offer.shop} — at or below your target of ${w.target} kr`)
            && !delivered) delivered = Date.now();
          await db.prepare('INSERT INTO alerts (user_id, product_id, shop, price, prev_price, target, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(w.user_id, pid, offer.shop, offer.price, prev.best, w.target, Date.now(), delivered).run();
          continue;
        }
      }
      if (s.push !== true) continue;
      if (restocked) await push(`Back in stock: ${name}`, `${offer.price} kr at ${offer.shop}`);
      else if (w.target == null && isLow && s.lows !== false) {
        await push(`All-time low: ${name}`, `${offer.price} kr at ${offer.shop} — the lowest price we've tracked`);
      }
    }
  }
}

// Numeric shipping (plans/shipping-totals.md): the offer's own ship string
// wins ('Free shipping' / 'kr N shipping', normalised at scrape time), then
// the per-shop registry (flat rate, waived at freeOver — the Norwegian "fri
// frakt over N kr" norm, applied per offer against its price). null = unknown,
// and unknown is NEVER free: no total, no freeship match, no "inkl. frakt"
// line. Derived at read like facets, so a registry fix needs no backfill.
export function shipCost(shop, price, ship, reg = SHIPPING) { // reg injectable for tests
  if (ship != null) {
    if (ship === 'Free shipping') return 0;
    const m = /^kr (\d+(?:\.\d+)?) shipping$/.exec(ship); // "kr 109.00 shipping" exists in prod
    return m ? Math.round(parseFloat(m[1])) : null;
  }
  const r = reg[shop];
  return r ? (r.freeOver && price >= r.freeOver ? 0 : r.flat) : null;
}
// "In stock" counts as 0 days (upstream's own predicate); "2–6 days" → 2.
const etaDays = (eta) => eta === 'In stock' ? 0 : /^\d/.test(eta || '') ? parseInt(eta) : null;

function shapeRows(prods, offs, pts, imgSet, shopPts) {
  const group = (rows, f) => rows.reduce((m, r) => (((m[r.product_id] ??= []).push(f(r))), m), {});
  // per-shop history rides detail fetches only (shopPts stays undefined on
  // list queries — same lean-row rule as specs). Real observed days only;
  // upstream right-aligns a shorter line, it must never pad or invent.
  const shist = {};
  for (const r of shopPts || []) (shist[`${r.product_id}\0${r.shop}`] ??= []).push(r.price);
  const offers = group(offs, o => {
    const h = shist[`${o.product_id}\0${o.shop}`];
    const sc = shipCost(o.shop, o.price, o.ship);
    return { shop: o.shop, price: o.price, ship: o.ship,
      ...(sc != null ? { shipCost: sc, total: o.price + sc } : {}),
      ...(h ? { hist: h.slice(-24) } : {}), // same window as `history`
      stock: o.stock === 2 ? undefined : !!o.stock, eta: o.eta, url: o.url, updated_at: o.updated_at };
  });
  const history = group(pts, p => p.price);
  return prods.map(({ id, meta }) => {
    const m = JSON.parse(meta);
    const po = offers[id] || [];
    const best = po[0]?.price; // po is price-ordered
    // cheapest shipping-inclusive offer, only over offers whose shipping is
    // KNOWN — absent when none is (upstream renders no "inkl. frakt" then)
    let bestTotal, bestTotalShop;
    for (const o of po) if (o.total != null && (bestTotal == null || o.total < bestTotal)) { bestTotal = o.total; bestTotalShop = o.shop; }
    // name-derived facet values (worker/facetrules.js) under whatever
    // enrichment actually stored — an explicit meta.facets value always wins.
    // The ruleset comes from the brick (facetKeyOf); no brick = no ruleset.
    const derived = deriveFacets(m, facetKeyOf(m.brick));
    // demo seed rating/reviews never ship — fake trust signals, same honesty
    // rule as the purged demo review cards. The real aggregate (meta.udom,
    // written by refreshReviewMeta) serves as `dom`, which is the ONLY thing
    // upstream's reviewStats can read for a product whose rows it hasn't
    // fetched; a separate key because seed re-upserts json_patch with seed
    // keys winning, so a real value in meta.rating would be clobbered back on
    // every deploy. `rating` itself is never served: it is the demo synth's
    // input upstream, and a synthesised verdict is a fake trust signal too.
    const { rating: _demoRating, reviews: _demoReviews, udom, urating: _u1, ureviews: _u2, ...pub } = m;
    return {
      id, ...pub,
      // display category is DERIVED from the brick at read time (gpc-strict):
      // label/icon from the overlay (EN GPC title where uncurated), path the
      // Segment › Family › Class trail. No brick = the honest bucket.
      ...(m.brick
        ? { cat: gpcSegName(m.brick), icon: gpcIcon(m.brick), path: gpcPath(m.brick) }
        : { cat: 'Ukategorisert', icon: 'package-search' }),
      ...(udom ? { dom: udom, reviews: udom.n } : {}),
      facets: derived ? { ...derived, ...m.facets } : m.facets,
      img: imgSet.has(id) ? `/img/${id}` : undefined,
      best,
      bestTotal, bestTotalShop,
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
  // fetched_at > 0 only: a queued row has a src but no bytes in R2 yet, and
  // advertising /img/<id> for it serves a 404 to every card that renders it
  const withImg = new Set((await db.prepare('SELECT product_id FROM images WHERE fetched_at > 0').all()).results.map(r => r.product_id));
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
// Chunks are independent, so they go out concurrently — Promise.all keeps
// chunk order, so the concatenation is identical to awaiting them in turn.
// This is the whole latency story of a category page: 400 ids = 9 chunks ×
// 4 families, and sequentially that was 36 D1 round trips at ~20 ms each
// (plans/api-latency-round-trips.md). Query COUNT is unchanged, so the
// subrequest budget is untouched.
const chunked = async (ids, run, size = 45) => {
  const jobs = [];
  for (let i = 0; i < ids.length; i += size) jobs.push(run(ids.slice(i, i + size)));
  return (await Promise.all(jobs)).flat();
};

// most rows one list query will return (see the cat= branch for why)
const PAGE_MAX = 400;

// auto-discovered products carry meta.hidden = 1 until enriched, and admin
// PATCH {hidden: 1} demotes a bad row. hidden means NOT SERVED — to any
// normal caller, on any route, direct id fetches included (an `ean-*` id is
// derived from the barcode, so the backlog was enumerable by construction,
// and a demoted product kept a working PDP). Ops opt back in with the
// INGEST_TOKEN bearer: rowsFor's `hidden` flag, set by the two gated branches.
const visible = (col = 'meta') => `json_extract(${col}, '$.hidden') IS NOT 1`;

// Rows for a set of product ids, in the catalog.json row shape. expand=true
// (the PDP/watchlist case) resolves child ids (`head~combo`) to their head,
// includes every child of each head, and adds ≤4 same-category head
// neighbors so the PDP's "More in {cat}" has rows to show.
async function rowsFor(db, ids, { expand = true, hidden = false } = {}) {
  const heads = [...new Set(ids.map(id => id.includes('~') ? id.slice(0, id.indexOf('~')) : id))];
  if (!heads.length) return [];
  const vis = hidden ? '' : ` AND ${visible()}`;
  const prods = expand
    ? await chunked(heads, async c => (await db.prepare(`SELECT id, meta FROM products WHERE (id IN (${ph(c)}) OR json_extract(meta, '$.family') IN (${ph(c)}))${vis} ORDER BY rowid`).bind(...c, ...c).all()).results)
    : (await chunked(heads, async c => (await db.prepare(`SELECT id, meta FROM products WHERE id IN (${ph(c)})${vis}`).bind(...c).all()).results))
        .sort((a, b) => heads.indexOf(a.id) - heads.indexOf(b.id)); // caller's order is the ranking (sort=drop)
  if (expand) {
    // PDP neighbors are same-BRICK (gpc-strict) — precise by construction.
    // Ukategorisert rows get none: "More in unsorted" would be a lie.
    const bricks = [...new Set(prods.filter(r => heads.includes(r.id)).map(r => JSON.parse(r.meta).brick).filter(Boolean))];
    for (const brick of bricks) {
      const got = new Set(prods.map(r => r.id));
      // NOT IN can't be paged under the param cap — over-fetch by rowid
      // (≤ got.size rows can collide) and drop the ones already present
      const cand = (await db.prepare(
        `SELECT id, meta FROM products WHERE json_extract(meta,'$.brick') = ? AND json_extract(meta, '$.family') IS NULL AND ${visible()} ORDER BY rowid LIMIT ?`
      ).bind(brick, got.size + 4).all()).results;
      prods.push(...cand.filter(r => !got.has(r.id)).slice(0, 4));
    }
  }
  const all = prods.map(r => r.id);
  // the three families are independent of each other too — one wait, not three
  const [offs, pts, imgs, shopPts] = await Promise.all([
    chunked(all, async c => (await db.prepare(`SELECT product_id, shop, price, ship, stock, eta, url, updated_at FROM offers WHERE product_id IN (${ph(c)}) ORDER BY price`).bind(...c).all()).results),
    chunked(all, async c => (await db.prepare(`SELECT product_id, price FROM price_points WHERE product_id IN (${ph(c)}) ORDER BY day`).bind(...c).all()).results),
    chunked(all, async c => (await db.prepare(`SELECT product_id FROM images WHERE fetched_at > 0 AND product_id IN (${ph(c)})`).bind(...c).all()).results),
    expand ? chunked(all, async c => (await db.prepare(`SELECT product_id, shop, price FROM shop_prices WHERE product_id IN (${ph(c)}) ORDER BY day`).bind(...c).all()).results) : [],
  ]);
  const withImg = new Set(imgs.map(r => r.product_id));
  const rows = shapeRows(prods, offs, pts, withImg, expand ? shopPts : undefined);
  // full spec sheets (Icecat-sized, ~100 rows) only ride detail fetches —
  // list queries stay lean; boot's Object.assign merge never wipes a
  // previously hydrated sheet with a lean row
  if (!expand) rows.forEach(r => delete r.specs);
  return rows;
}

// Diacritic folding. Norwegian shoppers type "hundefor", the catalog says
// "hundefôr" — measured on the live 14k catalog, 25% of rows carry æ/ø/å/é in
// name or brand, and an ASCII-typed query found none of them ("kjokken" 0 hits
// vs "kjøkken" 100, "tradlos" 0 vs "trådløs" 34). SQLite has no unaccent and
// D1 has no ICU, so both sides of the LIKE get the same replace() chain — done
// in the QUERY, not in a stored column: no migration, and it covers hidden and
// future rows for free (the alternative was folding `kw` at promotion time plus
// a backfill of 13,705 rows that promotion guards refuse to re-touch).
// Uppercase forms are listed because sqlite's lower() is ASCII-only, so
// "Øretelefoner" never lowercases; JS's toLowerCase makes those pairs no-ops
// on the query side, which is fine.
// The fold now runs ONCE PER WRITE into search_index rather than per row per
// token at query time — see SEARCH_SQL. The old note here said "no migration,
// and it covers hidden and future rows for free"; triggers keep both of those
// true, and SEARCH_VER rebuilds every row whenever this list changes, so a
// fold fix still needs no hand-run backfill.
const FOLD = [['æ', 'ae'], ['Æ', 'ae'], ['ø', 'o'], ['Ø', 'o'], ['å', 'a'], ['Å', 'a'], ['ä', 'a'], ['Ä', 'a'], ['ö', 'o'], ['Ö', 'o'], ['ü', 'u'], ['Ü', 'u'], ['é', 'e'], ['É', 'e'], ['è', 'e'], ['ê', 'e'], ['ô', 'o'], ['ç', 'c']];
const foldSql = (expr) => FOLD.reduce((s, [a, b]) => `replace(${s}, '${a}', '${b}')`, `lower(${expr})`);
const foldJs = (s) => FOLD.reduce((s2, [a, b]) => s2.split(a).join(b), String(s).toLowerCase());

// The three folded values searchIds matches on, over any expression naming a
// products row. `$.icon` is dropped for the same reason as `$.specs`: it is
// not search text (it holds the category's lucide icon NAME, so leaving it in
// made every Furniture row match "sofa"). The leading space on `nm` is what
// makes '% tok%' mean "starts a word in the name".
const searchCols = (meta) => [
  foldSql(`json_remove(${meta}, '$.specs', '$.icon')`),
  `' ' || ${foldSql(`json_extract(${meta}, '$.name')`)}`,
  foldSql(`coalesce(json_extract(${meta}, '$.brand'), '')`),
].join(', ');
const SET_COLS = 'sk = excluded.sk, nm = excluded.nm, br = excluded.br';
// Triggers, not write-site calls: every path that writes products is covered,
// including ones nobody has written yet. Recreated (not IF NOT EXISTS) on a
// SEARCH_VER change so a FOLD edit actually reaches them.
const SEARCH_SQL = [
  'DROP TRIGGER IF EXISTS products_search_ai',
  'DROP TRIGGER IF EXISTS products_search_au',
  'DROP TRIGGER IF EXISTS products_search_ad',
  `CREATE TRIGGER products_search_ai AFTER INSERT ON products BEGIN INSERT INTO search_index (product_id, sk, nm, br) VALUES (new.id, ${searchCols('new.meta')}) ON CONFLICT(product_id) DO UPDATE SET ${SET_COLS}; END`,
  `CREATE TRIGGER products_search_au AFTER UPDATE OF meta ON products BEGIN INSERT INTO search_index (product_id, sk, nm, br) VALUES (new.id, ${searchCols('new.meta')}) ON CONFLICT(product_id) DO UPDATE SET ${SET_COLS}; END`,
  'CREATE TRIGGER products_search_ad AFTER DELETE ON products BEGIN DELETE FROM search_index WHERE product_id = old.id; END',
  // WHERE true: SQLite needs it to tell this ON CONFLICT from a join clause
  `INSERT INTO search_index (product_id, sk, nm, br) SELECT id, ${searchCols('meta')} FROM products WHERE true ON CONFLICT(product_id) DO UPDATE SET ${SET_COLS}`,
];
// Hashed, not length-counted: any change to FOLD or searchCols changes this,
// so the rebuild is automatic. seed_meta row 3 pins it; seedCatalog reads that
// row for free in the marker SELECT it already runs.
let searchVer;

// Broad candidate match for free-text search: LIKE over the whole meta JSON
// (name/brand/cat/kw all live there). Deliberately broader than the client's
// searchCatalog — the SPA re-filters exactly, MCP re-scores; never return
// these raw. Token semantics mirror the client: ≥2 chars, OR, '' ≠ 'a'
// (a query with no valid tokens matches nothing, an absent query everything).
async function searchIds(db, q) {
  const toks = String(q).split(/\s+/)
    .filter(t => t.length >= 2).slice(0, 8)
    .map(t => foldJs(t).replace(/[\\%_]/g, c => '\\' + c));
  if (!toks.length) return [];
  // Folded once at write time (search_index, see SEARCH_SQL) instead of per
  // row per token here. Same three values, same LIKE patterns, same ranking —
  // only where the folding happens changed.
  const blob = 's.sk';
  // leading space + '% tok%' = the token starts a word in the name
  const name = 's.nm';
  const brand = 's.br';
  // Rank before truncating, or LIMIT 100 over rowid order returns "whichever
  // shop we crawled first": q=ring matched 409 names and served 100 of them
  // with 25 non-jewellery rows in the way. Word-start-in-name beats
  // substring-in-name beats brand beats "mentioned somewhere in the blob"
  // (srcCat/kw). Measured: q=ring 75 → 96 of 100 rows in Jewelry, q=kjokken
  // 20 → 95 in Kitchen. Ties keep rowid order, so curated rows stay first.
  const score = toks.map(() =>
    `(CASE WHEN ${name} LIKE ? ESCAPE '\\' THEN 4 ELSE 0 END) + (CASE WHEN ${name} LIKE ? ESCAPE '\\' THEN 2 ELSE 0 END) + (CASE WHEN ${brand} LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`
  ).join(' + ');
  const { results } = await db.prepare(
    `SELECT p.id FROM products p JOIN search_index s ON s.product_id = p.id
     WHERE json_extract(p.meta, '$.family') IS NULL AND ${visible('p.meta')} AND (${toks.map(() => `${blob} LIKE ? ESCAPE '\\'`).join(' OR ')})
     ORDER BY ${score} DESC, p.rowid LIMIT 100`
  ).bind(...toks.map(t => `%${t}%`), ...toks.flatMap(t => [`% ${t}%`, `%${t}%`, `%${t}%`])).all();
  return results.map(r => r.id);
}

// The prototype's own facet lookup (AppData.jsx `fval`), ported so a
// server-side filter keeps exactly the rows the screen would: the merged
// facet value wins, then the spec sheet, then the head's variant axis.
// facetNorm's array handling is odd (['a','b'] → "a,b") but it is what the
// client does, and the two predicates must agree or the screen's count and
// the served total drift apart.
const facetNorm = (v) => v == null ? undefined : typeof v === 'boolean' ? v : isFinite(parseFloat(v)) ? parseFloat(v) : String(v).trim();
function fval(m, f, k) {
  const v = facetNorm(f[k] ?? (m.specs || {})[k]);
  if (v !== undefined) return v;
  const axis = ((m.variants || {}).axes || []).find(a => a.id === k);
  if (!axis) return undefined;
  const ids = axis.options.map(o => o.id);
  return ids.every(id => isFinite(parseFloat(id))) ? ids.map(id => parseFloat(id)) : ids;
}

// Folkedommen (plans/folkedommen-reviews.md). These mirror upstream's
// _calcStats/verdictWord/domTier line for line — the served sort/filter and
// the screen's own must agree, exactly like failGroups mirrors Results'
// predicate. A claim with no decided answers counts as .5, which is what
// upstream's `d ? c.y / d : .5` does; no udom = no verdict at all.
const CLAIM_KEYS = ['worth', 'durable', 'described'];
function domScore(m) {
  const c = m.udom && m.udom.c;
  if (!c) return undefined;
  const s = CLAIM_KEYS.map(k => { const [y = 0, n = 0] = c[k] || []; return (y + n) ? y / (y + n) : .5; });
  return s.reduce((a, b) => a + b, 0) / s.length;
}
const domTier = (m) => {
  const s = domScore(m);
  return s === undefined ? null : s >= .85 ? 3 : s >= .6 ? 2 : s >= .4 ? 1 : 0;
};

// Sort fields mirror the prototype's SORT_FIELDS ids; `facet:<key>` is one of
// its spec axes. An axis holding several values sorts on the end of its range
// that matches the direction, like specSorts does.
const SORT_VAL = {
  best: r => r.best,
  drop: r => r.drop,
  save: r => (r.m.was != null && r.best != null) ? r.m.was - r.best : undefined,
  updated: r => r.updated,
  // Folkedommen (upstream kept the field id `rating`; only its label and value
  // changed). Real aggregate only — shapeRows never serves the demo seed
  // numbers, and the sort must rank what the screen shows.
  rating: r => domScore(r.m),
  reviews: r => r.m.udom?.n,
  shops: r => r.shops,
  name: r => r.m.name,
  brand: r => r.m.brand,
  // "Totalpris": shipping-inclusive where shipping is known, item price where
  // it isn't (0.3% offer coverage + a curated registry — most rows are
  // unknown, and hiding them all would empty the sort). Upstream's comparator
  // must mirror this exact fallback or its re-sort disagrees with the page.
  total: r => r.bestTotal ?? r.best,
};
const blank = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v));
function sortRows(rows, sort, dir) {
  const fk = sort.startsWith('facet:') ? sort.slice(6) : null;
  const val = fk
    ? (r) => { const v = fval(r.m, r.f, fk); if (!Array.isArray(v)) return v; const a = v.slice().sort((x, y) => typeof x === 'number' ? x - y : String(x).localeCompare(String(y))); return dir === 'asc' ? a[0] : a[a.length - 1]; }
    : SORT_VAL[sort];
  if (!val) return rows;
  const mul = dir === 'asc' ? 1 : -1;
  return rows.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
    if (blank(a.v) || blank(b.v)) return blank(a.v) && blank(b.v) ? a.i - b.i : blank(a.v) ? 1 : -1;
    return (typeof a.v === 'string' ? String(a.v).localeCompare(String(b.v), 'nb') : a.v - b.v) * mul || a.i - b.i;
  }).map(o => o.r);
}

// Which filter GROUPS a row misses: `''` for the whole non-facet block
// (name/brand/price/dom/sale/stock), plus one entry per facet key whose
// selection it fails. Empty array = a match, so this is Results' own predicate
// line for line, quirks included (a row with no drop passes `sale`, because
// `undefined < 12` is false there too) — it just reports WHY instead of
// stopping at the first no, which is what lets fcounts cross-filter.
function failGroups(r, f) {
  const bad = [];
  const n = f.name.length ? foldJs(r.m.name || '') : '';
  if ((f.name.length && !f.name.every(t => n.includes(t)))
    || (f.brands.length && !f.brands.includes(r.m.brand))
    || ((f.min || f.max) && r.best == null)
    || (f.min && r.best < f.min)
    || (f.max && r.best > f.max)
    // Folkedommen tier: a row with no reviews has no tier and is EXCLUDED,
    // like upstream's `domTier(p) == null || domTier(p) < f.dom`
    || (f.dom && !(domTier(r.m) >= f.dom))
    || (f.sale && r.drop < 12)
    || (f.instock && !r.stock)
    // availability group (upstream's universal defs, not FACETS): freeship =
    // some offer KNOWN free; maxeta = some offer at/inside N days ("In stock"
    // counts as 0). r.free/r.minEta ride the shipAgg pass in listIds, which
    // runs whenever these filters are set.
    || (f.freeship && !r.free)
    || (f.maxeta && !(r.minEta <= f.maxeta))) bad.push('');
  for (const k in f.facets) {
    const sel = f.facets[k];
    const v = fval(r.m, r.f, k);
    if (sel === true ? v !== true : (v === undefined || (Array.isArray(v) ? !v.some(x => sel.includes(x)) : !sel.includes(v)))) bad.push(k);
  }
  return bad;
}
const NO_FAIL = []; // shared empty: no filters means nothing to miss

// Results' filter state off the query string, or null when nothing is set.
// `facets` is JSON because its values are typed (numbers for spec axes, `true`
// for the bool ones) and its keys are whatever facets.json declares.
function listFilters(p) {
  const num = (k) => { const n = Number(p.get(k)); return p.get(k) && isFinite(n) ? n : 0; };
  let facets = {};
  try { facets = JSON.parse(p.get('facets') || '{}') || {}; } catch (e) {} // a broken filter param must not 500 a listing
  const f = {
    // `name=` is Results' refine-within-results box: every token must appear in
    // the NAME (its refineToks/refineMatch), diacritic-folded on both sides like
    // `q=` — "hundefor" has to find "Hundefôr". Client-side it would only ever
    // see the loaded page, the same bug sort= and the filters moved here to fix.
    // The fold MUST match upstream's refineToks/refineMatch: the screen filters
    // its cache with those, so a server that folds while the client doesn't
    // serves rows the screen then drops — a count with an empty list under it.
    name: String(p.get('name') || '').trim().split(/\s+/).filter(Boolean).slice(0, 8).map(foldJs),
    brands: (p.get('brand') || '').split(',').filter(Boolean).slice(0, 50),
    min: num('min'), max: num('max'),
    // Folkedommen tier, 1–3 (DOM_TIERS upstream); anything else is no filter
    dom: [1, 2, 3].includes(num('dom')) ? num('dom') : 0,
    sale: p.get('sale') === '1', instock: p.get('instock') === '1',
    freeship: p.get('freeship') === '1', maxeta: num('maxeta'),
    facets: typeof facets === 'object' && facets ? facets : {},
  };
  const on = f.name.length || f.brands.length || f.min || f.max || f.dom || f.sale || f.instock || f.freeship || f.maxeta || Object.keys(f.facets).length;
  return on ? f : null;
}

// Category listing (cat = null → every head), ranked, filtered, sorted, paged.
// Default order is offer count: rowid was "whichever shop we crawled first",
// which decided WHICH 400 of Toys' 1,387 rows you could see, and offer count is
// the cheapest honest signal a price comparison has (offer-less rows sink;
// ties keep rowid so curated seed rows stay first among their peers).
//
// `sort`/`filters` make that page the page the SCREEN is showing. Results
// re-sorts and re-filters its merged cache locally, so nothing here needs the
// response order honoured — the server's whole job is picking the RIGHT rows,
// and the client's own sort then lands on the true first page instead of the
// cheapest of whatever happened to be loaded.
//
// It runs in JS, not SQL, because facet values are DERIVED per row
// (worker/facetrules.js): on the live 14k-row catalog `facets.type` is stored
// on 0 rows and derived on 7,099, so SQL cannot see what the rail filters on.
// Shaping the whole category in JS also makes `total` and the facet histogram
// free — the two numbers the screen cannot compute from a partial cache.
// Measured end to end (this route, prod's 14,059 heads replayed into local
// sqlite): cat=Toys 60 → 64 ms per request, of which catMeta alone is 36 ms
// and rowsFor 4 ms. The category's histogram costs ≤ 908 bytes (Beauty).
// Worth it: the cheapest Toy in the default page is kr 19, the cheapest in the
// category is kr 2 — that gap was the whole bug.
// ponytail: all heads WITH a sort parses 14k rows, 64 → 144 ms. That is one
// link on Browse ("All products"), so it pays it. Push the universal fields
// into a SQL ORDER BY (measured 21 ms for the id list) if it ever matters.
//
// It scales LINEARLY in category size, and it is never the dominant term.
// One synthetic category grown from real rows, whole request measured:
//   rows      request   catMeta   SQL scan   added by this shape   heap
//    1,400      62 ms     47 ms      14 ms       ~1 ms             <1 MB
//   10,000      80 ms     57 ms      18 ms       ~5 ms              4 MB
//   20,000     116 ms     71 ms      23 ms      ~22 ms              9 MB
//   50,000     236 ms    125 ms      47 ms      ~64 ms             22 MB
// So at 36x the biggest category we have, moving these sorts to SQL saves 27%
// of the request and costs a second implementation that still cannot filter or
// count the derived facets. The catMeta column above is now ~0 on a warm
// isolate (2026-07-26, it is memoised on a catalog version), so this scan is
// the dominant CPU term again — but on prod the request is 330 ms and this is
// 85 ms of it. Next, in order: stored facet values + a SQL ORDER BY.
// Retained heap is ~440 B/row against a 128 MB isolate (a row without the meta
// blob is ~280 B, if 100k-row categories ever arrive).
async function listIds(db, { node = null, limit = PAGE_MAX, offset = 0, sort = null, dir = 'asc', filters = null } = {}) {
  const base = `json_extract(p.meta, '$.family') IS NULL AND ${visible('p.meta')}`;
  // node= is one or more GPC codes (comma-joined, any level) or 'uncat'.
  // uncat = the NULL bucket; a brick code binds directly (expression index);
  // class/family/segment codes expand to the STOCKED bricks under them —
  // chunked under D1's 100-param cap, one aggregate query per chunk.
  let chunks = [{ where: base, bind: [] }];
  let ruleset; // single facet ruleset for the node → fcounts served
  if (node === 'uncat') {
    chunks = [{ where: `${base} AND json_extract(p.meta,'$.brick') IS NULL`, bind: [] }];
  } else if (node) {
    const codes = String(node).split(',').map(c => c.trim()).filter(Boolean);
    const keys = new Set(codes.map(facetKeyOf));
    if (keys.size === 1) ruleset = [...keys][0];
    let bricks = codes;
    if (!codes.every(c => GPC.bricks[c])) {
      const stocked = (await db.prepare(`SELECT DISTINCT json_extract(meta,'$.brick') AS b FROM products WHERE json_extract(meta,'$.brick') IS NOT NULL`).all()).results.map(r => String(r.b));
      bricks = bricksUnder(node, stocked);
    }
    if (!bricks.length) return { ids: [], total: 0 };
    chunks = [];
    for (let i = 0; i < bricks.length; i += 90) {
      const c = bricks.slice(i, i + 90);
      chunks.push({ where: `${base} AND json_extract(p.meta,'$.brick') IN (${ph(c)})`, bind: c });
    }
  }
  if (!sort && !filters && !node) {
    // untouched fast path: no sort, no filters, no facet counts to serve
    const { results } = await db.prepare(
      `SELECT p.id FROM products p LEFT JOIN offers o ON o.product_id = p.id WHERE ${base}
       GROUP BY p.id ORDER BY COUNT(o.product_id) DESC, p.rowid LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    return { ids: results.map(r => r.id) };
  }
  // ponytail: SQL fast path for the two nodes too big to shape in JS — uncat
  // (~50k rows post-crawl) and all-heads. Parsing every meta blob per request
  // is 100+ ms CPU, and the free-plan isolate dies at ~10; filterless queries
  // (boot's mount prefetch and every sort click) don't need the JS pass at
  // all, since neither node serves fcounts. Sort whitelist mirrors sortRows:
  // blanks last either direction, tie = offer-count rank. Known drift, all
  // marginal: name/brand collate binary not 'nb' (æøå order), total falls
  // back to item price (bestTotal covers 0.3% of offers), rating/facet sorts
  // and any filter still take the JS path — those on uncat stay over budget
  // until the paid plan or a SQL filter dialect.
  const BEST = 'MIN(o.price)', WAS = `json_extract(p.meta,'$.was')`;
  const SQL_SORT = {
    best: BEST, total: BEST,
    drop: `CASE WHEN ${WAS} AND ${BEST} THEN ROUND((1.0 - ${BEST} / CAST(${WAS} AS REAL)) * 100.0) END`,
    save: `CASE WHEN ${WAS} IS NOT NULL AND ${BEST} IS NOT NULL THEN ${WAS} - ${BEST} END`,
    updated: 'MAX(o.updated_at)', shops: 'COUNT(o.product_id)',
    reviews: `json_extract(p.meta,'$.udom.n')`,
    name: `json_extract(p.meta,'$.name') COLLATE NOCASE`,
    brand: `json_extract(p.meta,'$.brand') COLLATE NOCASE`,
  };
  if (!filters && (node === 'uncat' || !node) && (!sort || SQL_SORT[sort])) {
    const w = chunks[0].where;
    const ord = sort
      ? `(${SQL_SORT[sort]} IS NULL OR ${SQL_SORT[sort]} = ''), ${SQL_SORT[sort]} ${dir === 'desc' ? 'DESC' : 'ASC'}, COUNT(o.product_id) DESC, p.rowid`
      : 'COUNT(o.product_id) DESC, p.rowid';
    const [page, count, brandRows, pr] = await Promise.all([
      db.prepare(`SELECT p.id FROM products p LEFT JOIN offers o ON o.product_id = p.id WHERE ${w}
                  GROUP BY p.id ORDER BY ${ord} LIMIT ? OFFSET ?`).bind(limit, offset).all(),
      db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`).first(),
      node ? db.prepare(`SELECT json_extract(p.meta,'$.brand') AS b, COUNT(*) AS n FROM products p
                         WHERE ${w} AND json_extract(p.meta,'$.brand') IS NOT NULL AND json_extract(p.meta,'$.brand') != '' GROUP BY b`).all() : null,
      node ? db.prepare(`SELECT MIN(t.b) AS lo, MAX(t.b) AS hi FROM (SELECT ${BEST} AS b FROM products p
                         JOIN offers o ON o.product_id = p.id WHERE ${w} GROUP BY p.id) t`).first() : null,
    ]);
    return {
      ids: page.results.map(r => r.id), total: count.n,
      brands: brandRows && brandRows.results.map(r => [r.b, r.n]).sort((a, b) => a[0].localeCompare(b[0])),
      prange: pr && pr.lo != null ? [pr.lo, pr.hi] : undefined,
    };
  }
  const results = (await Promise.all(chunks.map(ch => db.prepare(
    `SELECT p.id, p.meta, p.rowid AS ri, MIN(o.price) AS best, COUNT(o.product_id) AS shops,
            MAX(CASE WHEN o.stock = 1 THEN 1 ELSE 0 END) AS stock, MAX(o.updated_at) AS updated
     FROM products p LEFT JOIN offers o ON o.product_id = p.id WHERE ${ch.where}
     GROUP BY p.id ORDER BY COUNT(o.product_id) DESC, p.rowid`
  ).bind(...ch.bind).all()))).flatMap(r => r.results);
  // >1 chunk loses the global default rank — restore it (offer count, rowid)
  if (chunks.length > 1) results.sort((a, b) => b.shops - a.shops || a.ri - b.ri);
  // Shipping aggregates need per-offer rows (shipCost is registry logic the
  // GROUP BY above can't see — same reason the facets run in JS), so fetch
  // them only when the query actually touches shipping. ~1 offer/product
  // today, so it's roughly one extra row per head.
  // `cat` fetches it too: the rail's availability counts (meta.acounts) need
  // free/minEta on every row, and they ride every category response now
  let shipAgg = null;
  if (node || sort === 'total' || filters?.freeship || filters?.maxeta) {
    const offs = (await Promise.all(chunks.map(ch => db.prepare(
      `SELECT o.product_id, o.shop, o.price, o.ship, o.eta, o.stock FROM offers o JOIN products p ON p.id = o.product_id WHERE ${ch.where}`
    ).bind(...ch.bind).all()))).flatMap(r => r.results);
    shipAgg = {};
    for (const o of offs) {
      const a = shipAgg[o.product_id] ??= { free: false, minEta: Infinity };
      const sc = shipCost(o.shop, o.price, o.ship);
      if (sc === 0) a.free = true;
      if (sc != null) { const t = o.price + sc; if (a.bestTotal == null || t < a.bestTotal) a.bestTotal = t; }
      // upstream's AVAIL 'fast' def counts IN-STOCK offers only (o.stock ===
      // true && etaFast) — mirror it or the count and the page disagree
      const d = o.stock === 1 ? etaDays(o.eta) : null;
      if (d != null && d < a.minEta) a.minEta = d;
    }
  }
  // per-cat only: the rail has no facets without one. Counted in a Map and
  // served as [value, count] PAIRS — a JSON object would stringify the
  // numeric axes (55 → "55") and the rail's option ids must keep their type
  const fcounts = node && ruleset ? new Map() : null;
  // brand histogram + price bounds over the WHOLE category, in Results'
  // brandPool convention (facet selections applied, the non-facet block —
  // brand/price/dom/sale/stock/avail — deliberately not): the slider's max was
  // the max of whichever 400 rows were loaded (kr 100 on Toys, true max kr
  // 25k), and a brand outside the page never made the rail at all. Same drift
  // rule as failGroups vs Results' own predicate.
  const brands = node ? new Map() : null;
  let plo = Infinity, phi = -Infinity;
  // availability counts in upstream's OWN convention: its availCounts reads
  // countPool — no filters applied at all — so these count the whole
  // category unfiltered, and the refine falls back client-side like the rest.
  // `fast` mirrors upstream's fixed ≤2-days AVAIL def (boot sends maxeta=2).
  const acounts = node ? { instock: 0, freeship: 0, fast: 0 } : null;
  let rows = [];
  for (const x of results) {
    const m = JSON.parse(x.meta);
    const derived = deriveFacets(m, facetKeyOf(m.brick));
    const r = {
      id: x.id, m, f: derived ? { ...derived, ...m.facets } : (m.facets || {}),
      best: x.best ?? undefined, shops: x.shops, stock: x.stock === 1, updated: x.updated || undefined,
    };
    r.drop = m.was && r.best ? Math.round((1 - r.best / m.was) * 100) : undefined;
    if (shipAgg) Object.assign(r, shipAgg[x.id] || { free: false, minEta: Infinity });
    const bad = filters ? failGroups(r, filters) : NO_FAIL;
    // Histogram over the whole category, CROSS-FILTERED: a row counts toward
    // group k when it misses nothing else, so picking a brand re-counts every
    // other group (the standard faceted convention — "Over-ear 3" next to a
    // brand that has none was the bug), while group k's own counts stay the
    // "what if I also picked this" numbers. Every value in the category is
    // still emitted, at 0 when nothing survives: the rail derives its option
    // list from these keys and drops a group under 2 values, so pruning them
    // would make groups — and an active selection — vanish as you filter.
    if (fcounts) for (const k of Object.keys(r.f)) {
      const v = fval(m, r.f, k);
      if (v === undefined) continue;
      let c = fcounts.get(k); if (!c) fcounts.set(k, c = new Map());
      const hit = bad.length === 0 || (bad.length === 1 && bad[0] === k) ? 1 : 0;
      for (const x2 of [].concat(v)) c.set(x2, (c.get(x2) || 0) + hit);
    }
    if (acounts) {
      if (r.stock) acounts.instock++;
      if (r.free) acounts.freeship++;
      if (r.minEta <= 2) acounts.fast++;
    }
    if (brands && !bad.some(k => k !== '')) {
      if (r.best != null) { if (r.best < plo) plo = r.best; if (r.best > phi) phi = r.best; }
      if (m.brand) brands.set(m.brand, (brands.get(m.brand) || 0) + 1);
    }
    if (!bad.length) rows.push(r);
  }
  if (sort) rows = sortRows(rows, sort, dir === 'desc' ? 'desc' : 'asc');
  return {
    ids: rows.slice(offset, offset + limit).map(r => r.id),
    total: rows.length,
    fcounts: fcounts && Object.fromEntries([...fcounts].map(([k, m]) => [k, [...m]])),
    prange: phi >= plo ? [plo, phi] : undefined,
    brands: brands && [...brands].sort((a, b) => a[0].localeCompare(b[0])),
    acounts: acounts || undefined,
  };
}

// Heads ranked by drop% (1 - best/was). perCat keeps the top `limit` per
// category (browse) instead of just the global top (home sidecard).
// ponytail: full head scan per call, fine to ~2k heads; store a drop column
// when it isn't.
async function topDropIds(db, { limit = 4, perCat = false } = {}) {
  const { results } = await db.prepare(
    `SELECT p.id, json_extract(p.meta, '$.brick') AS brick FROM products p JOIN offers o ON o.product_id = p.id WHERE json_extract(p.meta, '$.family') IS NULL AND ${visible('p.meta')} AND json_extract(p.meta, '$.was') > 0 GROUP BY p.id ORDER BY 1.0 - MIN(o.price) * 1.0 / json_extract(p.meta, '$.was') DESC`
  ).all();
  if (!perCat) return results.slice(0, limit).map(r => r.id);
  // perCat buckets by brick (gpc-strict); brickless rows only reach the
  // global top — an Ukategorisert per-bucket would advertise the backlog
  const per = {};
  const ids = results.slice(0, limit).map(r => r.id);
  for (const r of results) if (r.brick && (per[r.brick] = (per[r.brick] || 0) + 1) <= limit) ids.push(r.id);
  return [...new Set(ids)];
}

// Global aggregates + per-category head counts — served as meta on every
// /api/products response so the UI can show real totals off a partial cache.
//
// Five unindexed full-table aggregates, paid by every response including a
// PDP ids= fetch that touches no category — ~40 ms of CPU and 5 D1 round
// trips (~100 ms on prod). So it is memoised per database, keyed on the
// catalog version seedCatalog already read this request: a hit costs nothing,
// and any write anywhere bumps the version, so no isolate can serve a count
// that is behind the data. Falsy ver = don't cache (a just-written or
// unversioned db, and the ops catalog.json dump).
// A miss sends all five in ONE db.batch() round trip rather than five in a
// row — the scans still cost what they cost, but the ~80 ms of waiting is the
// part a cold isolate was paying. batch() returns one D1Result per statement
// WITH rows; test/api.test.js's shim had to be taught that (a shim that only
// .run()s each statement returns nothing, which passes locally and serves
// empty pages in prod).
// Callers must treat the result as read-only — it is shared between requests.
const metaCache = new WeakMap(); // db → { ver, val }
async function catMeta(db, ver) {
  const hit = metaCache.get(db);
  if (ver && hit?.ver === ver) return hit.val;
  const heads = `FROM products WHERE json_extract(meta, '$.family') IS NULL AND ${visible()}`;
  const [nRes, sRes, fRes, bRes] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n ${heads}`),
    // per-shop objective stats (plans/reviews-layer.md shop profiles v1):
    // offers tracked + price freshness — the shops count is this list's length
    db.prepare('SELECT shop, COUNT(*) AS n, MAX(updated_at) AS t FROM offers GROUP BY shop'),
    db.prepare('SELECT MAX(updated_at) AS t FROM offers'),
    // the whole category axis in ONE aggregate (gpc-strict): stocked-brick
    // histogram + the NULL bucket (Ukategorisert). tree/depts derive from it
    // in JS — O(stocked bricks), no cron, no seed_meta row
    db.prepare(`SELECT json_extract(meta, '$.brick') AS b, COUNT(*) AS n ${heads} GROUP BY 1`),
  ]);
  const products = nRes.results[0].n;
  const shops = sRes.results.length;
  const shopStats = Object.fromEntries(sRes.results.map(r => [r.shop, { offers: r.n, updated: r.t ?? null }]));
  const freshest = fRes.results[0].t ?? null;
  const bricks = {};
  let uncat = 0;
  for (const r of bRes.results) r.b == null ? uncat = r.n : bricks[String(r.b)] = r.n;
  // stocked GPC hierarchy, 4 levels, counts rolled up — names from the
  // overlay where curated, English GPC titles otherwise (decision: hybrid
  // navigation). Sorted by size so browse renders the biggest first.
  const nodes = {};
  const tree = [];
  for (const [b, n] of Object.entries(bricks)) {
    const meta4 = GPC.bricks[b];
    if (!meta4) continue; // brick unknown to this edition — counted in `bricks`, absent from the tree
    const chain = [gpcParent(gpcParent(gpcParent(b))), gpcParent(gpcParent(b)), gpcParent(b), b];
    let kids = tree;
    for (const c of chain) {
      let node = nodes[c];
      if (!node) { node = nodes[c] = { code: c, name: gpcName(c), ...(NO.names[c]?.icon ? { icon: NO.names[c].icon } : {}), n: 0, children: [] }; kids.push(node); }
      node.n += n;
      kids = node.children;
    }
  }
  const bySize = (l) => { l.sort((a, b) => b.n - a.n); l.forEach(x => { bySize(x.children); if (!x.children.length) delete x.children; }); };
  bySize(tree);
  // browse departments from the overlay tiles: a tile's b is one or more GPC
  // codes (any level); its count is the stocked total under them — the same
  // histogram the tree uses, so a tile number and its page can never disagree
  const tileN = (b) => bricksUnder(b, Object.keys(bricks)).reduce((a, x) => a + (bricks[x] || 0), 0);
  const depts = NO.depts.map(d => ({
    id: d.id, name: d.name, icon: d.icon,
    rules: d.tiles.map(t => {
      const first = String(t.b).split(',')[0];
      return { b: t.b, name: t.name ?? NO.names[first]?.name ?? gpcTitle(first), icon: t.icon ?? NO.names[first]?.icon ?? 'tag',
        syn: t.syn ?? NO.names[first]?.syn ?? [], ...(gpcPath(first) ? { path: gpcPath(first) } : {}), n: tileN(t.b) };
    }),
  }));
  // facet ruleset per stocked brick AND per tile code — boot's BRICK_CAT
  // bridge reads this so upstream's FACETS[brickToCat(b)] resolves the defs
  const facetKeys = {};
  for (const b of Object.keys(bricks)) { const k = facetKeyOf(b); if (k) facetKeys[b] = k; }
  for (const d of NO.depts) for (const t of d.tiles) { const k = facetKeyOf(String(t.b).split(',')[0]); if (k) facetKeys[t.b] = k; }
  const val = { products, shops, shopStats, freshest, facets: FACETS, facetKeys, tree, depts, bricks, uncat, shipping: SHIPPING };
  if (ver) metaCache.set(db, { ver, val });
  return val;
}

// ── Reviews (plans/reviews-layer.md) ───────────────────────────────────────
// First name + last initial ("Kari Nordmann" → "Kari N.") — the only slice of
// another user's identity a review ever carries.
const revName = (name) => {
  const p = String(name).trim().split(/\s+/);
  return p[0] + (p.length > 1 ? ' ' + p[p.length - 1][0] + '.' : '');
};

const REVIEW_COLS = `r.id, r.product_id, r.user_id, r.claims, r.plus, r.minus, r.buy_shop, r.paid,
       r.show_paid, r.title, r.body, r.verified, r.created_at, r.updated_at, u.name,
       (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS helpful,
       EXISTS(SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = ?) AS voted`;

// `paid` is served only when the reviewer chose to show it, or to the author
// (whose edit modal prefills from it). A hidden amount still counts toward the
// aggregate range — it is never returned as a number attached to a name. Same
// promise as the gift-list `by` stripping in plans/list-sharing-backend.md.
const mapReview = (r, userId) => ({
  id: r.id, prodId: r.product_id, author: revName(r.name),
  claims: r.claims || 'uuu', // upstream's own 'ynu' encoding, CLAIM_KEYS order
  plus: JSON.parse(r.plus || '[]'), minus: JSON.parse(r.minus || '[]'),
  shop: r.buy_shop || null,
  ...(r.paid != null && (r.show_paid || r.user_id === userId) ? { paid: r.paid } : {}),
  showPaid: !!r.show_paid,
  title: r.title, body: r.body, helpful: r.helpful, verified: !!r.verified,
  voted: !!r.voted, mine: r.user_id === userId,
  edited: r.updated_at > r.created_at, created_at: r.created_at,
});

// Visible reviews for a set of product ids, helpful counts and the session
// user's own vote/authorship joined in — the PDP hydrate batch.
async function reviewsFor(db, ids, userId) {
  const rows = await chunked(ids, async c => (await db.prepare(
    `SELECT ${REVIEW_COLS} FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.hidden = 0 AND r.product_id IN (${ph(c)}) ORDER BY r.id DESC`
  ).bind(userId, ...c).all()).results);
  return rows.map(r => mapReview(r, userId));
}

// The account tab's "My reviews" needs them across ALL products, which
// ReviewStore (one PDP at a time) can never hold. Deliberately not folded into
// meBody: /api/me is on every cold load and this tab is rare.
// ponytail: LIMIT 100, no paging — add offset paging for the 101st review
async function myReviews(db, userId) {
  const { results } = await db.prepare(
    `SELECT ${REVIEW_COLS} FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.hidden = 0 AND r.user_id = ? ORDER BY r.id DESC LIMIT 100`
  ).bind(userId, userId).all();
  return results.map(r => mapReview(r, userId));
}

// Real reviews recompute the product's aggregate into meta at write time (same
// meta-merge seam as admin PATCH) so list queries stay one read. This is the
// load-bearing bit of Folkedommen: upstream's reviewStats only ever holds the
// rows of the PDP you are on, so every result row, card, Compare cell, the
// `dom` filter and the Folkedommen sort read THIS instead. Zero visible
// reviews deletes the key and the product reads "Ingen omtaler ennå" — the
// honest cold start, since the demo `rating` synth never ships.
// ponytail: the whole blob rides every list row (~150 B); serve {n, c} only
// for list queries and the rest on ids= if a page ever gets tight
async function refreshReviewMeta(db, productId) {
  const [rows, cur] = await Promise.all([
    db.prepare('SELECT claims, plus, minus, paid FROM reviews WHERE product_id = ? AND hidden = 0').bind(productId).all(),
    db.prepare('SELECT meta FROM products WHERE id = ?').bind(productId).first(),
  ]);
  if (!cur) return;
  const meta = JSON.parse(cur.meta);
  delete meta.urating; delete meta.ureviews; // pre-Folkedommen stars; migration is this write
  const rs = rows.results;
  if (!rs.length) delete meta.udom;
  else {
    const c = { worth: [0, 0, 0], durable: [0, 0, 0], described: [0, 0, 0] };
    const traits = new Map(); // '<1|0><trait>' → count
    const paids = [];
    for (const r of rs) {
      const s = String(r.claims || 'uuu');
      CLAIM_KEYS.forEach((k, i) => { const j = 'ynu'.indexOf(s[i]); c[k][j < 0 ? 2 : j]++; });
      for (const [col, pos] of [['plus', 1], ['minus', 0]]) {
        for (const t of JSON.parse(r[col] || '[]')) traits.set(pos + t, (traits.get(pos + t) || 0) + 1);
      }
      if (r.paid > 0) paids.push(r.paid);
    }
    // 6 covers the PDP's 3 plus + 2 minus with slack, and a row shows 1–2
    const t = [...traits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => [k.slice(1), n, Number(k[0])]);
    meta.udom = { n: rs.length, c, t };
    // "alltid spennet, aldri enkeltkjøp": upstream renders lo === hi as ONE
    // amount, so with fewer than 3 reporters (or unrounded ends) that is a
    // named person's exact receipt — hidden toggle or not.
    if (paids.length >= 3) {
      meta.udom.p = [Math.floor(Math.min(...paids) / 10) * 10, Math.ceil(Math.max(...paids) / 10) * 10, paids.length];
    }
  }
  await db.batch([db.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), productId), bumpVer(db)]);
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
    'SELECT product_id AS id, target, paused, inclShip, COALESCE(EXISTS(SELECT 1 FROM alerts a WHERE a.user_id = watches.user_id AND a.product_id = watches.product_id) AND target >= (SELECT MIN(price) FROM offers o WHERE o.product_id = watches.product_id AND o.stock = 1), 0) AS hit FROM watches WHERE user_id = ? ORDER BY rowid'
  ).bind(user.id).all(); // rowid = the order the client PUT them in
  // hideAutobuy (env.HIDE_AUTOBUY): the feature is invisible — no autobuy blob,
  // no purchase history in the me payload. The data export passes false: a
  // user's own data stays complete regardless of what the UI shows.
  return { user: { email: user.email, name: user.name, initials: initials(user.name), hasPassword: !!user.password_hash, createdAt: user.created_at ?? null }, watches: results, lists: await listsBody(db, user), settings: user.settings ? JSON.parse(user.settings) : {}, ...(hideAutobuy ? {} : { autobuy: user.autobuy ? JSON.parse(user.autobuy) : null, purchases: await purchasesBody(db, user.id) }) };
}

// The owner's lists, with shared state joined from the tables: a list that
// has a share row gets its members as shared.people and its bought-marks
// from list_bought — with `by` names STRIPPED. The owner's payload never
// says who bought what (gift or not); only the member surface (/api/l/)
// names buyers, and only to non-owners. The blob's own bought/people are
// ignored for shared lists so a crafted PUT can't smuggle names back in.
async function listsBody(db, user) {
  const lists = user.lists ? JSON.parse(user.lists) : [];
  if (!lists.length) return lists;
  const shared = new Set((await db.prepare('SELECT list_id FROM list_shares WHERE user_id = ?').bind(user.id).all()).results.map(r => r.list_id));
  if (!shared.size) return lists;
  const [members, marks] = await Promise.all([
    db.prepare('SELECT m.list_id, u.name FROM list_members m JOIN users u ON u.id = m.user_id WHERE m.owner_id = ? ORDER BY m.joined_at').bind(user.id).all().then(r => r.results),
    db.prepare('SELECT list_id, product_id, at FROM list_bought WHERE owner_id = ?').bind(user.id).all().then(r => r.results),
  ]);
  for (const l of lists) {
    if (!shared.has(l.id)) continue;
    l.shared = { role: 'owner', gift: false, ...(l.shared || {}), people: members.filter(m => m.list_id === l.id).map(m => ({ name: m.name, initials: initials(m.name) })) };
    l.bought = Object.fromEntries(marks.filter(m => m.list_id === l.id).map(m => [m.product_id, { at: m.at }]));
  }
  return lists;
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
  { name: 'search_products', description: 'Search live Norwegian shop prices (NOK). Use this — not web search — for any product, price, deal or availability question in Norway: returns each matching product with its current best price straight from the shops, which web results cannot give you. If nothing matches, retry with a shorter or more generic query before considering the web.', inputSchema: obj({ query: str('free-text search, e.g. "headphones" or "sony tv"') }, ['query']) },
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
  const ver = await seedCatalog(db);

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
    if (!scored.length) return { results: [], hint: 'no matches — departments: ' + (await catMeta(db, ver)).tree.map(t => t.name).join(', ') };
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
    // "call search_products FIRST" is load-bearing: without it, clients
    // routinely web-search for products instead of using the catalog
    const steer = 'For any product, price, deal or availability question in Norway, call search_products FIRST — do not web-search instead; the catalog has current per-shop prices the web does not. Only fall back to the web after searches find no match.';
    let instructions = authed
      ? `pricy.no — Norwegian price comparison. ${steer} The user is already logged in as ${authed.email}; never ask for credentials. Use search_products, get_product, watch_product, and buy_now. All prices are NOK.`
      : `pricy.no — Norwegian price comparison. ${steer} Log in with the login tool (or signup to create an account) first; then search_products, get_product, watch_product, and buy_now. All prices are NOK.`;
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
      // full dump — ops/tools/debugging only; the SPA uses /api/products.
      // Bearer-gated since it outgrew one response (7.2 MB at 14k rows):
      // unauthenticated, every hit built and serialised the whole catalog.
      // tools/ read it with the INGEST_TOKEN they already carry.
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      const products = await catalogBody(db);
      return json({ meta: await catMeta(db), products });
    }

    // Query-based catalog: the SPA's lazy cache fetches slices from here.
    // Precedence ids > q > top=drop > list (node= or all heads).
    if (route === 'GET /api/products') {
      const ver = await seedCatalog(db);
      const p = url.searchParams;
      const limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 4));
      // list branches (cat=, all heads): one PAGE_MAX page by default,
      // `limit`+`offset` to walk the rest. meta.cats[cat] / meta.products is
      // the total, so a caller knows when to stop.
      const page = {
        limit: Math.min(PAGE_MAX, Math.max(1, Number(p.get('limit')) || PAGE_MAX)),
        offset: Math.max(0, Number(p.get('offset')) || 0),
        sort: p.get('sort'),
        dir: p.get('dir'),
        filters: listFilters(p),
      };
      let products, extra;
      // the ops bearer is the only way to see meta.hidden rows (see visible())
      const denied = ingestAuth(request, env);
      const ops = !denied;
      if (p.get('hidden') === '1') {
        // enrichment listing (tools/enrich.mjs): auto-discovered rows awaiting
        // a hand-written worker/extra.json entry. Not used by the SPA — it is
        // the undiscovered backlog, so it is gated like the catalog.json dump.
        if (denied) return denied;
        const { results } = await db.prepare(`SELECT id FROM products WHERE json_extract(meta, '$.hidden') = 1 ORDER BY rowid LIMIT 200`).all();
        // 90-id chunks: D1 caps bound parameters at 100 per statement
        products = [];
        for (let i = 0; i < results.length; i += 90) {
          products.push(...await rowsFor(db, results.slice(i, i + 90).map(r => r.id), { expand: false, hidden: true }));
        }
      } else if (p.get('ids') != null) {
        const ids = p.get('ids').split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length > 100) return json({ error: 'too many ids (max 100)' }, 400);
        // ops needs a specific hidden row too — the listing above stops at 200
        products = await rowsFor(db, ids, { hidden: ops });
      } else if (p.get('q') != null) {
        products = await rowsFor(db, await searchIds(db, p.get('q')), { expand: false });
      } else if (p.get('top') === 'drop') {
        products = await rowsFor(db, await topDropIds(db, { limit, perCat: p.get('perCat') === '1' }), { expand: false });
      } else {
        // cat= (PAGE_MAX rows per page — the SPA renders one card per row, and
        // a full-catalog crawl puts thousands in a category: Toys 1,387), or
        // "/results with no query and no category", which takes the same page
        // and the same id-list shape: catalogBody() would build the WHOLE
        // catalog just to throw all but PAGE_MAX of it away.
        // Results' sort and filters ride along, so this is the page the screen
        // actually shows; `total` (matching rows) and `fcounts` (the category's
        // facet histogram) come back as meta — neither is computable from the
        // partial cache the screen holds.
        const slice = await listIds(db, { node: p.get('node'), ...page });
        extra = { total: slice.total, fcounts: slice.fcounts || undefined, prange: slice.prange, brands: slice.brands || undefined, acounts: slice.acounts };
        products = await rowsFor(db, slice.ids, { expand: false });
      }
      return json({ meta: { ...await catMeta(db, ver), ...extra }, products });
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
        || (r.srcCat != null && typeof r.srcCat !== 'string') || (r.ean != null && typeof r.ean !== 'string'));
      if (bad) return json({ error: 'bad rows' }, 400);
      await seedCatalog(db);
      // by the batch's own ids, not the whole products table: this check only
      // ever asks about rows that are IN the batch, and a full id read is a
      // fixed per-chunk cost that smaller or parallel chunks cannot dilute
      // (see the note in ingest()).
      const ids = [...new Set(rows.map(r => r.product_id))];
      const idSlices = [];
      for (let i = 0; i < ids.length; i += 100) idSlices.push(ids.slice(i, i + 100));
      const known = new Set();
      for (const res of await db.batch(idSlices.map(s =>
        db.prepare(`SELECT id FROM products WHERE id IN (${s.map(() => '?').join(',')})`).bind(...s))))
        for (const p of res.results) known.add(p.id);
      // aliased EANs resolve inside ingest(); their derived ids are known here
      for (const r of (await db.prepare('SELECT ean FROM eans').all()).results) known.add('ean-' + r.ean);
      // discovery rows (ean-derived id + name) pass through — ingest creates them hidden
      const unknown = [...new Set(rows.filter(r => !known.has(r.product_id) && !autoAdd(r)).map(r => r.product_id))];
      if (unknown.length) return json({ error: 'unknown product_id', ids: unknown }, 400);
      await ingest(db, rows, env);
      return json({ ok: true, ingested: rows.length });
    }

    // Drain the image queue (see queueImages). The cron drains ~40/hour on
    // its own; this is how a backfill after a full-catalog crawl gets done in
    // minutes instead of weeks — tools/crawl.mjs loops it until remaining = 0.
    if (route === 'POST /api/admin/images') {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 40, 1), 40);
      const res = await drainImages(db, env, n);
      if (res.done) await bumpVer(db).run(); // stored bytes = new img: links in the catalog
      return json(res);
    }

    // Drain the gtin→brick queue (gpc-strict). The cron drains on its own;
    // this is how a backfill after a crawl or a fixture change gets done in
    // minutes — loop until remaining = 0.
    if (route === 'POST /api/admin/gpc') {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      await seedCatalog(db);
      const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 200, 1), 500);
      return json(await resolveGpcQueue(db, env, n));
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
      const STR = ['name', 'brand', 'kw', 'family', 'vlabel', 'brick'];
      const ok = patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length
        && Object.entries(patch).every(([k, v]) =>
          (v === null && k !== 'name') // null deletes a key; a product always keeps a name
          || (STR.includes(k) && typeof v === 'string' && v.trim())
          || (k === 'was' && Number.isInteger(v) && v > 0)
          || ((k === 'hidden' || k === 'auto' || k === 'man') && v === 1)
          || ((k === 'variants' || k === 'facets' || k === 'specs') && typeof v === 'object' && !Array.isArray(v)));
      if (!ok) return json({ error: 'bad patch' }, 400);
      // gpc-strict: `brick` replaced `cat`/`icon` — display derives from the
      // brick at read time. The code must exist in the shipped taxonomy.
      if (typeof patch.brick === 'string' && !GPC.bricks[patch.brick.trim()]) return json({ error: 'unknown brick', hint: 'an 8-digit GPC brick code from the current publication (see worker/gpc.json)' }, 400);
      const meta = JSON.parse(cur.meta);
      for (const [k, v] of Object.entries(patch)) v === null ? delete meta[k] : meta[k] = typeof v === 'string' ? v.trim() : v;
      // A hand-set brick is a human decision — pin it, or the resolver would
      // quietly overwrite the triage that fixed it. `brick: null` clears the
      // pin too (unless the patch pins explicitly) and re-queues the gtin so
      // the resolver answers again.
      if (typeof patch.brick === 'string' && !('man' in patch)) meta.man = 1;
      if (patch.brick === null) {
        if (!('man' in patch)) delete meta.man;
        if (meta.ean) await db.prepare("UPDATE gpc SET status = 'queued' WHERE gtin = ?").bind(meta.ean).run();
      }
      await db.batch([db.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), id), bumpVer(db)]);
      return json({ ok: true, id, meta });
    }

    // Review moderation (same bearer as product triage): {hidden: 1} pulls a
    // review from every GET and the aggregate, {hidden: 0} restores it. No
    // listing route — `wrangler d1 execute` is the triage view, like reports.
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/admin/reviews/')) {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      const b = await request.json().catch(() => null);
      if (!b || (b.hidden !== 0 && b.hidden !== 1)) return json({ error: 'bad patch (hidden: 0|1)' }, 400);
      const row = await db.prepare('UPDATE reviews SET hidden = ? WHERE id = ? RETURNING product_id')
        .bind(b.hidden, Number(url.pathname.slice('/api/admin/reviews/'.length))).first();
      if (!row) return json({ error: 'unknown review' }, 404);
      if (row.product_id) await refreshReviewMeta(db, row.product_id);
      return json({ ok: true });
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
      // gpc-strict: an aliased gtin queues for brick resolution like any other
      await db.prepare("INSERT OR IGNORE INTO gpc (gtin, status) VALUES (?, 'queued')").bind(key).run();
      const orphan = `ean-${key}`;
      let migrated = false;
      if (orphan !== target && await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(orphan).first()) {
        migrated = true;
        await db.batch([
          // OR IGNORE: where the target already has the shop/day/user row,
          // the target's wins and the orphan's leftover is deleted below
          db.prepare('UPDATE OR IGNORE offers SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE OR IGNORE price_points SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE OR IGNORE shop_prices SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE OR IGNORE watches SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('UPDATE purchases SET product_id = ? WHERE product_id = ?').bind(target, orphan),
          db.prepare('DELETE FROM offers WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM price_points WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM shop_prices WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM watches WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM images WHERE product_id = ?').bind(orphan),
          db.prepare('DELETE FROM products WHERE id = ?').bind(orphan),
        ]);
        // the image re-fetches under the target id on the next ingest
        try { await env.IMAGES?.delete(`products/${orphan}`); } catch {}
      }
      await bumpVer(db).run(); // covers both the create above and the migration
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

      const user = await db.prepare('SELECT id, email, name, password_hash, settings, autobuy, lists, created_at FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: 'no account for this email' }, 401);
      if (!password) return json({ error: 'enter your password' }, 400);
      if (!user.password_hash) return json({ error: 'this account has no password — use magic link or BankID' }, 401);
      if (!(await verifyPassword(password, user.password_hash))) return json({ error: 'incorrect password' }, 401);
      return json(await meBody(db, user, !!env.HIDE_AUTOBUY), 200, { 'set-cookie': await startSession(db, user.id) });
    }

    // Web Push: the VAPID public key is public by definition — the browser
    // needs it as applicationServerKey before it can subscribe at all.
    if (route === 'GET /api/push/key') {
      return json({ key: env.VAPID_PUBLIC_KEY || null });
    }

    // Manual send, bearer-gated like the rest of the ops surface. Body:
    // { title, body, url?, email? } — email narrows to one user's devices.
    // ponytail: fires from tools/push.mjs by hand; becomes the alert cron's
    // delivery channel when price-drop pushes ship for real.
    if (route === 'POST /api/admin/push') {
      const denied = ingestAuth(request, env);
      if (denied) return denied;
      if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return json({ error: 'disabled (no VAPID keys)' }, 503);
      const body = await request.json().catch(() => ({}));
      const title = String(body.title || '').trim();
      if (!title) return json({ error: 'title required' }, 400);
      const payload = { title, body: String(body.body || ''), url: String(body.url || '/') };
      const email = body.email ? String(body.email).trim().toLowerCase() : null;
      // 40 devices per call — free-plan subrequest ceiling, same cap as drainImages
      const { results: subs } = await (email
        ? db.prepare('SELECT s.endpoint, s.p256dh, s.auth FROM push_subs s JOIN users u ON u.id = s.user_id WHERE u.email = ? LIMIT 40').bind(email)
        : db.prepare('SELECT endpoint, p256dh, auth FROM push_subs LIMIT 40')).all();
      let sent = 0, pruned = 0, failed = 0;
      await Promise.all(subs.map(async (sub) => {
        const status = await sendPush(env, sub, payload).catch(() => 0);
        if (status >= 200 && status < 300) sent++;
        else if (status === 404 || status === 410) {
          pruned++;
          await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
        } else failed++;
      }));
      return json({ ok: true, devices: subs.length, sent, pruned, failed });
    }

    const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
    const user = await sessionUser(db, token);

    // stores the browser's PushSubscription verbatim ({endpoint, keys})
    if (route === 'POST /api/push/subscribe') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const sub = await request.json().catch(() => ({}));
      const { endpoint, keys } = sub || {};
      if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1024
        || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string'
        || keys.p256dh.length > 200 || keys.auth.length > 100) return json({ error: 'bad subscription' }, 400);
      await db.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth')
        .bind(endpoint, user.id, keys.p256dh, keys.auth, Date.now()).run();
      return json({ ok: true });
    }

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
      const reviews = (await db.prepare('SELECT product_id, shop, claims, plus, minus, buy_shop, paid, show_paid, title, body, verified, hidden, created_at, updated_at FROM reviews WHERE user_id = ? ORDER BY id DESC').bind(user.id).all()).results;
      const review_votes = (await db.prepare('SELECT review_id FROM review_votes WHERE user_id = ?').bind(user.id).all()).results.map(r => r.review_id);
      const push_subs = (await db.prepare('SELECT endpoint, created_at FROM push_subs WHERE user_id = ?').bind(user.id).all()).results;
      return json({ ...await meBody(db, user), alerts: await alertsBody(db, user.id, -1), reports, reviews, review_votes, push_subs }, 200,
        { 'content-disposition': 'attachment; filename="pricy-export.json"' });
    }

    // GDPR delete: every row keyed to the user dies (settings/autobuy/lists
    // blobs live on the users row), and the session cookie is expired
    if (route === 'DELETE /api/account') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      // products whose review aggregate must be recomputed once the rows die
      const reviewed = (await db.prepare('SELECT DISTINCT product_id FROM reviews WHERE user_id = ? AND product_id IS NOT NULL').bind(user.id).all()).results.map(r => r.product_id);
      await db.batch([
        db.prepare('DELETE FROM alerts WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM reports WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM review_votes WHERE user_id = ? OR review_id IN (SELECT id FROM reviews WHERE user_id = ?)').bind(user.id, user.id),
        db.prepare('DELETE FROM reviews WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM purchases WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM watches WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM list_shares WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM list_members WHERE owner_id = ? OR user_id = ?').bind(user.id, user.id),
        db.prepare('DELETE FROM list_bought WHERE owner_id = ? OR user_id = ?').bind(user.id, user.id),
        db.prepare('DELETE FROM oauth_codes WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM login_tokens WHERE email = ?').bind(user.email),
        db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
      ]);
      for (const pid of reviewed) await refreshReviewMeta(db, pid);
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
        || list.some(w => typeof w.id !== 'string' || (w.target != null && typeof w.target !== 'number')
          || (w.inclShip != null && typeof w.inclShip !== 'boolean'))
        || new Set(list.map(w => w.id)).size !== list.length;
      if (bad) return json({ error: 'bad watchlist' }, 400);
      // ponytail: whole-list replace — the client (WatchStore) owns the list;
      // per-item endpoints when lists get big or multi-device concurrent
      await db.batch([
        db.prepare('DELETE FROM watches WHERE user_id = ?').bind(user.id),
        ...list.map(w => db.prepare('INSERT INTO watches (user_id, product_id, target, paused, inclShip) VALUES (?, ?, ?, ?, ?)')
          .bind(user.id, w.id, w.target ?? null, w.paused ? 1 : 0, w.inclShip ? 1 : 0)),
      ]);
      return json({ ok: true });
    }

    // Custom lists (ListStore): same JSON-blob seam as PUT /api/autobuy —
    // whole-array replace, the client owns the shape ({id, name, icon, items,
    // shared, bought, createdAt} per list). The "Overvåket" system list is
    // computed client-side off watches and never stored. Sharing is still
    // demo-only upstream (fake link/people) — real share tokens and member
    // access get their own table when that lands.
    if (route === 'PUT /api/lists') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const lists = await request.json().catch(() => null);
      const bad = !Array.isArray(lists) || lists.length > 50
        || lists.some(l => !l || typeof l !== 'object' || Array.isArray(l)
          || typeof l.id !== 'string' || typeof l.name !== 'string'
          || !Array.isArray(l.items) || l.items.some(i => typeof i !== 'string'))
        || new Set(lists.map(l => l.id)).size !== lists.length
        || JSON.stringify(lists).length > 32000;
      if (bad) return json({ error: 'bad lists' }, 400);
      await db.prepare('UPDATE users SET lists = ? WHERE id = ?').bind(JSON.stringify(lists), user.id).run();
      return json({ ok: true });
    }

    // Mint a share link for one of the session user's lists. Reissue =
    // replace: a second POST kills the previous link, so boot caches the
    // returned url in the list's shared.url and only ever POSTs once.
    if (request.method === 'POST' && url.pathname.startsWith('/api/lists/') && url.pathname.endsWith('/share')) {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const id = decodeURIComponent(url.pathname.slice('/api/lists/'.length, -'/share'.length));
      if (!(user.lists ? JSON.parse(user.lists) : []).some(l => l.id === id)) return json({ error: 'unknown list' }, 404);
      const token = newToken();
      await db.batch([
        db.prepare('DELETE FROM list_shares WHERE user_id = ? AND list_id = ?').bind(user.id, id),
        db.prepare('INSERT INTO list_shares (token_hash, user_id, list_id, created_at) VALUES (?, ?, ?, ?)')
          .bind(await sha(token), user.id, id, Date.now()),
      ]);
      return json({ url: `${url.origin}/l/${token}` });
    }

    // Member surface for a shared list — session required (the link is a
    // capability, but not a public one). GET returns the list with live
    // prices; a non-owner's first request joins them as a member. POST
    // toggles a bought-mark: members only their own, the owner anyone's.
    // Gift privacy is enforced HERE: the owner's payload never carries who.
    if (url.pathname.startsWith('/api/l/')) {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const share = await db.prepare('SELECT user_id, list_id FROM list_shares WHERE token_hash = ?')
        .bind(await sha(decodeURIComponent(url.pathname.slice('/api/l/'.length)))).first();
      if (!share) return json({ error: 'not found' }, 404);
      const role = share.user_id === user.id ? 'owner' : 'member';
      const owner = role === 'owner' ? user
        : await db.prepare('SELECT id, name, lists, settings FROM users WHERE id = ?').bind(share.user_id).first();
      const l = owner && (owner.lists ? JSON.parse(owner.lists) : []).find(x => x.id === share.list_id);
      if (!l) return json({ error: 'not found' }, 404); // owner or list gone — the link is dead
      await seedCatalog(db); // before the POST block: the bought push reads the product's name
      if (role === 'member') {
        const known = await db.prepare('SELECT 1 AS x FROM list_members WHERE owner_id = ? AND list_id = ? AND user_id = ?')
          .bind(share.user_id, share.list_id, user.id).first();
        await db.prepare('INSERT OR IGNORE INTO list_members (owner_id, list_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
          .bind(share.user_id, share.list_id, user.id, Date.now()).run();
        if (!known && (owner.settings ? JSON.parse(owner.settings) : {}).push === true) {
          await pushToUser(db, env, owner.id, {
            title: `${user.name} joined «${l.name}»`, body: 'They can now see the list and mark gifts as bought',
            url: `/lists?id=${encodeURIComponent(l.id)}`,
          });
        }
      }
      if (request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        if (typeof b.product_id !== 'string' || !(l.items || []).includes(b.product_id)) return json({ error: 'not in list' }, 400);
        if (b.bought) {
          // OR IGNORE: already bought by someone else is a no-op, the
          // response below shows them who beat them to it
          const had = await db.prepare('SELECT 1 AS x FROM list_bought WHERE owner_id = ? AND list_id = ? AND product_id = ?')
            .bind(share.user_id, share.list_id, b.product_id).first();
          await db.prepare('INSERT OR IGNORE INTO list_bought (owner_id, list_id, product_id, user_id, at) VALUES (?, ?, ?, ?, ?)')
            .bind(share.user_id, share.list_id, b.product_id, user.id, Date.now()).run();
          if (!had) {
            // gift coordination: tell the OTHER members someone bought it, so
            // nobody double-buys. NEVER the owner — the in-app marks already
            // hide who, and a push at purchase time would spoil the surprise
            // by timing alone.
            const { results: mem } = await db.prepare('SELECT u.id, u.settings FROM list_members m JOIN users u ON u.id = m.user_id WHERE m.owner_id = ? AND m.list_id = ? AND m.user_id != ?')
              .bind(share.user_id, share.list_id, user.id).all();
            const pMeta = await db.prepare('SELECT meta FROM products WHERE id = ?').bind(b.product_id).first();
            const pName = (pMeta && JSON.parse(pMeta.meta).name) || b.product_id;
            const tok = decodeURIComponent(url.pathname.slice('/api/l/'.length));
            for (const m of mem) {
              if ((m.settings ? JSON.parse(m.settings) : {}).push === true) {
                await pushToUser(db, env, m.id, {
                  title: `Bought: ${pName}`, body: `Marked as bought on «${l.name}»`, url: `/l/${tok}`,
                });
              }
            }
          }
        } else {
          await (role === 'owner'
            ? db.prepare('DELETE FROM list_bought WHERE owner_id = ? AND list_id = ? AND product_id = ?')
              .bind(share.user_id, share.list_id, b.product_id)
            : db.prepare('DELETE FROM list_bought WHERE owner_id = ? AND list_id = ? AND product_id = ? AND user_id = ?')
              .bind(share.user_id, share.list_id, b.product_id, user.id)).run();
        }
      }
      const [members, marks, products] = await Promise.all([
        db.prepare('SELECT u.name FROM list_members m JOIN users u ON u.id = m.user_id WHERE m.owner_id = ? AND m.list_id = ? ORDER BY m.joined_at')
          .bind(share.user_id, share.list_id).all().then(r => r.results),
        db.prepare('SELECT b.product_id, b.user_id, b.at, u.name FROM list_bought b JOIN users u ON u.id = b.user_id WHERE b.owner_id = ? AND b.list_id = ?')
          .bind(share.user_id, share.list_id).all().then(r => r.results),
        rowsFor(db, l.items || [], { expand: false }),
      ]);
      const gift = !!(l.shared && l.shared.gift);
      return json({
        list: { id: l.id, name: l.name, icon: l.icon, gift, role, owner: owner.name, items: l.items || [] },
        members: members.map(m => ({ name: m.name, initials: initials(m.name) })),
        bought: Object.fromEntries(marks.map(m => [m.product_id, {
          at: m.at, mine: m.user_id === user.id,
          ...(role === 'owner' && gift ? {} : { by: m.name }),
        }])),
        products,
      });
    }

    // UGC product reviews (plans/folkedommen-reviews.md). Batch GET for the PDP
    // hydrate, `mine=1` for the account tab; POST is create-or-edit-your-own
    // (the partial unique index makes the upsert atomic; editing never clears
    // hidden, so a moderated author can't republish by editing).
    // verified = a purchases row matches.
    if (route === 'GET /api/reviews') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      if (url.searchParams.get('mine') === '1') return json({ reviews: await myReviews(db, user.id) });
      const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length || ids.length > 100) return json({ error: 'need ids (max 100)' }, 400);
      return json({ reviews: await reviewsFor(db, ids, user.id) });
    }

    if (route === 'POST /api/reviews') {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const b = await request.json().catch(() => ({}));
      const pid = typeof b.product_id === 'string' ? b.product_id.trim() : '';
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const text = typeof b.body === 'string' ? b.body.trim() : '';
      // the three claims are the ONLY required field — upstream's own gate says
      // the same ("«Vet ikke» er også et svar"), title/body are optional now.
      // Per-key check, not a regex on the join: {worth: 'yn'} would join to a
      // valid string with the answers shifted onto the wrong claims.
      const claimVals = CLAIM_KEYS.map(k => (b.claims || {})[k]);
      const claims = claimVals.every(c => c === 'y' || c === 'n' || c === 'u') ? claimVals.join('') : '';
      const shop = b.shop == null || b.shop === '' ? null : String(b.shop).trim();
      const paid = b.paid == null ? null : b.paid;
      // free text rendered to other users — the caps are not optional
      const traits = (v) => [...new Set((Array.isArray(v) ? v : [])
        .map(t => String(t == null ? '' : t).trim().slice(0, 40)).filter(Boolean))].slice(0, 6);
      if (!pid || !claims || title.length > 80 || text.length > 2000
        || (shop != null && shop.length > 60)
        || (paid != null && (!Number.isInteger(paid) || paid < 1 || paid > 1_000_000))) {
        return json({ error: 'bad review' }, 400);
      }
      await seedCatalog(db);
      if (!await db.prepare(`SELECT 1 FROM products WHERE id = ? AND ${visible()}`).bind(pid).first()) {
        return json({ error: 'unknown product' }, 400);
      }
      const verified = await db.prepare('SELECT 1 FROM purchases WHERE user_id = ? AND product_id = ? LIMIT 1').bind(user.id, pid).first() ? 1 : 0;
      const showPaid = paid != null && (b.show_paid === true || b.show_paid === 1) ? 1 : 0;
      // created_at is NOT overwritten on conflict — the card keeps its real
      // date, and `edited` is derivable as updated_at > created_at. One shared
      // timestamp: two Date.now() calls can straddle a ms tick, and a create
      // with updated_at = created_at + 1 renders as edited.
      const now = Date.now();
      await db.prepare(
        `INSERT INTO reviews (user_id, product_id, rating, claims, plus, minus, buy_shop, paid, show_paid, title, body, verified, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, product_id) WHERE product_id IS NOT NULL
         DO UPDATE SET claims = excluded.claims, plus = excluded.plus, minus = excluded.minus,
           buy_shop = excluded.buy_shop, paid = excluded.paid, show_paid = excluded.show_paid,
           title = excluded.title, body = excluded.body, verified = excluded.verified,
           updated_at = excluded.updated_at`
      ).bind(user.id, pid, claims, JSON.stringify(traits(b.plus)), JSON.stringify(traits(b.minus)),
        shop, paid, showPaid, title, text, verified, now, now).run();
      await refreshReviewMeta(db, pid);
      return json({ reviews: await reviewsFor(db, [pid], user.id) });
    }

    // Delete your own review (ReviewStore.remove, wired on the PDP card and in
    // the account tab). Own only — a 404 either way, so this never tells you
    // whether someone else's review with that id exists.
    if (request.method === 'DELETE' && /^\/api\/reviews\/\d+$/.test(url.pathname)) {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const id = Number(url.pathname.split('/')[3]);
      const gone = await db.prepare('DELETE FROM reviews WHERE id = ? AND user_id = ? RETURNING product_id').bind(id, user.id).first();
      if (!gone) return json({ error: 'not found' }, 404);
      await db.prepare('DELETE FROM review_votes WHERE review_id = ?').bind(id).run();
      await refreshReviewMeta(db, gone.product_id);
      return json({ reviews: await reviewsFor(db, [gone.product_id], user.id) });
    }

    // Helpful-vote toggle — one per (review, user), count at read
    if (request.method === 'POST' && /^\/api\/reviews\/\d+\/vote$/.test(url.pathname)) {
      if (!user) return json({ error: 'unauthenticated' }, 401);
      const id = Number(url.pathname.split('/')[3]);
      if (!await db.prepare('SELECT 1 FROM reviews WHERE id = ? AND hidden = 0').bind(id).first()) {
        return json({ error: 'not found' }, 404);
      }
      const undone = await db.prepare('DELETE FROM review_votes WHERE review_id = ? AND user_id = ? RETURNING review_id').bind(id, user.id).first();
      if (!undone) await db.prepare('INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)').bind(id, user.id).run();
      const { n } = await db.prepare('SELECT COUNT(*) AS n FROM review_votes WHERE review_id = ?').bind(id).first();
      return json({ helpful: n, voted: !undone });
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
    // and work off whatever image URLs are queued — the cron alone is slow
    // (~40/hour), POST /api/admin/images is the fast lane after a big crawl
    const drained = await drainImages(db, env).catch(e => console.error(`image drain failed: ${e.message}`));
    if (drained?.done) await bumpVer(db).run();
    // gtin→brick resolution rides the same hourly tick (gpc-strict)
    await resolveGpcQueue(db, env).catch(e => console.error(`gpc drain failed: ${e.message}`));
  },
};
