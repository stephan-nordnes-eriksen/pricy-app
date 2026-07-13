// Render-check: loads _ds_bundle.js + app.js the way the browser does,
// then renderToString's every route and asserts on expected content.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const React = require('react');
const { renderToString } = require('react-dom/server');

const REPO = __dirname;

// --- browser-ish globals, as index.html provides them ---------
global.window = global;
global.React = React;
Object.assign(global, React); // the hooks-on-window shim
global.location = { pathname: '/', search: '' };
global.history = { pushState() {} };
global.document = { getElementById: () => ({}) };
global.ReactDOM = { createRoot: () => ({ render() {} }) }; // app.js mounts; we render manually
global.scrollTo = () => {};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.lucide = { createIcons() {} };

const ns = JSON.parse(fs.readFileSync(REPO + '/_ds_manifest.json', 'utf8')).namespace;
vm.runInThisContext(fs.readFileSync(REPO + '/_ds_bundle.js', 'utf8'), { filename: '_ds_bundle.js' });
assert.deepStrictEqual(window[ns].__errors, [], 'design bundle load errors');
vm.runInThisContext(fs.readFileSync(REPO + '/app.js', 'utf8'), { filename: 'app.js' });

// expectations derive from the synced mock data so future design syncs
// that change products don't false-fail the check
const p = window.PRODUCTS[0];
const routes = [
  ['/', '', ['pcard', 'hero']],
  ['/deals', '', ['deal__drop', 'deal__name']],
  ['/search', '?q=' + p.name.slice(0, 6), ['rrow__name', p.name]],
  ['/product/' + p.id, '', ['bestbox__top', 'Best price', 'orow', 'Price history', p.name]],
  ['/product/nope-does-not-exist', '', ['Product not found']],
];

let failed = 0;
for (const [pathname, search, expects] of routes) {
  global.location = { pathname, search };
  const html = renderToString(React.createElement(App));
  for (const s of expects) {
    if (!html.includes(s)) { console.log(`FAIL ${pathname}${search}: missing "${s}"`); failed++; }
  }
  console.log(`${pathname}${search}: rendered ${html.length} chars`);
}
console.log(failed ? `${failed} FAILURES` : 'ALL ROUTES OK');
process.exit(failed ? 1 : 0);
