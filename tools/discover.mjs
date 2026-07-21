#!/usr/bin/env node
// Product-page discovery (PLAN.md 4d): given a shop's OWN origin, walk its
// sitemap(s) (robots.txt Sitemap: lines, else /sitemap.xml), shortlist URLs
// whose slug looks like a catalog product, fetch those pages and confirm
// identity by their JSON-LD GTIN/EAN against worker/eans.json. Confirmed
// URLs are then scraped once via scrapeSource as an end-to-end check.
// First-party shop domains only — never competing comparison services.
//
// Usage:  node tools/discover.mjs <Shop> <https://origin> [--write] [--browser-ua]
//   --write       merge confirmed { product_id: url } into tools/crawl-urls.json
//   --browser-ua  fetch with BROWSER_UA (shops that 403 every bot UA); with
//                 --write also records "$ua": "browser" for the shop
//
// Pages with an EAN we don't know are NEW products: they join the confirmed
// set under a derived `ean-<digits>` id — the next crawl auto-creates them
// hidden, and tools/enrich.mjs lists them for manual enrichment. If one is
// really a variant of a catalog product, add the EAN to worker/eans.json and
// drop the ean- entry from crawl-urls.json instead.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { UA, BROWSER_UA, eanKey, EAN_TO_PRODUCT, scrapeSource } from '../worker/sources.js';

const [shop, origin] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const write = process.argv.includes('--write');
const browserUa = process.argv.includes('--browser-ua');
if (!shop || !origin) { console.error('usage: node tools/discover.mjs <Shop> <https://origin> [--write]'); process.exit(2); }

let seed;
try { seed = JSON.parse(readFileSync(new URL('../worker/seed.json', import.meta.url), 'utf8')); }
catch { console.error('worker/seed.json missing — run `node build.js` first'); process.exit(2); }

// ponytail: fixed caps, tune when a real shop's sitemap layout demands it
const MAX_SITEMAPS = 40, CANDIDATES_PER_PRODUCT = 3;
const pause = () => new Promise(r => setTimeout(r, 500));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': browserUa ? BROWSER_UA : UA } });
  if (!res.ok) throw new Error(`${url} → http ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // .gz sitemaps arrive as literal gzip bytes (magic 1f 8b), not content-encoding
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map(m => m[1].trim().replace(/&amp;/g, '&'));

// GTIN/EAN of the page's JSON-LD Product node, if any
function pageGtin(html) {
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let doc;
    try { doc = JSON.parse(body.trim()); } catch { continue; }
    for (const n of [doc, ...(Array.isArray(doc) ? doc : []), ...(doc['@graph'] || [])]) {
      const g = n?.gtin13 ?? n?.gtin ?? n?.gtin12 ?? n?.gtin14 ?? n?.ean;
      if (g) return String(g);
    }
  }
  return null;
}

// 1. gather page URLs from the sitemap tree
let queue = [];
try {
  queue = (await fetchText(new URL('/robots.txt', origin).href)).split('\n')
    .map(l => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1]).filter(Boolean);
} catch {}
if (!queue.length) queue = [new URL('/sitemap.xml', origin).href];

const pages = [];
let fetched = 0;
while (queue.length && fetched < MAX_SITEMAPS) {
  // product sub-sitemaps first, so the cap spends itself on the right files
  queue.sort((a, b) => /prod/i.test(b) - /prod/i.test(a));
  const url = queue.shift();
  fetched++;
  let xml;
  try { xml = await fetchText(url); } catch (e) { console.warn(`sitemap skip: ${e.message}`); continue; }
  if (/<sitemapindex/i.test(xml)) queue.push(...locs(xml));
  else pages.push(...locs(xml));
}
if (queue.length) console.warn(`capped at ${MAX_SITEMAPS} sitemap fetches — ${queue.length} sub-sitemap(s) unread`);
console.log(`${pages.length} page URL(s) from ${fetched} sitemap fetch(es)`);

// 2. slug-match catalog products, 3. confirm identity by EAN
const tokens = (s) => [...new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3))];
const found = {}; // product_id → url, EAN-confirmed
for (const p of seed) {
  const toks = tokens(`${p.brand} ${p.name}`);
  const cands = pages
    .map(u => ({ u, score: toks.filter(t => decodeURIComponent(u).toLowerCase().includes(t)).length / toks.length }))
    .filter(c => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_PRODUCT);
  if (!cands.length) { console.log(`${p.id}: no sitemap URL resembles "${p.name}"`); continue; }
  for (const { u } of cands) {
    await pause();
    let html;
    try { html = await fetchText(u); } catch (e) { console.warn(`page skip: ${e.message}`); continue; }
    const ean = pageGtin(html);
    const pid = EAN_TO_PRODUCT[eanKey(ean)];
    if (pid) {
      console.log(`${pid}: confirmed by EAN ${ean} → ${u}`);
      found[pid] ??= u;
      if (pid === p.id) break; // done with this product's candidates
    } else if (ean) {
      // unknown EAN = new product: derived id, ingest auto-creates it hidden
      // on first crawl. If it's really a variant of ${p.id}, add the EAN to
      // worker/eans.json instead and drop the ean- entry from crawl-urls.json.
      const nid = `ean-${eanKey(ean)}`;
      console.log(`${p.id}? new product ${nid} (JSON-LD EAN ${ean}) → ${u}`);
      found[nid] ??= u;
    } else {
      console.log(`${p.id}? unconfirmed candidate (no JSON-LD EAN) → ${u}`);
    }
  }
}

// 4. end-to-end check: do the confirmed pages actually scrape?
const rows = await scrapeSource(shop, { urls: found, ua: browserUa ? 'browser' : undefined });
for (const r of rows) console.log(`${r.shop}\t${r.product_id}\tkr ${r.price}`);
console.log(`discovered ${Object.keys(found).length}, scraped ${rows.length}`);

if (write && Object.keys(found).length) {
  const path = new URL('./crawl-urls.json', import.meta.url);
  const all = JSON.parse(readFileSync(path, 'utf8'));
  all[shop] = { ...all[shop], ...(browserUa ? { $ua: 'browser' } : {}), ...found };
  writeFileSync(path, JSON.stringify(all, null, 2) + '\n');
  console.log(`merged ${Object.keys(found).length} url(s) into tools/crawl-urls.json["${shop}"]`);
}
process.exit(rows.length ? 0 : 1);
