#!/usr/bin/env node
/**
 * Backfill the derived `schedule.lastDate` column on existing rows (#603).
 *
 * Rows written before this column shipped hold NULL, which reads as
 * "this recurrence never ends." So a finished event stays on the public
 * feeds until something recomputes it. This CLI walks `events` and
 * `app-cards` and fixes them. The routine itself, and the reasoning
 * behind it, live in `src/lib/schedule/backfillLastDate.ts`.
 *
 * This reports by default. It writes only with `--force`. You can
 * re-run it safely: a second pass finds nothing to do, because
 * `lastDate` is a pure function of the schedule.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-schedule-last-date.ts              # dry run
 *   pnpm tsx scripts/backfill-schedule-last-date.ts --force      # apply
 *   pnpm tsx scripts/backfill-schedule-last-date.ts --force --collection events
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import type { ScheduleCollection } from '../src/lib/schedule/backfillLastDate'
import {
  backfillScheduleLastDate,
  SCHEDULE_COLLECTIONS,
} from '../src/lib/schedule/backfillLastDate'

interface Args {
  force: boolean
  collections: readonly ScheduleCollection[]
}

function parseArgs(argv: string[]): Args {
  let collections: readonly ScheduleCollection[] = SCHEDULE_COLLECTIONS
  let force = false

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') {
      force = true
    } else if (arg === '--collection') {
      const value = argv[++i] as ScheduleCollection
      if (!SCHEDULE_COLLECTIONS.includes(value)) {
        throw new Error(`--collection must be one of: ${SCHEDULE_COLLECTIONS.join(', ')}`)
      }
      collections = [value]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { force, collections }
}

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
  const { force, collections } = parseArgs(process.argv)

  console.log(
    force
      ? 'APPLYING — recomputing schedule.lastDate on matching rows.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()
  let failed = 0

  for (const collection of collections) {
    console.log(`${collection}:`)
    const stats = await backfillScheduleLastDate({
      payload,
      collection,
      apply: force,
      onChange: ({ id, from, to, error }) => {
        const suffix = error ? ` FAILED — ${error}` : force ? '' : ' (dry run)'
        console.log(`  ${collection}#${id}: ${from ?? 'null'} → ${to ?? 'null'}${suffix}`)
      },
    })
    failed += stats.failed
    console.log(
      `  scanned ${stats.scanned}, ${force ? 'updated' : 'would update'} ${stats.changed}, ` +
        `already correct ${stats.unchanged}, no schedule ${stats.skipped}, failed ${stats.failed}\n`,
    )
  }

  if (failed > 0) {
    console.error(`Completed with ${failed} failure(s).`)
    process.exit(1)
  }
  console.log('Done.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
