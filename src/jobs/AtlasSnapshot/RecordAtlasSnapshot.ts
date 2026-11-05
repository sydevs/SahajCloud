import type { PayloadRequest, TaskConfig } from 'payload'

import { snapshotDate } from '@/lib/atlasOverview/snapshots'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import { relationId } from '@/lib/utilities/relationId'
import type { AtlasSnapshotCounts } from '@/payload-types'

const PAGINATION_LIMIT = 500

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
 * ⚠ **One row per UTC day, replaced rather than added to.** `date` is unique,
 * so a re-run of the same day overwrites: a retry after a crash must not leave
 * the day half counted, and two rows for one day would make "the snapshot from
 * 30 days ago" ambiguous.
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
    // `req.context.now` overrides the clock for deterministic tests.
    const contextNow = (req.context as { now?: unknown } | undefined)?.now
    const date = snapshotDate(contextNow instanceof Date ? contextNow : new Date())

    const counts = await countEventsByRegion(req)
    const events = Object.values(counts).reduce(
      (total, stages) => total + Object.values(stages).reduce((sum, n) => sum + (n ?? 0), 0),
      0,
    )

    const existing = await payload.find({
      collection: 'atlas-snapshots',
      where: { date: { equals: date } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      select: {},
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'atlas-snapshots',
        id: existing.docs[0].id,
        data: { counts },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } else {
      await payload.create({
        collection: 'atlas-snapshots',
        data: { counts, date },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    const output = { date, events, regions: Object.keys(counts).length }
    payload.logger.info({ msg: 'RecordAtlasSnapshot complete', ...output })
    return { output }
  },
}
