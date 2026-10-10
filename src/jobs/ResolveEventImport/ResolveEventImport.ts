import type { PayloadRequest, TaskConfig } from 'payload'

import { Temporal } from '@js-temporal/polyfill'

import { PROGRESS_EVERY_ROWS, RESOLVE_CONCURRENCY } from '@/collections/EventImports/constants'
import {
  failBatchWhenSpent,
  jobWriteReq,
  recordBatchFailure,
  stillHolding,
} from '@/collections/EventImports/jobContext'
import type { ProposableTargetLevel } from '@/collections/EventImports/propose/tree'
import {
  isProposableTargetLevel,
  unproposableTargetMessage,
} from '@/collections/EventImports/propose/tree'
import type { LoadTargetResult } from '@/collections/EventImports/regionReads'
import { loadTarget } from '@/collections/EventImports/regionReads'
import type { EventImport, EventImportRows, SupportedTimezones } from '@/payload-types'

import { geocodePendingRows, GeocoderDown } from './geocodeRows'
import { markDuplicates } from './markDuplicates'
import { proposeTree } from './proposeTree'

type ImportRow = EventImportRows[number]
type LoadedTarget = Extract<LoadTargetResult, { ok: true }>


/**
 * How many times the queue re-runs a resolve that threw.
 *
 * One, because the only error this job throws is "the geocoder did not answer"
 * — `src/lib/mapbox/geocoder.ts` has already spent `p-retry`'s three attempts
 * by then, so a second pass is a minute's grace against a blip and no more.
 * Everything else about a row is written onto the row and is not an error.
 */
const RESOLVE_RETRIES = 1

/**
 * Geocode every row of a batch, place it against the target, flag the repeats,
 * and propose the region tree a commit would create.
 *
 * This is #874's `resolve` and `propose` endpoints with the chunking taken out.
 * The browser no longer drives the work, so there is no lease, no time budget
 * and no cursor: `enableConcurrencyControl` gives one worker per job row, and
 * the status is what says whether the work is this job's to do.
 *
 * ⚠ **Resolve and propose are one job, not two.** The tree is sized from the
 * places the rows name — the metro merge and the state layer both count them
 * (`propose/tree.ts`) — so a tree built while any row is still pending proposes
 * a shape the finished batch does not have. Keeping them together is what makes
 * "every row has an answer" true by construction rather than by a status check.
 *
 * ⚠ **Rows are geocoded concurrently and matched sequentially.** The duplicate
 * check compares a row against the rows before it, so running it inside the
 * concurrent pass would make a file's answers depend on which request returned
 * first — the chunked version had exactly that, keyed on chunk boundaries. Two
 * passes, and a file resolves to the same answer every time.
 *
 * ⚠ **A row's own fault is written onto the row; ours is thrown.** Mapbox not
 * answering says nothing about the address, so writing "could not find this
 * location" would turn a few minutes of trouble into rows a volunteer can only
 * fix by re-uploading. The batch reads `failed` instead, with the reason.
 */
export const ResolveEventImport: TaskConfig<'resolveEventImport'> = {
  slug: 'resolveEventImport',
  label: 'Resolve Event Import',
  retries: RESOLVE_RETRIES,
  onFail: failBatchWhenSpent(RESOLVE_RETRIES),
  inputSchema: [{ name: 'batchId', type: 'number', required: true }],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'resolved', type: 'number', required: true },
    { name: 'pending', type: 'number', required: true },
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

    // The batch was discarded, or swept, between the queue and the worker.
    if (!batch) return { output: { status: 'gone', resolved: 0, pending: 0 } }
    // ⚠ **The status is the authority, not the job row.** A re-upload queues a
    // second resolve, and the autoRun net can re-run a row whose own completion
    // write was lost — so a job whose batch has moved on does nothing rather
    // than overwriting a review in progress.
    if (batch.status !== 'resolving') {
      return { output: { status: batch.status, resolved: 0, pending: 0 } }
    }

    const loaded = await loadTargetOrFail(req, batch, batchId)
    if (!loaded) return { output: { status: 'failed', resolved: 0, pending: 0 } }
    const { target, level } = loaded

    const rows = (batch.rows ?? []) as ImportRow[]
    let tree: Awaited<ReturnType<typeof proposeTree>>
    try {
      await geocodePendingRows({
        req,
        batchId,
        rows,
        scope: target.scope,
        defaultLanguages: (batch.defaultLanguages ?? []) as string[],
        concurrency: RESOLVE_CONCURRENCY,
        progressEvery: PROGRESS_EVERY_ROWS,
        todayIn,
      })
      await markDuplicates({ req, targetId: target.target.id, rows })
      tree = await proposeTree({ req, rows, target, level })
    } catch (error) {
      // ⚠ **Every fault stores a message, not only the geocoder's.** `onFail`
      // moves the batch to `failed` once the attempts are spent and carries no
      // error of its own, so anything that skips this leaves a volunteer a
      // failed batch with nothing saying why — the one state `jobContext.ts`
      // exists to prevent.
      const down = error instanceof GeocoderDown
      // The rows go back first, so the ones that did resolve are not geocoded
      // again on the retry.
      await writeRows(req, batchId, rows, {
        note: down ? 'Waiting for the address lookup service' : 'Interrupted — trying again',
      })
      await recordBatchFailure({
        req,
        batchId,
        error: down
          ? error.message
          : 'This import stopped while working out its addresses. It will try again.',
        final: false,
      })
      throw error
    }

    const pending = rows.filter((row) => !row.resolved && !row.errors?.length).length

    // A discard that landed while this ran wins: the geocoding is spent either
    // way, and the batch is its owner's to give up on.
    if (!(await stillHolding(req, batchId, 'resolving'))) {
      return { output: { status: 'discarded', resolved: 0, pending } }
    }

    await req.payload.update({
      collection: 'event-imports',
      id: batchId,
      data: {
        rows,
        proposedRegions: tree,
        progress: { done: rows.length, total: rows.length, note: target.warning ?? null },
        status: 'review',
        error: null,
      },
      overrideAccess: true,
      depth: 0,
      select: { status: true },
      req: jobWriteReq(req),
    })

    return {
      output: {
        status: 'review',
        resolved: rows.filter((row) => row.resolved).length,
        pending,
      },
    }
  },
}

/**
 * The target region and the codes its rows are confined to, or `null` once the
 * batch has been told why there are none.
 *
 * Both refusals are terminal, so they are recorded rather than thrown: the
 * region is gone, or it is a level no tree can hang off, and a retry answers
 * identically.
 */
async function loadTargetOrFail(
  req: PayloadRequest,
  batch: EventImport,
  batchId: number,
): Promise<null | { target: LoadedTarget; level: ProposableTargetLevel }> {
  const targetId =
    typeof batch.targetRegion === 'object' ? batch.targetRegion?.id : batch.targetRegion
  if (typeof targetId !== 'number') {
    await recordBatchFailure({
      req,
      batchId,
      error: 'This import names no target region.',
      final: true,
    })
    return null
  }

  const loaded = await loadTarget(req, targetId)
  if (!loaded.ok) {
    await recordBatchFailure({ req, batchId, error: loaded.error, final: true })
    return null
  }
  const level = loaded.target.level
  if (!isProposableTargetLevel(level)) {
    await recordBatchFailure({ req, batchId, error: unproposableTargetMessage(level), final: true })
    return null
  }
  return { target: loaded, level }
}

/** The rows as they stand, plus a note for the bar — used on the way out of a failure. */
async function writeRows(
  req: PayloadRequest,
  batchId: number,
  rows: readonly ImportRow[],
  progress: { note: string },
): Promise<void> {
  await req.payload.update({
    collection: 'event-imports',
    id: batchId,
    data: {
      rows: rows as EventImportRows,
      progress: { done: rows.filter((row) => row.resolved || row.errors?.length).length, total: rows.length, ...progress },
    },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req: jobWriteReq(req),
  })
}

/** Today in the class's own zone, which is what a first occurrence counts from. */
function todayIn(timezone: SupportedTimezones): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(timezone)
}
