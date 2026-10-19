/**
 * Bulk class import: `@payloadcms/plugin-import-export` on `events`, with the
 * rows turned into draft classes by our `before` hook.
 *
 * A volunteer uploads a CSV from the Events list, the plugin's job reads it and
 * creates one draft class per row as that volunteer, and the Events list
 * filtered to the import is where they review and publish. What this file adds
 * on top of the plugin is one wrapper around its task: the plugin's hooks
 * receive the rows and `req` and nothing else, so the wrapper loads the import
 * document first and carries it on `req.context` (`run.ts`).
 */

import type { ImportRun } from './run'
import type { Plugin, TaskConfig } from 'payload'

import { importExportPlugin } from '@payloadcms/plugin-import-export'

import { relationId } from '@/lib/utilities/relationId'
import type { Import } from '@/payload-types'

import { IMPORT_BATCH_SIZE, MAX_IMPORT_ROWS } from './constants'
import { afterImport } from './hooks/afterImport'
import { beforeImport } from './hooks/beforeImport'
import { overrideExportCollection, overrideImportCollection } from './importCollection'
import { loadTarget } from './regions'
import { RUN_CONTEXT_KEY } from './run'

const IMPORT_TASK = 'createCollectionImport'

export const eventImportPlugin: Plugin = async (config) => {
  const withPlugin = await importExportPlugin({
    collections: [
      {
        slug: 'events',
        export: false,
        import: {
          batchSize: IMPORT_BATCH_SIZE,
          limit: MAX_IMPORT_ROWS,
          defaultVersionStatus: 'draft',
          hooks: { before: beforeImport, after: afterImport },
        },
      },
    ],
    overrideImportCollection,
    overrideExportCollection,
  })(config)

  const task = withPlugin.jobs?.tasks?.find((entry) => entry.slug === IMPORT_TASK) as
    | TaskConfig<typeof IMPORT_TASK>
    | undefined
  if (!task || typeof task.handler !== 'function') {
    throw new Error(`plugin-import-export registered no inline ${IMPORT_TASK} task to wrap`)
  }
  const handler = task.handler
  task.handler = async (args) => {
    const importId = Number(args.input.importId)
    const batch = (await args.req.payload.findByID({
      collection: 'imports',
      id: importId,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    })) as Import
    const targetId = relationId(batch.targetRegion)
    const target = targetId === null ? null : await loadTarget(args.req, targetId)
    if (!target) throw new Error(`Import ${importId} names no target region that still exists.`)

    const run: ImportRun = {
      importId,
      target,
      managerId: relationId(batch.manager),
      defaultLanguages: (batch.defaultLanguages ?? []) as string[],
      skipped: [],
      imported: 0,
    }
    args.req.context = { ...args.req.context, [RUN_CONTEXT_KEY]: run }
    if (batch.locale) args.req.locale = batch.locale as typeof args.req.locale
    return handler(args)
  }

  return withPlugin
}
