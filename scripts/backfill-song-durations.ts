#!/usr/bin/env node
/**
 * Give every stored song a `duration` (#1195).
 *
 * The extraction hook fires on an upload, so every song uploaded before that
 * hook landed carries no duration and renders as `0:00` wherever a playlist
 * lists it. This reads each such song's stored audio and writes the length it
 * states.
 *
 * Dry run by default; `--force` writes. The dry run reads the same audio the
 * write would, so the operator sees each length before it lands — only the
 * format block is read, not the whole track. Re-runnable: a song that already
 * holds a duration is never read or written.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-song-durations.ts
 *   pnpm tsx scripts/backfill-song-durations.ts --force
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET, CLOUDFLARE_R2_DELIVERY_URL.
 */
import dotenv from 'dotenv'

import { exitAfterFlush, loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'
import { backfillSongDurations } from './song-durations'

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  if (force) console.warn('--force: every song listed below will be written.\n')

  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayloadWithoutSchemaChanges()

  const { written, skipped } = await backfillSongDurations(payload, { dryRun: !force })

  console.log(`${written.length + skipped.length} song(s) hold no duration.\n`)
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
  exitAfterFlush(0)
}

void main().catch((error) => {
  console.error(error)
  exitAfterFlush(1)
})
