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

import { buildResults } from './results'
import { sendImportSummary } from './summaryEmail'

type ImportStatus = 'completed' | 'failed' | 'partial'

function statusOf(run: ImportRun): ImportStatus {
  if (!run.skipped.length) return 'completed'
  return run.imported > 0 ? 'partial' : 'failed'
}

export async function finishImport(req: PayloadRequest, run: ImportRun): Promise<void> {
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
  await req.payload.update({
    collection: 'imports',
    id: run.importId,
    data: {
      status: statusOf(run),
      results: rows,
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
  const message = importErrorMessage(error)
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

/**
 * A whole-import failure in the volunteer's words.
 *
 * ⚠ **The plugin's CSV parser refuses a ragged file outright**, so one row
 * split on an unquoted comma fails every row, and its own message names
 * neither the cause nor the fix.
 */
export function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const ragged = /Invalid Record Length: columns length is (\d+), got (\d+) on line (\d+)/.exec(message)
  if (ragged) {
    const [, columns, got, line] = ragged
    return `Line ${line} has ${got} values but the header has ${columns} columns. A value that contains a comma must be wrapped in double quotes. Fix the file and upload it again.`
  }
  if (/Quote Not Closed/i.test(message)) {
    return 'A double quote (") opens a value that never closes, so the rest of the file reads as one value. Close the quote or remove it, and upload the file again.'
  }
  const quote = /Invalid (?:Opening|Closing) Quote.*?line (\d+)/i.exec(message)
  if (quote) {
    return `Line ${quote[1]} has text straight after a closing double quote ("). Inside a quoted value, write a double quote as two (""). Fix the file and upload it again.`
  }
  return message
}
