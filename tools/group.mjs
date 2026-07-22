#!/usr/bin/env node
// Variant grouping triage (OPEN-CATALOG-PLAN.md Phase C): cluster discovered
// (ean-*) products by family fingerprint — brand + name minus storage/colour/
// pack tokens — and print per-cluster proposals: head, synthesized variant
// axes, and ready-to-run admin curls that re-home each member onto a
// `<head>~<combo>` child (migrating its collected offers/history).
//
// Print-only, deliberately: shop listing titles are messy and the clustering
// WILL misfire sometimes — a human reads, edits, runs. Env: PRICY_URL.
const base = process.env.PRICY_URL || 'https://pricy.no';

// NO + EN colour words → canonical option id (never contains '-' or '~')
const COLORS = {
  svart: 'black', black: 'black', hvit: 'white', white: 'white',
  'blå': 'blue', blue: 'blue', 'grønn': 'green', green: 'green',
  'rød': 'red', red: 'red', rosa: 'pink', pink: 'pink', gul: 'yellow',
  yellow: 'yellow', 'grå': 'grey', grey: 'grey', gray: 'grey',
  'sølv': 'silver', silver: 'silver', gull: 'gold', gold: 'gold',
  beige: 'beige', brun: 'brown', brown: 'brown', lilla: 'purple',
  purple: 'purple', midnight: 'midnight', starlight: 'starlight',
  titan: 'titanium', titanium: 'titanium', grafitt: 'graphite',
  graphite: 'graphite', navy: 'navy', krem: 'cream', cream: 'cream',
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const gbLabel = (gb) => gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;

// tokens of one product: storage (GB, last match wins — "16/256 GB" lists
// RAM first), canonical colour, and the residue fingerprint
function tokensOf(p) {
  const name = `${p.brand ?? ''} ${p.name ?? ''}`.toLowerCase();
  const storage = [...name.matchAll(/(\d+)\s?(gb|tb)\b/g)]
    .map(m => m[2] === 'tb' ? Number(m[1]) * 1024 : Number(m[1])).at(-1) ?? null;
  const words = name
    .replace(/\d+\s?(gb|tb)\b/g, ' ')
    .replace(/\b\d+[- ]?(pack|pk|stk)\b/g, ' ')
    .split(/[^a-z0-9æøå]+/).filter(Boolean);
  const color = words.map(w => COLORS[w]).find(Boolean) ?? null;
  // Set-dedupe: shop titles double the brand ("Apple Apple iPhone 15") —
  // without it a listing-title fp never matches the catalog head's
  return { storage, color, fp: [...new Set(words.filter(w => !COLORS[w]))].join(' ') };
}

const hidden = (await (await fetch(`${base}/api/products?hidden=1`)).json()).products ?? [];
const visible = (await (await fetch(`${base}/api/catalog.json`)).json()).products ?? [];
// cluster pool: every discovered row, plus visible catalog heads so a
// discovered SKU can match an existing product's family
const pool = [
  ...hidden,
  ...visible.filter(p => !p.family),
].map(p => ({ ...p, ...tokensOf(p), discovered: /^ean-\d+$/.test(p.id) }));

const clusters = {};
for (const p of pool) (clusters[p.fp] ??= []).push(p);

const H = `-H "authorization: Bearer $TOKEN" -H 'content-type: application/json'`;
const curl = (method, path, body) =>
  `curl -sX ${method} "$BASE${path}" ${H} -d '${JSON.stringify(body)}'`;

let proposals = 0;
console.log(`BASE=${base}; TOKEN=$(cat tools/.ingest-token)\n`);
for (const members of Object.values(clusters)) {
  const discovered = members.filter(m => m.discovered);
  if (members.length < 2 || !discovered.length) continue;
  proposals++;
  console.log(`## family: "${members[0].fp}" (${members.length} members)`);
  for (const m of members) {
    console.log(`#   ${m.id}${m.discovered ? '' : ' [catalog]'}: "${m.name}" storage=${m.storage ?? '?'} color=${m.color ?? '?'} offers=${m.offers?.length ?? 0}`);
  }

  const seedMember = members.find(m => !m.discovered);
  if (seedMember) {
    // an existing catalog product is in the family: plain triage — alias each
    // discovered EAN to it (or to one of its ~children; pick by hand)
    for (const m of discovered) {
      console.log(curl('POST', '/api/admin/alias', { ean: m.ean, product_id: seedMember.id }) + `  # or ${seedMember.id}~<combo>`);
    }
    console.log('');
    continue;
  }

  // all-discovered family: synthesize axes from the differing tokens
  const axes = [];
  if (new Set(members.map(m => m.storage)).size > 1) axes.push('storage');
  if (new Set(members.map(m => m.color)).size > 1) axes.push('color');
  const combo = (m) => axes.map(ax => ax === 'storage' ? String(m.storage) : m.color).join('-');
  const bad = !axes.length
    || members.some(m => axes.some(ax => m[ax === 'storage' ? 'storage' : 'color'] == null))
    || new Set(members.map(combo)).size !== members.length;
  if (bad) {
    console.log(`# no clean axis split (missing/duplicate tokens) — group by hand if real\n`);
    continue;
  }

  const head = [...members].sort((a, b) => (b.offers?.length ?? 0) - (a.offers?.length ?? 0))[0];
  // head = default combo: its own option must come FIRST on every axis
  // (variantListing treats options[0]-of-each-axis as the base listing)
  const optIds = (ax) => [...new Set(members.map(m => ax === 'storage' ? String(m.storage) : m.color))]
    .sort((a, b) => (combo(head).split('-').includes(a) ? -1 : 0) - (combo(head).split('-').includes(b) ? -1 : 0));
  const variants = { axes: axes.map(ax => ({
    id: ax, label: ax === 'storage' ? 'Storage' : 'Colour',
    options: optIds(ax).map(id => ({ id, label: ax === 'storage' ? gbLabel(Number(id)) : cap(id) })),
  })) };
  const vlabel = (m) => axes.map(ax => ax === 'storage' ? gbLabel(m.storage) : cap(m.color)).join(' · ');

  console.log(`# head ${head.id} gets the axes (PATCH also promotes it — fill cat/kw):`);
  console.log(curl('PATCH', `/api/admin/products/${head.id}`, { cat: 'FILL_ME', icon: 'package', kw: '', variants, hidden: null }));
  for (const m of members) {
    if (m === head) continue;
    console.log(curl('POST', '/api/admin/alias', {
      ean: m.ean, product_id: `${head.id}~${combo(m)}`,
      meta: { name: `${head.name} · ${vlabel(m)}`, family: head.id, vlabel: vlabel(m) },
    }));
  }
  console.log('');
}
console.log(proposals ? `${proposals} cluster(s) proposed — review before running anything` : 'no multi-member families found');
