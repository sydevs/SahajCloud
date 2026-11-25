#!/usr/bin/env node
/**
 * Re-spell region slugs generated before `slugifyValue` wrote umlauts as
 * `ae`/`oe`/`ue` (`universitat-trier → universitaet-trier`). Which slugs
 * qualify is `planUmlautSlugs` (`scripts/umlaut-region-slugs-plan.ts`).
 *
 * **Dry run by default.** It prints every rename, collision and unmatched
 * slug. `--apply` writes the renames.
 *
 * ⚠ A renamed place's old URL stops resolving: the atlas finds a place by its
 * last slug alone. An event URL still opens, because it resolves by id. A
 * host whose configured default route names an old slug opens nothing.
 *
 * Each rename goes through the Local API, so the nested-docs cascade
 * re-saves every descendant's breadcrumbs, which `webPath` is built from.
 *
 * Usage:
 *   pnpm tsx scripts/umlaut-region-slugs.ts            # dry run
 *   pnpm tsx scripts/umlaut-region-slugs.ts --apply
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import dotenv from 'dotenv'

import { exitAfterFlush, loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'
import { planUmlautSlugs, type RegionSlugRow } from './umlaut-region-slugs-plan'

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayloadWithoutSchemaChanges()

  const { docs } = await payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, slug: true },
  })
  const plan = planUmlautSlugs(docs as RegionSlugRow[])

  console.log(`${plan.renames.length} rename(s) of ${docs.length} regions:`)
  for (const change of plan.renames) {
    console.log(`  regions#${change.id}  ${change.from} → ${change.to}  (${change.name})`)
  }
  if (plan.collisions.length) {
    console.log(`\n${plan.collisions.length} skipped, the new slug is taken:`)
    for (const change of plan.collisions) {
      console.log(`  regions#${change.id}  ${change.from} ↛ ${change.to}  (${change.name})`)
    }
  }
  if (plan.unmatched.length) {
    console.log(`\n${plan.unmatched.length} skipped, slug not generated from the name:`)
    for (const row of plan.unmatched) {
      console.log(`  regions#${row.id}  ${row.slug}  (${row.name})`)
    }
  }

  if (!apply) {
    console.log('\nDry run. Pass --apply to write the renames.')
    exitAfterFlush(0)
    return
  }

  console.log('\n⚠ Writing renames.')
  let failed = 0
  for (const change of plan.renames) {
    try {
      await payload.update({
        collection: 'regions',
        id: change.id,
        data: { slug: change.to },
        overrideAccess: true,
      })
      console.log(`  ✓ regions#${change.id}  ${change.to}`)
    } catch (error) {
      failed++
      console.error(`  ✗ regions#${change.id}  ${change.to}: ${(error as Error).message}`)
    }
  }
  exitAfterFlush(failed ? 1 : 0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
