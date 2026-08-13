#!/usr/bin/env node
// Icecat Open → PDP spec sheets: node tools/fetch-specs.mjs [out.json] [--force]
// For every visible head without specs (curated prototype sheets keep their
// variant-bound rows; --force refetches everything), looks its EANs up in
// Icecat Open (Norwegian datasheets, free tier) and writes the
// self-describing { groups: [{ label, rows: [[label, value], …] }] } form
// that specsFor renders for ANY category. Then: node tools/apply-specs.mjs out.json
// ICECAT_USER: the shared demo user covers Open Icecat (sponsoring) brands
// only — register free at icecat.biz for full coverage.
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.env.PRICY_URL || 'https://pricy.no';
const user = process.env.ICECAT_USER || 'openIcecat-live';
const lang = process.env.ICECAT_LANG || 'no';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'specs.json';
const force = process.argv.includes('--force');

const eans = JSON.parse(readFileSync(new URL('../worker/eans.json', import.meta.url), 'utf8'));
// curated = prototype sheets baked into the seed (variant-bound axis rows,
// hand-written) — never overwrite those; thin runtime-PATCHed sheets are
// fair game, Icecat depth replaces them
const curated = new Set(JSON.parse(readFileSync(new URL('../worker/seed.json', import.meta.url), 'utf8')).filter(p => p.specs).map(p => p.id));
const token = process.env.INGEST_TOKEN || readFileSync(new URL('./.ingest-token', import.meta.url), 'utf8').trim();
const { fetchHeads } = await import('./catalog.mjs');
const candsOf = (p) => eans[p.id] || (/^ean-\d+$/.test(p.id) ? [p.id.slice(4)] : []);
// catalog.json 503s at this size (PROBLEMS.md #15): page the lean all-heads
// listing, then detail-fetch (`ids=`, which serves specs — list rows don't)
// only the EAN-bearing candidates, to see which already have a sheet.
const heads = await fetchHeads(base, token);
const candIds = heads.filter(p => (force || !curated.has(p.id)) && candsOf(p).length).map(p => p.id);
console.error(`${heads.length} heads, ${candIds.length} with an EAN — checking for existing sheets …`);
const products = [];
for (let i = 0; i < candIds.length; i += 100) {
  const r = await fetch(`${base}/api/products?ids=${candIds.slice(i, i + 100).map(encodeURIComponent).join(',')}&cb=${Date.now()}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) { console.error(`ids page @${i}: HTTP ${r.status}`); process.exit(1); }
  products.push(...(await r.json()).products);
}
const sheets = {};
const miss = [`(${heads.length - candIds.length} heads skipped: no EAN, or curated)`];
for (const p of products) {
  if (p.family) continue; // heads only — the PDP renders the head's sheet
  if (p.specs?.groups && !force) continue; // already Icecat-depth
  const cands = candsOf(p);
  let hit = null;
  for (const ean of cands) {
    const r = await fetch(`https://live.icecat.biz/api?UserName=${user}&Language=${lang}&GTIN=${ean}`);
    if (r.ok) { const j = await r.json(); if (j?.data?.FeaturesGroups?.length) { hit = j.data; break; } }
    await new Promise(res => setTimeout(res, 200));
  }
  if (!hit) { miss.push(`${p.id}: not in Icecat (${cands.join(', ')})`); continue; }
  const g = hit.GeneralInfo || {};
  const groups = [{ label: 'Generelt', rows: [
    ['Produktnavn', g.Title], ['Produsent', g.Brand], ['Varenummer', g.BrandPartCode], ['EAN', (g.GTIN || []).join(', ')],
  ].filter(([, v]) => v) }];
  for (const fg of hit.FeaturesGroups) {
    const rows = fg.Features.map(f => [f.Feature?.Name?.Value, f.PresentationValue]).filter(([k, v]) => k && v);
    if (rows.length) groups.push({ label: fg.FeatureGroup?.Name?.Value || 'Annet', rows });
  }
  sheets[p.id] = { groups };
  console.log(`ok   ${p.id} — ${groups.reduce((n, x) => n + x.rows.length, 0)} rows (${g.Title})`);
}
writeFileSync(out, JSON.stringify(sheets));
console.log(`\n${Object.keys(sheets).length} sheet(s) → ${out} — apply: node tools/apply-specs.mjs ${out}`);
miss.forEach(m => console.log('skip', m));
