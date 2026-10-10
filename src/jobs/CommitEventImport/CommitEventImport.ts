import type { PayloadRequest, TaskConfig } from 'payload'

import { ensureCoordinators } from '@/collections/EventImports/commit/coordinators'
import { managerRoster } from '@/collections/EventImports/commit/managers'
import { ensureProposedRegions } from '@/collections/EventImports/commit/regions'
import type { CommitRow, Uploader } from '@/collections/EventImports/commit/rows'
import {
  isCommittable,
  refuseRow,
  reviveOrphanedRepeats,
  rowsAwaitingCommit,
} from '@/collections/EventImports/commit/rows'
import { commitWriteReq } from '@/collections/EventImports/commit/scope'
import { commitReport, tallyRows } from '@/collections/EventImports/commit/summary'
import { PROGRESS_EVERY_ROWS } from '@/collections/EventImports/constants'
import {
  failBatchWhenSpent,
  jobWriteReq,
  recordBatchFailure,
} from '@/collections/EventImports/jobContext'
import { loadTarget, readSubtree } from '@/collections/EventImports/regionReads'
import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import type {
  EventImport,
  EventImportProposedRegions,
  EventImportRows,
  Region,
} from '@/payload-types'
import { purgeCloudflareCache } from '@/plugins/cache/purge'

import { commitRow } from './commitRow'
import { duplicatePlacements, recheckDuplicates } from './recheckDuplicates'
import { sendImportSummary } from './summaryEmail'

/**
 * How many times the queue re-runs a commit that threw.
 *
 * Two, because a commit's transient faults are a dropped connection and a
 * deadlock — both worth one more pass — and because a retry is cheap by
 * construction: `importKey` is checked before every create, so a class an
 * earlier attempt made is found rather than repeated.
 */
const COMMIT_RETRIES = 2

/**
 * Create the batch's regions, its coordinators and one class per committable
 * row.
 *
 * This is #874's `commit` endpoint and `commit/finish.ts` with the chunking and
 * the overwrite branch taken out. There is no batch transaction — 500 classes in
 * one would hold a write lock across every region the batch touches — so a run
 * that dies has already created classes, and three things keep the retry honest:
 * one worker per job row (`enableConcurrencyControl`), each class's unique
 * `importKey`, and `rows[].committed`, which is what says a row is owed nothing.
 *
 * ⚠ **The tree is re-read, never rebuilt.** `proposedRegions` is what a human
 * approved; recomputing it here would commit a shape nobody saw. What it names
 * is re-checked instead — a region that has since left the target, a slug taken
 * since, a feature created since (`commit/regions.ts`).
 *
 * ⚠ **The duplicate question is asked again of every row it writes.** The
 * review's answer is minutes or days old, and another volunteer's batch into the
 * same region may have added the class since. Such a row is skipped and
 * reported, because nobody chose otherwise.
 *
 * ⚠ **One purge per tag, at the end.** Every write carries
 * `DEFER_CACHE_INVALIDATION` (`commit/scope.ts`), so no class or region busts
 * the edge on its own way in — 500 classes would otherwise be 500 Cloudflare
 * calls and 500 sidebar busts for one outcome. Between the first write and this
 * step the edge serves the shape it had before; the per-collection TTL is the
 * backstop if the job dies in that window.
 *
 * ⚠ **Nothing here sends an invitation.** `queueOnManagerField`
 * (`src/plugins/login/invitations.ts`) queues one when `Events.manager` is set,
 * which is the only place a coordinator is named — so a second mechanism here
 * would mail them twice.
 */
export const CommitEventImport: TaskConfig<'commitEventImport'> = {
  slug: 'commitEventImport',
  label: 'Commit Event Import',
  retries: COMMIT_RETRIES,
  onFail: failBatchWhenSpent(COMMIT_RETRIES),
  inputSchema: [{ name: 'batchId', type: 'number', required: true }],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'committed', type: 'number', required: true },
    { name: 'skipped', type: 'number', required: true },
  ],
  handler: async ({ input, req }) => {
    const batchId = Number(input.batchId)
    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id: batchId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })) as EventImport | null

    if (!batch) return { output: { status: 'gone', committed: 0, skipped: 0 } }
    // ⚠ **The status is the authority.** The Retry button queues a second
    // commit, and the autoRun net can re-run a row whose completion write was
    // lost — so a job whose batch is already `finished` does nothing rather than
    // re-reporting and re-mailing it.
    if (batch.status !== 'committing') {
      return { output: { status: batch.status, committed: 0, skipped: 0 } }
    }

    const targetId =
      typeof batch.targetRegion === 'object' ? batch.targetRegion?.id : batch.targetRegion
    const tree = batch.proposedRegions
    if (typeof targetId !== 'number' || !tree) {
      await recordBatchFailure({
        req,
        batchId,
        error: 'This import has no target region or no proposed regions. Upload the file again.',
        final: true,
      })
      return { output: { status: 'failed', committed: 0, skipped: 0 } }
    }

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) {
      await recordBatchFailure({ req, batchId, error: loaded.error, final: true })
      return { output: { status: 'failed', committed: 0, skipped: 0 } }
    }

    const rows = (batch.rows ?? []) as CommitRow[]
    // Before anything is created: a row the proposal refused carries its reason
    // in the tree and nothing on the row, so it would otherwise read as
    // committable here.
    adoptTreeErrors(rows, tree)

    const managerId = typeof batch.manager === 'object' ? batch.manager?.id : batch.manager
    const uploader = await uploaderOf(req, typeof managerId === 'number' ? managerId : null)

    try {
      await writeClasses({
        req,
        batchId,
        rows,
        targetId,
        tree,
        targetLevel: loaded.target.level,
        uploader,
      })
    } catch (error) {
      reviveOrphanedRepeats(rows)
      // The rows go back first: a job that dies without them would create every
      // class again on its retry, and `importKey` is what stops that costing a
      // duplicate rather than a wasted pass.
      await writeRows(req, batchId, rows)
      await recordBatchFailure({
        req,
        batchId,
        error: 'Some classes could not be created. The import will try again.',
        final: false,
      })
      throw error
    }

    reviveOrphanedRepeats(rows)
    const report = commitReport(rows)
    const tally = tallyRows(rows)

    if (tally.committed > 0) {
      await purgeCloudflareCache({ tags: ['events', 'regions'] }, { logger: req.payload.logger })
      revalidateAtlasSidebar()
    }

    await req.payload.update({
      collection: 'event-imports',
      id: batchId,
      data: {
        rows: rows as EventImportRows,
        report: { ...report, finishedAt: new Date().toISOString() },
        progress: { done: rows.length, total: rows.length, note: null },
        status: 'finished',
        error: null,
      },
      overrideAccess: true,
      depth: 0,
      select: { status: true },
      req: jobWriteReq(req),
    })

    // Last, and never allowed to fail the commit: the classes exist and the
    // report is on the batch either way, and a job that threw here would create
    // every class again on its retry.
    await sendImportSummary({
      req,
      batchId,
      batchCreatedAt: batch.createdAt,
      uploader,
      targetName: loaded.target.name,
      rows,
      nodes: tree.nodes,
    })

    return {
      output: { status: 'finished', committed: tally.committed, skipped: report.skipped.length },
    }
  },
}

/**
 * Regions, then coordinators, then one class per row.
 *
 * In that order because each needs the one before it: a class is filed under a
 * region, and a class's coordinator must have an account before it can name one.
 */
async function writeClasses(args: {
  req: PayloadRequest
  batchId: number
  rows: CommitRow[]
  targetId: number
  tree: EventImportProposedRegions
  /** Whether a class may hang off the target itself — `Events.region` is a city or a venue. */
  targetLevel: Region['level']
  /** Who uploaded the batch, named on every class it creates. */
  uploader: Uploader
}): Promise<void> {
  const { req, batchId, rows, targetId, tree, targetLevel, uploader } = args

  const subtree = await readSubtree(req, targetId)
  const regions = await ensureProposedRegions(req, {
    batchId,
    targetId,
    nodes: tree.nodes,
    subtree,
  })

  const owed = rowsAwaitingCommit(rows)
  if (!owed.length) return

  await recheckDuplicates({ req, batchId, targetId, rows: owed })
  const writable = owed.filter(isCommittable)
  const [coordinators, placements] = await Promise.all([
    ensureCoordinators(
      req,
      managerRoster(writable.map(({ line, values }) => ({ line, values: values ?? {} }))),
      [...subtree.keys()],
    ),
    duplicatePlacements(req, writable, subtree),
  ])

  // One copy for the whole pass: every region a row files into exists by now,
  // and the request's own memo would otherwise refuse them (`commit/scope.ts`).
  const writeReq = commitWriteReq(req)
  let done = 0
  for (const row of writable) {
    await commitRow({
      req: writeReq,
      row,
      batchId,
      targetId,
      targetLevel,
      uploader,
      tree,
      regions,
      coordinators,
      subtree,
      placements,
    })
    done += 1
    if (done % PROGRESS_EVERY_ROWS === 0) {
      await writeProgress(req, batchId, {
        done,
        total: writable.length,
        note: `Creating ${writable.length} ${writable.length === 1 ? 'class' : 'classes'} — ${done} done`,
      })
    }
  }
}

/**
 * Who uploaded the batch, which is not always who fired the commit.
 *
 * ⚠ **The id travels beside the name.** `name` is the account holder's to edit,
 * so a provenance entry naming only a name could credit anybody. A deleted
 * account degrades to a number rather than a blank.
 */
async function uploaderOf(req: PayloadRequest, managerId: null | number): Promise<Uploader> {
  if (managerId === null) return { id: null, name: 'Bulk import' }
  const manager = await req.payload
    .findByID({
      collection: 'managers',
      id: managerId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { name: true },
      req,
    })
    .catch(() => null)
  return { id: managerId, name: manager?.name?.trim() || `#${managerId}` }
}

/** Copy the proposal's own refusals onto the rows they belong to, once. */
function adoptTreeErrors(rows: CommitRow[], tree: EventImportProposedRegions): void {
  if (!tree.rowErrors.length) return
  const byLine = new Map(rows.map((row) => [row.line, row]))
  for (const { line, message } of tree.rowErrors) {
    const row = byLine.get(line)
    if (row && !row.errors?.includes(message)) refuseRow(row, message)
  }
}

async function writeRows(req: PayloadRequest, batchId: number, rows: readonly CommitRow[]) {
  await req.payload.update({
    collection: 'event-imports',
    id: batchId,
    data: { rows: rows as EventImportRows },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req: jobWriteReq(req),
  })
}

async function writeProgress(
  req: PayloadRequest,
  batchId: number,
  progress: { done: number; total: number; note: string },
) {
  await req.payload.update({
    collection: 'event-imports',
    id: batchId,
    data: { progress },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req: jobWriteReq(req),
  })
}
