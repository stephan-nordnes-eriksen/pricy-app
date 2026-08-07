// Validate worker/gpcno.json (the curated Norwegian overlay) against the
// condensed taxonomy worker/gpc.json — every referenced code must be a real,
// active GPC code at any level; dept ids unique; no tile code listed twice.
// Also checks gpc.json is in sync with the cached publication edition.
//
//   node tools/gpc-check.mjs            # validate
//   node tools/gpc-check.mjs --refresh  # re-download publication + rebuild gpc.json first (via gpc-build)
//
// EAN→brick classification of rows does NOT live here: that is the resolver
// (worker/gpc-resolver.js — Verified by GS1 once credentials exist).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
if (process.argv.includes('--refresh')) execFileSync('node', [path.join(HERE, 'gpc-build.mjs'), '--refresh'], { stdio: 'inherit' });

const GPC = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpc.json'), 'utf8'));
const NO = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpcno.json'), 'utf8'));
const known = (c) => GPC.segs[c] || GPC.fams[c] || GPC.classes[c] || GPC.bricks[c];

let bad = 0;
const err = (m) => { console.error(`✗ ${m}`); bad++; };

const cache = path.join(HERE, '.gpc-en.json');
if (fs.existsSync(cache)) {
  const pub = JSON.parse(fs.readFileSync(cache, 'utf8'));
  const [, m, y] = String(pub.DateUtc).split('/');
  const ed = `${y}-${String(m).padStart(2, '0')}`;
  if (ed !== GPC.edition) err(`gpc.json edition ${GPC.edition} != cached publication ${ed} — run node tools/gpc-build.mjs`);
}

for (const [c, v] of Object.entries(NO.names)) {
  if (!known(c)) err(`names: ${c} is not a GPC code`);
  if (!v.name || !v.icon) err(`names: ${c} needs name and icon`);
  if (v.syn && !(Array.isArray(v.syn) && v.syn.every((s) => typeof s === 'string'))) err(`names: ${c} syn must be a string array`);
}

const ids = new Set(), seen = new Set();
for (const d of NO.depts) {
  if (!d.id || !d.name || !d.icon || !Array.isArray(d.tiles)) err(`dept ${d.id || '?'}: needs id/name/icon/tiles`);
  if (ids.has(d.id)) err(`dept ${d.id}: duplicate id`);
  ids.add(d.id);
  for (const t of d.tiles) {
    const codes = String(t.b || '').split(',');
    for (const c of codes) {
      if (!known(c)) err(`dept ${d.id}: tile code ${c} is not a GPC code`);
      if (seen.has(c)) err(`dept ${d.id}: tile code ${c} appears in more than one tile`);
      seen.add(c);
    }
    // a tile is labelled by its overlay names entry (single code) or inline
    if (!(t.name && t.icon) && !(codes.length === 1 && NO.names[codes[0]])) err(`dept ${d.id}: tile ${t.b} has no name/icon and no names entry`);
    if (t.name && (!t.icon || !Array.isArray(t.syn))) err(`dept ${d.id}: inline tile ${t.b} needs name+icon+syn`);
  }
}

for (const c of Object.keys(NO.facetKeys)) if (!known(c)) err(`facetKeys: ${c} is not a GPC code`);

const nTiles = NO.depts.reduce((a, d) => a + d.tiles.length, 0);
console.log(bad ? `${bad} problems` : `overlay ok: ${NO.depts.length} depts, ${nTiles} tiles, ${Object.keys(NO.names).length} names, ${Object.keys(NO.facetKeys).length} facet keys (GPC ${GPC.edition})`);
process.exit(bad ? 1 : 0);
