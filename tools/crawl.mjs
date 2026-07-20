#!/usr/bin/env node
// Manual price crawl (PLAN.md 4d interim): scrape first-party shop product
// pages listed in tools/crawl-urls.json and push the rows to POST
// /api/ingest. Never point this at competing comparison services
// (Prisjakt etc.) — shops' own pages only.
//
// Usage:  node tools/crawl.mjs [--dry] [--shop <name>] [--limit <n>] [--out <file>]
//   --dry          crawl and print rows, POST nothing
//   --shop <name>  only crawl this shop (validate one crawler before going all in)
//   --limit <n>    at most n products per shop
//   --out <file>   also write the scraped rows as JSON to <file>
// Env:
//   PRICY_URL      target origin (default https://pricy.no)
//   INGEST_TOKEN   bearer token; falls back to tools/.ingest-token (untracked)
//
// crawl-urls.json shape: { "Elkjøp": { "airpods": "https://www.elkjop.no/…" } }
// A "$ua": "browser" key in a shop's map makes its fetches use BROWSER_UA
// (for shops that 403 every bot UA, honest or not — e.g. NetOnNet).
// Shop names must match the catalog's; product ids come from worker/seed.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { scrapeSource } from '../worker/sources.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const dry = process.argv.includes('--dry');
const shopFilter = arg('--shop');
const limit = Number(arg('--limit')) || Infinity;
const out = arg('--out');
const base = process.env.PRICY_URL || 'https://pricy.no';
const urlsByShop = JSON.parse(readFileSync(new URL('./crawl-urls.json', import.meta.url), 'utf8'));

const rows = [];
for (const [shop, { $ua, ...urls }] of Object.entries(urlsByShop)) {
  if (shopFilter && shop !== shopFilter) continue;
  for (const [pid, url] of Object.entries(urls).slice(0, limit)) {
    // ponytail: one page at a time with a pause — polite to the shops,
    // and a manual run is in no hurry
    rows.push(...await scrapeSource(shop, { ua: $ua, urls: { [pid]: url } }));
    await new Promise(r => setTimeout(r, 500));
  }
}

for (const r of rows) console.log(`${r.shop}\t${r.product_id}\tkr ${r.price}${r.stock ? '' : '\t(out of stock)'}`);
console.log(`crawled ${rows.length} row(s)`);
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
if (!rows.length) process.exit(1);
if (dry) process.exit(0);

const token = process.env.INGEST_TOKEN
  || readFileSync(new URL('./.ingest-token', import.meta.url), 'utf8').trim();
const res = await fetch(`${base}/api/ingest`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(rows),
});
console.log(`POST ${base}/api/ingest → ${res.status} ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
