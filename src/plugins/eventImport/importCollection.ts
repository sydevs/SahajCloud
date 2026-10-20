/**
 * The plugin's `imports` collection (labelled Event Imports), shaped for a volunteer.
 *
 * The plugin owns the file, the `status` field, the job that
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

import { ValidationError } from 'payload'
import { z } from 'zod'

import type { JobStageConfig } from '@/components/admin/JobStageView/stages'
import { hideUntilCreated } from '@/fields/hideUntilCreated'
import { jsonField } from '@/fields/jsonField'
import { requireManagerPermission } from '@/lib/endpoints'
import { runQueueSoon } from '@/lib/jobs/runQueueSoon'
import { baseLanguageOrDefault, getLanguageOptions } from '@/lib/locales'
import type { Manager } from '@/payload-types'
import { isAdminManager } from '@/plugins/access'

import { IMPORT_STALL_MS } from './constants'
import { prepareUpload } from './csv/upload'
import { targetRegionFilterOptions, validateTargetRegion } from './targetRegion'

const ownOrAdmin: Access = ({ req }) => {
  if (isAdminManager(req.user as Manager | null)) return true
  if (req.user?.collection !== 'managers') return false
  return { manager: { equals: req.user.id } }
}

/** An active manager who may create classes: what the import does on their behalf. */
const classCreators: Access = ({ req }) =>
  requireManagerPermission({ req, collection: 'events', operation: 'create', forbidden: '' }) === null

/**
 * Set by `finish.ts` on the one write that ends an import. The plugin writes
 * `status` too, when its own loop ends — before our results are stored — so
 * without this the page would open on a finished import with no rows.
 */
export const IMPORT_FINISH = 'eventImportFinish'

/**
 * Where an import stands for the volunteer, replacing the plugin's own
 * vocabulary (which records how its run went, and never moves afterwards).
 * `finish.ts` sets the first settled status; `refreshImportStatus` moves an
 * import between `review` and `completed` as its classes are published or
 * deleted, wherever that happens.
 */
const STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Review', value: 'review' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
]

/** What each import status means for the volunteer, under the Status field. */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending:
    'The file is being read and its classes created as drafts. This page opens once it is done.',
  review:
    'Some classes from this import are still drafts. Nothing is public until published: publish the ones that are right and clean up the rest.',
  completed:
    'Nothing is left to review: every class from this import is published or deleted. Skipped rows say why below, and can be downloaded, fixed and uploaded again.',
  failed:
    'The import stopped, or created no classes. The result or the error says why — fix the file and upload it again.',
}

/** The plugin's knobs, kept but out of the way: only `events` is ever imported into. */
const PLUGIN_FIELDS_HIDDEN: ReadonlySet<string> = new Set(['collectionSlug', 'importMode', 'matchField'])

const TEMPLATE_LINK = '@/components/admin/EventImport/TemplateLink'

const OUR_MAIN_FIELDS: Field[] = [
  {
    // Not `required`: the column must accept NULL so a region can still be
    // deleted while an import names it. `validateTargetRegion` requires it on
    // create, which is the only write that sets it.
    name: 'targetRegion',
    type: 'relationship',
    relationTo: 'regions',
    maxDepth: 1,
    filterOptions: targetRegionFilterOptions,
    validate: validateTargetRegion,
    admin: {
      position: 'sidebar',
      allowCreate: false,
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
    name: 'results',
    label: 'Result',
    schemaTitle: 'EventImportResults',
    schema: z.array(
      z.strictObject({
        row: z.int().describe("The row's line in the volunteer's spreadsheet, header included."),
        outcome: z.enum(['created', 'duplicate', 'error']),
        eventId: z.int().optional().describe('The class the row created.'),
        title: z.string(),
        city: z.string(),
        reasons: z.array(z.string()).optional().describe('Why a skipped row was skipped.'),
        warnings: z
          .array(z.string())
          .optional()
          .describe('Things the import noticed about a created row that did not stop it.'),
        duplicateOf: z
          .strictObject({
            eventId: z.int().optional(),
            title: z.string().optional(),
            row: z.int().optional(),
          })
          .optional()
          .describe('What a duplicate row repeats: a class already listed, or an earlier row.'),
        values: z
          .record(z.string(), z.string())
          .optional()
          .describe('A skipped row as uploaded, to fix and upload again.'),
        missingCity: z
          .strictObject({ name: z.string() })
          .optional()
          .describe('The town a row was skipped for having no city region.'),
      }),
    ),
    access: { update: () => false },
    admin: {
      readOnly: true,
      condition: (data) => Boolean(data?.status) && data.status !== 'pending',
      // A server component: each created row's live status is a read of the
      // class itself, which may have been published or cleaned up since.
      components: { Field: '@/components/admin/EventImport/ImportResultsField' },
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
    // Hidden on the create form, where the stamp has not happened yet. The
    // condition makes the column nullable; `access.create` admitting managers
    // only is what guarantees the stamp.
    admin: { position: 'sidebar', readOnly: true, condition: hideUntilCreated },
  },
  {
    // The admin locale at the upload, which the job writes the classes in.
    name: 'locale',
    type: 'text',
    admin: { hidden: true },
  },
]

/**
 * The plugin's own fields, with its knobs hidden and its status moved to the
 * sidebar. Its `summary` counts are dropped: `results` says the same per row,
 * and the plugin's own write of them is discarded as an unknown field.
 */
function pluginFields(fields: readonly Field[]): Field[] {
  return fields.flatMap((field): Field[] => {
    if (!('name' in field)) return [field]
    if (field.name === 'preview') return []
    if (PLUGIN_FIELDS_HIDDEN.has(field.name)) {
      return [{ ...field, admin: { ...field.admin, hidden: true } } as Field]
    }
    if (field.name === 'status') {
      return [
        {
          ...field,
          options: STATUS_OPTIONS,
          admin: {
            ...field.admin,
            position: 'sidebar',
            condition: hideUntilCreated,
            custom: { ...field.admin?.custom, descriptions: STATUS_DESCRIPTIONS },
            components: { ...field.admin?.components, Description: '@/components/admin/SelectDescription' },
          },
        } as Field,
      ]
    }
    if (field.name === 'summary') return []
    return [field]
  })
}

export const overrideImportCollection: NonNullable<
  ImportExportPluginConfig['overrideImportCollection']
> = ({ collection }) => ({
  ...collection,
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  // The plugin's one custom route is the CSV preview this form does not show.
  endpoints: [],
  access: { create: classCreators, read: ownOrAdmin, update: () => false, delete: ownOrAdmin },
  upload: {
    ...(typeof collection.upload === 'object' ? collection.upload : {}),
    // One file is one import: a bulk upload would start one job per file with
    // no target region chosen for any of them.
    bulkUpload: false,
    // The file comes from the volunteer's computer; fetching one from a URL
    // would be a server-side request to wherever they point it.
    pasteURL: false,
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
      ({ args, operation, req }) => {
        // Before Payload's own MIME check, which runs between here and
        // `beforeChange`: the stored file is the cleaned CSV, and the plugin
        // reads `text/csv` as "parse as CSV" (`csv/upload.ts`).
        if (operation !== 'create' || !req.file) return args
        const prepared = prepareUpload(req.file.name, req.file.data)
        if (!prepared.ok) {
          throw new ValidationError({ errors: [{ path: 'file', message: prepared.error }] })
        }
        const data = Buffer.from(prepared.csv, 'utf8')
        req.file = { ...req.file, data, size: data.length, mimetype: 'text/csv' }
        return args
      },
    ],
    beforeChange: [
      ...(collection.hooks?.beforeChange ?? []),
      ({ data, operation, originalDoc, req }) => {
        if (operation === 'create') {
          return req.user?.collection === 'managers'
            ? { ...data, manager: req.user.id, locale: req.locale ?? null }
            : data
        }
        if (originalDoc?.status === 'pending' && !req.context?.[IMPORT_FINISH]) {
          return { ...data, status: 'pending' }
        }
        return data
      },
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
    upload: {
      ...(typeof collection.upload === 'object' ? collection.upload : {}),
      staticDir: 'media/exports',
    },
  }
}
