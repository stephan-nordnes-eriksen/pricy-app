#!/usr/bin/env node
// GPC coverage report (gpc-strict): how much of the live catalog the
// resolver has categorized, where the GTINs are missing, and which stocked
// bricks still render English titles (the overlay curation worklist).
// Replays the bearer-gated /api/catalog.json — same discipline as the old
// score-cats.mjs: measure the WHOLE catalog, never a sample.
//
//   node tools/gpc-coverage.mjs [--fetch] [--worklist N]
//
// Queue depth by status lives in D1, not the dump:
//   wrangler d1 execute pricy-app --remote --command \
//     "SELECT status, COUNT(*) FROM gpc GROUP BY status"
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '.catalog.json');
const base = process.env.PRICY_URL || 'https://pricy.no';

if (!fs.existsSync(CACHE) || process.argv.includes('--fetch')) {
  const token = process.env.INGEST_TOKEN || fs.readFileSync(path.join(HERE, '.ingest-token'), 'utf8').trim();
  console.error(`fetching ${base}/api/catalog.json …`);
  const res = await fetch(`${base}/api/catalog.json`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error(`fetch failed: ${res.status}`); process.exit(1); }
  fs.writeFileSync(CACHE, await res.text());
}

const { products } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const NO = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpcno.json'), 'utf8'));
const GPC = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpc.json'), 'utf8'));
const heads = products.filter(p => !p.family);
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

const withBrick = heads.filter(p => p.brick);
const withEan = heads.filter(p => p.ean);
console.log(`catalog: ${heads.length} heads (${products.length} rows incl. variants)`);
console.log(`  gtin known:      ${withEan.length}  (${pct(withEan.length, heads.length)})`);
console.log(`  brick resolved:  ${withBrick.length}  (${pct(withBrick.length, heads.length)})`);
console.log(`  Ukategorisert:   ${heads.length - withBrick.length}  (${pct(heads.length - withBrick.length, heads.length)})`);
console.log(`  gtin but no brick yet: ${withEan.length - heads.filter(p => p.ean && p.brick).length} (queued/none — resolver backlog)`);

// per-shop GTIN capture: of a shop's heads, how many know their barcode —
// low % = the shop publishes no gtin (re-scrape can't help; pins can)
const shopStats = {};
for (const p of heads) for (const o of p.offers || []) {
  const s = shopStats[o.shop] ??= { rows: 0, ean: 0, brick: 0 };
  s.rows++; if (p.ean) s.ean++; if (p.brick) s.brick++;
}
console.log('\nper-shop (rows / gtin% / brick%):');
for (const [shop, s] of Object.entries(shopStats).sort((a, b) => b[1].rows - a[1].rows)) {
  console.log(`  ${shop.padEnd(24)} ${String(s.rows).padStart(6)}  ${pct(s.ean, s.rows).padStart(6)}  ${pct(s.brick, s.rows).padStart(6)}`);
}

// stocked-but-uncurated bricks: rendered with English GPC titles until a
// gpcno.json names entry lands — THE curation worklist, biggest first
const hist = {};
for (const p of withBrick) hist[p.brick] = (hist[p.brick] || 0) + 1;
const uncurated = Object.entries(hist).filter(([b]) => !NO.names[b]).sort((a, b) => b[1] - a[1]);
const n = Number(process.argv[process.argv.indexOf('--worklist') + 1]) || 20;
console.log(`\nstocked bricks: ${Object.keys(hist).length} (${uncurated.length} uncurated — English titles). Top ${Math.min(n, uncurated.length)}:`);
for (const [b, c] of uncurated.slice(0, n)) console.log(`  ${b}  ${String(c).padStart(5)}  ${GPC.bricks[b]?.[0] ?? '(not in this edition)'}`);
