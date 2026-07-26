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
//   --no-images    drop the image field and skip the post-crawl image drain
//                  (a price-only refresh; images are cheap now, see below)
// Env:
//   CRAWL_CONC     shops crawled concurrently (default 8)
// Env:
//   PRICY_URL      target origin (default https://pricy.no)
//   INGEST_TOKEN   bearer token; falls back to tools/.ingest-token (untracked)
//
// crawl-urls.json shape: { "Elkjøp": { "airpods": "https://www.elkjop.no/…" } }
// A "$ua": "browser" key in a shop's map makes its fetches use BROWSER_UA
// (for shops that 403 every bot UA, honest or not — e.g. NetOnNet).
// Shop names must match the catalog's; product ids come from worker/seed.json.
//
// A shop entry can instead be `{ "$discover": { "sitemap": "https://…/sitemap.xml" } }`
// to walk the shop's own sitemap for every product page instead of a
// hand-picked URL list — see discoverSource() in worker/sources.js for the
// full cfg shape (pathFilter/sitemapFilter/limit/ua/delayMs).

import { readFileSync, writeFileSync } from 'node:fs';
import { scrapeSource, discoverSource } from '../worker/sources.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const dry = process.argv.includes('--dry');
const noImages = process.argv.includes('--no-images');
const shopFilter = arg('--shop');
const limit = Number(arg('--limit')) || Infinity;
const out = arg('--out');
const base = process.env.PRICY_URL || 'https://pricy.no';
const urlsByShop = JSON.parse(readFileSync(new URL('./crawl-urls.json', import.meta.url), 'utf8'));

// Shops run concurrently, pages within a shop stay sequential-with-a-pause:
// the politeness that matters is per-host request rate, and crawling 47 shops
// one after another turns a 5-minute run into a 4-hour one.
async function crawlShop(shop, cfg) {
  const rows = [];
  const { $discover, $ua, ...urls } = cfg;
  if ($discover) rows.push(...await discoverSource(shop, { ...$discover, ...(limit < Infinity ? { limit } : {}) }));
  for (const [pid, url] of Object.entries(urls).slice(0, limit)) {
    rows.push(...await scrapeSource(shop, { ua: $ua, urls: { [pid]: url } }));
    await new Promise(r => setTimeout(r, 500));
  }
  console.error(`  ${shop}: ${rows.length} row(s)`);
  return rows;
}

const queue = Object.entries(urlsByShop).filter(([shop]) => !shopFilter || shop === shopFilter);
const rows = [];
await Promise.all(Array.from({ length: Number(process.env.CRAWL_CONC || 8) }, async () => {
  for (let e; (e = queue.shift());) {
    rows.push(...await crawlShop(...e).catch(err => (console.error(`  ${e[0]}: FAILED ${err.message}`), [])));
  }
}));

for (const r of rows) console.log(`${r.shop}\t${r.product_id}\tkr ${r.price}${r.stock === 1 ? '' : r.stock === 2 ? '\t(stock unknown)' : '\t(out of stock)'}`);
console.log(`crawled ${rows.length} row(s)`);
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
if (!rows.length) process.exit(1);
if (dry) process.exit(0);

const token = process.env.INGEST_TOKEN
  || readFileSync(new URL('./.ingest-token', import.meta.url), 'utf8').trim();
// Ingest only queues image URLs (no downloads inside the POST), so a full
// catalog run POSTs at the route's own 500-row limit AND keeps its images.
const payload = noImages ? rows.map(({ image, ...r }) => r) : rows;
const CHUNK = 500;
let ok = true;
for (let i = 0; i < payload.length; i += CHUNK) {
  const res = await fetch(`${base}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload.slice(i, i + CHUNK)),
  });
  console.log(`POST ${base}/api/ingest [${i}–${Math.min(i + CHUNK, payload.length)}] → ${res.status} ${(await res.text()).slice(0, 200)}`);
  ok &&= res.ok;
}

// Then work the image queue down. 40 downloads per call is the Worker's
// subrequest budget; the loop is what turns a 22k-image backlog into ~10
// minutes instead of the cron's ~40/hour. Stops on the first failed call.
if (!noImages) for (let left = 1; left > 0;) {
  const res = await fetch(`${base}/api/admin/images?n=40`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error(`drain → ${res.status} ${(await res.text()).slice(0, 200)}`); ok = false; break; }
  const r = await res.json();
  console.log(`images: +${r.done} stored, ${r.failed} failed, ${r.remaining} queued`);
  left = r.done + r.failed ? r.remaining : 0; // no progress = every candidate failed, stop
}
process.exit(ok ? 0 : 1);
