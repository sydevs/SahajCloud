import fs from 'fs'
import path from 'path'

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'
import { parseBuffer } from 'music-metadata'

/**
 * Data-only migration: Backfill duration for existing meditations.
 *
 * Fetches audio files from R2 (production) or local filesystem (development),
 * extracts duration using music-metadata, and updates the duration column.
 *
 * This migration is idempotent — only processes meditations where duration IS NULL.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const r2DeliveryUrl = process.env.CLOUDFLARE_R2_DELIVERY_URL

  const result = await db.all(sql`
    SELECT id, filename FROM meditations
    WHERE filename IS NOT NULL AND duration IS NULL
  `)

  const rows = result.rows as Array<{ id: number; filename: string }>
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[backfill-duration] No meditations need backfilling')
    return
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill-duration] Processing ${rows.length} meditations...`)

  let updated = 0
  let failed = 0

  for (const row of rows) {
    try {
      let buffer: Buffer

      if (r2DeliveryUrl) {
        // Production: fetch from R2 public URL
        const url = `${r2DeliveryUrl}/${row.filename}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching ${url}`)
        }
        buffer = Buffer.from(await response.arrayBuffer())
      } else {
        // Development: read from local filesystem
        const localPath = path.join(process.cwd(), 'media', 'meditations', row.filename)
        if (!fs.existsSync(localPath)) {
          // eslint-disable-next-line no-console
          console.log(`[backfill-duration] Skipping meditation ${row.id}: file not found at ${localPath}`)
          continue
        }
        buffer = fs.readFileSync(localPath)
      }

      const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg' })
      const duration = metadata.format.duration

      if (duration != null && duration > 0) {
        const roundedDuration = Math.round(duration)
        await db.run(sql`UPDATE meditations SET duration = ${roundedDuration} WHERE id = ${row.id}`)
        updated++
      }
    } catch (error) {
      failed++
      // eslint-disable-next-line no-console
      console.error(
        `[backfill-duration] Failed for meditation ${row.id} (${row.filename}):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill-duration] Complete: ${updated} updated, ${failed} failed, ${rows.length - updated - failed} skipped`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Reset all backfilled durations to NULL
  await db.run(sql`UPDATE meditations SET duration = NULL WHERE duration IS NOT NULL`)
}
