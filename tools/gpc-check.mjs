// Validate worker/depts.json against the real GS1 GPC publication: every
// non-synthetic brick code (not 99-prefixed) must exist, and the rule's
// display path must be the publication's Segment › Family › Class trail.
// The publication is fetched from the GPC browser API (it requires
// browser-ish Origin/Referer headers) and cached next to this script —
// ~32 MB, EN, free to download per GS1's own browser.
//
//   node tools/gpc-check.mjs            # validate
//   node tools/gpc-check.mjs --refresh  # re-download the publication first
//
// EAN→brick classification of rows stays parked: that mapping lives in
// GS1 Verified (member API), not in this publication.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '.gpc-en.json');
const DEPTS = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'depts.json'), 'utf8'));

if (!fs.existsSync(CACHE) || process.argv.includes('--refresh')) {
  console.log('downloading GPC publication (EN, ~32 MB)…');
  const res = await fetch('https://gpc-api.gs1.org/api/browser/download/publication/1/json', {
    headers: { Origin: 'https://gpc-browser.gs1.org', Referer: 'https://gpc-browser.gs1.org/', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) { console.error(`GS1 download failed: ${res.status}`); process.exit(1); }
  fs.writeFileSync(CACHE, await res.text());
}

const pub = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const bricks = new Map(); // code → Segment › Family › Class
(function walk(nodes, trail) {
  for (const n of nodes || []) {
    if (n.Level === 4) bricks.set(String(n.Code), trail.join(' › '));
    else walk(n.Childs, [...trail, n.Title]);
  }
})(pub.Schema, []);

let bad = 0;
for (const d of DEPTS) for (const r of d.rules) {
  if (r.b.startsWith('99')) { console.log(`  (synthetic) ${r.b} ${r.name}`); continue; }
  const p = bricks.get(r.b);
  if (!p) { console.error(`✗ ${r.b} ${r.name}: not a GPC brick`); bad++; }
  else if (p !== r.path) { console.error(`✗ ${r.b} ${r.name}: path drifted\n    ours: ${r.path}\n    GPC:  ${p}`); bad++; }
}
console.log(bad ? `${bad} mismatches` : `all ${DEPTS.flatMap(d => d.rules).length} rules check out (publication ${pub.DateUtc})`);
process.exit(bad ? 1 : 0);
