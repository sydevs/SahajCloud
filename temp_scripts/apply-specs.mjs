// Apply verified IA specs (from the audit workflow) to the schema + seed.
// Reads temp_scripts/ia-specs.json — an array of:
//   { leaf: "auth.login", seedKey, title|null, description, order:[{key,section,description}], dead[], misfiled[] }
// leafPath is derived by splitting `leaf` on '.'. Uses reorder-lib so nothing is
// dropped silently and the seed stays in step.
import { readFileSync } from 'node:fs'

import { applyLeaf, loadFiles, writeFiles } from './reorder-lib.mjs'

const specs = JSON.parse(readFileSync('temp_scripts/ia-specs.json', 'utf8'))
const ctx = loadFiles()

let hadIssue = false
for (const s of specs) {
  const path = s.leaf.split('.')
  const spec = s.order.map((o) => [o.key, o.section || '', o.description])
  const { unhandled, missing } = applyLeaf(ctx, {
    path,
    seedKey: s.seedKey,
    title: s.title ?? undefined,
    description: s.description,
    spec,
    dead: s.dead || [],
    misfiled: s.misfiled || [],
  })
  if (unhandled.length || missing.length) hadIssue = true
}

writeFiles(ctx)
console.log(hadIssue ? '\n⚠ applied WITH issues (see above)' : '\n✓ all specs applied cleanly')
