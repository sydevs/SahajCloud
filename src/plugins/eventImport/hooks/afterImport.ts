/**
 * After each batch: fold the plugin's own failures into the run's skipped
 * rows, keyed back to the file's values so the volunteer can download, fix and
 * upload them again. After the last batch: store that list on the import and
 * send the uploader one email.
 */

import type { ImportAfterHook } from '@payloadcms/plugin-import-export/types'

import { IMPORT_BATCH_SIZE } from '../constants'
import { normaliseRow } from '../rows'
import { runOf } from '../run'
import { sendImportSummary } from '../summaryEmail'

/** Payload's envelope around a field refusal, which names fields and not reasons. */
const FIELDS_INVALID = /^The following fields? (?:is|are) invalid: /

export const afterImport: ImportAfterHook = async ({
  batchNumber,
  originalData,
  req,
  result,
  totalBatches,
}) => {
  const run = runOf(req)
  run.imported += result.imported

  const offset = (batchNumber - 1) * IMPORT_BATCH_SIZE
  for (const failure of result.errors) {
    const raw = originalData[failure.index - offset]
    run.skipped.push({
      row: failure.index + 1,
      reasons: [failure.error.replace(FIELDS_INVALID, 'invalid: ')],
      values: raw ? normaliseRow(raw) : {},
    })
  }

  if (batchNumber !== totalBatches) return

  run.skipped.sort((a, b) => a.row - b.row)
  await req.payload.update({
    collection: 'imports',
    id: run.importId,
    data: { skippedRows: run.skipped },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
  })
  await sendImportSummary({ req, run })
}
