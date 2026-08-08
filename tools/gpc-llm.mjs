#!/usr/bin/env node
// Best-effort LLM categorization of every uncategorized head (gpc-strict):
// Claude Sonnet 5 picks a GPC brick from the shipped taxonomy for rows the
// resolver can't reach (no gtin / gtin unknown to the fixture). Each hit is
// PATCHed as { brick, llm: 1, man: null } — llm:1 marks the row as an
// interim LLM guess, man:null skips the admin pin, so the real Verified-by-
// GS1 resolver overwrites (and clears the mark) once credentials exist.
// Deploy the worker first: the PATCH validator must accept `llm: 1`.
//
//   node tools/gpc-llm.mjs [--dry] [--limit N] [--batch N]
//
// Reads the paged node=uncat listing (NOT /api/catalog.json — the full dump
// exceeds the free-plan CPU ceiling at 52k rows), so re-running after an
// interruption resumes for free: bricked rows leave the uncat node. Auth:
// ANTHROPIC_API_KEY (or an `ant auth login` profile) + tools/.ingest-token
// for the PATCHes.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const base = process.env.PRICY_URL || 'https://pricy.no';
const arg = (f) => process.argv.includes(f);
const num = (f, d) => Number(process.argv[process.argv.indexOf(f) + 1]) || d;
const DRY = arg('--dry');
const LIMIT = num('--limit', Infinity);
const BATCH = num('--batch', 40);
const CONC = 4; // ponytail: fixed pool; the prompt cache is warmed by batch 0 before fan-out

// Model answers are JSON, possibly fenced or wrapped in prose — take the
// outermost object.
function parseAnswer(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('no JSON object in answer');
  return JSON.parse(text.slice(s, e + 1));
}
if (arg('--selftest')) {
  const assert = (await import('node:assert')).strict;
  assert.deepEqual(parseAnswer('```json\n{"a":"10000002"}\n```'), { a: '10000002' });
  assert.deepEqual(parseAnswer('Here you go: {"a":null}'), { a: null });
  assert.throws(() => parseAnswer('no json here'));
  console.error('selftest ok'); process.exit(0);
}

const token = process.env.INGEST_TOKEN || fs.readFileSync(path.join(HERE, '.ingest-token'), 'utf8').trim();
const GPC = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'worker', 'gpc.json'), 'utf8'));

// Page the whole uncat node up front (mutating while paging would shift
// offsets). cb= busts the edge cache; one retry rides over a transient 503.
console.error('paging uncategorized heads …');
const uncat = [];
for (let off = 0, total = Infinity; off < Math.min(total, LIMIT); off += 400) {
  let res = await fetch(`${base}/api/products?node=uncat&limit=400&offset=${off}&cb=${Date.now()}`);
  if (!res.ok) res = await fetch(`${base}/api/products?node=uncat&limit=400&offset=${off}&cb=${Date.now()}r`);
  if (!res.ok) { console.error(`page @${off} failed: ${res.status}`); process.exit(1); }
  const { products, meta } = await res.json();
  total = meta.total;
  uncat.push(...products.filter(p => !p.brick && !p.llm));
}
uncat.length = Math.min(uncat.length, LIMIT);
console.error(`${uncat.length} uncategorized heads, batches of ${BATCH}${DRY ? ' (dry run)' : ''}`);

// The full taxonomy as a Segment > Family > Class outline with brick codes
// under each class — one stable string, prompt-cached across every batch.
const byParent = (o) => Object.entries(o).reduce((m, [c, v]) => ((m[v[1]] ??= []).push([c, v[0]]), m), {});
const famsOf = byParent(GPC.fams), classesOf = byParent(GPC.classes), bricksOf = byParent(GPC.bricks);
let outline = '';
for (const [seg, segTitle] of Object.entries(GPC.segs)) {
  outline += `\n# ${segTitle}\n`;
  for (const [fam, famTitle] of famsOf[seg] || []) {
    outline += `## ${famTitle}\n`;
    for (const [cls, clsTitle] of classesOf[fam] || []) {
      outline += `### ${clsTitle}\n`;
      for (const [brick, brickTitle] of bricksOf[cls] || []) outline += `${brick} ${brickTitle}\n`;
    }
  }
}

const SYSTEM = `You categorize products from a Norwegian price-comparison site into GS1 GPC bricks.
Given products (Norwegian or English names), answer with a JSON object mapping each product id to the single best-fitting 8-digit brick code from the taxonomy below, or null when you genuinely cannot tell what the product is. Pick the most specific brick that fits; prefer a correct broader brick over a wrong specific one. Answer ONLY with the JSON object, no prose.

GPC taxonomy (edition ${GPC.edition}) — brick codes under their Segment/Family/Class:
${outline}`;

const client = new Anthropic();

async function patchBrick(id, brick) {
  const res = await fetch(`${base}/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ brick, llm: 1, man: null }), // man:null = no pin — resolver may overwrite
  });
  if (!res.ok) console.error(`  ✗ PATCH ${id}: ${res.status} ${await res.text()}`);
  return res.ok;
}

let done = 0, hit = 0, skip = 0, bad = 0;
async function runBatch(batch) {
  const lines = batch.map(p => JSON.stringify({ id: p.id, name: p.name, brand: p.brand, srcCat: p.srcCat })).join('\n');
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' }, // bulk classification — high adds thinking cost, not accuracy
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: lines }],
    });
    const answer = parseAnswer(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    for (const p of batch) {
      const brick = answer[p.id];
      if (!brick) { skip++; continue; }
      if (!GPC.bricks[brick]) { bad++; console.error(`  ✗ ${p.id}: invalid brick ${brick}`); continue; }
      if (DRY) console.log(`${p.id}\t${brick}\t${GPC.bricks[brick][0]}\t# ${p.name}`);
      else if (!await patchBrick(p.id, String(brick))) continue;
      hit++;
    }
  } catch (e) {
    console.error(`batch failed: ${e.message} — skipped (re-run picks these up)`);
  }
  done += batch.length;
  console.error(`${done}/${uncat.length}  categorized ${hit}, no-answer ${skip}, invalid ${bad}`);
}

const batches = [];
for (let i = 0; i < uncat.length; i += BATCH) batches.push(uncat.slice(i, i + BATCH));
if (batches.length) {
  await runBatch(batches[0]); // alone first: writes the prompt cache the pool then reads
  let next = 1;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < batches.length) await runBatch(batches[next++]);
  }));
}
