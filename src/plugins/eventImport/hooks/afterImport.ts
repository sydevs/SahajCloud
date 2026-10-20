/**
 * After each batch: fold the plugin's own failures into the run's skipped
 * rows, keyed back to the file's values so the volunteer can download, fix and
 * upload them again. `finish.ts` stores the list once the plugin is done.
 */

import type { ImportAfterHook } from '@payloadcms/plugin-import-export/types'

import { IMPORT_BATCH_SIZE } from '../constants'
import { lineOf, normaliseRow } from '../rows'
import { runOf } from '../run'

/** Payload's envelope around a field refusal, which names fields and not reasons. */
const FIELDS_INVALID = /^The following fields? (?:is|are) invalid: /

/** Payload's access refusal, which says nothing about why. */
const FORBIDDEN = /^You are not allowed to perform this action\.?$/

function reasonOf(error: string): string {
  if (FORBIDDEN.test(error)) {
    return "you are not allowed to add classes in this row's city — ask an admin, or remove the row"
  }
  return error.replace(FIELDS_INVALID, 'invalid: ')
}

export const afterImport: ImportAfterHook = async ({
  batchNumber,
  originalData,
  req,
  result,
}) => {
  const run = runOf(req)
  run.imported += result.imported

  const offset = (batchNumber - 1) * IMPORT_BATCH_SIZE
  for (const failure of result.errors) {
    const raw = originalData[failure.index - offset]
    run.skipped.push({
      row: raw ? lineOf(raw) : failure.index + 2,
      reasons: [reasonOf(failure.error)],
      values: raw ? normaliseRow(raw) : {},
    })
  }
}
