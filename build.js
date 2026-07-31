// Build: proto/ (synced Claude Design prototype) → dist/
//   proto/index.html is a thin loader: babel <script src="X.jsx"> refs +
//   <link>ed css, all living next to it in proto/.
//   dist/app.js     all referenced .jsx files except the last (AppRouter,
//                   the design harness), plus boot.jsx, compiled with esbuild
//   dist/index.html the loader html with CDN dev React/Babel swapped for
//                   vendored production UMDs and the babel refs replaced
//                   by <script src="app.js">
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { RULE_KEYS } = require('./worker/facetrules.js');

const REPO = __dirname;
const DIST = path.join(REPO, 'dist');
let html = fs.readFileSync(path.join(REPO, 'proto', 'index.html'), 'utf8');

// --- resolve the babel blocks from their split files ----------
const BLOCK_RE = /[ \t]*<script type="text\/babel"[^>]*\bsrc="([^"]+)"[^>]*><\/script>\n?/g;
const srcs = [...html.matchAll(BLOCK_RE)].map(m => m[1]);
if (srcs.length < 2) throw new Error('expected multiple babel script refs in proto/index.html');
if (/<script type="text\/babel"(?![^>]*\bsrc=)/.test(html)) {
  throw new Error('inline babel block found — the prototype must reference split .jsx files only');
}
const blocks = srcs.map(f => '\n' + fs.readFileSync(path.join(REPO, 'proto', f), 'utf8') + '\n');
const harness = blocks.pop(); // AppRouter.jsx — the designer's preview router, replaced by boot.jsx

// designer's frozen layout choices live in the harness between EDITMODE markers
const defaults = harness.match(/\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//);
if (!defaults) throw new Error('TWEAK_DEFAULTS EDITMODE markers not found in harness block');
const tweaks = JSON.parse(defaults[1].replace(/(\w+):/g, '"$1":')); // sanity: must be a plain object literal

// the Worker's HIDE_AUTOBUY var (MCP tools, /api/buy, /api/autobuy, me blob)
// must agree with the designer's hideAutobuy tweak (every UI surface) — a
// split brain hides the buttons but keeps selling
const hideVar = fs.readFileSync(path.join(REPO, 'wrangler.jsonc'), 'utf8').match(/"HIDE_AUTOBUY"\s*:\s*(true|false)/);
if (!hideVar || (hideVar[1] === 'true') !== !!tweaks.hideAutobuy) {
  throw new Error(`wrangler.jsonc HIDE_AUTOBUY (${hideVar ? hideVar[1] : 'missing'}) must match the prototype's TWEAK_DEFAULTS.hideAutobuy (${!!tweaks.hideAutobuy})`);
}

const jsx = [
  `window.TWEAK_DEFAULTS = ${defaults[1]};`,
  ...blocks,
  fs.readFileSync(path.join(REPO, 'boot.jsx'), 'utf8'),
].join('\n;\n');
const compiled = esbuild.transformSync(jsx, { loader: 'jsx', target: 'es2020' }).code;

// --- catalog: run the prototype blocks in Node, dump the enriched CATALOG --
// Blocks only touch React/window at module load (DOM access is inside
// effects), so a bare vm context is enough.
const blockCode = esbuild.transformSync(blocks.join('\n;\n'), { loader: 'jsx', target: 'es2020' }).code;
const ctx = vm.createContext({ React: {}, console });
ctx.window = ctx;
vm.runInContext(blockCode, ctx, { filename: 'proto-blocks.js' });
const catalog = ctx.CATALOG;
if (!Array.isArray(catalog) || !catalog.length || catalog.some(p => !p.id || !p.offers || !p.history)) {
  throw new Error('catalog extraction from the prototype blocks produced bad data');
}

// --- 4e: variant children — every non-default combo becomes its own product
// row (id `<head>~<comboKey>`), derived by the prototype's own variantListing
// in the same vm context so demo offers/history stay byte-identical to the
// deployed preview's synth. Child meta: family + vlabel + vlabel-baked name,
// no variants (the picker's axes live on the head only).
const children = [];
for (const p of catalog.filter(p => p.variants)) {
  let combos = [{}];
  for (const ax of p.variants.axes) {
    for (const o of ax.options) {
      if (o.id.includes('-')) throw new Error(`variant option id "${o.id}" contains "-" (the combo-key separator)`);
    }
    combos = combos.flatMap(c => ax.options.map(o => ({ ...c, [ax.id]: o.id })));
  }
  for (const sel of combos.slice(1)) { // combos[0] = all defaults = the head row itself
    const { variants, ...v } = ctx.variantListing(p, sel);
    const key = p.variants.axes.map(ax => sel[ax.id]).join('-');
    children.push({ ...v, id: `${p.id}~${key}`, name: `${p.name} · ${v.vlabel}`, family: p.id });
  }
}
if (catalog.some(p => p.variants)) {
  // determinism guard: the deployed preview synthesizes this combo at 10190
  const probe = children.find(c => c.id === 'iphone~256-blue');
  if (!probe || probe.best !== 10190 || probe.offers[0].price !== probe.best) {
    throw new Error(`variant child prices diverged from the preview's synth (iphone~256-blue = ${probe && probe.best})`);
  }
}

// --- extra products (worker/extra.json, hand-written) -----------
// Heads the prototype doesn't know about — meta only, no demo offers/history;
// real prices arrive via ingest. Riding seed.json means seedCatalog,
// discover.mjs and crawl.mjs all see them with no further wiring.
const extra = JSON.parse(fs.readFileSync(path.join(REPO, 'worker', 'extra.json'), 'utf8'));
{
  // worker/cats.json is the category registry — new cats go there, not
  // upstream; boot appends server-known cats into the prototype's list
  const CATS = JSON.parse(fs.readFileSync(path.join(REPO, 'worker', 'cats.json'), 'utf8'));
  for (const c of ctx.CATEGORIES) if (!CATS[c]) throw new Error(`worker/cats.json is missing prototype category "${c}" — registry must be a superset`);
  // a derived facet nobody declared is invisible (Results renders one group
  // per facets.json def), and a def for an unknown cat never renders at all
  const FACETS = JSON.parse(fs.readFileSync(path.join(REPO, 'worker', 'facets.json'), 'utf8'));
  for (const c of Object.keys(FACETS)) if (!CATS[c]) throw new Error(`worker/facets.json has facets for unknown category "${c}"`);
  for (const [c, keys] of Object.entries(RULE_KEYS)) {
    const declared = new Set((FACETS[c] || []).map(d => d.key));
    for (const k of keys) if (!declared.has(k)) throw new Error(`worker/facetrules.js derives "${k}" for ${c}, but worker/facets.json declares no such facet`);
  }
  // depts.json (GPC departments) is a navigation alias over cats — every
  // rule must back onto a real cat, and every cat must stay reachable from
  // at least one whole-cat rule or it vanishes from Browse/rail/suggest
  const DEPTS = JSON.parse(fs.readFileSync(path.join(REPO, 'worker', 'depts.json'), 'utf8'));
  {
    const bricks = new Set(), deptIds = new Set(), covered = new Set();
    for (const d of DEPTS) {
      if (!d.id || !d.name || !d.icon || !Array.isArray(d.rules) || !d.rules.length) throw new Error(`depts.json dept needs id/name/icon/rules: ${JSON.stringify(d.id)}`);
      if (deptIds.has(d.id)) throw new Error(`depts.json duplicate dept id: ${d.id}`);
      deptIds.add(d.id);
      for (const r of d.rules) {
        if (!r.b || !r.name || !r.icon) throw new Error(`depts.json rule needs b/name/icon: ${JSON.stringify(r)}`);
        if (bricks.has(r.b)) throw new Error(`depts.json duplicate brick code: ${r.b}`);
        bricks.add(r.b);
        if (!CATS[r.cat]) throw new Error(`depts.json rule "${r.name}": unknown category "${r.cat}"`);
        if (!r.facets && !r.label) covered.add(r.cat);
      }
    }
    for (const c of Object.keys(CATS)) if (!covered.has(c)) throw new Error(`depts.json leaves category "${c}" unreachable — it needs a whole-cat rule in some department`);
  }
  const ids = new Set([...catalog, ...children].map(p => p.id));
  for (const p of extra) {
    if (!p.id || !p.name || !p.cat) throw new Error(`extra.json row needs id/name/cat: ${JSON.stringify(p)}`);
    if (p.id.includes('~')) throw new Error(`extra.json id "${p.id}" contains "~" (reserved for variant children)`);
    if (ids.has(p.id)) throw new Error(`extra.json duplicate/colliding id: ${p.id}`);
    if (!CATS[p.cat]) throw new Error(`extra.json "${p.id}": unknown category "${p.cat}" (worker/cats.json knows: ${Object.keys(CATS).join(', ')})`);
    ids.add(p.id);
  }
}

// --- sub-category `type` facet for prototype-owned rows (SUBCATS-PLAN) ----
// extra.json rows carry their own facets; demo rows can't (CATALOG is
// sync-owned) so they're stamped here. Explicit facets also outrank the demo
// spec strings ('Home console', 'Cordless stick', …) that would otherwise
// leak into the Type filter as a second vocabulary next to these values.
{
  const DEMO_TYPE = {
    airpods: 'Earbuds', airpods4: 'Earbuds',
    xm5: 'Headphones', 'bose-ultra': 'Headphones', 'senn-m4': 'Headphones',
    'sonos-ace': 'Headphones', 'jbl-tour2': 'Headphones', 'beats-pro': 'Headphones',
    switch: 'Consoles', ps5: 'Consoles', xbox: 'Consoles',
    steamdeck: 'Handhelds', switchlite: 'Handhelds', rogally: 'Handhelds',
    fc25: 'Games', zeldatotk: 'Games', bo6: 'Games',
    dualsense: 'Controllers', ultimate2c: 'Controllers', poweradv: 'Controllers',
    mba: 'Laptops', mbp14: 'Laptops', xps13: 'Laptops', yoga7x: 'Laptops',
    g14: 'Laptops', spectre: 'Laptops',
    macminim4: 'Desktops', omen35l: 'Desktops', ideacentre: 'Desktops',
    dyson: 'Vacuums', roborock: 'Vacuums', eufy: 'Vacuums', jet85: 'Vacuums',
    'philips-air': 'Climate', hue: 'Smart lighting',
    specialista: 'Coffee makers', barista: 'Coffee makers', mocca: 'Coffee makers',
    vertuopop: 'Coffee makers', ninja: 'Air fryers',
    'wilfa-kettle': 'Small appliances', kitchenaid: 'Small appliances',
    nutribullet900: 'Small appliances', mq9: 'Small appliances',
  };
  for (const [id, type] of Object.entries(DEMO_TYPE)) {
    const p = catalog.find(p => p.id === id);
    if (!p) throw new Error(`DEMO_TYPE id "${id}" is gone from the prototype CATALOG`);
    // the stamp WINS: upstream demo rows carry their own type vocabulary
    // ('Home console', 'Stick vacuum') that must not sit beside facetrules'
    // curated values in the rail
    p.facets = { ...p.facets, type };
  }
}

// --- rewrite the html ------------------------------------------
html = html
  .replace(BLOCK_RE, '')
  .replace(/<script src="https:\/\/unpkg\.com\/react@[^"]*"[^>]*><\/script>/, '<script src="vendor/react.production.min.js"></script>')
  .replace(/<script src="https:\/\/unpkg\.com\/react-dom@[^"]*"[^>]*><\/script>/, '<script src="vendor/react-dom.production.min.js"></script>')
  .replace(/<script src="https:\/\/unpkg\.com\/lucide@[^"]*"[^>]*><\/script>/, '<script src="vendor/lucide.min.js"></script>')
  .replace(/[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"[^>]*><\/script>\n?/, '')
  // Add-to-home-screen: the manifest is what Android/Chrome installs from;
  // iOS Safari needs the apple-* tags (it won't take an SVG touch icon, hence
  // the rasterised pwa/icon-512.png). The prototype's head is sync-owned, so
  // these live here.
  .replace(/<title>[^<]*<\/title>/, '<title>pricy.no — Never overpay</title>\n<base href="/">\n<link rel="icon" href="assets/logo-mark.svg">\n<link rel="manifest" href="/manifest.json">\n<link rel="apple-touch-icon" href="/icon-512.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="pricy">\n<meta name="theme-color" content="#F3F1E9">')
  .trimEnd();
// closing tags are optional HTML5 and the prototype has dropped them before —
// inject app.js against either shape
html = html.includes('</body>')
  ? html.replace('</body>', '<script src="app.js"></script>\n</body>')
  : html + '\n<script src="app.js"></script>\n</body>\n</html>\n';
if (!html.includes('<script src="app.js">')) throw new Error('app.js injection failed');
for (const cdn of ['unpkg.com', 'text/babel']) {
  if (html.includes(cdn)) throw new Error(`build output still references ${cdn}`);
}
// every locally-linked stylesheet must exist next to the loader in proto/
const localCss = [...html.matchAll(/<link[^>]*href="(?!https?:)([^"]+\.css)"/g)].map(m => m[1]);
for (const f of localCss) {
  if (!fs.existsSync(path.join(REPO, 'proto', f))) throw new Error(`html links ${f} but it's not in proto/`);
}

// --- write dist -------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'app.js'), compiled);
// ponytail: block all crawlers until we're ready to be indexed
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
// seed for the Worker's D1 bootstrap (4c) — /api/catalog.json is a dynamic
// route now, so nothing under dist/api/ may shadow it
// specs ride along on head rows (children inherit via family, specsFor is
// head-keyed) so the served catalog — not the client-baked table — is truth
fs.writeFileSync(path.join(REPO, 'worker', 'seed.json'), JSON.stringify([
  ...catalog.map(p => ctx.SPECS[p.id] ? { ...p, specs: ctx.SPECS[p.id] } : p),
  ...children,
  ...extra.map(p => ({ offers: [], history: [], ...p })), // uniform row shape; real offers arrive via ingest
]));
for (const f of fs.readdirSync(path.join(REPO, 'vendor')).filter(f => f.endsWith('.js'))) {
  fs.copyFileSync(path.join(REPO, 'vendor', f), path.join(DIST, 'vendor', f));
}
fs.cpSync(path.join(REPO, 'assets'), path.join(DIST, 'assets'), { recursive: true });
// pwa/ lands at the dist ROOT: sw.js must be served from / to claim / as its
// scope, and manifest.json's start_url/icon paths are written against it
fs.cpSync(path.join(REPO, 'pwa'), DIST, { recursive: true });
for (const f of localCss) fs.copyFileSync(path.join(REPO, 'proto', f), path.join(DIST, f));
console.log(`built dist/: app.js ${Math.round(compiled.length / 1024)}KB from ${blocks.length} prototype blocks + boot.jsx`);
