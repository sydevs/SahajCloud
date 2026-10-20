/** Writing an import's outcome: the result rows, its status, and the uploader's email. */

import type { ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { buildResults } from './results'
import { sendImportSummary } from './summaryEmail'

type ImportStatus = 'completed' | 'failed' | 'review'

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
 * Move a settled import between `review` and `completed` as its drafts are
 * published or deleted. A pending or failed import is left alone: the one is
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
  if (current?.status !== 'review' && current?.status !== 'completed') return
  const { totalDocs: drafts } = await req.payload.count({
    collection: 'events',
    where: { and: [{ importBatch: { equals: importId } }, { _status: { equals: 'draft' } }] },
    overrideAccess: true,
    req,
  })
  const next: ImportStatus = drafts ? 'review' : 'completed'
  if (next !== current.status) await markImport(req, importId, { status: next })
}
