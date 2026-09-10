// Merge the per-group audit outputs in temp_scripts/specs-out/*.json into
// temp_scripts/ia-specs.json, validating each leaf's coverage against the real
// schema keys FIRST. Catches agent mistakes (invented keys, dropped keys,
// duplicates, non-contiguous sections) before anything touches the schema.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const KEYS = JSON.parse(readFileSync('temp_scripts/remaining-keys.json', 'utf8'))
const dir = 'temp_scripts/specs-out'

const merged = []
const problems = []

for (const f of readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  let arr
  try {
    arr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  } catch (e) {
    problems.push(`${f}: INVALID JSON — ${e.message}`)
    continue
  }
  if (!Array.isArray(arr)) {
    problems.push(`${f}: not an array`)
    continue
  }
  for (const s of arr) {
    const meta = KEYS[s.leaf]
    if (!meta) {
      problems.push(`${f}: unknown leaf "${s.leaf}"`)
      continue
    }
    const expected = meta.keys.map((k) => k.replace(/ \[richText\]$/, ''))
    const got = [...(s.order || []).map((o) => o.key), ...(s.dead || []), ...(s.misfiled || [])]
    const dupes = got.filter((k, i) => got.indexOf(k) !== i)
    const missing = expected.filter((k) => !got.includes(k))
    const invented = got.filter((k) => !expected.includes(k))
    if (dupes.length) problems.push(`${s.leaf}: duplicate keys — ${[...new Set(dupes)].join(', ')}`)
    if (missing.length) problems.push(`${s.leaf}: MISSING keys — ${missing.join(', ')}`)
    if (invented.length) problems.push(`${s.leaf}: INVENTED keys — ${invented.join(', ')}`)

    // sections must be contiguous
    const seen = new Set()
    let prev
    for (const o of s.order || []) {
      const sec = o.section || ''
      if (sec !== prev) {
        if (sec && seen.has(sec)) problems.push(`${s.leaf}: section "${sec}" not contiguous`)
        seen.add(sec)
        prev = sec
      }
      if (!o.description || !o.description.trim())
        problems.push(`${s.leaf}.${o.key}: empty description`)
    }

    // preserve an existing tab title unless the audit deliberately set one
    if (s.title == null && meta.title) s.title = meta.title
    if (!s.seedKey) s.seedKey = meta.seedKey
    merged.push(s)
  }
}

console.log(
  `merged ${merged.length} leaves from ${readdirSync(dir).filter((f) => f.endsWith('.json')).length} files`,
)
for (const s of merged) {
  const secs = [...new Set((s.order || []).map((o) => o.section).filter(Boolean))]
  console.log(
    `  ${s.leaf.padEnd(26)} ${String((s.order || []).length).padStart(2)} rows  ${secs.length} sections  dead=${(s.dead || []).length}${s.title ? `  title="${s.title}"` : ''}`,
  )
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} PROBLEM(S) — NOT writing ia-specs.json:`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}

writeFileSync('temp_scripts/ia-specs.json', JSON.stringify(merged, null, 2) + '\n')
console.log('\n✓ validated; wrote temp_scripts/ia-specs.json')
