// Build worker/gpc.json — the condensed GS1 GPC taxonomy the Worker ships.
// Source: the official publication zip at https://ref.gs1.org/standards/gpc/
// (versioned biannual releases; archive at /standards/gpc/archive). The full
// EN JSON (~32 MB incl. brick attributes) is cached at tools/.gpc-en.json
// (gitignored); the emitted file keeps only the 4 category levels.
//
//   node tools/gpc-build.mjs            # emit worker/gpc.json from the cache
//   node tools/gpc-build.mjs --refresh  # re-download the publication first
//
// Inactive nodes are dropped. A stocked/curated code going inactive on a
// publication upgrade is caught by tools/gpc-check.mjs and build.js — the
// remap then goes in worker/gpcno.json before the new gpc.json can ship.
//
// EAN→brick classification does NOT live here: that is the resolver's job
// (worker/gpc-resolver.js — Verified by GS1 once credentials exist).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '.gpc-en.json');
const OUT = path.join(HERE, '..', 'worker', 'gpc.json');

if (!fs.existsSync(CACHE) || process.argv.includes('--refresh')) {
  console.log('downloading GPC publication zip (~11 MB)…');
  const res = await fetch('https://ref.gs1.org/standards/gpc/', { headers: { Accept: 'application/zip' } });
  if (!res.ok) { console.error(`GS1 download failed: ${res.status}`); process.exit(1); }
  const zip = path.join(os.tmpdir(), 'gpc-pub.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const name = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').find(f => / EN\.json$/.test(f));
  if (!name) { console.error('no EN.json member in the publication zip'); process.exit(1); }
  fs.writeFileSync(CACHE, execFileSync('unzip', ['-p', zip, name], { maxBuffer: 64 * 1024 * 1024 }));
  fs.unlinkSync(zip);
}

const pub = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const [d, m, y] = String(pub.DateUtc).split('/');
const edition = `${y}-${String(m).padStart(2, '0')}`;

// Shape: segs {code: title}; fams/classes/bricks {code: [title, parentCode]}.
const gpc = { edition, segs: {}, fams: {}, classes: {}, bricks: {} };
(function walk(nodes, seg, fam, cls) {
  for (const n of nodes || []) {
    if (!n.Active || n.Level > 4) continue;
    const c = String(n.Code);
    if (n.Level === 1) { gpc.segs[c] = n.Title; walk(n.Childs, c); }
    else if (n.Level === 2) { gpc.fams[c] = [n.Title, seg]; walk(n.Childs, seg, c); }
    else if (n.Level === 3) { gpc.classes[c] = [n.Title, fam]; walk(n.Childs, seg, fam, c); }
    else gpc.bricks[c] = [n.Title, cls];
  }
})(pub.Schema);

const out = JSON.stringify(gpc);
fs.writeFileSync(OUT, out);
console.log(`gpc.json ${edition}: ${Object.keys(gpc.segs).length} segments, ${Object.keys(gpc.fams).length} families, ${Object.keys(gpc.classes).length} classes, ${Object.keys(gpc.bricks).length} bricks — ${(out.length / 1024).toFixed(0)} KiB`);
