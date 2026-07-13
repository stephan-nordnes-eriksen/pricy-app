// UI tests: boot the app exactly as the browser does — the <script> pipeline
// from index.html executed inside jsdom — then drive it with real DOM events.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');

function boot(url = 'http://pricy.test/') {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const ctx = dom.getInternalVMContext();
  dom.window.scrollTo = () => {};
  // run the exact <script> sequence from index.html, so the test also
  // catches drift between index.html and what the tests assume
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s+src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 5, 'expected the index.html script pipeline');
  for (const [, src, inline] of scripts) {
    const code = src ? fs.readFileSync(path.join(REPO, src), 'utf8') : inline;
    vm.runInContext(code, ctx, { filename: src || 'index.html:inline' });
  }
  return dom.window;
}

const tick = () => new Promise(r => setTimeout(r, 25));
// passive effects (icon conversion) can land late in a busy process — poll
async function until(fn, ms = 1500) {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await tick();
  return fn();
}

function q(win, sel) { return win.document.querySelector(sel); }
function qa(win, sel) { return [...win.document.querySelectorAll(sel)]; }
function type(win, input, value) {
  const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function submit(win, form) {
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}
// prices render as "kr 2 990" with spaces; parse back to a number
function priceOf(el) { return Number(el.textContent.replace(/[^0-9]/g, '')); }

test('home renders hero, product grid, categories and popular chips', async () => {
  const win = boot();
  await tick();
  assert.match(q(win, '.hero h1').textContent, /Never overpay/);
  assert.strictEqual(qa(win, '.pcard').length, 8);
  assert.ok(qa(win, '.cchip').length >= win.POPULAR.length + win.CATEGORIES.length);
});

test('lucide icons render as inline svg', async () => {
  const win = boot();
  const ok = await until(() => qa(win, '#root .icon svg').length > 0 && qa(win, '#root i[data-lucide]').length === 0);
  assert.ok(ok, 'expected every <i data-lucide> replaced by svg');
});

test('clicking a product card opens that product page', async () => {
  const win = boot();
  await tick();
  const card = qa(win, '.pcard')[0];
  const name = card.querySelector('.pcard__name').textContent;
  card.click();
  await tick();
  assert.match(win.location.pathname, /^\/product\//);
  assert.strictEqual(q(win, '.pdp__info h1').textContent, name);
});

test('product page shows offers sorted by price with best row first', async () => {
  const p = boot().PRODUCTS[0];
  const win = boot(`http://pricy.test/product/${p.id}`);
  await tick();
  const rows = qa(win, '.orow');
  assert.strictEqual(rows.length, p.offers.length);
  const prices = rows.map(r => priceOf(r.querySelector('.price')));
  assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b), 'offers not ascending');
  assert.ok(rows[0].classList.contains('is-best'));
  assert.ok(q(win, '.chart svg'), 'price history chart missing');
});

test('hero search navigates to results for the typed query', async () => {
  const win = boot();
  await tick();
  type(win, q(win, '.hero__search input'), 'sony');
  // a real browser fires BOTH the button click and the form submit
  q(win, '.hero__search .btn').click();
  submit(win, q(win, '.hero__search'));
  await tick();
  assert.strictEqual(win.location.pathname + win.location.search, '/search?q=sony');
  assert.ok(qa(win, '.rrow__name').some(el => /sony/i.test(el.textContent)));
  // ...and must create exactly ONE history entry: back returns home
  win.history.back();
  await tick();
  assert.ok(q(win, '.hero'), 'back button should return to home in one step');
});

test('header search works from any page', async () => {
  const win = boot('http://pricy.test/deals');
  await tick();
  type(win, q(win, '.hdr__search input'), 'lego');
  submit(win, q(win, '.hdr__search'));
  await tick();
  assert.strictEqual(win.location.pathname + win.location.search, '/search?q=lego');
  assert.ok(qa(win, '.rrow__name').some(el => /lego/i.test(el.textContent)));
});

test('header search input reflects the active query after chip navigation', async () => {
  const win = boot();
  await tick();
  const chip = qa(win, '.hero__popular .cchip')[0];
  const term = chip.textContent;
  chip.click();
  await tick();
  assert.strictEqual(win.location.pathname + win.location.search, '/search?q=' + encodeURIComponent(term).replace(/%20/g, '%20'));
  assert.strictEqual(q(win, '.hdr__search input').value, term);
});

test('deals nav shows deals sorted by biggest drop', async () => {
  const win = boot();
  await tick();
  qa(win, '.navlink').find(el => el.textContent === 'Deals').click();
  await tick();
  assert.strictEqual(win.location.pathname, '/deals');
  const drops = qa(win, '.deal__drop').map(el => Number(el.textContent.replace(/[^0-9]/g, '')));
  assert.ok(drops.length > 0);
  assert.deepStrictEqual(drops, [...drops].sort((a, b) => b - a), 'deals not sorted by drop');
});

test('breadcrumb category link goes to category results', async () => {
  const p = boot().PRODUCTS[0];
  const win = boot(`http://pricy.test/product/${p.id}`);
  await tick();
  qa(win, '.pdp__crumb a').find(a => a.textContent === p.cat).click();
  await tick();
  assert.strictEqual(win.location.pathname + win.location.search, '/search?q=' + encodeURIComponent(p.cat));
});

test('footer links navigate', async () => {
  const win = boot();
  await tick();
  qa(win, '.ftr__col a')[0].click();
  await tick();
  assert.strictEqual(win.location.pathname, '/deals');
});

test('back and forward buttons work', async () => {
  const win = boot();
  await tick();
  qa(win, '.pcard')[0].click();
  await tick();
  win.history.back();
  await tick();
  assert.ok(q(win, '.hero'), 'back should return to home');
  win.history.forward();
  await tick();
  assert.ok(q(win, '.pdp__info'), 'forward should return to product');
});

test('unknown product shows not-found with a way home', async () => {
  const win = boot('http://pricy.test/product/does-not-exist');
  await tick();
  assert.match(win.document.body.textContent, /Product not found/);
  q(win, '.btn').click();
  await tick();
  assert.ok(q(win, '.hero'));
});

test('search with no matches falls back to showing everything', async () => {
  const win = boot('http://pricy.test/search?q=zzzznothing');
  await tick();
  assert.match(win.document.body.textContent, /Nothing matched/);
  assert.strictEqual(qa(win, '.rrow').length, boot().PRODUCTS.length);
});
