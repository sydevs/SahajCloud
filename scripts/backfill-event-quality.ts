#!/usr/bin/env node
/**
 * Backfill the stored listing-quality columns on existing events (#609).
 *
 * `qualityOpenCount` / `qualityCheckVersion` are stamped on every save, so rows
 * written before they shipped hold NULL — which sorts as "no open items" and
 * puts the worst listings at the bottom of a list sorted by the column. The
 * same pass re-stamps rows whose `qualityCheckVersion` predates the current
 * check definitions. The routine itself (and the reasoning behind it) lives in
 * `src/lib/eventQuality/backfill.ts`.
 *
 * Reports by default; writes only with `--force`. Re-runnable — a second pass
 * finds nothing to do, because the count is a pure function of the document.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-event-quality.ts              # dry run
 *   pnpm tsx scripts/backfill-event-quality.ts --force      # apply
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { backfillEventQuality } from '../src/lib/eventQuality/backfill'

function parseArgs(argv: string[]): { force: boolean } {
  let force = false
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') force = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return { force }
}

/**
 * The Payload config validates the whole server env when it's imported, and ESM
 * hoists every static import above the module body — so dotenv has to run first
 * and the config has to be pulled in dynamically.
 */
async function loadPayload(): Promise<Payload> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const { force } = parseArgs(process.argv)

  console.log(
    force
      ? 'APPLYING — restamping the listing-quality columns on matching rows.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()
  const stats = await backfillEventQuality({
    payload,
    apply: force,
    onChange: ({ id, from, to, error }) => {
      const suffix = error ? ` FAILED — ${error}` : force ? '' : ' (dry run)'
      console.log(
        `  events#${id}: ${from.openCount ?? 'null'} open (v${from.version ?? 'null'}) → ` +
          `${to.openCount} open (v${to.version})${suffix}`,
      )
    },
  })

  console.log(
    `\nscanned ${stats.scanned}, ${force ? 'updated' : 'would update'} ${stats.changed}, ` +
      `already correct ${stats.unchanged}, failed ${stats.failed}`,
  )

  if (stats.failed > 0) {
    console.error(`Completed with ${stats.failed} failure(s).`)
    process.exit(1)
  }
  console.log('Done.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
