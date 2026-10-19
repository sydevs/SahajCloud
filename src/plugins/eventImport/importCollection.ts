/**
 * The plugin's `imports` collection, shaped for a volunteer.
 *
 * The plugin owns the file, the `status` and `summary` fields, the job that
 * reads the CSV and the per-row `events` creates. This override adds what a
 * class import needs on top — the target region, the uploader, the languages a
 * blank cell falls back to, and the rows that were skipped — and hides the
 * plugin's own knobs, since only one collection is ever imported into.
 *
 * ⚠ **Access is explicit here, not a role grant.** The access plugin spreads a
 * collection's own `access` over its generated one, and a role-wide `read`
 * would show every volunteer every other region's CSV, contact details and all.
 * `update` is closed to everyone: nothing on an import is edited after the
 * save, and the jobs write with `overrideAccess`.
 */

import type { ImportExportPluginConfig } from '@payloadcms/plugin-import-export/types'
import type { Access, CollectionConfig, Field } from 'payload'

import { z } from 'zod'

import type { JobStageConfig } from '@/components/admin/JobStageView/stages'
import { jsonField } from '@/fields/jsonField'
import { runQueueSoon } from '@/lib/jobs/runQueueSoon'
import { baseLanguageOrDefault, getLanguageOptions } from '@/lib/locales'
import type { Manager } from '@/payload-types'
import { isAdminManager } from '@/plugins/access'

import { IMPORT_STALL_MS } from './constants'
import { targetRegionFilterOptions, validateTargetRegion } from './targetRegion'

const ownOrAdmin: Access = ({ req }) => {
  if (isAdminManager(req.user as Manager | null)) return true
  if (req.user?.collection !== 'managers') return false
  return { manager: { equals: req.user.id } }
}

const managersOnly: Access = ({ req }) => req.user?.collection === 'managers'

/** The plugin's knobs, kept but out of the way: only `events` is ever imported into. */
const PLUGIN_FIELDS_HIDDEN: ReadonlySet<string> = new Set(['collectionSlug', 'importMode', 'matchField'])

const OUR_FIELDS: Field[] = [
  {
    name: 'targetRegion',
    type: 'relationship',
    relationTo: 'regions',
    required: true,
    maxDepth: 1,
    filterOptions: targetRegionFilterOptions,
    validate: validateTargetRegion,
    admin: {
      description:
        'Classes are filed under the cities of this region. A town with no city region yet is skipped — create the city first.',
    },
  },
  {
    // ⚠ Named `manager`: the volunteer's own read and delete come through it.
    name: 'manager',
    type: 'relationship',
    relationTo: 'managers',
    required: true,
    maxDepth: 1,
    admin: { readOnly: true, hidden: true },
  },
  {
    name: 'defaultLanguages',
    type: 'select',
    hasMany: true,
    required: true,
    options: getLanguageOptions(),
    defaultValue: ({ req }) => [baseLanguageOrDefault(req.locale)],
    admin: { description: 'Language(s) for rows whose own `languages` column is empty.' },
  },
  {
    // The admin locale at the upload, which the job writes the classes in.
    name: 'locale',
    type: 'text',
    admin: { hidden: true },
  },
  jsonField({
    name: 'skippedRows',
    label: 'Skipped rows',
    schemaTitle: 'EventImportSkippedRows',
    schema: z.array(
      z.strictObject({
        row: z.int().describe('1-based data row, header excluded.'),
        reasons: z.array(z.string()),
        values: z.record(z.string(), z.string()).describe('The row as uploaded, to fix and upload again.'),
      }),
    ),
    admin: {
      readOnly: true,
      condition: (data) => data?.status && data.status !== 'pending',
      components: { Field: '@/components/admin/EventImport/SkippedRowsDownload' },
    },
  }),
]

export const overrideImportCollection: NonNullable<
  ImportExportPluginConfig['overrideImportCollection']
> = ({ collection }) => ({
  ...collection,
  labels: { singular: 'Class Import', plural: 'Class Imports' },
  access: { create: managersOnly, read: ownOrAdmin, update: () => false, delete: ownOrAdmin },
  upload: {
    ...(typeof collection.upload === 'object' ? collection.upload : {}),
    // Excel on Windows labels a saved CSV `application/vnd.ms-excel`, and some
    // editors send `text/plain`; `csvMimeType` below renames both for the plugin.
    mimeTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  admin: {
    ...collection.admin,
    group: 'Classes',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'targetRegion', 'manager', 'status', 'updatedAt'],
    // Listed for every manager: `access.read` scopes the list to their own
    // imports, and the import page is where the skipped rows are downloaded.
    description:
      'Upload a CSV built from the template at /event-import-template.csv. Each row becomes a draft class to review and publish from the Events list.',
    custom: {
      ...collection.admin?.custom,
      jobStage: {
        runningStages: ['pending'],
        staleAfterMs: IMPORT_STALL_MS,
      } satisfies JobStageConfig,
    },
    components: {
      ...collection.admin?.components,
      views: { edit: { default: { Component: '@/components/admin/JobStageView/JobStageView' } } },
    },
  },
  fields: [
    ...OUR_FIELDS,
    ...collection.fields.flatMap((field): Field[] => {
      if (!('name' in field)) return [field]
      if (field.name === 'preview') return []
      if (!PLUGIN_FIELDS_HIDDEN.has(field.name)) return [field]
      return [{ ...field, admin: { ...field.admin, hidden: true } } as Field]
    }),
  ],
  hooks: {
    ...collection.hooks,
    beforeOperation: [
      ...(collection.hooks?.beforeOperation ?? []),
      ({ args, req }) => {
        // Decided before Payload's own MIME check, which runs between here and
        // `beforeChange`; the plugin reads `text/csv` as "parse as CSV".
        if (req.file && req.file.mimetype !== 'text/csv' && /\.csv$/i.test(req.file.name)) {
          req.file.mimetype = 'text/csv'
        }
        return args
      },
    ],
    beforeChange: [
      ...(collection.hooks?.beforeChange ?? []),
      ({ data, operation, req }) =>
        operation === 'create' && req.user?.collection === 'managers'
          ? { ...data, manager: req.user.id, locale: req.locale ?? null }
          : data,
    ],
    afterChange: [
      ...(collection.hooks?.afterChange ?? []),
      // The plugin queues its job on `default` with no kick of its own; the
      // cron on that queue is the safety net, this is what makes it prompt.
      ({ doc, operation, req }) => {
        if (operation === 'create') {
          runQueueSoon({
            payload: req.payload,
            queue: 'default',
            label: 'imports',
            context: { importId: doc.id },
            afterCommit: true,
          })
        }
        return doc
      },
    ],
  },
})

/** The plugin's `exports` collection, which nothing here uses: admins only, out of the nav. */
export const overrideExportCollection: NonNullable<
  ImportExportPluginConfig['overrideExportCollection']
> = ({ collection }): CollectionConfig => {
  const admins: Access = ({ req }) => isAdminManager(req.user as Manager | null)
  return {
    ...collection,
    access: { create: admins, read: admins, update: admins, delete: admins },
    admin: { ...collection.admin, hidden: true },
  }
}
