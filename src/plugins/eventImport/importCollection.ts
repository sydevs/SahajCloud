/**
 * `imports` (labelled Event Imports): one uploaded CSV of classes, the job that
 * turns its rows into draft classes (`task.ts`), and the result of that run.
 *
 * ⚠ **The CSV is parsed at the upload and never stored.** `prepareUpload`
 * refuses a file no import can use, and the rows it reads go into the hidden
 * `rows` field, which the job reads and then clears. No storage adapter holds
 * the file (`disableLocalStorage`, and none in `storagePlugin`), so the contact
 * details in it exist nowhere but the import's own rows and results.
 *
 * ⚠ **Access is explicit here, not a role grant.** The access plugin spreads a
 * collection's own `access` over its generated one, and a role-wide `read`
 * would show every volunteer every other region's contact details. A manager
 * reads and deletes the imports whose target lies in the region subtree they
 * may write classes in — the same subtree the picker offers. `update` is closed
 * to everyone: nothing on an import is edited after the save, and the job
 * writes with `overrideAccess`.
 */

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
import { isAdminManager, resolveOwnedRegionIds } from '@/plugins/access'

import { IMPORT_STALL_MS } from './constants'
import { prepareUpload } from './csv/upload'
import { importsRetention } from './retention'
import { targetRegionFilterOptions, validateTargetRegion } from './targetRegion'
import { IMPORT_TASK } from './task'

/** Imports into a region the manager may write classes in. Without a target, admins only. */
const inEditableRegion: Access = async ({ req }) => {
  const user = req.user as Manager | null
  if (isAdminManager(user)) return true
  if (req.user?.collection !== 'managers' || user?.type !== 'manager') return false
  const regions = await resolveOwnedRegionIds(req, user.id)
  return regions.length ? { targetRegion: { in: regions } } : false
}

/** An active manager who may create classes: what the import does on their behalf. */
const classCreators: Access = ({ req }) =>
  requireManagerPermission({ req, collection: 'events', operation: 'create', forbidden: '' }) ===
  null

/**
 * Where an import stands for the volunteer. The job sets the first settled
 * status; `refreshImportStatus` moves an import between `review` and
 * `completed` as its classes are published or deleted, wherever that happens.
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

const MAIN_FIELDS: Field[] = [
  {
    // Not `required`: the column must accept NULL so a region can still be
    // deleted while an import names it. `validateTargetRegion` requires it on
    // create, the only write that sets it.
    name: 'targetRegion',
    type: 'relationship',
    relationTo: 'regions',
    maxDepth: 1,
    filterOptions: targetRegionFilterOptions,
    validate: validateTargetRegion,
    // A region's "Import classes" link opens the create form as
    // `?targetRegion=<id>`; the validator still refuses one the uploader may not use.
    defaultValue: ({ req }) => {
      const id = Number(req.query?.targetRegion)
      return Number.isInteger(id) && id > 0 ? id : undefined
    },
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
  jsonField({
    // The parsed CSV, from the upload to the end of the run. Never shown:
    // `results` carries what the volunteer needs, and the job clears this.
    name: 'rows',
    schemaTitle: 'EventImportRows',
    schema: z
      .array(
        z.strictObject({
          line: z.int().describe("The row's line in the volunteer's spreadsheet."),
          values: z.record(z.string(), z.string()),
        }),
      )
      .nullable(),
    access: { read: () => false, update: () => false },
    admin: { hidden: true },
  }),
]

const SIDEBAR_FIELDS: Field[] = [
  {
    name: 'status',
    type: 'select',
    options: STATUS_OPTIONS,
    defaultValue: 'pending',
    required: true,
    access: { update: () => false },
    admin: {
      position: 'sidebar',
      readOnly: true,
      condition: hideUntilCreated,
      custom: { descriptions: STATUS_DESCRIPTIONS },
      components: { Description: '@/components/admin/SelectDescription' },
    },
  },
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

export const importCollection: CollectionConfig = {
  slug: 'imports',
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  access: {
    create: classCreators,
    read: inEditableRegion,
    update: () => false,
    delete: inEditableRegion,
  },
  // Retention is declared beside the window's own reason, and read by
  // `cleanupCollections` off the built config.
  custom: { retention: importsRetention },
  disableDuplicate: true,
  lockDocuments: false,
  upload: {
    // Parsed at the upload and never kept (see the top of this file).
    disableLocalStorage: true,
    filesRequiredOnCreate: true,
    hideRemoveFile: true,
    // One file is one import: a bulk upload would start one job per file with
    // no target region chosen for any of them.
    bulkUpload: false,
    // The file comes from the volunteer's computer; fetching one from a URL
    // would be a server-side request to wherever they point it.
    pasteURL: false,
    // Excel on Windows labels a saved CSV `application/vnd.ms-excel`, and some
    // editors send `text/plain`; the `beforeOperation` hook renames both.
    mimeTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  admin: {
    group: 'Classes',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'targetRegion', 'manager', 'status', 'updatedAt'],
    disableCopyToLocale: true,
    custom: {
      jobStage: {
        runningStages: ['pending'],
        staleAfterMs: IMPORT_STALL_MS,
      } satisfies JobStageConfig,
    },
    components: {
      Description: '@/components/admin/EventImport/TemplateLink',
      views: { edit: { default: { Component: '@/components/admin/JobStageView/JobStageView' } } },
    },
  },
  fields: [...MAIN_FIELDS, ...SIDEBAR_FIELDS],
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        // Before Payload's own MIME check, which runs between here and
        // `beforeChange`, so a refused file names its own problem.
        if (operation !== 'create' || !req.file) return args
        const prepared = prepareUpload(req.file.name, req.file.data)
        if (!prepared.ok) {
          throw new ValidationError({ errors: [{ path: 'file', message: prepared.error }] })
        }
        req.file = { ...req.file, mimetype: 'text/csv' }
        return { ...args, data: { ...args.data, rows: prepared.rows } }
      },
    ],
    beforeChange: [
      ({ data, operation, req }) =>
        operation === 'create' && req.user?.collection === 'managers'
          ? { ...data, manager: req.user.id, locale: req.locale ?? null, status: 'pending' }
          : data,
    ],
    // No file is stored, so there is no URL to offer: without this the edit
    // view fetches the CSV for its preview and gets a 500.
    afterRead: [({ doc }) => ({ ...doc, url: null, thumbnailURL: null })],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc
        await req.payload.jobs.queue({
          task: IMPORT_TASK,
          input: { importId: doc.id },
          queue: 'default',
          req,
        })
        // The `default` queue's cron is the safety net; this is what makes it prompt.
        runQueueSoon({
          payload: req.payload,
          queue: 'default',
          label: 'imports',
          context: { importId: doc.id },
          afterCommit: true,
        })
        return doc
      },
    ],
  },
}
