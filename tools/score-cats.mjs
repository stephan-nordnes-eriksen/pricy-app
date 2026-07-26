#!/usr/bin/env node
// Score the CURRENT working-tree category rules against the LIVE catalog.
//
//   node tools/score-cats.mjs                 # buckets + moves + floor audit
//   node tools/score-cats.mjs --labels 80     # …plus the top unread labels
//   node tools/score-cats.mjs --moves         # …plus every category move, by cat
//   node tools/score-cats.mjs --shop JYSK     # what one shop's floor disagrees with
//
// Why this exists: three separate category-rule changes have been tuned on a
// sample and been wrong (see plans/category-misclassification.md). A rule edit's
// blast radius is only visible over the whole catalog, so measure it there.
// Caches the 11.5 MB dump in tools/.catalog.json (gitignored) — it 503s about 1
// request in 3, so re-fetch with --fetch only when you want fresh data.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { classify, CAT_WEAK } from '../worker/index.js';

const CACHE = new URL('.catalog.json', import.meta.url);
const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const has = f => process.argv.includes(f);

if (has('--fetch') || !existsSync(CACHE)) {
  const token = readFileSync(new URL('.ingest-token', import.meta.url), 'utf8').trim();
  let body;
  for (let i = 1; i <= 6 && !body; i++) {
    const res = await fetch('https://pricy.no/api/catalog.json', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) body = await res.text(); else console.error(`attempt ${i}: HTTP ${res.status}`);
  }
  if (!body) { console.error('catalog.json never returned 200 — it 503s under its own size, try again'); process.exit(1); }
  writeFileSync(CACHE, body);
}
const { products } = JSON.parse(readFileSync(CACHE, 'utf8'));
// CATMAP lives in wrangler.jsonc; the only comments in it are whole-line //
const CATMAP = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')).vars.CATMAP;

const auto = products.filter(r => r.auto);
const shopsOf = r => [...new Set(r.offers.map(o => o.shop))];
// mirrors ingest(): the shop's hand-mapped label, else the shared vocabulary.
// The floor is deliberately NOT part of this — it is not evidence.
const real = r => shopsOf(r).map(s => CATMAP[s]?.[r.srcCat]).find(Boolean) ?? classify(r.srcCat);

const nosrc = auto.filter(r => !r.srcCat);
const unread = auto.filter(r => r.srcCat && !real(r));
const read = auto.filter(r => real(r));
const pct = n => (100 * n / auto.length).toFixed(1) + '%';
console.log(`${auto.length} auto rows of ${products.length} products`);
console.log(`  decided by the product's own label   ${String(read.length).padStart(6)}  ${pct(read.length)}`);
console.log(`  label present, vocabulary can't read ${String(unread.length).padStart(6)}  ${pct(unread.length)}`);
console.log(`  no label at all                      ${String(nosrc.length).padStart(6)}  ${pct(nosrc.length)}`);
console.log(`  → shop floor decides                 ${String(unread.length + nosrc.length).padStart(6)}  ${pct(unread.length + nosrc.length)}`);

// A live row only ever changes category when its own label resolves elsewhere.
const moves = read.filter(r => real(r) !== r.cat);
const mv = {};
for (const r of moves) (mv[`${r.cat} → ${real(r)}`] ??= []).push(r);
console.log(`\n${moves.length} rows would change category on the next crawl:`);
for (const [k, v] of Object.entries(mv).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(v.length).padStart(4)}  ${k.padEnd(26)} e.g. ${v[0].name.slice(0, 46)}  [${v[0].srcCat.slice(0, 40)}]`);
  if (has('--moves')) for (const r of v.slice(0, 12)) console.log(`          ${r.name.slice(0, 58).padEnd(60)} ${r.srcCat}`);
}

// Per category: how much of it was filed by a shop floor rather than by any
// evidence about the product. This is the "TV holds 106 products, 2 are
// televisions" number, one category at a time.
const cats = {};
for (const r of auto) { const c = cats[r.cat] ??= { tot: 0, fl: 0 }; c.tot++; if (!real(r)) c.fl++; }
console.log('\nhow much of each category came from a shop floor, not the product:');
for (const [c, v] of Object.entries(cats).sort((a, b) => b[1].fl / b[1].tot - a[1].fl / a[1].tot))
  if (v.tot > 40) console.log(`  ${c.padEnd(12)} ${String(v.fl).padStart(5)} of ${String(v.tot).padStart(5)}  ${(100 * v.fl / v.tot).toFixed(0).padStart(3)}%`);

// Floor audit: for each CATMAP["*"], how much of the shop's catalog it still
// decides, and how often the readable part of that catalog contradicts it.
const st = {};
for (const r of auto) {
  const ev = real(r);
  for (const s of shopsOf(r)) {
    if (!CATMAP[s]?.['*']) continue;
    const b = st[s] ??= { floor: CATMAP[s]['*'], tot: 0, lab: 0, ok: 0, fl: 0, bad: {} };
    b.tot++;
    if (!ev) b.fl++;
    else { b.lab++; if (ev === b.floor) b.ok++; else (b.bad[ev] ??= []).push(r); }
  }
}
console.log('\nshop floors — "decides" is what goes hidden if you drop it,');
console.log('"agrees" is how often the shop\'s OWN readable labels back the floor up:');
console.log('shop                   floor      catalog  decides   labels agrees');
for (const [s, b] of Object.entries(st).sort((a, b2) => b2[1].fl - a[1].fl))
  console.log(`${s.padEnd(22)} ${b.floor.padEnd(10)} ${String(b.tot).padStart(7)} ${String(b.fl).padStart(8)} ${String(b.lab).padStart(8)} ${b.lab ? (100 * b.ok / b.lab).toFixed(0).padStart(5) + '%' : '     —'}`);
const one = arg('--shop');
if (one) for (const [c, v] of Object.entries(st[one]?.bad ?? {}).sort((a, b) => b[1].length - a[1].length))
  console.log(`\n${one}: label says ${c}, floor says ${st[one].floor}  (${v.length})\n  ` +
    v.slice(0, 10).map(r => `${r.name.slice(0, 52).padEnd(54)} ${r.srcCat}`).join('\n  '));

// Unread labels, with the nav-only ones split out: a label that is nothing but
// audience/navigation crumbs can never be read, so it is floor-or-nothing.
if (has('--labels')) {
  const CRUMB = /\s*(?:>|›|»|\||::|\/)\s*/;
  const lab = {}; let nav = 0;
  for (const r of unread) {
    const live = r.srcCat.split(CRUMB).map(c => c.trim()).filter(c => c && !CAT_WEAK.test(c));
    const key = live.join(' > ');
    if (!key) { nav++; continue; }
    (lab[key] ??= { n: 0, ex: r.name, cat: r.cat }).n++;
  }
  const top = Object.entries(lab).sort((a, b) => b[1].n - a[1].n);
  console.log(`\n${unread.length} unread rows: ${nav} are navigation crumbs only, the rest spread over ${top.length} labels`);
  for (const [l, v] of top.slice(0, Number(arg('--labels', 60))))
    console.log(`${String(v.n).padStart(4)}  ${l.padEnd(46).slice(0, 46)} [${v.cat}] ${v.ex.slice(0, 40)}`);
  console.log(`top ${Math.min(100, top.length)} labels = ${top.slice(0, 100).reduce((a, b) => a + b[1].n, 0)} of those rows`);
}
