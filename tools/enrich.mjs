#!/usr/bin/env node
// Enrichment triage: list auto-discovered products (meta.hidden = 1) and
// print paste-ready worker/extra.json rows. Full runbook: ENRICHMENT.md.
const base = process.env.PRICY_URL || 'https://pricy.no';
const { products } = await (await fetch(`${base}/api/products?hidden=1`)).json();
if (!products?.length) { console.log('no hidden products — nothing to enrich'); process.exit(0); }
for (const p of products) {
  const urls = p.offers.map(o => `${o.shop} kr ${o.price} ${o.url ?? ''}`.trim()).join(' | ');
  console.log(`// ${p.id} (ean ${p.ean}): ${urls || 'no offers'}`);
  console.log(JSON.stringify({ id: p.id, name: p.name, brand: p.brand ?? '', cat: 'FILL_ME', icon: 'package', kw: '' }) + ',');
}
console.log(`\n${products.length} hidden product(s) — triage per ENRICHMENT.md (icon = lucide name, cat = prototype category)`);
