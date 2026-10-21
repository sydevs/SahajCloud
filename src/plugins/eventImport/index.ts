/**
 * Bulk class import (#907): the `imports` collection, the job that turns an
 * upload's rows into draft classes, and the Events hooks that keep an import's
 * status in step with its classes.
 *
 * A volunteer uploads a CSV from the Events list or a region's Events tab; the
 * job (`task.ts`) creates one draft class per row as that volunteer, and the
 * import page lists every row, where the drafts are published or cleaned up.
 */

import type { CollectionConfig, PayloadRequest, Plugin } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { refreshImportStatus } from './finish'
import { importCollection } from './importCollection'
import { RUN_CONTEXT_KEY } from './run'
import { importEventsTask } from './task'

export const eventImportPlugin: Plugin = (config) => ({
  ...config,
  collections: [...(config.collections ?? []).map(withImportHooks), importCollection],
  jobs: { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), importEventsTask] },
})

/** Events: an "Import classes" list menu item, and the status refresh on every write. */
function withImportHooks(collection: CollectionConfig): CollectionConfig {
  if (collection.slug !== 'events') return collection
  const components = collection.admin?.components
  return {
    ...collection,
    admin: {
      ...collection.admin,
      components: {
        ...components,
        listMenuItems: [
          ...(components?.listMenuItems ?? []),
          '@/components/admin/EventImport/ImportListMenuItem',
        ],
      },
    },
    hooks: {
      ...collection.hooks,
      afterChange: [...(collection.hooks?.afterChange ?? []), refreshFromEvent],
      afterDelete: [...(collection.hooks?.afterDelete ?? []), refreshFromEvent],
    },
  }
}

/**
 * Move an import between review and completed as its classes are published or
 * deleted, wherever that happens. The job's own creates are skipped: the run
 * writes the outcome itself, once.
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
