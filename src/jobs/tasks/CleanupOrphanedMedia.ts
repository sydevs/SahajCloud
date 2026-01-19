import type { CollectionSlug, TaskConfig, Payload, PayloadRequest } from 'payload'

import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
  type FieldReference,
} from '@/lib/schemaUtils'
import type { ImageTag } from '@/payload-types'

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
export const CleanupOrphanedMedia: TaskConfig<'cleanupOrphanedMedia'> = {
  retries: 2,
  label: 'Cleanup Orphaned Media',
  slug: 'cleanupOrphanedMedia',
  inputSchema: [],
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
  handler: async ({ req }) => {
    const maxOperations = 500
    const gracePeriodHours = 24

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - gracePeriodHours)

    req.payload.logger.info({
      msg: 'Starting orphaned media cleanup',
      cutoffTime: cutoffTime.toISOString(),
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
        await trashOrphanedMedia(req, result, remainingOps, cutoffTime)
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
 * Phase A: Permanently delete items that are already in trash (have deletedAt set)
 */
async function permanentlyDeleteTrashedItems(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
): Promise<void> {
  req.payload.logger.info({ msg: 'Phase A: Permanently deleting trashed items' })

  // Find and permanently delete trashed files
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

  for (const file of trashedFiles.docs) {
    try {
      // Permanently delete trashed item
      // Note: trash: true required so delete() can find the trashed document
      await req.payload.delete({
        collection: 'files',
        id: file.id,
        trash: true,
      })
      result.permanentlyDeletedFiles++
      req.payload.logger.info({
        msg: `Permanently deleted trashed file`,
        fileId: file.id,
        filename: file.filename,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: `Failed to permanently delete trashed file`,
        fileId: file.id,
        error: errorMessage,
      })
      result.errors++
    }
  }

  // Find and permanently delete trashed images
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

  for (const image of trashedImages.docs) {
    try {
      // Permanently delete trashed item
      // Note: trash: true required so delete() can find the trashed document
      await req.payload.delete({
        collection: 'images',
        id: image.id,
        trash: true,
      })
      result.permanentlyDeletedImages++
      req.payload.logger.info({
        msg: `Permanently deleted trashed image`,
        imageId: image.id,
        filename: image.filename,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: `Failed to permanently delete trashed image`,
        imageId: image.id,
        error: errorMessage,
      })
      result.errors++
    }
  }

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
  cutoffTime: Date,
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

  // Find orphaned files (older than grace period, not already in trash, not referenced)
  const potentialOrphanFiles = await req.payload.find({
    collection: 'files',
    where: {
      and: [
        { createdAt: { less_than: cutoffTime.toISOString() } },
        { deletedAt: { exists: false } }, // Not already in trash
      ],
    },
    limit: maxOperations,
    depth: 0,
  })

  for (const file of potentialOrphanFiles.docs) {
    if (result.trashedFiles >= maxOperations / 2) break

    if (!referencedFiles.has(file.id)) {
      try {
        // Soft delete: set deletedAt to move to trash
        // Note: payload.delete() hard-deletes; use update() for soft delete
        await req.payload.update({
          collection: 'files',
          id: file.id,
          data: {
            deletedAt: new Date().toISOString(),
          },
        })
        result.trashedFiles++
        req.payload.logger.info({
          msg: `Moved orphaned file to trash`,
          fileId: file.id,
          filename: file.filename,
          createdAt: file.createdAt,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        req.payload.logger.error({
          msg: `Failed to trash orphaned file`,
          fileId: file.id,
          error: errorMessage,
        })
        result.errors++
      }
    }
  }

  // Find orphaned images (older than grace period, not already in trash, not referenced, no content tags)
  const remainingOps = maxOperations - result.trashedFiles
  const potentialOrphanImages = await req.payload.find({
    collection: 'images',
    where: {
      and: [
        { createdAt: { less_than: cutoffTime.toISOString() } },
        { deletedAt: { exists: false } }, // Not already in trash
      ],
    },
    limit: remainingOps * 2, // Get more to account for filtering
    depth: 1, // Include tag objects to check titles
  })

  for (const image of potentialOrphanImages.docs) {
    if (result.trashedImages >= remainingOps) break

    // Skip if image is referenced
    if (referencedImages.has(image.id)) {
      continue
    }

    // Skip if image has content tags (ignore auto-generated orientation tags)
    // Orientation tags (landscape, portrait, square) are auto-generated and don't count as "intentional" tags
    const hasContentTags =
      Array.isArray(image.tags) &&
      image.tags.some((tag) => {
        const tagTitle = typeof tag === 'object' && tag !== null ? (tag as ImageTag).title : null
        return tagTitle && !ORIENTATION_TAG_TITLES.includes(tagTitle)
      })
    if (hasContentTags) {
      result.skippedImages++
      continue
    }

    try {
      // Soft delete: set deletedAt to move to trash
      // Note: payload.delete() hard-deletes; use update() for soft delete
      await req.payload.update({
        collection: 'images',
        id: image.id,
        data: {
          deletedAt: new Date().toISOString(),
        },
      })
      result.trashedImages++
      req.payload.logger.info({
        msg: `Moved orphaned image to trash`,
        imageId: image.id,
        filename: image.filename,
        createdAt: image.createdAt,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: `Failed to trash orphaned image`,
        imageId: image.id,
        error: errorMessage,
      })
      result.errors++
    }
  }

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
