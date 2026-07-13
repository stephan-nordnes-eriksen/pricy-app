// Build: proto/index.html (synced Claude Design prototype) → dist/
//   dist/app.js     all prototype babel blocks except the last (the design
//                   harness), plus boot.jsx, compiled with esbuild
//   dist/index.html prototype html with CDN dev React/Babel swapped for
//                   vendored production UMDs and the babel blocks replaced
//                   by <script src="app.js">
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const REPO = __dirname;
const DIST = path.join(REPO, 'dist');
let html = fs.readFileSync(path.join(REPO, 'proto', 'index.html'), 'utf8');

// --- pull out the babel blocks --------------------------------
const BLOCK_RE = /[ \t]*<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>\n?/g;
const blocks = [...html.matchAll(BLOCK_RE)].map(m => m[1]);
if (blocks.length < 2) throw new Error('expected multiple babel blocks in proto/index.html');
const harness = blocks.pop(); // tweaks panel + preview App — replaced by boot.jsx

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
// every locally-linked stylesheet must exist in the repo (it gets copied below)
const localCss = [...html.matchAll(/<link[^>]*href="(?!https?:)([^"]+\.css)"/g)].map(m => m[1]);
for (const f of localCss) {
  if (!fs.existsSync(path.join(REPO, f))) throw new Error(`html links ${f} but it's not in the repo`);
}

// --- write dist -------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'app.js'), compiled);
fs.mkdirSync(path.join(DIST, 'api'));
fs.writeFileSync(path.join(DIST, 'api', 'catalog.json'), JSON.stringify(catalog));
for (const f of fs.readdirSync(path.join(REPO, 'vendor')).filter(f => f.endsWith('.js'))) {
  fs.copyFileSync(path.join(REPO, 'vendor', f), path.join(DIST, 'vendor', f));
}
fs.cpSync(path.join(REPO, 'assets'), path.join(DIST, 'assets'), { recursive: true });
for (const f of localCss) fs.copyFileSync(path.join(REPO, f), path.join(DIST, f));
console.log(`built dist/: app.js ${Math.round(compiled.length / 1024)}KB from ${blocks.length} prototype blocks + boot.jsx`);
