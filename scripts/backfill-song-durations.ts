#!/usr/bin/env node
/**
 * Give every stored song a `duration` (#1195).
 *
 * The extraction hook fires on an upload, so every song uploaded before that
 * hook landed carries no duration and renders as `0:00` wherever a playlist
 * lists it. This reads each such song's stored audio and writes the length it
 * states.
 *
 * Dry run by default; `--force` writes. Re-runnable — a song that already
 * holds a duration is never fetched or written.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-song-durations.ts
 *   pnpm tsx scripts/backfill-song-durations.ts --force
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET, CLOUDFLARE_R2_DELIVERY_URL.
 */
import dotenv from 'dotenv'

import { backfillSongDurations } from '../src/lib/audio/backfillSongDurations'
import { loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  if (force) console.warn('--force: every song below will be written.\n')

  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayloadWithoutSchemaChanges()

  const { scanned, written, skipped } = await backfillSongDurations(payload, { dryRun: !force })

  console.log(`${scanned} song(s) hold no duration.\n`)
  for (const row of written) {
    console.log(`  songs#${row.id}  ${row.duration}s  ${JSON.stringify(row.title)}`)
  }
  for (const row of skipped) {
    console.log(`  songs#${row.id}  SKIPPED (${row.reason})  ${JSON.stringify(row.title)}`)
  }

  console.log(
    `\n${written.length} ${force ? 'written' : 'to write'}, ${skipped.length} skipped.` +
      (force ? '' : '\nRe-run with --force to write them.'),
  )
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
