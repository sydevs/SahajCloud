/** Writing an import's outcome: the result rows, its status, and the uploader's email. */

import type { ImportRun } from './run'
import type { Payload, PayloadRequest } from 'payload'

import type { PayloadJob } from '@/payload-types'

import { buildResults } from './results'
import { sendImportSummary } from './summaryEmail'
import { IMPORT_TASK } from './task'

type ImportStatus = 'completed' | 'failed' | 'review'

/** What a volunteer is told when the container running their import went away. */
const INTERRUPTED_ERROR = 'The import stopped before it finished running. Upload the file again.'

/** Every class a finished run created is a draft, so it starts in review. */
export async function finishImport(req: PayloadRequest, run: ImportRun): Promise<void> {
  await writeOutcome(req, run, { status: run.created.length ? 'review' : 'failed' })
  await sendImportSummary({ req, run })
}

/**
 * A whole-import failure — the geocoder down, the target gone — stored where
 * the import page shows it, with whatever the run had already created, so
 * those drafts can still be published or cleaned up from the page. The
 * rethrow that follows is what records it on the job, so a failure of this
 * write is logged rather than allowed to replace it.
 */
export async function failImport(
  req: PayloadRequest,
  importId: number,
  error: unknown,
  run?: ImportRun,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  try {
    if (run) await writeOutcome(req, run, { status: 'failed', error: message })
    else await markImport(req, importId, { status: 'failed', error: message })
  } catch (failure) {
    req.payload.logger.error(
      { err: failure, import: importId },
      'Failed import could not be marked',
    )
  }
}

/** The results, and the parsed rows cleared: what a skipped row needs, `results` keeps. */
function writeOutcome(
  req: PayloadRequest,
  run: ImportRun,
  data: { status: ImportStatus; error?: string },
) {
  return markImport(req, run.importId, {
    ...data,
    results: buildResults(run.created, run.skipped),
    rows: null,
  })
}

function markImport(req: PayloadRequest, importId: number, data: Record<string, unknown>) {
  return req.payload.update({
    collection: 'imports',
    id: importId,
    data,
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req,
  })
}

/**
 * Finish an import once the last of its drafts is published or deleted.
 *
 * ⚠ **One direction only, `review` to `completed`.** This runs after every
 * Events write, and the lifecycle re-drafts an imported class long after the
 * import is done — ExpireEvents unpublishes an expired one, and a community
 * denial drafts one. Walking back would reopen a finished import for work that
 * is not import work. A pending or failed import is left alone too: the one is
 * still running, and the other keeps the error that explains it.
 */
export async function refreshImportStatus(req: PayloadRequest, importId: number): Promise<void> {
  const current = await req.payload.findByID({
    collection: 'imports',
    id: importId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { status: true },
    req,
  })
  if (current?.status !== 'review') return
  const { totalDocs: drafts } = await req.payload.count({
    collection: 'events',
    where: { and: [{ importBatch: { equals: importId } }, { _status: { equals: 'draft' } }] },
    overrideAccess: true,
    req,
  })
  if (drafts === 0) await markImport(req, importId, { status: 'completed' })
}

/**
 * Fail every import whose run was lost with the job rows the stale-job sweep
 * cancelled (`@/jobs/RecoverLostJobs/RecoverLostJobs`).
 *
 * The task marks the import from its own `catch` (`task.ts`), which a lost run
 * never reaches — so the row stays `pending`, its schedule cannot queue
 * another, and the import page waits on a worker that is gone. `status` is
 * closed to every writer, so there is no retry a volunteer could reach either.
 *
 * ⚠ **Only a `pending` import is touched.** The sweep's rows are read before
 * the cancel, so one of those runs may have landed in between and written its
 * own outcome — overwriting that would replace a real result with this notice.
 */
export async function failInterruptedImports(
  payload: Payload,
  cancelled: PayloadJob[],
): Promise<void> {
  for (const job of cancelled) {
    if (job.taskSlug !== IMPORT_TASK) continue
    const importId = Number((job.input as { importId?: unknown })?.importId)
    if (!Number.isInteger(importId)) continue

    try {
      const current = await payload.findByID({
        collection: 'imports',
        id: importId,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        select: { status: true },
      })
      if (current?.status !== 'pending') continue
      await payload.update({
        collection: 'imports',
        id: importId,
        data: { status: 'failed', error: INTERRUPTED_ERROR },
        depth: 0,
        overrideAccess: true,
        select: { status: true },
      })
    } catch (err) {
      payload.logger.error({ err, import: importId }, 'Interrupted import could not be marked')
    }
  }
}
