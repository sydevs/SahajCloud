import fs from 'fs'
import path from 'path'

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'
import { parseBuffer } from 'music-metadata'

type DurationRow = {
  id: number
  filename: string | null
  mime_type: string | null
}

type BackfillResult = {
  updated: number
  failed: number
  skipped: number
}

/**
 * Data-only migration: Backfill duration for existing meditations.
 *
 * Fetches audio files from R2 (production) or local filesystem (development),
 * extracts duration using music-metadata, and updates the duration column.
 *
 * This migration is idempotent — only processes meditations where duration IS NULL.
 */
const getAudioBuffer = async (
  filename: string,
  r2DeliveryUrl: string | undefined,
): Promise<Buffer | null> => {
  if (r2DeliveryUrl) {
    const url = `${r2DeliveryUrl}/${filename}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  const localPath = path.join(process.cwd(), 'media', 'meditations', filename)
  if (!fs.existsSync(localPath)) {
    return null
  }

  return fs.readFileSync(localPath)
}

const getRoundedDuration = async (
  row: DurationRow,
  r2DeliveryUrl: string | undefined,
  durationCache: Map<string, number | null>,
): Promise<number | null> => {
  const filename = row.filename?.trim()

  if (!filename) {
    return null
  }

  if (durationCache.has(filename)) {
    return durationCache.get(filename) ?? null
  }

  const buffer = await getAudioBuffer(filename, r2DeliveryUrl)
  if (!buffer) {
    durationCache.set(filename, null)
    return null
  }

  const metadata = await parseBuffer(buffer, { mimeType: row.mime_type || 'audio/mpeg' })
  const duration = metadata.format.duration

  if (duration == null || duration <= 0) {
    durationCache.set(filename, null)
    return null
  }

  const roundedDuration = Math.round(duration)
  durationCache.set(filename, roundedDuration)
  return roundedDuration
}

const backfillMeditations = async (
  args: MigrateUpArgs,
  r2DeliveryUrl: string | undefined,
  durationCache: Map<string, number | null>,
): Promise<BackfillResult> => {
  const { db } = args

  const rows = await db.all<DurationRow>(sql`
    SELECT id, filename, mime_type FROM meditations
    WHERE filename IS NOT NULL AND duration IS NULL
  `)

  if (rows.length === 0) {
    return { updated: 0, failed: 0, skipped: 0 }
  }

  let updated = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const roundedDuration = await getRoundedDuration(row, r2DeliveryUrl, durationCache)
      if (roundedDuration == null) {
        skipped++
        continue
      }

      await db.run(sql`UPDATE meditations SET duration = ${roundedDuration} WHERE id = ${row.id}`)
      updated++
    } catch (error) {
      failed++
      // eslint-disable-next-line no-console
      console.error(
        `[backfill-duration] Failed for meditation ${row.id} (${row.filename ?? 'unknown'}):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  return { updated, failed, skipped }
}

const backfillMeditationVersions = async (
  args: MigrateUpArgs,
  r2DeliveryUrl: string | undefined,
  durationCache: Map<string, number | null>,
): Promise<BackfillResult> => {
  const { db } = args

  const rows = await db.all<DurationRow>(sql`
    SELECT id, version_filename as filename, version_mime_type as mime_type FROM _meditations_v
    WHERE version_filename IS NOT NULL AND version_duration IS NULL
  `)

  if (rows.length === 0) {
    return { updated: 0, failed: 0, skipped: 0 }
  }

  let updated = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const roundedDuration = await getRoundedDuration(row, r2DeliveryUrl, durationCache)
      if (roundedDuration == null) {
        skipped++
        continue
      }

      await db.run(sql`UPDATE _meditations_v SET version_duration = ${roundedDuration} WHERE id = ${row.id}`)
      updated++
    } catch (error) {
      failed++
      // eslint-disable-next-line no-console
      console.error(
        `[backfill-duration] Failed for meditation version ${row.id} (${row.filename ?? 'unknown'}):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  return { updated, failed, skipped }
}

export async function up(args: MigrateUpArgs): Promise<void> {
  const r2DeliveryUrl = process.env.CLOUDFLARE_R2_DELIVERY_URL
  const durationCache = new Map<string, number | null>()

  const meditationRows = await args.db.all<{ count: number }>(sql`
    SELECT COUNT(*) as count FROM meditations
    WHERE filename IS NOT NULL AND duration IS NULL
  `)
  const versionRows = await args.db.all<{ count: number }>(sql`
    SELECT COUNT(*) as count FROM _meditations_v
    WHERE version_filename IS NOT NULL AND version_duration IS NULL
  `)

  const meditationCount = meditationRows[0]?.count ?? 0
  const versionCount = versionRows[0]?.count ?? 0
  const totalRows = meditationCount + versionCount

  if (totalRows === 0) {
    // eslint-disable-next-line no-console
    console.log('[backfill-duration] No meditation rows need backfilling')
    return
  }

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-duration] Processing ${totalRows} rows (${meditationCount} meditations, ${versionCount} versions)...`,
  )

  const meditationResult = await backfillMeditations(args, r2DeliveryUrl, durationCache)
  const versionResult = await backfillMeditationVersions(args, r2DeliveryUrl, durationCache)

  const updated = meditationResult.updated + versionResult.updated
  const failed = meditationResult.failed + versionResult.failed
  const skipped = meditationResult.skipped + versionResult.skipped

  // eslint-disable-next-line no-console
  console.log(`[backfill-duration] Complete: ${updated} updated, ${failed} failed, ${skipped} skipped`)
}

// No safe down migration for data backfill
export async function down({}: MigrateDownArgs): Promise<void> {
  // Intentionally left blank
}
