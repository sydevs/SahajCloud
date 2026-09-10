import { readFileSync, writeFileSync } from 'node:fs'

const F =
  '/private/tmp/claude-501/-Users-antontcymbal-Projects-WeMeditate-SahajCloud--claude-worktrees-nice-shtern-4fa2c0/ea36d94c-b8f2-4c12-a48a-8627b6ae2cc5/tasks/wwm1gmpjl.output'
const out = JSON.parse(readFileSync(F, 'utf8'))
const arr = out.result || out

const specs = []
const review = []
for (const r of arr) {
  const v = r.verified || r.draft
  if (!v) {
    review.push({ leaf: r.leaf, ERROR: 'no verified/draft' })
    continue
  }
  specs.push({
    leaf: r.leaf,
    seedKey: r.seedKey,
    title: v.title ?? null,
    description: v.description,
    order: v.order,
    dead: v.dead || [],
    misfiled: v.misfiled || [],
  })
  review.push({
    leaf: r.leaf,
    confidence: v.confidence,
    coverageOk: v.coverageOk,
    keyCount: r.keys.length,
    orderCount: v.order.length,
    dead: v.dead,
    misfiled: v.misfiled,
    changedFromDraft: v.changedFromDraft || [],
    notes: v.notes || [],
  })
}

writeFileSync('temp_scripts/ia-specs.json', JSON.stringify(specs, null, 2) + '\n')
writeFileSync('temp_scripts/ia-review.json', JSON.stringify(review, null, 2) + '\n')
console.log(`extracted ${specs.length} specs`)
for (const rv of review) {
  const cov = rv.coverageOk ? 'ok' : 'COVERAGE!'
  console.log(
    `  ${rv.leaf.padEnd(34)} conf=${(rv.confidence || '?').padEnd(6)} ${cov}  keys=${rv.keyCount} order=${rv.orderCount} dead=${(rv.dead || []).length} misfiled=${(rv.misfiled || []).length}`,
  )
}
