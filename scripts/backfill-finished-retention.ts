#!/usr/bin/env node
/**
 * Arm the retention watermark on `finished` events written before it existed.
 *
 * The ExpireEvents job finds every transition — including "trash this finished
 * event, its 6-month retention elapsed" — through one query, `nextCheckAt <=
 * now`. Rows finished before that rule shipped hold NULL, which reads as "never
 * look at this again", so they'd never be trashed. This CLI gives them their
 * retention date. The routine (and the reasoning) lives in
 * `src/lib/eventVerification/backfillFinishedRetention.ts`.
 *
 * Reports by default; writes only with `--force`. Re-runnable — a second pass
 * finds nothing, because it only selects rows whose `nextCheckAt` is still null.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-finished-retention.ts            # dry run
 *   pnpm tsx scripts/backfill-finished-retention.ts --force    # apply
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { backfillFinishedRetention } from '../src/lib/eventVerification/backfillFinishedRetention'

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
      ? 'APPLYING — arming nextCheckAt on finished events that have none.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()
  const stats = await backfillFinishedRetention({
    payload,
    apply: force,
    onChange: ({ id, to, error }) => {
      const suffix = error ? ` FAILED — ${error}` : force ? '' : ' (dry run)'
      console.log(`  events#${id}: retention → ${to}${suffix}`)
    },
  })

  console.log(
    `\nscanned ${stats.scanned}, ${force ? 'armed' : 'would arm'} ${stats.armed}, ` +
      `no schedule end ${stats.skipped}, failed ${stats.failed}`,
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
