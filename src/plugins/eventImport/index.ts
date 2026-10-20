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
import type { PayloadRequest, Plugin, TaskConfig } from 'payload'

import { importExportPlugin } from '@payloadcms/plugin-import-export'

import { runQueueSoon } from '@/lib/jobs/runQueueSoon'
import { relationId } from '@/lib/utilities/relationId'
import type { Import } from '@/payload-types'

import { IMPORT_BATCH_SIZE, MAX_IMPORT_ROWS } from './constants'
import { failImport, finishImport, refreshImportStatus } from './finish'
import { afterImport } from './hooks/afterImport'
import { beforeImport } from './hooks/beforeImport'
import { overrideExportCollection, overrideImportCollection } from './importCollection'
import { cityIndex, loadTarget } from './regions'
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
    TaskConfig<typeof IMPORT_TASK> | undefined
  if (!task || typeof task.handler !== 'function') {
    throw new Error(`plugin-import-export registered no inline ${IMPORT_TASK} task to wrap`)
  }
  // ⚠ One import at a time. Payload hands every job in a run the same `req`,
  // and the run below lives on its `context`, so two imports running together
  // would write into each other's rows.
  task.concurrency = { key: () => IMPORT_TASK, exclusive: true }
  const handler = task.handler
  task.handler = async (args) => {
    const importId = Number(args.input.importId)
    let run: ImportRun | undefined
    try {
      run = await startRun(args.req, importId)
      args.req.context = { ...args.req.context, [RUN_CONTEXT_KEY]: run }
      const result = await handler(args)
      await finishImport(args.req, run)
      return result
    } catch (error) {
      await failImport(args.req, importId, error, run)
      throw error
    } finally {
      // Payload hands every job in a run the same `req`, so a run left here
      // would make a later job's Events write skip its status refresh below.
      if (args.req.context) delete args.req.context[RUN_CONTEXT_KEY]
      // An import queued while this one ran was passed over; start it once
      // this job's row is released, rather than at the next five-minute sweep.
      runQueueSoon({
        payload: args.req.payload,
        queue: 'default',
        label: 'imports-next',
        afterCommit: true,
      })
    }
  }

  // An import's status follows its classes wherever they are published or
  // deleted — the result table, a drawer, the Events list, a job.
  const events = withPlugin.collections?.find((collection) => collection.slug === 'events')
  if (!events) throw new Error('eventImportPlugin needs the events collection')
  events.hooks = {
    ...events.hooks,
    afterChange: [...(events.hooks?.afterChange ?? []), refreshFromEvent],
    afterDelete: [...(events.hooks?.afterDelete ?? []), refreshFromEvent],
  }

  return withPlugin
}

/**
 * Refresh the status of the import a changed class came from. Skipped inside
 * the import job itself, where every create would ask while the import is
 * still pending; never throws, since the class's own write has succeeded.
 */
const refreshFromEvent = async ({
  doc,
  previousDoc,
  req,
}: {
  doc: { importBatch?: unknown }
  previousDoc?: { importBatch?: unknown }
  req: PayloadRequest
}) => {
  if (req.context?.[RUN_CONTEXT_KEY]) return doc
  const ids = new Set([relationId(doc?.importBatch), relationId(previousDoc?.importBatch)])
  for (const id of ids) {
    if (id === null) continue
    try {
      await refreshImportStatus(req, id)
    } catch (error) {
      req.payload.logger.error({ err: error, import: id }, 'Import status could not be refreshed')
    }
  }
  return doc
}

/** The import document, reduced to what the hooks need, with the target it names. */
async function startRun(req: PayloadRequest, importId: number): Promise<ImportRun> {
  const batch = (await req.payload.findByID({
    collection: 'imports',
    id: importId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as Import
  const targetId = relationId(batch.targetRegion)
  const target = targetId === null ? null : await loadTarget(req, targetId)
  if (!target) throw new Error('The target region no longer exists. Start a new import.')
  if (batch.locale) req.locale = batch.locale as typeof req.locale
  return {
    importId,
    target,
    managerId: relationId(batch.manager),
    defaultLanguages: (batch.defaultLanguages ?? []) as string[],
    submitted: [],
    skipped: [],
    imported: 0,
    cities: await cityIndex(req, target.id),
    claimed: new Map(),
  }
}
