/**
 * The plugin's `imports` collection (labelled Event Imports), shaped for a volunteer.
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
import { hideUntilCreated } from '@/fields/hideUntilCreated'
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

/** Counts that mean nothing here: an import only creates, and `importResults` lists the issues. */
const SUMMARY_FIELDS_HIDDEN: ReadonlySet<string> = new Set(['updated', 'issueDetails'])

const TEMPLATE_LINK = '@/components/admin/EventImport/TemplateLink'

const OUR_MAIN_FIELDS: Field[] = [
  {
    name: 'templateLink',
    type: 'ui',
    admin: { components: { Field: TEMPLATE_LINK } },
  },
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
    name: 'error',
    type: 'text',
    access: { update: () => false },
    admin: {
      readOnly: true,
      condition: (data) => Boolean(data?.error),
      description: 'Why the import stopped before it could finish.',
    },
  },
  jsonField({
    name: 'skippedRows',
    label: 'Result',
    schemaTitle: 'EventImportSkippedRows',
    schema: z.array(
      z.strictObject({
        row: z.int().describe('1-based data row, header excluded.'),
        reasons: z.array(z.string()),
        values: z.record(z.string(), z.string()).describe('The row as uploaded, to fix and upload again.'),
      }),
    ),
    access: { update: () => false },
    admin: {
      readOnly: true,
      condition: (data) => Boolean(data?.status) && data.status !== 'pending',
      components: { Field: '@/components/admin/EventImport/ImportResults' },
    },
  }),
]

const OUR_SIDEBAR_FIELDS: Field[] = [
  {
    name: 'defaultLanguages',
    type: 'select',
    hasMany: true,
    required: true,
    options: getLanguageOptions(),
    defaultValue: ({ req }) => [baseLanguageOrDefault(req.locale)],
    admin: {
      position: 'sidebar',
      description: 'Language(s) for rows whose own `languages` column is empty.',
    },
  },
  {
    // ⚠ Named `manager`: the volunteer's own read and delete come through it.
    name: 'manager',
    type: 'relationship',
    relationTo: 'managers',
    required: true,
    maxDepth: 1,
    label: 'Uploaded by',
    access: { update: () => false },
    // No `condition`: a conditional field generates as nullable, and the stamp
    // is what every import's access hangs on.
    admin: { position: 'sidebar', readOnly: true },
  },
  {
    // The admin locale at the upload, which the job writes the classes in.
    name: 'locale',
    type: 'text',
    admin: { hidden: true },
  },
]

/** The plugin's own fields, with its knobs hidden and its outcome moved to the sidebar. */
function pluginFields(fields: readonly Field[]): Field[] {
  return fields.flatMap((field): Field[] => {
    if (!('name' in field)) return [field]
    if (field.name === 'preview') return []
    if (PLUGIN_FIELDS_HIDDEN.has(field.name)) {
      return [{ ...field, admin: { ...field.admin, hidden: true } } as Field]
    }
    if (field.name === 'status') {
      return [{ ...field, admin: { ...field.admin, position: 'sidebar', condition: hideUntilCreated } } as Field]
    }
    if (field.name === 'summary' && field.type === 'group') {
      return [
        {
          ...field,
          admin: { ...field.admin, position: 'sidebar' },
          fields: field.fields.map((child) =>
            'name' in child && SUMMARY_FIELDS_HIDDEN.has(child.name)
              ? ({ ...child, admin: { ...child.admin, hidden: true } } as Field)
              : child,
          ),
        } as Field,
      ]
    }
    return [field]
  })
}

export const overrideImportCollection: NonNullable<
  ImportExportPluginConfig['overrideImportCollection']
> = ({ collection }) => ({
  ...collection,
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  access: { create: managersOnly, read: ownOrAdmin, update: () => false, delete: ownOrAdmin },
  upload: {
    ...(typeof collection.upload === 'object' ? collection.upload : {}),
    // One file is one import: a bulk upload would start one job per file with
    // no target region chosen for any of them.
    bulkUpload: false,
    // Beside every other upload collection's local files, which git ignores.
    staticDir: 'media/imports',
    // Excel on Windows labels a saved CSV `application/vnd.ms-excel`, and some
    // editors send `text/plain`; the `beforeOperation` hook renames both.
    mimeTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  admin: {
    ...collection.admin,
    group: 'Classes',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'targetRegion', 'manager', 'status', 'updatedAt'],
    // Listed for every manager: `access.read` scopes the list to their own
    // imports, and the import page is where the skipped rows are read.
    custom: {
      ...collection.admin?.custom,
      jobStage: {
        runningStages: ['pending'],
        staleAfterMs: IMPORT_STALL_MS,
      } satisfies JobStageConfig,
    },
    components: {
      ...collection.admin?.components,
      Description: TEMPLATE_LINK,
      views: { edit: { default: { Component: '@/components/admin/JobStageView/JobStageView' } } },
    },
  },
  fields: [...OUR_MAIN_FIELDS, ...pluginFields(collection.fields), ...OUR_SIDEBAR_FIELDS],
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
