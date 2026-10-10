/**
 * Parses the uploaded CSV into `rows`, and refuses a file no volunteer can use.
 *
 * ⚠ **There is no "uploaded" stage.** A saved file is resolved at once, so the
 * manager's first screen after the create is the progress bar. The resolve job
 * is queued off `status: 'resolving'`, which this hook sets.
 *
 * ⚠ **A re-upload is how a corrected file gets in.** The form keeps the upload
 * field editable while the batch is in review or failed, and a new file resets
 * everything the old one produced — `transitionStatus` is what refuses a
 * re-upload at any other stage.
 *
 * ⚠ **Both caps live here, because this is where the file is in hand.** The
 * byte cap bounds what the parser is handed; `parseImportCsv`'s own record
 * bounds are what keep a file of empty lines cheap, and `MAX_IMPORT_ROWS` is
 * what bounds the geocoder spend.
 */

import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { parseImportCsv } from '../csv/parse'

/**
 * `MAX_IMPORT_ROWS` rows with every column filled is about 150 KB, so this
 * leaves three times the headroom a real file needs.
 */
const MAX_CSV_BYTES = 500_000

export const parseUpload: CollectionBeforeChangeHook = ({ data, req }) => {
  const file = req.file
  if (!file) return data

  if (file.size > MAX_CSV_BYTES) {
    throw new ValidationError({
      errors: [
        {
          path: 'file',
          message: `The file is larger than ${MAX_CSV_BYTES.toLocaleString('en')} bytes — split it into smaller files.`,
        },
      ],
    })
  }

  const parsed = parseImportCsv(file.data.toString('utf8'))
  if (!parsed.ok) {
    throw new ValidationError({ errors: [{ path: 'file', message: parsed.error }] })
  }

  const unusable = parsed.rows.filter((row) => row.errors?.length)
  if (unusable.length === parsed.rows.length) {
    // Every row is broken, which is a wrong file rather than a few wrong rows —
    // and a batch with nothing to resolve has no review to reach.
    throw new ValidationError({
      errors: [{ path: 'file', message: firstLinesMessage(unusable) }],
    })
  }

  return {
    ...data,
    rows: parsed.rows,
    proposedRegions: null,
    report: null,
    progress: null,
    error: null,
    status: 'resolving',
  }
}

/** The first few bad lines, named, so a volunteer can open the file and look. */
const NAMED_LINES = 5

function firstLinesMessage(rows: readonly { line: number; errors?: string[] }[]): string {
  const named = rows
    .slice(0, NAMED_LINES)
    .map((row) => `line ${row.line}: ${row.errors?.join('; ')}`)
  const rest = rows.length - named.length
  const more = rest > 0 ? ` …and ${rest} more.` : ''
  return `Every row in the file has a problem. ${named.join(' · ')}${more}`
}
