#!/usr/bin/env node
// Score the CURRENT working-tree facet rules against the LIVE catalog, as a
// DIFF against a committed baseline (default HEAD). Same discipline as
// score-cats.mjs — a rule edit's blast radius is only visible over the whole
// catalog — and shares its tools/.catalog.json cache (--fetch to refresh).
//
//   node tools/score-facets.mjs                # value moves vs HEAD, by cat/key
//   node tools/score-facets.mjs --ref abc123   # …vs another baseline
//   node tools/score-facets.mjs --moves        # …plus example rows per move
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deriveFacets } from '../worker/facetrules.js';
import { fetchHeads } from './catalog.mjs';

const CACHE = new URL('.catalog.json', import.meta.url);
const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const has = f => process.argv.includes(f);

if (has('--fetch') || !existsSync(CACHE)) {
  const token = process.env.INGEST_TOKEN || readFileSync(new URL('.ingest-token', import.meta.url), 'utf8').trim();
  const base = process.env.PRICY_URL || 'https://pricy.no';
  console.error(`paging ${base}/api/products …`);
  writeFileSync(CACHE, JSON.stringify({ products: await fetchHeads(base, token) }));
}
const { products } = JSON.parse(readFileSync(CACHE, 'utf8'));

// The ruleset key comes from the BRICK (worker/index.js facetKeyOf), not
// r.cat — post gpc-strict that's the segment display name, which names no
// RULES entry, so scoring with the default derived undefined on every row.
const GPC = JSON.parse(readFileSync(new URL('../worker/gpc.json', import.meta.url), 'utf8'));
const NO = JSON.parse(readFileSync(new URL('../worker/gpcno.json', import.meta.url), 'utf8'));
const gpcParent = (c) => GPC.bricks[c]?.[1] ?? GPC.classes[c]?.[1] ?? GPC.fams[c]?.[1];
const facetKeyOf = (code) => { for (let c = code; c; c = gpcParent(c)) if (NO.facetKeys[c]) return NO.facetKeys[c]; return undefined; };

// The baseline is the COMMITTED rules, imported straight from git — no temp
// file, facetrules.js is self-contained (keep it that way or this breaks).
const ref = arg('--ref', 'HEAD');
const src = execFileSync('git', ['show', `${ref}:worker/facetrules.js`], { encoding: 'utf8' });
const base = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).deriveFacets;

const moves = {};
let changed = 0;
for (const r of products) {
  const key = facetKeyOf(r.brick);
  const a = base(r, key) ?? {}, b = deriveFacets(r, key) ?? {};
  let hit = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    hit = true;
    (moves[`${r.cat.padEnd(12)} ${k}: ${a[k]} → ${b[k]}`] ??= []).push(r);
  }
  if (hit) changed++;
}

console.log(`${products.length} rows replayed, ${changed} would change a facet value vs ${ref}:`);
for (const [k, v] of Object.entries(moves).sort((x, y) => y[1].length - x[1].length)) {
  console.log(`  ${String(v.length).padStart(5)}  ${k.padEnd(52)} e.g. ${v[0].name.slice(0, 44)}  [${(v[0].srcCat || '').slice(0, 40)}]`);
  if (has('--moves')) for (const r of v.slice(0, 12)) console.log(`          ${r.name.slice(0, 56).padEnd(58)} ${r.srcCat || ''}`);
}
