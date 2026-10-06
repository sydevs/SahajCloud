/**
 * The commit's last step, run once the rows owe nothing: tidy what the batch
 * left empty, invalidate the caches, report what landed, and reduce the batch to
 * that report.
 *
 * ⚠ **This is what pays the deferral back.** Every commit write carries
 * `DEFER_CACHE_INVALIDATION` (`./scope`), so no class or region purged the edge
 * or the sidebar on its own way in. Between the first write and this step the
 * edge serves the shape it had before, and the per-collection TTL is the
 * backstop if a commit dies in that window (`src/plugins/cache/purge.ts`).
 * Removing this step does not slow the import down — it leaves the Atlas stale.
 *
 * ⚠ **The batch is trashed as its report, not hard-deleted.** Deleted, a response
 * lost on its way back would take the import's only account with it, and the
 * next call could answer nothing but 404. The rows lose their CSV values (contact
 * names, phones, addresses) except on the lines that were skipped, the report is
 * stored beside them, and the trash window (`PurgeEventImports`) erases the rest.
 * A commit call on a finished batch answers with the report.
 *
 * ⚠ **It runs once, under the batch's lease** (`lease.ts`), so two final calls
 * cannot purge, mail and archive twice — the second finds `finished`.
 */

import type { ProposedNode } from '../propose/tree'
import type { PayloadRequest } from 'payload'

import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import type { EventImportReport, Manager, Region } from '@/payload-types'
import { purgeCloudflareCache } from '@/plugins/cache/purge'

import { ENDPOINT_WRITE } from '../discard'
import { managerRoster } from './managers'
import { creatableNodes } from './placement'
import { plannedMapboxId } from './regionData'
import { isCommittable, type CommitRow, type Uploader } from './rows'
import { commitWriteReq } from './scope'
import { skippedRowsCsv } from './skippedCsv'
import { commitReport, tallyRows, type CommitReport } from './summary'
import { sendImportSummary } from './summaryEmail'

export interface FinishCommitArgs {
  batchId: number
  /** When the batch was uploaded — the boundary a region or account it opened is counted against. */
  batchCreatedAt: string
  targetId: number
  targetName: string
  uploader: Uploader
  rows: readonly CommitRow[]
  nodes: readonly ProposedNode[]
}

export interface FinishOutcome extends CommitReport {
  /** Whether the admins were told. Nothing is sent to them for a batch that changed nothing. */
  summaryEmailed: boolean
  /** Whether the uploader was sent their report, skipped lines attached. */
  reportEmailed: boolean
}

export async function finishCommit(
  req: PayloadRequest,
  args: FinishCommitArgs,
): Promise<FinishOutcome> {
  const { batchId, batchCreatedAt, targetId, targetName, uploader, rows, nodes } = args
  const tally = tallyRows(rows)
  const report = commitReport(rows)

  const regions = await createdRegions(req, batchId, nodes, batchCreatedAt)
  const removed = await removeEmptyRegions(req, regions)
  const regionsAdded = regions.length - removed

  if (tally.committed > 0 || regions.length > 0) {
    await purgeCloudflareCache({ tags: ['events', 'regions'] }, { logger: req.payload.logger })
    revalidateAtlasSidebar()
  }

  // ⚠ **The same rows `ensureCoordinators` was given, not every row.** A
  // duplicate or errored row may name a coordinator nobody ever looked up, and
  // counting it would report accounts this import never touched.
  const roster = managerRoster(
    rows.filter(isCommittable).map(({ line, values }) => ({ line, values: values ?? {} })),
  )
  const counts = {
    overwritten: tally.overwritten,
    verified: tally.verified,
    unverified: tally.unverified,
    duplicates: tally.duplicates,
    errors: tally.errors,
    regionsAdded,
    coordinators: roster.length,
    coordinatorsCreated: await coordinatorsCreated(req, roster, batchCreatedAt),
  }
  const common = { uploaderName: uploader.name, targetId, targetName, counts }

  // An import that changed nothing is the uploader's business, not every
  // admin's — and four requests must not be enough to mail all of them.
  const summaryEmailed =
    tally.committed > 0 || regionsAdded > 0
      ? await sendImportSummary(req, { ...common, to: { audience: 'admin' } })
      : false

  const address = await addressOf(req, uploader.id)
  const reportEmailed = address
    ? await sendImportSummary(req, {
        ...common,
        to: { audience: 'uploader', address },
        skipped: {
          lines: report.skipped.map(({ line, reasons }) => ({ line, reasons })),
          csv: skippedRowsCsv(report.skipped),
        },
      })
    : false

  await archiveBatch(req, batchId, rows, {
    committed: report.committed,
    skipped: report.skipped,
    reportEmailed,
    finishedAt: new Date().toISOString(),
  })

  return { ...report, summaryEmailed, reportEmailed }
}

/**
 * The regions this batch opened: the ones holding a node's planned feature, and
 * younger than the batch.
 *
 * Asked of the database because no counter survives the chunks — the last
 * chunk's own `ensureProposedRegions` reports everything as adopted.
 */
async function createdRegions(
  req: PayloadRequest,
  batchId: number,
  nodes: readonly ProposedNode[],
  since: string,
): Promise<Pick<Region, 'id' | 'level'>[]> {
  let planned: string[]
  try {
    planned = creatableNodes(nodes).flatMap((node) => plannedMapboxId(node, batchId) ?? [])
  } catch {
    return []
  }
  if (!planned.length) return []

  const { docs } = await req.payload.find({
    collection: 'regions',
    where: {
      and: [{ mapboxId: { in: planned } }, { createdAt: { greater_than_equal: since } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { level: true },
    req,
  })
  return docs as Pick<Region, 'id' | 'level'>[]
}

const DEPTH: Record<Region['level'], number> = { country: 0, region: 1, city: 2, venue: 3 }

/**
 * Remove the regions this batch opened that ended up holding nothing.
 *
 * ⚠ **Regions are live the moment they are written** — `Regions` has no drafts —
 * so a city whose every row failed was a published, empty place on the Atlas.
 * Deepest first, so a state empties once its last city goes. A region holding a
 * class (trashed ones included) or a child region is left alone, and a refusal
 * is logged rather than failing the finish.
 */
async function removeEmptyRegions(
  req: PayloadRequest,
  regions: readonly Pick<Region, 'id' | 'level'>[],
): Promise<number> {
  let removed = 0
  const writeReq = commitWriteReq(req)
  for (const region of [...regions].sort((a, b) => DEPTH[b.level] - DEPTH[a.level])) {
    try {
      const [classes, children] = await Promise.all([
        req.payload.count({
          collection: 'events',
          where: { region: { equals: region.id } },
          overrideAccess: true,
          trash: true,
          req,
        }),
        req.payload.count({
          collection: 'regions',
          where: { parent: { equals: region.id } },
          overrideAccess: true,
          req,
        }),
      ])
      if (classes.totalDocs || children.totalDocs) continue
      await req.payload.delete({
        collection: 'regions',
        id: region.id,
        overrideAccess: true,
        select: { level: true },
        req: writeReq,
      })
      removed += 1
    } catch (error) {
      req.payload.logger.warn({ err: error, region: region.id }, 'Empty imported region not removed')
    }
  }
  return removed
}

/**
 * How many of the batch's coordinators got an account out of it.
 *
 * An account holding a roster address and younger than the batch is one this
 * import created; the only way to miscount is for somebody to have added that
 * exact address by hand between the upload and the commit. `createdAt` is not
 * the uploader's to move (`discard.ts`).
 */
async function coordinatorsCreated(
  req: PayloadRequest,
  roster: readonly { email: string }[],
  batchCreatedAt: string,
): Promise<number> {
  if (!roster.length) return 0

  const { totalDocs } = await req.payload.count({
    collection: 'managers',
    where: {
      and: [
        { email: { in: roster.map((request) => request.email) } },
        { createdAt: { greater_than_equal: batchCreatedAt } },
      ],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs
}

/** The uploader's own address, for their report. */
async function addressOf(req: PayloadRequest, uploaderId: null | number): Promise<null | string> {
  if (uploaderId === null) return null
  const manager = (await req.payload
    .findByID({
      collection: 'managers',
      id: uploaderId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { email: true, type: true },
      req,
    })
    .catch(() => null)) as Manager | null
  return manager && manager.type !== 'inactive' ? manager.email || null : null
}

/**
 * Reduce the batch to its report and move it to the trash.
 *
 * A failure is logged, not thrown: the classes exist and the report is in the
 * response either way, and the sweep removes a batch left behind.
 */
async function archiveBatch(
  req: PayloadRequest,
  batchId: number,
  rows: readonly CommitRow[],
  report: EventImportReport,
): Promise<void> {
  try {
    await req.payload.update({
      collection: 'event-imports',
      id: batchId,
      data: {
        status: 'finished',
        report,
        // ⚠ The CSV values go; what the row became stays, which is what a
        // replayed report and an admin restoring the batch read.
        rows: rows.map(({ line, errors, warnings, duplicate, committed }) => ({
          line,
          values: {},
          ...(errors?.length ? { errors } : {}),
          ...(warnings?.length ? { warnings } : {}),
          ...(duplicate ? { duplicate } : {}),
          ...(committed ? { committed } : {}),
        })),
        proposedRegions: null as never,
        deletedAt: new Date().toISOString(),
      },
      context: { [ENDPOINT_WRITE]: true },
      overrideAccess: true,
      depth: 0,
      select: { status: true },
      req,
    })
  } catch (error) {
    req.payload.logger.error({ err: error, batch: batchId }, 'Finished event import not archived')
  }
}
