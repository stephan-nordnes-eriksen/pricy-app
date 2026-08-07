#!/usr/bin/env node
// Print-only brick-pin curls (gpc-strict) from a curated JSON file of
// { "product-id": "8-digit-brick", … } — the triage path for p-* rows whose
// shops publish no GTIN (the resolver can never reach them). Human runs the
// curls after reading them; nothing is sent from here (enrich.mjs pattern).
//
//   node tools/gpc-pin.mjs pins.json
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const file = process.argv[2];
if (!file) { console.error('usage: node tools/gpc-pin.mjs pins.json   ({ id: brick, … })'); process.exit(1); }
const pins = JSON.parse(fs.readFileSync(file, 'utf8'));
const GPC = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpc.json'), 'utf8'));

let bad = 0;
for (const [id, brick] of Object.entries(pins)) {
  if (!GPC.bricks[brick]) { console.error(`✗ ${id}: ${brick} is not a GPC ${GPC.edition} brick`); bad++; }
}
if (bad) process.exit(1);

const base = process.env.PRICY_URL || 'https://pricy.no';
console.log(`BASE=${base}; TOKEN=$(cat tools/.ingest-token)\n`);
for (const [id, brick] of Object.entries(pins)) {
  console.log(`# ${id} → ${brick} ${GPC.bricks[brick][0]}`);
  console.log(`curl -sX PATCH "$BASE/api/admin/products/${encodeURIComponent(id)}" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"brick":"${brick}"}'`);
}
console.log(`\n# ${Object.keys(pins).length} pin(s). A pin sets man:1 — the resolver never overwrites it; {"brick":null} hands the row back.`);
