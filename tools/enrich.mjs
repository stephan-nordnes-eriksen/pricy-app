#!/usr/bin/env node
// Enrichment triage: list auto-discovered products (meta.hidden = 1) and
// print paste-ready worker/extra.json rows. The manual ritual:
//   1. node tools/enrich.mjs            (PRICY_URL to target another origin)
//   2. per product: fill cat (must be a prototype CATEGORY), icon, kw —
//      KEEP THE SAME id (offers/history hang on it); paste into extra.json.
//      If it's really a variant of an existing product, add its EAN to
//      worker/eans.json under that product instead and skip the extra row.
//   3. node build.js && npm test && npm run deploy — the new seed upserts
//      meta without `hidden`, the product goes live with the offers and
//      price history it already collected.
const base = process.env.PRICY_URL || 'https://pricy.no';
const { products } = await (await fetch(`${base}/api/products?hidden=1`)).json();
if (!products?.length) { console.log('no hidden products — nothing to enrich'); process.exit(0); }
for (const p of products) {
  const urls = p.offers.map(o => `${o.shop} kr ${o.price} ${o.url ?? ''}`.trim()).join(' | ');
  console.log(`// ${p.id} (ean ${p.ean}): ${urls || 'no offers'}`);
  console.log(JSON.stringify({ id: p.id, name: p.name, brand: p.brand ?? '', cat: 'FILL_ME', icon: '📦', kw: '' }) + ',');
}
console.log(`\n${products.length} hidden product(s) — fill cat/icon/kw, paste into worker/extra.json, build + deploy`);
