import type { PayloadRequest, TaskConfig } from 'payload'

import {
  type AtlasSnapshotCounts,
  SNAPSHOT_KEY_PREFIX,
  snapshotDate,
  snapshotKey,
} from '@/lib/atlasOverview/statistics'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import { runClock } from '@/lib/jobs/runClock'
import { relationId } from '@/lib/utilities/relationId'

const PAGINATION_LIMIT = 500
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long a day's counts are kept.
 *
 * ⚠ **Lower bound: the longest comparison a tile makes, plus slack.** The homes
 * and the statistics email compare against 30 days ago, so a window at 30 would
 * race the prune. 45 leaves two weeks of missed runs before a comparison goes
 * blind.
 */
const SNAPSHOT_RETENTION_DAYS = 45

/**
 * Count each region's own non-trashed events by stage.
 *
 * Two columns per event, no population: the rollup to a subtree happens at
 * read time from the breadcrumbs the regions already carry, so this needs
 * nothing but the region id and the stage.
 */
export async function countEventsByRegion(req: PayloadRequest): Promise<AtlasSnapshotCounts> {
  const counts: AtlasSnapshotCounts = {}
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await req.payload.find({
      collection: 'events',
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      overrideAccess: true,
      req,
      select: { region: true, verificationStage: true },
    })
    for (const event of batch.docs) {
      const regionId = relationId(event.region)
      if (regionId == null) continue
      const stage = event.verificationStage as VerificationStage
      const region = (counts[String(regionId)] ??= {})
      region[stage] = (region[stage] ?? 0) + 1
    }
    hasNextPage = batch.hasNextPage
    page++
  }
  return counts
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

    const cutoff = snapshotKey(
      snapshotDate(new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * DAY_MS)),
    )
    const expired = (await payload.kv.keys()).filter(
      (key) => key.startsWith(SNAPSHOT_KEY_PREFIX) && key < cutoff,
    )
    for (const key of expired) await payload.kv.delete(key)

    const output = { date, events, regions: Object.keys(counts).length }
    payload.logger.info({ msg: 'RecordAtlasSnapshot complete', ...output })
    return { output }
  },
}
