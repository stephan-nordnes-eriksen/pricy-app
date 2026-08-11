#!/usr/bin/env node
// Latency prober + report for pricy.no. Manual runs only:
//   node tools/latency.mjs                 probe prod, append to tools/latency.db, rewrite tools/latency-report.html
//   node tools/latency.mjs --report-only   regenerate the report from stored runs
//   node tools/latency.mjs --selftest      offline check of median/report logic
// Flags: --samples N (default 3), --base URL (default https://pricy.no), --db path.
//
// Session probes (/api/me, /api/reviews) need a probe account. One-time setup:
// sign up on pricy.no with a throwaway email+password, then
//   echo '{"email":"...","password":"..."}' > tools/.latency-probe.json
// Missing/failing credentials just skip those probes.
//
// Numbers are prod round-trips from this machine: read them as ±30 ms
// (plans/api-latency-round-trips.md). API probes carry a cb= buster so they
// measure the Worker, never an edge cache. Failures (the CPU-limit 503s on
// big listings) are recorded as-is and flagged red in the report.
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';

const { values: opts } = parseArgs({ options: {
  samples: { type: 'string', default: '3' },
  base: { type: 'string', default: 'https://pricy.no' },
  db: { type: 'string', default: new URL('./latency.db', import.meta.url).pathname },
  'report-only': { type: 'boolean', default: false },
  selftest: { type: 'boolean', default: false },
} });
const REPORT = new URL('./latency-report.html', import.meta.url).pathname;

// raw = no cb= buster (asset/edge paths where the cached answer IS the measurement)
const PROBES = [
  { name: 'asset',         path: '/robots.txt', raw: true },                    // network + asset-layer floor
  { name: 'worker-static', path: '/.well-known/oauth-protected-resource', raw: true }, // Worker floor, no ensureSchema
  { name: 'd1-floor',      path: '/api/me', expect: 401 },                      // schema + session lookup, no cookie
  { name: 'search',        path: '/api/products?q=sofa' },                      // searchIds
  { name: 'list-big',      path: '/api/products?node=86010000,71020100,70010000&sort=best&dir=asc' }, // Toys dept — the live-503 case
  { name: 'list-uncat',    path: '/api/products?node=uncat' },
  { name: 'all-heads',     path: '/api/products?sort=best&dir=asc' },           // slowest read path
  { name: 'pdp',           path: '/api/products?ids=iphone' },
  { name: 'top-drop',      path: '/api/products?top=drop&perCat=1&limit=4' },
  { name: 'img-cached',    path: '/img/iphone', raw: true },                    // edge-cacheable R2 serve
  { name: 'img-bust',      path: '/img/iphone' },                               // cb= forces the edge miss
  { name: 'me',            path: '/api/me', session: true },
  { name: 'reviews',       path: '/api/reviews?ids=iphone', session: true },
];

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS samples(
    run_ts INTEGER NOT NULL, probe TEXT NOT NULL, url TEXT NOT NULL,
    status INTEGER, ok INTEGER, headers_ms REAL, total_ms REAL,
    bytes INTEGER, cf_cache TEXT, colo TEXT)`);
  return db;
}

async function timed(url, headers) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers, redirect: 'manual' });
    const headersMs = performance.now() - t0;
    const buf = await res.arrayBuffer();
    return { status: res.status, headersMs, totalMs: performance.now() - t0,
      bytes: buf.byteLength, cfCache: res.headers.get('cf-cache-status'),
      colo: (res.headers.get('cf-ray') || '').split('-')[1] || null };
  } catch (e) {
    return { status: 0, headersMs: null, totalMs: performance.now() - t0,
      bytes: 0, cfCache: null, colo: null, err: e.message };
  }
}

async function login(base) {
  let creds;
  try { creds = JSON.parse(readFileSync(new URL('./.latency-probe.json', import.meta.url), 'utf8')); }
  catch { console.log('(no tools/.latency-probe.json — skipping session probes)'); return null; }
  const res = await fetch(base + '/api/auth/login', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) });
  const cookie = res.headers.getSetCookie().find(c => c.startsWith('pricy_session='));
  if (!res.ok || !cookie) { console.log(`(login failed with ${res.status} — skipping session probes)`); return null; }
  return cookie.split(';')[0];
}

async function runProbes(db, base, samples) {
  const runTs = Date.now();
  const cookie = await login(base);
  const ins = db.prepare('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const p of PROBES) {
    if (p.session && !cookie) continue;
    const expect = p.expect ?? 200;
    const line = [];
    for (let i = 0; i < samples; i++) {
      const cb = p.raw ? '' : (p.path.includes('?') ? '&' : '?') + `cb=${runTs}-${i}`;
      const url = base + p.path + cb;
      const r = await timed(url, p.session ? { cookie } : undefined);
      ins.run(runTs, p.name, url, r.status, r.status === expect ? 1 : 0,
        r.headersMs, r.totalMs, r.bytes, r.cfCache, r.colo);
      line.push(`${Math.round(r.totalMs)}ms${r.status === expect ? '' : ` [${r.status || r.err}]`}`);
      await new Promise(res => setTimeout(res, 150)); // politeness pause, this is monitoring not load
    }
    console.log(p.name.padEnd(14), line.join('  '));
  }
  return runTs;
}

// ---------- report ----------
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const nice = v => { const p = 10 ** Math.floor(Math.log10(v || 1)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTs = ts => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

function summarize(rows) {
  const order = PROBES.map(p => p.name);
  const byProbe = new Map();
  for (const r of rows) {
    if (!byProbe.has(r.probe)) byProbe.set(r.probe, new Map());
    const runs = byProbe.get(r.probe);
    if (!runs.has(r.run_ts)) runs.set(r.run_ts, []);
    runs.get(r.run_ts).push(r);
  }
  const probes = [...byProbe.keys()].sort((a, b) =>
    (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return probes.map(name => ({
    name,
    points: [...byProbe.get(name)].map(([ts, ss]) => ({
      ts,
      med: median(ss.map(s => s.total_ms)),
      min: Math.min(...ss.map(s => s.total_ms)),
      max: Math.max(...ss.map(s => s.total_ms)),
      hmed: median(ss.map(s => s.headers_ms).filter(v => v != null)),
      bytes: median(ss.map(s => s.bytes)),
      fails: ss.filter(s => !s.ok).length,
      n: ss.length,
      statuses: [...new Set(ss.map(s => s.status))].join(','),
      colos: [...new Set(ss.map(s => s.colo).filter(Boolean))].join(','),
    })).sort((a, b) => a.ts - b.ts),
  }));
}

function chartSvg(p, span) {
  const W = 760, H = 170, L = 56, R = 14, T = 14, B = 26;
  const ymax = nice(Math.max(...p.points.map(q => q.max)) * 1.05);
  const x = ts => span[1] > span[0]
    ? L + (ts - span[0]) / (span[1] - span[0]) * (W - L - R) : (L + W - R) / 2;
  const y = v => T + (1 - v / ymax) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} latency over time">`;
  for (let i = 0; i <= 3; i++) {
    const v = ymax * i / 3, yy = y(v);
    s += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" class="grid"/>` +
      `<text x="${L - 6}" y="${yy + 3}" class="tick" text-anchor="end">${Math.round(v)}</text>`;
  }
  s += `<text x="${L}" y="${H - 6}" class="tick">${fmtTs(span[0])}</text>` +
    `<text x="${W - R}" y="${H - 6}" class="tick" text-anchor="end">${fmtTs(span[1])}</text>`;
  if (p.points.length > 1)
    s += `<polyline class="line" points="${p.points.map(q => `${x(q.ts).toFixed(1)},${y(q.med).toFixed(1)}`).join(' ')}"/>`;
  for (const q of p.points) {
    const xx = x(q.ts), bad = q.fails > 0;
    s += `<line x1="${xx}" y1="${y(q.min)}" x2="${xx}" y2="${y(q.max)}" class="whisker"/>` +
      `<circle cx="${xx}" cy="${y(q.med)}" r="4" class="pt${bad ? ' bad' : ''}"/>`;
    if (bad) s += `<text x="${xx}" y="${y(q.max) - 6}" class="fail" text-anchor="middle">&#x2715;${q.fails}</text>`;
    s += `<rect x="${xx - 12}" y="0" width="24" height="${H - B}" fill="transparent">` +
      `<title>${fmtTs(q.ts)}\nmedian ${Math.round(q.med)} ms (min ${Math.round(q.min)}, max ${Math.round(q.max)}, n=${q.n})\n` +
      `headers ${Math.round(q.hmed)} ms, ~${Math.round(q.bytes / 1024)} KB\nstatus ${q.statuses}${q.fails ? ` — ${q.fails} failed` : ''}\ncolo ${q.colos || '?'}</title></rect>`;
  }
  return s + '</svg>';
}

function buildReport(rows, base) {
  const probes = summarize(rows);
  const runs = [...new Set(rows.map(r => r.run_ts))].sort((a, b) => a - b);
  const span = [runs[0] ?? 0, runs.at(-1) ?? 1];
  const last = runs.at(-1);
  const tableRows = probes.map(p => {
    const q = p.points.find(pt => pt.ts === last);
    if (!q) return `<tr><td>${esc(p.name)}</td><td colspan="6" class="muted">not in last run</td></tr>`;
    return `<tr><td>${esc(p.name)}</td><td>${Math.round(q.med)}</td><td>${Math.round(q.min)}–${Math.round(q.max)}</td>` +
      `<td>${Math.round(q.hmed)}</td><td>${Math.round(q.bytes / 1024)}</td>` +
      `<td${q.fails ? ' class="fail"' : ''}>${q.statuses}${q.fails ? ` (&#x2715;${q.fails}/${q.n})` : ''}</td><td>${esc(q.colos || '?')}</td></tr>`;
  }).join('\n');
  const charts = probes.map(p =>
    `<section class="card"><h2>${esc(p.name)} <span class="muted">median total ms per run</span></h2>${chartSvg(p, span)}</section>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>pricy.no latency</title>
<style>
:root { color-scheme: light dark;
  --surface-1:#fcfcfb; --page:#f9f9f7; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --series-1:#2a78d6; --critical:#d03b3b; --border:rgba(11,11,11,.10); }
@media (prefers-color-scheme: dark) { :root {
  --surface-1:#1a1a19; --page:#0d0d0d; --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --series-1:#3987e5; --critical:#d03b3b; --border:rgba(255,255,255,.10); } }
body { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--page); color: var(--ink); margin: 0 auto; max-width: 820px; padding: 24px 16px; }
h1 { font-size: 20px; } h2 { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.muted { color: var(--muted); font-weight: 400; }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px 14px; margin: 12px 0; }
svg { width: 100%; height: auto; display: block; }
.grid { stroke: var(--grid); stroke-width: 1; }
.tick, .fail { font: 10px system-ui, sans-serif; fill: var(--muted); }
.line { fill: none; stroke: var(--series-1); stroke-width: 2; }
.whisker { stroke: var(--series-1); stroke-width: 1; opacity: .45; }
.pt { fill: var(--series-1); stroke: var(--surface-1); stroke-width: 2; }
.pt.bad { fill: var(--critical); }
.fail { fill: var(--critical); font-weight: 700; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--grid); }
th { color: var(--ink-2); font-weight: 600; }
td.fail { color: var(--critical); font-weight: 600; }
</style>
<h1>pricy.no latency <span class="muted">${esc(base)} — ${runs.length} run${runs.length === 1 ? '' : 's'}, last ${last ? fmtTs(last) : 'never'} UTC</span></h1>
${rows.length ? `<section class="card"><h2>Latest run</h2>
<table><tr><th>probe</th><th>median ms</th><th>min–max</th><th>headers ms</th><th>KB</th><th>status</th><th>colo</th></tr>
${tableRows}</table></section>
${charts}` : '<p class="muted">No runs yet — <code>node tools/latency.mjs</code></p>'}
`;
}

// ---------- main ----------
if (opts.selftest) {
  const db = openDb(':memory:');
  const ins = db.prepare('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)');
  ins.run(1000, 'list-big', 'u', 200, 1, 40, 100, 9000, null, 'OSL');
  ins.run(1000, 'list-big', 'u', 200, 1, 50, 300, 9000, null, 'OSL');
  ins.run(1000, 'list-big', 'u', 503, 0, 60, 200, 20, null, 'OSL');
  ins.run(2000, 'list-big', 'u', 200, 1, 40, 150, 9000, null, 'ARN');
  const html = buildReport(db.prepare('SELECT * FROM samples').all(), 'selftest');
  const assert = (c, m) => { if (!c) { console.error('SELFTEST FAIL:', m); process.exit(1); } };
  assert(median([1, 3, 2]) === 2 && median([1, 2, 3, 4]) === 2.5, 'median');
  assert(html.includes('<svg') && html.includes('list-big'), 'chart rendered');
  assert(html.includes('&#x2715;1'), 'failure marker rendered');
  assert(html.includes('>200<') || html.includes('median 200'), 'median of 100/300/200 is 200');
  console.log('selftest ok');
  process.exit(0);
}

const db = openDb(opts.db);
if (!opts['report-only']) await runProbes(db, opts.base, Number(opts.samples) || 3);
writeFileSync(REPORT, buildReport(db.prepare('SELECT * FROM samples ORDER BY run_ts').all(), opts.base));
console.log('report: ' + REPORT);
