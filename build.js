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
JSON.parse(defaults[1].replace(/(\w+):/g, '"$1":')); // sanity: must be a plain object literal

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
  const ids = new Set([...catalog, ...children].map(p => p.id));
  for (const p of extra) {
    if (!p.id || !p.name || !p.cat) throw new Error(`extra.json row needs id/name/cat: ${JSON.stringify(p)}`);
    if (p.id.includes('~')) throw new Error(`extra.json id "${p.id}" contains "~" (reserved for variant children)`);
    if (ids.has(p.id)) throw new Error(`extra.json duplicate/colliding id: ${p.id}`);
    if (!ctx.CATEGORIES.includes(p.cat)) throw new Error(`extra.json "${p.id}": unknown category "${p.cat}" (prototype knows: ${ctx.CATEGORIES.join(', ')})`);
    ids.add(p.id);
  }
}

// --- rewrite the html ------------------------------------------
html = html
  .replace(BLOCK_RE, '')
  .replace(/<script src="https:\/\/unpkg\.com\/react@[^"]*"[^>]*><\/script>/, '<script src="vendor/react.production.min.js"></script>')
  .replace(/<script src="https:\/\/unpkg\.com\/react-dom@[^"]*"[^>]*><\/script>/, '<script src="vendor/react-dom.production.min.js"></script>')
  .replace(/<script src="https:\/\/unpkg\.com\/lucide@[^"]*"[^>]*><\/script>/, '<script src="vendor/lucide.min.js"></script>')
  .replace(/[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"[^>]*><\/script>\n?/, '')
  .replace(/<title>[^<]*<\/title>/, '<title>pricy.no — Never overpay</title>\n<base href="/">\n<link rel="icon" href="assets/logo-mark.svg">')
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
for (const f of localCss) fs.copyFileSync(path.join(REPO, 'proto', f), path.join(DIST, f));
console.log(`built dist/: app.js ${Math.round(compiled.length / 1024)}KB from ${blocks.length} prototype blocks + boot.jsx`);
