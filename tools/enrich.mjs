#!/usr/bin/env node
// Enrichment triage: list auto-discovered products (meta.hidden = 1) and
// print ready-to-run admin curls (promote / alias-to-variant) — no deploy
// needed. Full runbook: ENRICHMENT.md.
const base = process.env.PRICY_URL || 'https://pricy.no';
const { products } = await (await fetch(`${base}/api/products?hidden=1`)).json();
if (!products?.length) { console.log('no hidden products — nothing to enrich'); process.exit(0); }
console.log(`BASE=${base}; TOKEN=$(cat tools/.ingest-token)\n`);
const H = `-H "authorization: Bearer $TOKEN" -H 'content-type: application/json'`;
for (const p of products) {
  const urls = p.offers.map(o => `${o.shop} kr ${o.price} ${o.url ?? ''}`.trim()).join(' | ');
  console.log(`## ${p.id} (ean ${p.ean}) ${p.brand ?? ''} "${p.name}"${p.srcCat ? ` [srcCat: ${p.srcCat}]` : ''}: ${urls || 'no offers'}`);
  console.log(`# promote:`);
  console.log(`curl -sX PATCH "$BASE/api/admin/products/${p.id}" ${H} -d '${JSON.stringify({ name: p.name, cat: 'FILL_ME', icon: 'package', kw: '', hidden: null })}'`);
  console.log(`# …or variant of an existing product (migrates collected offers/history):`);
  console.log(`curl -sX POST "$BASE/api/admin/alias" ${H} -d '${JSON.stringify({ ean: p.ean, product_id: 'TARGET_ID' })}'`);
  console.log(`# …then facets (filter values — keys per worker/facets.json for the cat, e.g. TV: size/panel/refresh):`);
  console.log(`curl -sX PATCH "$BASE/api/admin/products/${p.id}" ${H} -d '${JSON.stringify({ facets: { KEY: 'VALUE' } })}'`);
  console.log(`# …then specs (PDP Specifications — keys per the cat's SPEC_KINDS schema in proto/Specs.jsx, or bulk via tools/apply-specs.mjs):`);
  console.log(`curl -sX PATCH "$BASE/api/admin/products/${p.id}" ${H} -d '${JSON.stringify({ specs: { KEY: 'VALUE' } })}'`);
  console.log('');
}
console.log(`${products.length} hidden product(s) — triage per ENRICHMENT.md (icon = lucide name, cat = prototype category; junk = do nothing)`);
