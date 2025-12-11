import type { TaskConfig, Where, Payload, PayloadRequest } from 'payload'

import type { Author, Lecture, Lesson, Meditation, Page } from '@/payload-types'

/** Maximum documents to fetch per page when scanning for references */
const PAGINATION_LIMIT = 1000

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
 * - Images: Any image not referenced by any document AND has no tags (empty tags array)
 *
 * Collections that reference Files:
 * - lessons.introAudio
 * - lessons.panels[].video (VideoStoryBlock)
 *
 * Collections that reference Images:
 * - authors.image
 * - lectures.thumbnail
 * - lessons.icon
 * - lessons.panels[].image (TextStoryBlock)
 * - meditations.thumbnail
 * - pages.content (Lexical blocks: TextBoxBlock.image, LayoutBlock.items[].image, GalleryBlock.items)
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
  const trashedFiles = await req.payload.find({
    collection: 'files',
    where: {
      deletedAt: { exists: true },
    },
    limit: Math.floor(maxOperations / 2),
    depth: 0,
  })

  for (const file of trashedFiles.docs) {
    try {
      // Deleting an already-trashed item permanently removes it
      await req.payload.delete({
        collection: 'files',
        id: file.id,
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
  const remainingOps = maxOperations - result.permanentlyDeletedFiles
  const trashedImages = await req.payload.find({
    collection: 'images',
    where: {
      deletedAt: { exists: true },
    },
    limit: remainingOps,
    depth: 0,
  })

  for (const image of trashedImages.docs) {
    try {
      // Deleting an already-trashed item permanently removes it
      await req.payload.delete({
        collection: 'images',
        id: image.id,
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

  // Get all referenced file and image IDs
  const referencedFiles = await getAllReferencedFileIds(req.payload)
  const referencedImages = await getAllReferencedImageIds(req.payload)

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
        // Soft delete moves to trash (sets deletedAt)
        await req.payload.delete({
          collection: 'files',
          id: file.id,
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

  // Find orphaned images (older than grace period, not already in trash, not referenced, no tags)
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
    depth: 0,
  })

  for (const image of potentialOrphanImages.docs) {
    if (result.trashedImages >= remainingOps) break

    // Skip if image is referenced
    if (referencedImages.has(image.id)) {
      continue
    }

    // Skip if image has tags (tagged images are preserved even if unreferenced)
    const hasTags = Array.isArray(image.tags) && image.tags.length > 0
    if (hasTags) {
      result.skippedImages++
      continue
    }

    try {
      // Soft delete moves to trash (sets deletedAt)
      await req.payload.delete({
        collection: 'images',
        id: image.id,
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
 * Get all file IDs that are referenced by any document
 */
async function getAllReferencedFileIds(payload: Payload): Promise<Set<number>> {
  const referencedIds = new Set<number>()

  // Lessons: introAudio field and panels[].video
  await collectReferencedIds<Lesson>(payload, 'lessons', {}, (lesson) => {
    if (lesson.introAudio) {
      const id = extractId(lesson.introAudio)
      if (id) referencedIds.add(id)
    }

    // Check panels for video blocks
    if (Array.isArray(lesson.panels)) {
      for (const panel of lesson.panels) {
        if (panel.blockType === 'video' && panel.video) {
          const id = extractId(panel.video)
          if (id) referencedIds.add(id)
        }
      }
    }
  })

  return referencedIds
}

/**
 * Get all image IDs that are referenced by any document
 */
async function getAllReferencedImageIds(payload: Payload): Promise<Set<number>> {
  const referencedIds = new Set<number>()

  // Authors: image field
  await collectReferencedIds<Author>(payload, 'authors', { image: { exists: true } }, (doc) => {
    if (doc.image) {
      const id = extractId(doc.image)
      if (id) referencedIds.add(id)
    }
  })

  // Lectures: thumbnail field
  await collectReferencedIds<Lecture>(
    payload,
    'lectures',
    { thumbnail: { exists: true } },
    (doc) => {
      if (doc.thumbnail) {
        const id = extractId(doc.thumbnail)
        if (id) referencedIds.add(id)
      }
    },
  )

  // Meditations: thumbnail field
  await collectReferencedIds<Meditation>(
    payload,
    'meditations',
    { thumbnail: { exists: true } },
    (doc) => {
      if (doc.thumbnail) {
        const id = extractId(doc.thumbnail)
        if (id) referencedIds.add(id)
      }
    },
  )

  // Lessons: icon field and panels[].image
  await collectReferencedIds<Lesson>(payload, 'lessons', {}, (lesson) => {
    if (lesson.icon) {
      const id = extractId(lesson.icon)
      if (id) referencedIds.add(id)
    }

    // Check panels for text blocks with images
    if (Array.isArray(lesson.panels)) {
      for (const panel of lesson.panels) {
        if (panel.blockType === 'text' && panel.image) {
          const id = extractId(panel.image)
          if (id) referencedIds.add(id)
        }
      }
    }
  })

  // Pages: content blocks (TextBoxBlock, LayoutBlock, GalleryBlock)
  await collectReferencedIds<Page>(payload, 'pages', {}, (page) => {
    extractImageIdsFromLexicalContent(page.content, referencedIds)
  })

  return referencedIds
}

/**
 * Helper to collect referenced IDs from a collection with pagination
 */
async function collectReferencedIds<T>(
  payload: Payload,
  collection: 'authors' | 'lectures' | 'meditations' | 'lessons' | 'pages' | 'files' | 'images',
  where: Where,
  processDoc: (doc: T) => void,
): Promise<void> {
  let page = 1
  let hasMore = true

  while (hasMore) {
    const result = await payload.find({
      collection,
      where,
      limit: PAGINATION_LIMIT,
      page,
      depth: 0,
    })

    for (const doc of result.docs) {
      processDoc(doc as T)
    }

    hasMore = result.hasNextPage
    page++
  }
}

/**
 * Extract image IDs from Lexical rich text content
 */
function extractImageIdsFromLexicalContent(
  content: Page['content'],
  referencedIds: Set<number>,
): void {
  if (!content || typeof content !== 'object') return

  const contentObj = content as Record<string, unknown>

  // Check if this is a block with image references
  if (contentObj.type === 'block') {
    const fields = contentObj.fields as Record<string, unknown> | undefined
    const blockType = contentObj.blockType as string | undefined

    if (fields) {
      // TextBoxBlock: image field
      if (fields.image) {
        const id = extractId(fields.image)
        if (id) referencedIds.add(id)
      }

      // LayoutBlock: items[].image
      if (Array.isArray(fields.items) && blockType === 'layout') {
        for (const item of fields.items) {
          if (typeof item === 'object' && item !== null) {
            const itemFields = item as Record<string, unknown>
            if (itemFields.image) {
              const id = extractId(itemFields.image)
              if (id) referencedIds.add(id)
            }
          }
        }
      }

      // GalleryBlock: items (array of image IDs)
      if (Array.isArray(fields.items) && blockType === 'gallery') {
        for (const item of fields.items) {
          const id = extractId(item)
          if (id) referencedIds.add(id)
        }
      }
    }
  }

  // Recursively process children
  if (contentObj.root && typeof contentObj.root === 'object') {
    extractImageIdsFromLexicalContent(contentObj.root as Page['content'], referencedIds)
  }

  if (Array.isArray(contentObj.children)) {
    for (const child of contentObj.children) {
      extractImageIdsFromLexicalContent(child as Page['content'], referencedIds)
    }
  }
}

/**
 * Extract numeric ID from a relationship field value
 * (can be number, string, or populated object)
 */
function extractId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? null : parsed
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (typeof obj.id === 'number') return obj.id
    if (typeof obj.id === 'string') {
      const parsed = parseInt(obj.id, 10)
      return isNaN(parsed) ? null : parsed
    }
  }
  return null
}
