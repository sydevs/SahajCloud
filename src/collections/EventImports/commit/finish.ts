/**
 * The commit's last step, run once the rows owe nothing: invalidate the caches,
 * report what landed, and delete the batch.
 *
 * ⚠ **This is what pays the deferral back.** Every commit write carries
 * `DEFER_CACHE_INVALIDATION` (`./scope`), so no class or region purged the edge
 * or the sidebar on its own way in. Between the first write and this step the
 * edge serves the shape it had before, and the per-collection TTL is the
 * backstop if a commit dies in that window (`src/plugins/cache/purge.ts`).
 * Removing this step does not slow the import down — it leaves the Atlas stale.
 *
 * ⚠ **The order is cache, mail, delete, and only the delete is irreversible.**
 * The batch is the one thing that can be re-read, so it goes last: a dropped
 * response re-enters the commit endpoint, finds nothing pending, and runs this
 * again. A second purge costs one API call and a second summary is a duplicate
 * email — both survivable, which the row the last caller already deleted is not.
 *
 * ⚠ **An undelivered summary does not strand the batch.** Nothing retries a
 * commit on its own, so refusing to delete would keep an uploaded CSV of contact
 * details forever waiting for a volunteer to press a button that is gone. The
 * classes are created either way, each one naming who imported it
 * (`EventImports.ts`), so the report is a courtesy and the provenance is the
 * record.
 */

import type { PayloadRequest } from 'payload'

import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import { purgeCloudflareCache } from '@/plugins/cache/purge'

import { managerRoster } from './managers'
import { isCommittable, type CommitRow } from './rows'
import { commitReport, tallyRows, type CommitReport, type CommitTally } from './summary'
import { sendImportSummary } from './summaryEmail'

export interface FinishCommitArgs {
  batchId: number
  /** When the batch was uploaded — the boundary a new coordinator account is counted against. */
  batchCreatedAt: string
  targetId: number
  targetName: string
  uploaderName: string
  rows: readonly CommitRow[]
  /** Regions the batch wrote, created and re-adopted alike (`./regions`). */
  regionsAdded: number
}

export interface FinishOutcome extends CommitReport {
  /** Whether the summary reached anybody. */
  summaryEmailed: boolean
  /** Whether the batch is gone, which is what makes the commit finished. */
  deleted: boolean
}

export async function finishCommit(
  req: PayloadRequest,
  args: FinishCommitArgs,
): Promise<FinishOutcome> {
  const { batchId, batchCreatedAt, targetId, targetName, uploaderName, rows, regionsAdded } = args
  const tally = tallyRows(rows)

  await invalidateCaches(req, tally, regionsAdded)

  // ⚠ **The same rows `ensureCoordinators` was given, not every row.** A
  // duplicate or errored row may name a coordinator nobody ever looked up, and
  // counting it would report accounts this import never touched — beside a
  // created count that only ever covers the ones it did.
  const roster = managerRoster(
    rows.filter(isCommittable).map(({ line, values }) => ({ line, values: values ?? {} })),
  )
  const summaryEmailed = await sendImportSummary(req, {
    uploaderName,
    targetId,
    targetName,
    counts: {
      verified: tally.verified,
      unverified: tally.unverified,
      duplicates: tally.duplicates,
      errors: tally.errors,
      regionsAdded,
      coordinators: roster.length,
      coordinatorsCreated: await coordinatorsCreated(req, roster, batchCreatedAt),
    },
  })

  return {
    ...commitReport(rows),
    summaryEmailed,
    deleted: await deleteBatch(req, batchId),
  }
}

/**
 * Both caches, once each, and only when something reached them.
 *
 * One Cloudflare call carries both tags: the API takes a list, and a class
 * changes what a region read serves as much as what an event read does.
 */
async function invalidateCaches(
  req: PayloadRequest,
  tally: CommitTally,
  regionsAdded: number,
): Promise<void> {
  if (tally.committed === 0 && regionsAdded === 0) return

  await purgeCloudflareCache({ tags: ['events', 'regions'] }, { logger: req.payload.logger })
  revalidateAtlasSidebar()
}

/**
 * How many of the batch's coordinators got an account out of it.
 *
 * ⚠ **Asked of the database, because no counter survives the chunks.**
 * `ensureCoordinators` reports what *it* created, and on the last chunk that is
 * zero — every account its predecessors made reads as matched. An account
 * holding a roster address and younger than the batch is one this import
 * created; the only way to miscount is for somebody to have added that exact
 * address by hand between the upload and the commit.
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

/**
 * Hard-delete the batch, which is what "the commit finished" means.
 *
 * `payload.delete` is the hard delete on a trash-enabled collection
 * (`src/collections/CLAUDE.md`), so this empties the row rather than moving it
 * where `PurgeEventImports` would find it a week later. A refusal is logged
 * against the id: it leaves an uploaded CSV behind, and the sweep will not take
 * it, because a batch nobody trashed has no `deletedAt`.
 */
async function deleteBatch(req: PayloadRequest, batchId: number): Promise<boolean> {
  try {
    await req.payload.delete({
      collection: 'event-imports',
      id: batchId,
      overrideAccess: true,
      // Without this the delete hydrates the whole `rows` column — up to 500
      // rows of CSV — to return a document nothing reads (`PurgeEventImports`).
      select: { status: true },
      req,
    })
    return true
  } catch (error) {
    req.payload.logger.error({ err: error, batch: batchId }, 'Committed event import not deleted')
    return false
  }
}
