import type { CollectionConfig } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { baseLanguage, getLanguageOptions } from '@/lib/locales'
import { adminOnlyFieldAccess } from '@/plugins/access'

import { batchUploaderAccess } from './access'

/**
 * Staging for one bulk event import, from upload to commit.
 *
 * A batch is working state, not a record: it is **hard-deleted the moment the
 * commit succeeds**. What survives is on the events themselves — each one's
 * `activityLog` names the manager who imported it — so a provenance question is
 * answered from the event rather than from a row somebody has to keep.
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
  // `create` and `delete` are left to the generated config on purpose — it
  // already answers both with "admins only" (`access.ts`).
  access: {
    read: batchUploaderAccess,
    update: batchUploaderAccess,
  },
  admin: {
    group: 'Classes',
    defaultColumns: ['id', 'targetRegion', 'uploader', 'status', 'createdAt'],
    hidden: true,
  },
  fields: [
    // ⚠ **Neither may be re-pointed after the create.** The endpoints' subtree
    // check and `batchUploaderAccess` are computed from them, so a PATCH onto
    // another region or manager would move the batch rather than edit it.
    // `overrideAccess: true` skips field access, so the endpoints still set them.
    {
      name: 'targetRegion',
      type: 'relationship',
      relationTo: 'regions',
      required: true,
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
    },
    {
      name: 'uploader',
      type: 'relationship',
      relationTo: 'managers',
      required: true,
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
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
      defaultValue: ({ req }) => [baseLanguage(req.locale)],
      admin: {
        description: 'Language(s) to use for rows whose own `languages` column is empty.',
      },
    },
    jsonField({
      name: 'rows',
      schemaTitle: 'EventImportRows',
      // One row per CSV data row, in file order, carrying `parseImportCsv`'s
      // output (`csv/parse.ts`) verbatim. The resolve and commit steps widen
      // this shape as each lands; a key declared ahead of its writer generates a
      // type a consumer can read as available, and an Ajv rule nothing
      // exercises.
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
