/**
 * The import's own last word, written after the plugin's.
 *
 * ⚠ **The plugin's status counts only its own failures.** Rows our `before`
 * hook skipped never reach its write, so a file whose every row was skipped
 * would otherwise read `completed` with nothing imported. This write carries
 * `IMPORT_FINISH`, the one marker that lets an import leave `pending`
 * (`importCollection.ts`), so the page never shows a finished import without
 * its rows.
 */

import type { ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { IMPORT_FINISH } from './importCollection'
import { buildResults } from './results'
import { sendImportSummary } from './summaryEmail'

type ImportStatus = 'completed' | 'failed' | 'partial'

function statusOf(run: ImportRun): ImportStatus {
  if (run.imported === 0) return 'failed'
  return run.skipped.length ? 'partial' : 'completed'
}

export async function finishImport(req: PayloadRequest, run: ImportRun): Promise<void> {
  await writeOutcome(req, run, { status: statusOf(run) })
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
    req.payload.logger.error({ err: failure, import: importId }, 'Failed import could not be marked')
  }
}

async function writeOutcome(
  req: PayloadRequest,
  run: ImportRun,
  data: { status: ImportStatus; error?: string },
): Promise<void> {
  run.skipped.sort((a, b) => a.row - b.row)
  const { docs } = await req.payload.find({
    collection: 'events',
    where: { importBatch: { equals: run.importId } },
    sort: 'id',
    draft: true,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { importBatch: true },
    req,
  })
  const { rows, matched } = buildResults(
    run.submitted,
    run.skipped,
    docs.map(({ id }) => id),
  )
  if (!matched) {
    req.payload.logger.warn(
      { import: run.importId, created: docs.length, rows: rows.length },
      'Imported classes could not be matched to their rows; the result links none of them',
    )
  }
  await markImport(req, run.importId, { ...data, results: rows })
}

function markImport(req: PayloadRequest, importId: number, data: Record<string, unknown>) {
  return req.payload.update({
    collection: 'imports',
    id: importId,
    data,
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req: { ...req, context: { ...req.context, [IMPORT_FINISH]: true } } as PayloadRequest,
  })
}
