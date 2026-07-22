#!/usr/bin/env node
// Bulk specs PATCH: node tools/apply-specs.mjs specs.json
// specs.json = { "<product id>": { <schema key>: value, ... }, ... }
// Keys must match the cat's SPEC_KINDS schema (proto/Specs.jsx), OR use the
// self-describing { groups: [{ label, rows: [[label, value], …] }] } form
// (any category, no schema needed — tools/fetch-specs.mjs emits this).
import { readFileSync } from 'node:fs';
const base = process.env.PRICY_URL || 'https://pricy.no';
const token = process.env.INGEST_TOKEN || readFileSync(new URL('./.ingest-token', import.meta.url), 'utf8').trim();
const map = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const [id, specs] of Object.entries(map)) {
  const r = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ specs }),
  });
  console.log(`${r.ok ? 'ok ' : 'FAIL'} ${id}${r.ok ? '' : ' ' + (await r.text())}`);
}
