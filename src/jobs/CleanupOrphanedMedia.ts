import type { CollectionSlug, TaskConfig, Payload, PayloadRequest } from 'payload'

import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
  type FieldReference,
} from '@/lib/schemaUtils'
import type { ImageTag } from '@/types/tags'

/** Maximum documents to fetch per page when scanning for references */
const PAGINATION_LIMIT = 1000

/**
 * Auto-generated orientation tags that should be ignored when determining orphan status.
 * These tags are added automatically via beforeChange hook on image upload.
 */
const ORIENTATION_TAG_TITLES = ['landscape', 'portrait', 'square']

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
 * - Phase A: Permanently delete items already in trash (deletedAt exists)
 * - Phase B: Move newly detected orphans to trash (soft delete)
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
/** Type for test-injected date range */
type TestDateRangeInput = {
  rangeStart: string
  rangeEnd: string
}

export const CleanupOrphanedMedia: TaskConfig<'cleanupOrphanedMedia'> = {
  retries: 2,
  label: 'Cleanup Orphaned Media',
  slug: 'cleanupOrphanedMedia',
  inputSchema: [
    {
      name: 'testDateRange',
      type: 'json',
      required: false,
    },
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
  ],
  schedule: [
    {
      cron: '0 0 1 * *', // First day of every month at midnight
      queue: 'monthly',
    },
  ],
  handler: async ({ req, input }) => {
    const maxOperations = 500
    const gracePeriodHours = 24

    let rangeStart: Date
    let rangeEnd: Date
    let rangeLabel: string

    // Check for test-injected date range
    if (input?.testDateRange) {
      const testRange = input.testDateRange as TestDateRangeInput
      rangeStart = new Date(testRange.rangeStart)
      rangeEnd = new Date(testRange.rangeEnd)
      rangeLabel = 'test-range'
    } else {
      // Determine date range based on current month (rotates through 3 ranges)
      const currentMonth = new Date().getMonth() // 0-11
      const rangeIndex = currentMonth % 3 // 0, 1, or 2
      const rangeEndMonthsAgo = rangeIndex
      const rangeStartMonthsAgo = rangeIndex + 1

      // Calculate range end (with grace period)
      rangeEnd = new Date()
      rangeEnd.setMonth(rangeEnd.getMonth() - rangeEndMonthsAgo)
      rangeEnd.setHours(rangeEnd.getHours() - gracePeriodHours)

      // Calculate range start
      rangeStart = new Date()
      rangeStart.setMonth(rangeStart.getMonth() - rangeStartMonthsAgo)

      // Human-readable labels for logging
      const rangeLabels = ['0-1mo', '1-2mo', '2-3mo']
      rangeLabel = rangeLabels[rangeIndex]
    }

    req.payload.logger.info({
      msg: 'Starting orphaned media cleanup',
      rangeLabel,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      maxOperations,
      gracePeriodHours,
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
      // Phase A: Permanently delete items already in trash
      await permanentlyDeleteTrashedItems(req, result, maxOperations)

      // Phase B: Move newly detected orphans to trash
      const remainingOps = maxOperations - getTotalOperations(result)
      if (remainingOps > 0) {
        await trashOrphanedMedia(req, result, remainingOps, rangeStart, rangeEnd)
      }

      req.payload.logger.info({
        msg: 'Orphaned media cleanup completed',
        ...result,
        totalOperations: getTotalOperations(result),
      })

      return {
        output: result,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: 'Error during orphaned media cleanup',
        error: errorMessage,
        ...result,
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
 */
interface ProcessItemsConfig<T extends { id: number; filename?: string | null; createdAt?: string }> {
  req: PayloadRequest
  collection: 'files' | 'images'
  docs: T[]
  operation: 'delete' | 'trash'
  result: CleanupResult
  resultKey: keyof CleanupResult
  maxItemsToProcess?: number
}

async function processItems<T extends { id: number; filename?: string | null; createdAt?: string }>(
  config: ProcessItemsConfig<T>,
): Promise<void> {
  const { req, collection, docs, operation, result, resultKey, maxItemsToProcess } = config
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
        // Permanent deletion: trash: true required so delete() can find trashed documents
        await req.payload.delete({
          collection,
          id: doc.id,
          trash: true,
        })
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: `Permanently deleted trashed ${itemType}`,
          [idKey]: doc.id,
          filename: doc.filename,
        })
      } else {
        // Soft delete: set deletedAt to move to trash
        await req.payload.update({
          collection,
          id: doc.id,
          data: {
            deletedAt: new Date().toISOString(),
          },
        })
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: `Moved orphaned ${itemType} to trash`,
          [idKey]: doc.id,
          filename: doc.filename,
          createdAt: doc.createdAt,
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
 * Phase A: Permanently delete items that are already in trash (have deletedAt set)
 */
async function permanentlyDeleteTrashedItems(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
): Promise<void> {
  req.payload.logger.info({ msg: 'Phase A: Permanently deleting trashed items' })

  // Find trashed files for permanent deletion
  // Note: trash: true is required to include soft-deleted documents in query results
  const trashedFiles = await req.payload.find({
    collection: 'files',
    where: {
      deletedAt: { exists: true },
    },
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
  })

  // Find trashed images for permanent deletion
  // Note: trash: true is required to include soft-deleted documents in query results
  const remainingOps = maxOperations - result.permanentlyDeletedFiles
  const trashedImages = await req.payload.find({
    collection: 'images',
    where: {
      deletedAt: { exists: true },
    },
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
  })

  req.payload.logger.info({
    msg: 'Phase A completed',
    permanentlyDeletedFiles: result.permanentlyDeletedFiles,
    permanentlyDeletedImages: result.permanentlyDeletedImages,
  })
}

/**
 * Phase B: Move newly detected orphans to trash (soft delete)
 */
async function trashOrphanedMedia(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
  rangeStart: Date,
  rangeEnd: Date,
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

  // Find orphaned files (in date range, not already in trash, not referenced)
  const potentialOrphanFiles = await req.payload.find({
    collection: 'files',
    where: {
      and: [
        { createdAt: { greater_than_equal: rangeStart.toISOString() } },
        { createdAt: { less_than: rangeEnd.toISOString() } },
        { deletedAt: { exists: false } }, // Not already in trash
      ],
    },
    limit: maxOperations,
    depth: 0,
  })

  // Filter unreferenced files and process with early exit
  const orphanFiles = potentialOrphanFiles.docs.filter((file) => !referencedFiles.has(file.id))

  await processItems({
    req,
    collection: 'files',
    docs: orphanFiles,
    operation: 'trash',
    result,
    resultKey: 'trashedFiles',
    maxItemsToProcess: Math.floor(maxOperations / 2),
  })

  // Find orphaned images (in date range, not already in trash, not referenced, no content tags)
  const remainingOps = maxOperations - result.trashedFiles
  const potentialOrphanImages = await req.payload.find({
    collection: 'images',
    where: {
      and: [
        { createdAt: { greater_than_equal: rangeStart.toISOString() } },
        { createdAt: { less_than: rangeEnd.toISOString() } },
        { deletedAt: { exists: false } }, // Not already in trash
      ],
    },
    limit: remainingOps * 2, // Get more to account for filtering
    depth: 1, // Include tag objects to check titles
  })

  // Filter unreferenced images without content tags, tracking skipped count
  // Orientation tags (landscape, portrait, square) are auto-generated and don't count as "intentional" tags
  // Note: We filter inline and track skipped images, but processItems() handles the early exit
  const orphanImages = potentialOrphanImages.docs.filter((image) => {
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

  await processItems({
    req,
    collection: 'images',
    docs: orphanImages,
    operation: 'trash',
    result,
    resultKey: 'trashedImages',
    maxItemsToProcess: remainingOps,
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
    await scanCollectionForReferences(
      payload,
      collectionSlug,
      collectionRefs,
      referencedIds,
    )
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

/**
 * Scan a collection for references using discovered field paths.
 */
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
