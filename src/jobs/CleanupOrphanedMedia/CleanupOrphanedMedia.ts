import type { CollectionSlug, TaskConfig, Payload, PayloadRequest } from 'payload'

import type { ImageTag } from '@/types/tags'

import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
  type FieldReference,
} from './schemaUtils'

/** Maximum documents to fetch per page when scanning for references */
const PAGINATION_LIMIT = 1000

/**
 * Auto-generated orientation tags that should be ignored when determining orphan status.
 * These tags are added automatically via beforeChange hook on image upload.
 */
const ORIENTATION_TAG_TITLES = ['landscape', 'portrait', 'square']

/**
 * How long an item stays recoverable in the media trash before Phase A may
 * delete it for good.
 *
 * ⚠ Phase A had no age check at all, which is why this job sat off every
 * automatic queue (#878): a run could permanently delete an item an editor had
 * hand-trashed minutes earlier.
 *
 * ⚠ It must outlast the longest month, not match the cadence. Runs fall 28 to
 * 31 days apart, so at 30 days a run after any 31-day month found the previous
 * run's trash already past the cutoff and deleted it one run later — 7 runs in
 * 12. At 45, what one run trashes survives the next with two weeks to spare and
 * goes at the run after, 59 or more days on.
 */
const TRASH_RETENTION_DAYS = 45

/** The newest `deletedAt` Phase A may permanently delete. */
export function trashDeletionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS)
  return cutoff
}

/** Uploads younger than this are never judged orphans: they may not be linked yet. */
const GRACE_PERIOD_HOURS = 24

/**
 * How far back Phase B looks for orphans by `createdAt`.
 *
 * ⚠ Every run scans the whole span. It used to scan one of three one-month
 * bands — 0-1, 1-2 or 2-3 months old — picked by `month % 3`. The band and the
 * clock both advance a month per run, so they cancelled out: all three runs of a
 * quarter scanned the same calendar month (December, March, June, September),
 * and uploads from the other eight months were never scanned at all. The whole
 * span gives every upload the three checks the bands meant to, at 0-1, 1-2 and
 * 2-3 months old, and a missed run loses nothing because the next one overlaps
 * it.
 */
const SCAN_WINDOW_MONTHS = 3

/** The `createdAt` span Phase B scans when the caller gives none. */
export function orphanScanWindow(now: Date = new Date()): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = new Date(now)
  rangeStart.setMonth(rangeStart.getMonth() - SCAN_WINDOW_MONTHS)
  const rangeEnd = new Date(now)
  rangeEnd.setHours(rangeEnd.getHours() - GRACE_PERIOD_HOURS)
  return { rangeStart, rangeEnd }
}

type CleanupResult = {
  permanentlyDeletedFiles: number
  permanentlyDeletedImages: number
  trashedFiles: number
  trashedImages: number
  skippedImages: number
  errors: number
}

/**
 * Cleanup job for orphaned media files.
 *
 * Two-phase cleanup:
 * - Phase A: Permanently delete items trashed longer ago than
 *   TRASH_RETENTION_DAYS
 * - Phase B: Move newly detected orphans to trash (soft delete)
 *
 * `dryRun` counts both phases without writing anything. It is how a run is
 * reviewed against real data before the next scheduled one acts on it.
 *
 * Orphan detection:
 * - Files: Any file not referenced by any document in any collection
 * - Images: Any image not referenced by any document AND has no content tags
 *   (auto-generated orientation tags like 'landscape', 'portrait', 'square' are ignored)
 *
 * References are auto-discovered via schema introspection - no hardcoded collection
 * or field knowledge required. Adding new collections with file/image references
 * requires no changes to this job.
 */
export const CleanupOrphanedMedia: TaskConfig<'cleanupOrphanedMedia'> = {
  retries: 2,
  label: 'Cleanup Orphaned Media',
  slug: 'cleanupOrphanedMedia',
  inputSchema: [
    // The cleanup span, normally `orphanScanWindow()`. Both together override
    // it; either alone is ignored. Only the integration spec passes them — a
    // run with a hand-picked span is a run that skips the uploads outside it,
    // so there is no reason to offer one half of it in the admin.
    // `inputSchema` types the input and nothing validates it at runtime, which
    // is why the handler tests both before it trusts either.
    { name: 'rangeStart', type: 'date', required: false },
    { name: 'rangeEnd', type: 'date', required: false },
    {
      name: 'maxOperations',
      type: 'number',
      required: false,
    },
    { name: 'dryRun', type: 'checkbox', required: false },
  ],
  outputSchema: [
    {
      name: 'permanentlyDeletedFiles',
      type: 'number',
      required: true,
    },
    {
      name: 'permanentlyDeletedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'trashedFiles',
      type: 'number',
      required: true,
    },
    {
      name: 'trashedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'skippedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'errors',
      type: 'number',
      required: true,
    },
    // Without this a reader of a job row cannot tell whether the counts above
    // were performed or only counted.
    { name: 'dryRun', type: 'checkbox', required: true },
  ],
  schedule: [
    {
      cron: '0 0 1 * *', // 1st of month at 00:00 UTC
      queue: 'monthly',
    },
  ],
  handler: async ({ req, input }) => {
    const maxOperations = typeof input?.maxOperations === 'number' ? input.maxOperations : 500
    const dryRun = input?.dryRun === true
    const trashCutoff = trashDeletionCutoff()

    // A caller-supplied span overrides the default window. Both halves are
    // required together: one alone would silently pair a chosen bound with a
    // derived one, which is a third range nobody asked for.
    const explicitRange =
      input?.rangeStart && input?.rangeEnd
        ? { rangeStart: new Date(input.rangeStart), rangeEnd: new Date(input.rangeEnd) }
        : undefined
    const { rangeStart, rangeEnd } = explicitRange ?? orphanScanWindow()

    req.payload.logger.info({
      msg: 'Starting orphaned media cleanup',
      rangeLabel: explicitRange ? 'explicit-range' : `0-${SCAN_WINDOW_MONTHS}mo`,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      maxOperations,
      gracePeriodHours: GRACE_PERIOD_HOURS,
      trashCutoff: trashCutoff.toISOString(),
      dryRun,
    })

    const result: CleanupResult = {
      permanentlyDeletedFiles: 0,
      permanentlyDeletedImages: 0,
      trashedFiles: 0,
      trashedImages: 0,
      skippedImages: 0,
      errors: 0,
    }

    try {
      // Phase A: Permanently delete items trashed before the retention cutoff
      await permanentlyDeleteTrashedItems(req, result, maxOperations, trashCutoff, dryRun)

      // Phase B: Move newly detected orphans to trash
      const remainingOps = maxOperations - getTotalOperations(result)
      if (remainingOps > 0) {
        await trashOrphanedMedia(req, result, remainingOps, rangeStart, rangeEnd, dryRun)
      }

      req.payload.logger.info({
        msg: 'Orphaned media cleanup completed',
        ...result,
        totalOperations: getTotalOperations(result),
        dryRun,
      })

      return {
        output: { ...result, dryRun },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: 'Error during orphaned media cleanup',
        error: errorMessage,
        ...result,
        dryRun,
      })
      throw error
    }
  },
}

function getTotalOperations(result: CleanupResult): number {
  return (
    result.permanentlyDeletedFiles +
    result.permanentlyDeletedImages +
    result.trashedFiles +
    result.trashedImages
  )
}

/**
 * Generic helper for processing items (delete or trash) with consistent logging and error handling.
 *
 * @param config.req - Payload request object
 * @param config.collection - Target collection ('files' or 'images')
 * @param config.docs - Documents to process
 * @param config.operation - 'delete' for permanent deletion, 'trash' for soft delete
 * @param config.result - CleanupResult object to update counters
 * @param config.resultKey - Which counter to increment on success
 * @param config.maxItemsToProcess - Maximum number of items to process (for early exit optimization)
 * @param config.dryRun - Count and log the operation without performing it
 */
interface ProcessItemsConfig<
  T extends { id: number; filename?: string | null; createdAt?: string },
> {
  req: PayloadRequest
  collection: 'files' | 'images'
  docs: T[]
  operation: 'delete' | 'trash'
  result: CleanupResult
  resultKey: keyof CleanupResult
  maxItemsToProcess?: number
  dryRun?: boolean
}

async function processItems<T extends { id: number; filename?: string | null; createdAt?: string }>(
  config: ProcessItemsConfig<T>,
): Promise<void> {
  const { req, collection, docs, operation, result, resultKey, maxItemsToProcess, dryRun } = config
  const itemType = collection === 'files' ? 'file' : 'image'
  const idKey = collection === 'files' ? 'fileId' : 'imageId'

  let processedCount = 0

  for (const doc of docs) {
    // Early exit if we've reached the maximum number of items to process
    if (maxItemsToProcess !== undefined && processedCount >= maxItemsToProcess) {
      break
    }

    try {
      if (operation === 'delete') {
        if (!dryRun) {
          // Permanent deletion: trash: true required so delete() can find trashed documents
          await req.payload.delete({
            collection,
            id: doc.id,
            trash: true,
          })
        }
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: dryRun
            ? `Would permanently delete trashed ${itemType}`
            : `Permanently deleted trashed ${itemType}`,
          [idKey]: doc.id,
          filename: doc.filename,
          dryRun: dryRun === true,
        })
      } else {
        if (!dryRun) {
          // Soft delete: set deletedAt to move to trash
          await req.payload.update({
            collection,
            id: doc.id,
            data: {
              deletedAt: new Date().toISOString(),
            },
          })
        }
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: dryRun
            ? `Would move orphaned ${itemType} to trash`
            : `Moved orphaned ${itemType} to trash`,
          [idKey]: doc.id,
          filename: doc.filename,
          createdAt: doc.createdAt,
          dryRun: dryRun === true,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const actionMsg = operation === 'delete' ? 'permanently delete trashed' : 'trash orphaned'
      req.payload.logger.error({
        msg: `Failed to ${actionMsg} ${itemType}`,
        [idKey]: doc.id,
        error: errorMessage,
      })
      result.errors++
    }
  }
}

/**
 * Phase A: Permanently delete items trashed before the retention cutoff.
 *
 * ⚠ `exists: true` stays beside `less_than`. A null `deletedAt` compares false
 * either way in SQL, but losing the existence term would make the age the only
 * thing standing between a live document and a permanent delete.
 */
async function permanentlyDeleteTrashedItems(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
  trashCutoff: Date,
  dryRun: boolean,
): Promise<void> {
  req.payload.logger.info({
    msg: 'Phase A: Permanently deleting trashed items',
    trashCutoff: trashCutoff.toISOString(),
  })

  const expiredTrash = {
    and: [{ deletedAt: { exists: true } }, { deletedAt: { less_than: trashCutoff.toISOString() } }],
  }

  // Find trashed files for permanent deletion
  // Note: trash: true is required to include soft-deleted documents in query results
  const trashedFiles = await req.payload.find({
    collection: 'files',
    where: expiredTrash,
    limit: Math.floor(maxOperations / 2),
    depth: 0,
    trash: true,
  })

  await processItems({
    req,
    collection: 'files',
    docs: trashedFiles.docs,
    operation: 'delete',
    result,
    resultKey: 'permanentlyDeletedFiles',
    dryRun,
  })

  // Find trashed images for permanent deletion
  // Note: trash: true is required to include soft-deleted documents in query results
  const remainingOps = maxOperations - result.permanentlyDeletedFiles
  const trashedImages = await req.payload.find({
    collection: 'images',
    where: expiredTrash,
    limit: remainingOps,
    depth: 0,
    trash: true,
  })

  await processItems({
    req,
    collection: 'images',
    docs: trashedImages.docs,
    operation: 'delete',
    result,
    resultKey: 'permanentlyDeletedImages',
    dryRun,
  })

  req.payload.logger.info({
    msg: 'Phase A completed',
    permanentlyDeletedFiles: result.permanentlyDeletedFiles,
    permanentlyDeletedImages: result.permanentlyDeletedImages,
  })
}

/**
 * Phase B: Move newly detected orphans to trash (soft delete)
 *
 * Option (b): Pagination strategy — loops through the date window fetching
 * candidates until we collect enough orphans to reach maxItemsToProcess for each
 * collection. This ensures all orphans in the window are eventually cleaned up,
 * not just the first batch. The reference filter (which excludes referenced
 * files/images) means naively lowering the fetch limit would starve throughput
 * when referenced items are dense in the window; pagination solves this.
 */
async function trashOrphanedMedia(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
  rangeStart: Date,
  rangeEnd: Date,
  dryRun: boolean,
): Promise<void> {
  req.payload.logger.info({ msg: 'Phase B: Trashing orphaned media' })

  // Get all referenced file and image IDs using schema introspection
  const referencedFiles = await getAllReferencedIds(req.payload, 'files')
  const referencedImages = await getAllReferencedIds(req.payload, 'images')

  req.payload.logger.info({
    msg: 'Reference scan completed',
    referencedFileCount: referencedFiles.size,
    referencedImageCount: referencedImages.size,
  })

  // Paginate through files until we collect maxItemsToProcess orphans
  const maxFilesToProcess = Math.floor(maxOperations / 2)
  const orphanFiles: Array<{ id: number; filename?: string | null; createdAt?: string }> = []
  let filePageNum = 1
  let hasMoreFiles = true

  while (hasMoreFiles && orphanFiles.length < maxFilesToProcess) {
    const potentialOrphanFiles = await req.payload.find({
      collection: 'files',
      where: {
        and: [
          { createdAt: { greater_than_equal: rangeStart.toISOString() } },
          { createdAt: { less_than: rangeEnd.toISOString() } },
          { deletedAt: { exists: false } }, // Not already in trash
        ],
      },
      limit: PAGINATION_LIMIT,
      page: filePageNum,
      depth: 0,
    })

    // Filter out referenced files and add to orphan collection
    const batchOrphans = potentialOrphanFiles.docs.filter((file) => !referencedFiles.has(file.id))
    orphanFiles.push(...batchOrphans)

    hasMoreFiles = potentialOrphanFiles.hasNextPage
    filePageNum++
  }

  await processItems({
    req,
    collection: 'files',
    docs: orphanFiles,
    operation: 'trash',
    result,
    resultKey: 'trashedFiles',
    maxItemsToProcess: maxFilesToProcess,
    dryRun,
  })

  // Paginate through images until we collect remaining orphans
  const maxImagesToProcess = maxOperations - result.trashedFiles
  const orphanImages: Array<{
    id: number
    filename?: string | null
    createdAt?: string
    tags?: unknown
  }> = []
  let imagePageNum = 1
  let hasMoreImages = true

  while (hasMoreImages && orphanImages.length < maxImagesToProcess) {
    const potentialOrphanImages = await req.payload.find({
      collection: 'images',
      where: {
        and: [
          { createdAt: { greater_than_equal: rangeStart.toISOString() } },
          { createdAt: { less_than: rangeEnd.toISOString() } },
          { deletedAt: { exists: false } }, // Not already in trash
        ],
      },
      limit: PAGINATION_LIMIT,
      page: imagePageNum,
      depth: 1, // Include tag objects to check titles
    })

    // Filter unreferenced images without content tags
    const batchOrphans = potentialOrphanImages.docs.filter((image) => {
      // Skip if image is referenced
      if (referencedImages.has(image.id)) {
        return false
      }

      // Skip if image has content tags (ignore auto-generated orientation tags)
      // Image tags are now inline enum strings, not relationships
      const hasContentTags =
        Array.isArray(image.tags) &&
        (image.tags as ImageTag[]).some(
          (tag) => typeof tag === 'string' && !ORIENTATION_TAG_TITLES.includes(tag),
        )
      if (hasContentTags) {
        result.skippedImages++
        return false
      }

      return true
    })

    orphanImages.push(...batchOrphans)

    hasMoreImages = potentialOrphanImages.hasNextPage
    imagePageNum++
  }

  await processItems({
    req,
    collection: 'images',
    docs: orphanImages,
    operation: 'trash',
    result,
    resultKey: 'trashedImages',
    maxItemsToProcess: maxImagesToProcess,
    dryRun,
  })

  req.payload.logger.info({
    msg: 'Phase B completed',
    trashedFiles: result.trashedFiles,
    trashedImages: result.trashedImages,
    skippedImages: result.skippedImages,
  })
}

/**
 * Get all IDs of a target collection that are referenced by any document.
 * Uses schema introspection to automatically discover all references.
 */
async function getAllReferencedIds(
  payload: Payload,
  targetCollection: 'files' | 'images',
): Promise<Set<number>> {
  const referencedIds = new Set<number>()

  // Discover all field references to the target collection
  const references = discoverReferencesForCollection(payload, targetCollection)

  // Log discovered references for debugging
  payload.logger.info({
    msg: `Discovered ${references.length} field references to ${targetCollection}`,
    references: references.map((r) => ({
      collection: r.collection,
      fieldPath: r.fieldPath,
      isLexicalBlock: r.isLexicalBlock,
    })),
  })

  // Separate regular field references from Lexical (richText) references
  const regularReferences = references.filter((r) => !r.isLexicalBlock)
  const lexicalReferences = references.filter((r) => r.isLexicalBlock)

  // Group regular references by source collection for efficient scanning
  const byCollection = groupByCollection(regularReferences)

  // Scan regular field references
  for (const [collectionSlug, collectionRefs] of byCollection) {
    await scanCollectionForReferences(payload, collectionSlug, collectionRefs, referencedIds)
  }

  // Scan Lexical content for block references
  // Each lexical reference represents a richText field that may contain blocks
  const lexicalByCollection = groupByCollection(lexicalReferences)
  for (const [collectionSlug, collectionRefs] of lexicalByCollection) {
    for (const ref of collectionRefs) {
      await scanCollectionForLexicalReferences(
        payload,
        collectionSlug,
        ref.fieldPath,
        referencedIds,
      )
    }
  }

  return referencedIds
}

/** Scan a collection for references using discovered field paths. */
async function scanCollectionForReferences(
  payload: Payload,
  collectionSlug: string,
  references: FieldReference[],
  referencedIds: Set<number>,
): Promise<void> {
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await payload.find({
      collection: collectionSlug as CollectionSlug,
      limit: PAGINATION_LIMIT,
      page,
      depth: 0,
    })

    for (const doc of result.docs) {
      const docRecord = doc as unknown as Record<string, unknown>
      for (const ref of references) {
        const ids = extractIdsFromDocument(docRecord, ref)
        for (const id of ids) {
          referencedIds.add(id)
        }
      }
    }

    hasMore = result.hasNextPage
    page++
  }
}

/**
 * Scan a collection's Lexical content for block references.
 * Uses generic Lexical traversal to find all upload/relationship IDs.
 */
async function scanCollectionForLexicalReferences(
  payload: Payload,
  collectionSlug: string,
  richTextFieldPath: string,
  referencedIds: Set<number>,
): Promise<void> {
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await payload.find({
      collection: collectionSlug as CollectionSlug,
      limit: PAGINATION_LIMIT,
      page,
      depth: 0,
    })

    for (const doc of result.docs) {
      const docRecord = doc as unknown as Record<string, unknown>
      const content = docRecord[richTextFieldPath]
      if (content) {
        // Use generic Lexical traversal to extract all IDs
        const ids = extractIdsFromLexicalContent(content)
        for (const id of ids) {
          referencedIds.add(id)
        }
      }
    }

    hasMore = result.hasNextPage
    page++
  }
}
