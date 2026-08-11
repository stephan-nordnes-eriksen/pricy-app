// Rolls product-eval/findings/*.jsonl into REPORT.md + fixes.jsonl (the applyable set).
// node product-eval/aggregate.mjs
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.join(import.meta.dirname, 'findings')
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jsonl')).sort()

const rows = [], summaries = [], bad = []
for (const f of files) {
  for (const [i, line] of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').entries()) {
    if (!line.trim()) continue
    let o
    try { o = JSON.parse(line) } catch { bad.push(`${f}:${i + 1}`); continue }
    o._shard = f.replace('.jsonl', '')
    ;(o.id === '_summary' ? summaries : rows).push(o)
  }
}

const issues = rows.filter(r => r.status === 'issue' && r.issues?.length)
const count = (arr, key) => arr.reduce((m, x) => (m[key(x)] = (m[key(x)] || 0) + 1, m), {})
const flat = issues.flatMap(r => (r.issues || []).map(i => ({ ...i, id: r.id, shard: r._shard })))
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])
const sev = { high: 0, med: 1, low: 2 }
const worst = r => Math.min(...(r.issues || []).map(i => sev[i.severity] ?? 2))

const md = []
md.push('# Product audit — pricy.no live catalog\n')
md.push(`Shards: ${files.length} · products checked: ${rows.length} · clean: ${rows.length - issues.length} · with findings: ${issues.length} (${(issues.length / rows.length * 100).toFixed(1)}%)\n`)
if (bad.length) md.push(`> Unparseable lines: ${bad.join(', ')}\n`)

md.push('\n## Findings by kind\n')
md.push('| kind | findings | high | med | low |', '|---|---|---|---|---|')
for (const [k, n] of top(count(flat, x => x.kind))) {
  const s = flat.filter(x => x.kind === k)
  md.push(`| ${k} | ${n} | ${s.filter(x => x.severity === 'high').length} | ${s.filter(x => x.severity === 'med').length} | ${s.filter(x => x.severity === 'low').length} |`)
}

md.push('\n## Findings by category\n')
md.push('| category | checked | with findings | high-severity rows |', '|---|---|---|---|')
const cats = [...new Set(rows.map(r => r._shard.replace(/-\d+$/, '')))].sort()
for (const c of cats) {
  const all = rows.filter(r => r._shard.startsWith(c + '-'))
  const iss = all.filter(r => r.status === 'issue' && r.issues?.length)
  md.push(`| ${c} | ${all.length} | ${iss.length} | ${iss.filter(r => worst(r) === 0).length} |`)
}

md.push('\n## Category re-classifications proposed\n')
const recat = flat.filter(x => x.kind === 'category' && x.suggested)
md.push(`${recat.length} rows. Most common moves:\n`)
md.push('| from → to | rows |', '|---|---|')
for (const [k, n] of top(count(recat, x => `${x.current} → ${x.suggested}`)).slice(0, 30)) md.push(`| ${k} | ${n} |`)

md.push('\n## Rule gaps reported (vocabulary / facetrules work)\n')
const gaps = [...summaries.flatMap(s => s.rule_gaps || []), ...flat.filter(x => x.kind && x.rule).map(x => x.rule)]
for (const [g, n] of top(count(gaps, x => x))) md.push(`- ${g}${n > 1 ? ` _(${n} shards)_` : ''}`)

md.push('\n## High-severity rows\n')
const highs = issues.filter(r => worst(r) === 0)
md.push(`${highs.length} rows. Full list in \`fixes.jsonl\`; first 100:\n`)
md.push('| id | name | issue | fix |', '|---|---|---|---|')
for (const r of highs.slice(0, 100)) {
  const i = (r.issues || []).find(x => x.severity === 'high') || r.issues[0]
  const esc = s => String(s ?? '').replace(/\|/g, '\\|').slice(0, 90)
  md.push(`| \`${r.id}\` | ${esc(r.name)} | ${i.kind}: ${esc(i.current)} → ${esc(i.suggested)} | ${esc(JSON.stringify(r.fix))} |`)
}

md.push('\n## Per-shard summaries\n')
md.push('| shard | checked | ok | issues | notes |', '|---|---|---|---|---|')
for (const s of summaries.sort((a, b) => a.shard?.localeCompare(b.shard)))
  md.push(`| ${s.shard} | ${s.checked} | ${s.ok} | ${s.issues} | ${String(s.notes ?? '').replace(/\|/g, '\\|')} |`)

fs.writeFileSync(path.join(import.meta.dirname, 'REPORT.md'), md.join('\n') + '\n')
fs.writeFileSync(path.join(import.meta.dirname, 'fixes.jsonl'),
  issues.filter(r => r.fix).map(r => JSON.stringify({ id: r.id, shard: r._shard, name: r.name, sev: ['high', 'med', 'low'][worst(r)], kinds: r.issues.map(i => i.kind), fix: r.fix })).join('\n') + '\n')

console.log(`shards ${files.length} · rows ${rows.length} · issues ${issues.length} · fixes ${issues.filter(r => r.fix).length} · bad lines ${bad.length}`)
const missing = files.length - summaries.length
if (missing) console.log(`WARNING: ${missing} shard file(s) have no _summary line`)
