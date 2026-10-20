/**
 * Payload's own field validation, run on a built class before the plugin
 * creates it.
 *
 * ⚠ **Needed because the import creates drafts, and a draft save skips
 * validation** (`payload/dist/collections/operations/create.js`). Without this
 * a bad value surfaced only at the publish, long after the spreadsheet was put
 * away. Running the real pass means every Events rule — a `maxLength`, a URL
 * or email rule, a select's options, the inactive-contact rule — is enforced
 * here the day it lands, with Payload's own wording.
 *
 * ⚠ **`beforeChangeTraverseFields` is exported by `payload` but undocumented.**
 * `tests/int/event-imports.int.spec.ts` pins what this relies on: a refused
 * value comes back as a column-named reason. Field `beforeChange` hooks run as
 * part of the pass, on a copy, so nothing they write reaches the class.
 */

import type { JsonObject, PayloadRequest, ValidationFieldError } from 'payload'

import { beforeChangeTraverseFields } from 'payload'

import { IMPORT_COLUMNS } from './csv/columns'

/** The CSV column a field path is reported under, by its longest matching prefix. */
const COLUMN_OF = new Map(
  IMPORT_COLUMNS.flatMap(({ field, name }) => (field ? [[field, name]] : [])),
)

function columnOf(path: string): string {
  if (path === 'schedule.firstDate') return 'date/startTime'
  for (let prefix = path; prefix; prefix = prefix.slice(0, Math.max(prefix.lastIndexOf('.'), 0))) {
    const column = COLUMN_OF.get(prefix)
    if (column) return column
  }
  return path
}

/** Why Payload would refuse this class, one sentence per field, or none. */
export async function fieldErrors(req: PayloadRequest, data: JsonObject): Promise<string[]> {
  const collection = req.payload.collections.events.config
  const copy = structuredClone(data)
  const errors: ValidationFieldError[] = []
  await beforeChangeTraverseFields({
    collection,
    context: {},
    data: copy,
    doc: {},
    docWithLocales: {},
    errors,
    fieldLabelPath: '',
    fields: collection.fields,
    global: null,
    mergeLocaleActions: [],
    operation: 'create',
    overrideAccess: true,
    parentIndexPath: '',
    parentIsLocalized: false,
    parentPath: '',
    parentSchemaPath: '',
    req,
    siblingData: copy,
    siblingDoc: {},
    siblingDocWithLocales: {},
    skipValidation: false,
  })
  return reasonsOf(errors)
}

/** Payload's field errors, each under the CSV column that held the value. */
export function reasonsOf(
  errors: readonly Pick<ValidationFieldError, 'message' | 'path'>[],
): string[] {
  return errors.map(({ message, path }) => `${columnOf(path)}: ${message}`)
}
