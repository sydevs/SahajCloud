import type { CollectionConfig } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { getLanguageOptions } from '@/lib/locales'

import { batchCreateAccess, batchUploaderAccess } from './access'

/**
 * Staging for one bulk event import, from upload to commit.
 *
 * A batch is working state, not a record: it exists so the resolve step can hand
 * a volunteer a tree and a row table to review before anything is written, and
 * it is **hard-deleted the moment the commit succeeds**. What survives is on the
 * events themselves — each one's `activityLog` names the manager who imported
 * it — so a provenance question is answered from the event rather than from a
 * row somebody has to keep.
 *
 * Reached only through the Import tab on a region. It is hidden from the nav for
 * that reason, and no project lists it, so it is named in
 * `RESTRICTED_COLLECTIONS` (`src/plugins/access/config/projects.ts`) — "no
 * project" otherwise reads as *shared*, and every published API key, the Atlas
 * widget's browser key included, would read every uploaded CSV.
 *
 * ⚠ **Several batches may be open on one region at once, deliberately.** There
 * is no lock: two volunteers uploading the same region's classes is a
 * duplicate-detection problem, and the commit re-runs the duplicate and slug
 * checks rather than trusting what the review step saw.
 */
export const EventImports: CollectionConfig = {
  slug: 'event-imports',
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  trash: true,
  access: {
    create: batchCreateAccess,
    read: batchUploaderAccess,
    update: batchUploaderAccess,
    delete: batchUploaderAccess,
  },
  admin: {
    group: 'Classes',
    useAsTitle: 'id',
    defaultColumns: ['id', 'targetRegion', 'uploader', 'status', 'createdAt'],
    hidden: true,
  },
  fields: [
    {
      name: 'targetRegion',
      type: 'relationship',
      relationTo: 'regions',
      required: true,
      maxDepth: 1,
    },
    {
      name: 'uploader',
      type: 'relationship',
      relationTo: 'managers',
      required: true,
      maxDepth: 1,
      // Every non-admin read of this collection is a `Where` on this column
      // (`access.ts`), so the listing is an index scan rather than a table scan.
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'uploaded',
      options: [
        { label: 'Uploaded', value: 'uploaded' },
        { label: 'Resolved', value: 'resolved' },
        { label: 'Committing', value: 'committing' },
      ],
      admin: {
        description:
          'Written by the import endpoints. `committing` means a commit was interrupted part-way; its rows carry the ids of whatever was already created.',
      },
    },
    {
      name: 'defaultLanguages',
      type: 'select',
      hasMany: true,
      required: true,
      // The same option set as `Events.languages`, since that is where these
      // values end up for every row whose own `languages` column is blank.
      options: getLanguageOptions(),
      // ⚠ **An admin locale is not a language.** `pt-BR` and `en-AU` are two of
      // the nineteen, and `Events.languages` takes ISO 639-1, which has
      // neither — so the base subtag is what this picker accepts.
      defaultValue: ({ req }) => [(req.locale ?? 'en').split('-')[0]],
      admin: {
        description: 'Language(s) to use for rows whose own `languages` column is empty.',
      },
    },
    jsonField({
      name: 'rows',
      schemaTitle: 'EventImportRows',
      // One row per CSV data row, in file order, carrying `parseImportCsv`'s
      // output (`csv/parse.ts`) verbatim. The resolve and commit steps widen
      // this shape as each lands — a geocode result, a duplicate match, the
      // proposed region a row was assigned, the event it became — for the same
      // reason `constants.ts` holds only the threshold phase one reads: a key
      // declared ahead of its writer generates a type a consumer can read as
      // available, and an Ajv rule nothing exercises.
      schema: z.array(
        z.strictObject({
          line: z
            .int()
            .describe(
              "The row's line in the uploaded file, 1-based and counting the header, so an error names the line the volunteer's spreadsheet shows.",
            ),
          values: z
            .record(z.string(), z.string())
            .describe('The row as the CSV held it, keyed by column name and trimmed.'),
          errors: z
            .array(z.string())
            .optional()
            .describe('Structural problems. A row with any of these is skipped, never committed.'),
        }),
      ),
      admin: { readOnly: true },
    }),
  ],
}
