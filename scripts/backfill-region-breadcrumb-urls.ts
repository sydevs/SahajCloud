#!/usr/bin/env node
/**
 * Backfill `breadcrumbs[].url` on existing regions (#634).
 *
 * The nested-docs plugin fills that column only on write. So turning on
 * `generateURL` leaves every existing row null until something re-saves
 * it, and `where[breadcrumbs.url][equals]='/nl/amsterdam'` resolves
 * nothing until this script runs. It re-saves **roots only**, and lets
 * the plugin's own cascade visit the rest of the subtree. See
 * `src/lib/atlas/backfillBreadcrumbUrls.ts`.
 *
 * This reports by default. It writes only with `--force`. You can
 * re-run it safely: `url` is a pure function of the ancestor slug chain.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-region-breadcrumb-urls.ts            # dry run
 *   pnpm tsx scripts/backfill-region-breadcrumb-urls.ts --force    # apply
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { backfillBreadcrumbUrls } from '../src/lib/atlas/backfillBreadcrumbUrls'

/**
 * The Payload config checks the whole server env as soon as something
 * imports it. ESM also hoists every static import above the module
 * body. So dotenv must run first, and the config must load through a
 * dynamic import instead.
 */
async function loadPayload(): Promise<Payload> {
  // Shell env wins, then .env.local, then .env (see seeds/env.ts).
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--force')
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`)

  console.log(
    force
      ? 'APPLYING — re-saving root regions to repopulate breadcrumb URLs.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()
  const stats = await backfillBreadcrumbUrls({
    payload,
    apply: force,
    onProgress: ({ id, error }) => {
      if (error) console.error(`  regions#${id}: FAILED — ${error}`)
    },
  })

  console.log(`  scanned ${stats.scanned} regions, ${stats.missing} missing a breadcrumb URL`)
  console.log(`  ${force ? 're-saved' : 'would re-save'} ${stats.resaved} root region(s)`)
  if (force) {
    console.log(`  still missing after the run: ${stats.remaining}`)
    if (stats.remaining > 0) {
      console.log('  → almost certainly a blank slug in the chain; run audit-region-slugs.ts')
    }
  }

  if (stats.failed > 0) {
    console.error(`\nCompleted with ${stats.failed} failure(s).`)
    process.exit(1)
  }
  console.log('\nDone.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
