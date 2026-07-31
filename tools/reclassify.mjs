#!/usr/bin/env node
// PATCH live rows whose STORED label already resolves to a different category
// under the working tree's rules — the rows a crawl won't revisit soon.
//
//   node tools/reclassify.mjs            # dry run: counts by move
//   node tools/reclassify.mjs --apply    # PATCH them (man: null — not pinned)
//
// Why this exists (2026-07-31): every unapproved shop is SAMPLED at 400 pages
// per crawl (tools/crawl.mjs SAMPLE_LIMIT), so a vocabulary fix only reaches
// the rows whose product page happens to be in the sample — 281 of 1,214
// measured moves landed on the crawl after the product-eval vocabulary pass.
// Re-POSTing stored prices through /api/ingest would re-classify too, but it
// bumps offers.updated_at on prices nobody re-verified — a PATCH is honest.
// Reads the score-cats catalog cache; run `node tools/score-cats.mjs --fetch`
// first for fresh data. Same `real()` as score-cats: the shop's hand-mapped
// label, else the shared vocabulary — the floor is not evidence.
import { readFileSync, existsSync } from 'node:fs';
import { classify } from '../worker/index.js';

const CACHE = new URL('.catalog.json', import.meta.url);
if (!existsSync(CACHE)) { console.error('no tools/.catalog.json — run: node tools/score-cats.mjs --fetch'); process.exit(1); }
const { products } = JSON.parse(readFileSync(CACHE, 'utf8'));
const CATMAP = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')).vars.CATMAP;
const icons = JSON.parse(readFileSync(new URL('../worker/cats.json', import.meta.url), 'utf8'));

const shopsOf = r => [...new Set(r.offers.map(o => o.shop))];
const real = r => shopsOf(r).map(s => CATMAP[s]?.[r.srcCat]).find(Boolean) ?? classify(r.srcCat);
const targets = products.filter(r => r.auto).map(r => ({ r, cat: real(r) })).filter(({ r, cat }) => cat && cat !== r.cat);

const by = {};
for (const { r, cat } of targets) (by[`${r.cat} → ${cat}`] ??= []).push(r);
console.log(`${targets.length} live rows whose stored label resolves elsewhere:`);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(v.length).padStart(4)}  ${k.padEnd(24)} e.g. ${v[0].name.slice(0, 46)}  [${String(v[0].srcCat).slice(0, 40)}]`);

if (!process.argv.includes('--apply')) { console.log('\ndry run — pass --apply to PATCH these'); process.exit(0); }
const token = readFileSync(new URL('.ingest-token', import.meta.url), 'utf8').trim();
// same shape ingest writes on promotion; man: null keeps the row rule-owned
const kwOf = (...p) => [...new Set(p.join(' ').toLowerCase().match(/[\p{L}\d]+/gu) || [])].filter(t => t.length > 1).join(' ');
let ok = 0, failed = 0;
for (const { r, cat } of targets) {
  const body = { cat, icon: icons[cat], kw: kwOf(r.name, r.brand ?? '', cat), man: null };
  const res = await fetch(`https://pricy.no/api/admin/products/${encodeURIComponent(r.id)}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) ok++; else { failed++; console.error(`  ${r.id}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); }
}
console.log(`\npatched ${ok}, failed ${failed}`);
