import type { PayloadRequest, TaskConfig } from 'payload'

import {
  type AtlasSnapshotCounts,
  countByRegion,
  SNAPSHOT_KEY_PREFIX,
  snapshotDate,
  snapshotKey,
} from '@/lib/atlasOverview/statistics'
import { addDays } from '@/lib/eventVerification/periods'
import { runClock } from '@/lib/jobs/runClock'

/**
 * How long a day's counts are kept: the 30-day comparison plus the week a
 * reader looks back past a missed run (`snapshotBefore`), plus a day of slack.
 */
const SNAPSHOT_RETENTION_DAYS = 38

/** Count each region's own non-trashed events by stage; the subtree rollup happens at read time. */
export async function countEventsByRegion(req: PayloadRequest): Promise<AtlasSnapshotCounts> {
  // ⚠ One unpaginated read, as the live tiles make: offset pages would shift under an event created mid-run.
  const { docs } = await req.payload.find({
    collection: 'events',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
    select: { region: true, verificationStage: true },
  })
  return countByRegion(docs)
}

/**
 * Record today's event counts per region, so a tile can say what changed.
 *
 * CADENCE: daily at 06:00 UTC, riding the hourly `nightly` autoRun — an hour
 * ahead of `sendDigests`, so the statistics an email quotes are the ones the
 * home shows.
 *
 * ⚠ **One `payload.kv` key per UTC day, replaced rather than added to**, so a
 * retry after a crash cannot leave the day half counted. This is the whole
 * history: the stage is overwritten in place on the event, so a tile's "+12 in
 * 30 days" has no other source.
 *
 * Also prunes days older than `SNAPSHOT_RETENTION_DAYS`. The keys sort as their
 * dates do, so the cutoff is a string comparison.
 */
export const RecordAtlasSnapshot: TaskConfig<'recordAtlasSnapshot'> = {
  slug: 'recordAtlasSnapshot',
  label: 'Record Atlas Snapshot',
  retries: 1,
  concurrency: { key: () => 'recordAtlasSnapshot', exclusive: true },
  outputSchema: [
    { name: 'date', type: 'text', required: true },
    { name: 'regions', type: 'number', required: true },
    { name: 'events', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 6 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    const payload = req.payload
    const now = runClock(req)
    const date = snapshotDate(now)

    const counts = await countEventsByRegion(req)
    const events = Object.values(counts).reduce(
      (total, stages) => total + Object.values(stages).reduce((sum, n) => sum + (n ?? 0), 0),
      0,
    )

    await payload.kv.set(snapshotKey(date), counts)

    const cutoff = snapshotKey(snapshotDate(addDays(now, -SNAPSHOT_RETENTION_DAYS)))
    const expired = (await payload.kv.keys()).filter(
      (key) => key.startsWith(SNAPSHOT_KEY_PREFIX) && key < cutoff,
    )
    for (const key of expired) await payload.kv.delete(key)

    const output = { date, events, regions: Object.keys(counts).length }
    payload.logger.info({ msg: 'RecordAtlasSnapshot complete', ...output })
    return { output }
  },
}
