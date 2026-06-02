import type { CollectionBeforeOperationHook } from 'payload'

import { generateR2Key } from './filenameUtils'
import { getMimeCategory } from './mimeUtils'

export const R2_PREASSIGNED_FILENAME_CONTEXT_KEY = '_r2PreassignedFilename'

type R2FilenameMode = 'always' | 'other-only'

const shouldPreassignFilename = (mode: R2FilenameMode, mimeType: string | undefined): boolean =>
  mode === 'always' || getMimeCategory(mimeType) === 'other'

/**
 * Assign the final R2 object key before Payload generates upload metadata.
 *
 * Payload writes `filename` to the document before the cloud-storage adapter's
 * `afterChange` upload runs. Preassigning here keeps the DB row and R2 object
 * key aligned even if the plugin's follow-up metadata update is skipped/fails.
 */
export const createR2FilenameBeforeOperationHook = (
  mode: R2FilenameMode,
): CollectionBeforeOperationHook => {
  return ({ args, operation }) => {
    if (operation !== 'create' && operation !== 'update') return args

    // Idempotency guard: if this request has already been preassigned (e.g., a
    // prior nested op in the same request), don't re-slugify and drift away
    // from the filename already written to the in-flight upload.
    if (args.req?.context?.[R2_PREASSIGNED_FILENAME_CONTEXT_KEY]) return args

    const file = args.req?.file
    if (!file?.name || !shouldPreassignFilename(mode, file.mimetype)) {
      return args
    }

    file.name = generateR2Key(file.name)
    args.req.context = args.req.context ?? {}
    args.req.context[R2_PREASSIGNED_FILENAME_CONTEXT_KEY] = true

    return args
  }
}
