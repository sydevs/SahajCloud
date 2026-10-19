/**
 * The import's own last word, written after the plugin's.
 *
 * ⚠ **The plugin's status counts only its own failures.** Rows our `before`
 * hook skipped never reach its write, so a file whose every row was skipped
 * would otherwise read `completed` with nothing imported. This runs after the
 * plugin's final update and replaces its status and issue count with ones that
 * include the skipped rows.
 */

import type { ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { sendImportSummary } from './summaryEmail'

type ImportStatus = 'completed' | 'failed' | 'partial'

function statusOf(run: ImportRun): ImportStatus {
  if (!run.skipped.length) return 'completed'
  return run.imported > 0 ? 'partial' : 'failed'
}

export async function finishImport(req: PayloadRequest, run: ImportRun): Promise<void> {
  run.skipped.sort((a, b) => a.row - b.row)
  await req.payload.update({
    collection: 'imports',
    id: run.importId,
    data: {
      status: statusOf(run),
      skippedRows: run.skipped,
      summary: {
        imported: run.imported,
        total: run.imported + run.skipped.length,
        issues: run.skipped.length,
      },
    },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req,
  })
  await sendImportSummary({ req, run })
}

/**
 * A whole-import failure — the geocoder down, the target gone — stored where
 * the import page shows it. The rethrow that follows is what records it on the
 * job, so a failure of this write is logged rather than allowed to replace it.
 */
export async function failImport(req: PayloadRequest, importId: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  try {
    await req.payload.update({
      collection: 'imports',
      id: importId,
      data: { status: 'failed', error: message },
      overrideAccess: true,
      depth: 0,
      select: { status: true },
      req,
    })
  } catch (failure) {
    req.payload.logger.error({ err: failure, import: importId }, 'Failed import could not be marked')
  }
}
