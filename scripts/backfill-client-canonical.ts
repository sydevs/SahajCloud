#!/usr/bin/env node
/**
 * Seed `canonical.domain` / `canonical.routing` on existing clients from the
 * legacy Atlas config (#633).
 *
 * A *starting point*, not a decision: `canonical.enabled` is left false on
 * every row, because the legacy values are unverified (`sahajayoga.at` is
 * recorded as `script` and in fact serves an iframe). Someone reads what the
 * widget actually reported into `embedMetadata`, then opts a client in by hand.
 *
 * Reports by default; writes only with `--force`. Re-runnable — it only ever
 * fills a field that is currently empty, so a second pass finds nothing to do.
 * The routine itself (and the reasoning behind reading `legacyData` rather than
 * the dropped `legacyConfig` column) lives in
 * `src/lib/clients/backfillCanonical.ts`.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-client-canonical.ts            # dry run
 *   pnpm tsx scripts/backfill-client-canonical.ts --force    # apply
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { backfillClientCanonical } from '../src/lib/clients/backfillCanonical'

function parseArgs(argv: string[]): { force: boolean } {
  let force = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--force') force = true
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return { force }
}

/**
 * The Payload config validates the whole server env when it's imported, and ESM
 * hoists every static import above the module body — so dotenv has to run first
 * and the config has to be pulled in dynamically.
 */
async function loadPayload(): Promise<Payload> {
  // Shell env wins, then .env.local, then .env (see seeds/env.ts).
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const { force } = parseArgs(process.argv)

  console.log(
    force
      ? 'APPLYING — seeding canonical.domain / canonical.routing from legacy Atlas config.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()
  const stats = await backfillClientCanonical({
    payload,
    apply: force,
    onChange: ({ id, name, domain, routing, error }) => {
      const parts = [domain && `domain=${domain}`, routing && `routing=${routing}`].filter(Boolean)
      const suffix = error ? ` FAILED — ${error}` : force ? '' : ' (dry run)'
      console.log(`  clients#${id} "${name}": ${parts.join(', ')}${suffix}`)
    },
  })

  console.log(
    `\nscanned ${stats.scanned}, ${force ? 'seeded' : 'would seed'} ${stats.changed}, ` +
      `already set ${stats.unchanged}, no legacy config ${stats.skipped}, failed ${stats.failed}`,
  )
  console.log('canonical.enabled left false on every row — opt in by hand after review.')

  if (stats.failed > 0) {
    console.error(`\nCompleted with ${stats.failed} failure(s).`)
    process.exit(1)
  }
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
