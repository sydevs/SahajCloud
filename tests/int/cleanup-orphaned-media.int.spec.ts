import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Page } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// ============================================================================
// TYPES
// ============================================================================

interface CleanupResult {
  permanentlyDeletedFiles: number
  permanentlyDeletedImages: number
  trashedFiles: number
  trashedImages: number
  skippedImages: number
  errors: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Backdate createdAt to bypass grace period (24 hours)
 */
async function backdateCreatedAt(
  payload: Payload,
  collection: 'files' | 'images',
  id: number,
  hoursAgo: number = 48,
): Promise<void> {
  const pastDate = new Date()
  pastDate.setHours(pastDate.getHours() - hoursAgo)

  await payload.update({
    collection,
    id,
    data: {
      createdAt: pastDate.toISOString(),
    },
  })
}

/**
 * Run cleanup job by invoking handler directly
 */
async function runCleanupJob(payload: Payload): Promise<CleanupResult> {
  const { CleanupOrphanedMedia } = await import('@/jobs/tasks/CleanupOrphanedMedia')

  const mockReq = {
    payload,
  } as PayloadRequest

  // The handler type can be a string (for queued jobs) or function (inline)
  // Our job uses inline handler, so we can safely call it
  const handler = CleanupOrphanedMedia.handler as (args: {
    req: PayloadRequest
    input: Record<string, unknown>
  }) => Promise<{ output: CleanupResult }>
  const result = await handler({ req: mockReq, input: {} })
  return result.output
}

/**
 * Check if file exists in database (not trashed)
 */
async function fileExists(payload: Payload, id: number): Promise<boolean> {
  const result = await payload.find({
    collection: 'files',
    where: { id: { equals: id } },
    limit: 1,
  })
  return result.docs.length > 0
}

/**
 * Check if image exists in database (not trashed)
 */
async function imageExists(payload: Payload, id: number): Promise<boolean> {
  const result = await payload.find({
    collection: 'images',
    where: { id: { equals: id } },
    limit: 1,
  })
  return result.docs.length > 0
}

/**
 * Check if file is in trash
 * Note: trash: true is required to include soft-deleted documents in query results
 */
async function fileInTrash(payload: Payload, id: number): Promise<boolean> {
  const result = await payload.find({
    collection: 'files',
    where: {
      and: [{ id: { equals: id } }, { deletedAt: { exists: true } }],
    },
    limit: 1,
    trash: true, // Include soft-deleted documents in results
  })
  return result.docs.length > 0
}

/**
 * Check if image is in trash
 * Note: trash: true is required to include soft-deleted documents in query results
 */
async function imageInTrash(payload: Payload, id: number): Promise<boolean> {
  const result = await payload.find({
    collection: 'images',
    where: {
      and: [{ id: { equals: id } }, { deletedAt: { exists: true } }],
    },
    limit: 1,
    trash: true, // Include soft-deleted documents in results
  })
  return result.docs.length > 0
}

/**
 * Generate unique ID for test entities
 */
function uniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Create Lexical content with TextBoxBlock containing image
 * Structure based on createBlockNode in imports/lib/lexicalConverter.ts:
 * - blockType goes INSIDE fields
 * - version: 2 for block nodes
 */
function createLexicalWithTextBoxBlock(imageId: number): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Text Box',
            blockType: 'textbox',
            image: imageId,
            imagePosition: 'left',
            text: 'Test content',
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with LayoutBlock containing image
 * Structure based on createBlockNode in imports/lib/lexicalConverter.ts
 */
function createLexicalWithLayoutBlock(imageId: number): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Layout',
            blockType: 'layout',
            style: 'grid',
            items: [
              {
                id: uniqueId(),
                image: imageId,
                title: 'Test Item',
              },
            ],
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with GalleryBlock containing images
 * Note: GalleryBlock requires minRows: 3 images
 * Structure based on createBlockNode in imports/lib/lexicalConverter.ts
 */
function createLexicalWithGalleryBlock(imageIds: number[]): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Image Gallery',
            blockType: 'gallery',
            items: imageIds,
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('CleanupOrphanedMedia Job', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  // ==========================================================================
  // PHASE A: PERMANENT DELETION
  // ==========================================================================

  describe('Phase A: Permanent Deletion', () => {
    it('permanently deletes trashed files', async () => {
      // Create a file and soft-delete it (move to trash)
      // Note: payload.delete() hard-deletes; use update() to set deletedAt for soft delete
      const file = await testData.createFile(payload)
      await payload.update({
        collection: 'files',
        id: file.id,
        data: { deletedAt: new Date().toISOString() },
      })

      // Verify file is in trash
      expect(await fileInTrash(payload, file.id)).toBe(true)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify permanent deletion
      expect(result.permanentlyDeletedFiles).toBeGreaterThanOrEqual(1)

      // Verify file no longer exists (even in trash)
      const trashedFiles = await payload.find({
        collection: 'files',
        where: {
          and: [{ id: { equals: file.id } }, { deletedAt: { exists: true } }],
        },
        trash: true,
      })
      expect(trashedFiles.docs).toHaveLength(0)
    })

    it('permanently deletes trashed images', async () => {
      // Create an image and soft-delete it (move to trash)
      // Note: payload.delete() hard-deletes; use update() to set deletedAt for soft delete
      const image = await testData.createMediaImage(payload)
      await payload.update({
        collection: 'images',
        id: image.id,
        data: { deletedAt: new Date().toISOString() },
      })

      // Verify image is in trash
      expect(await imageInTrash(payload, image.id)).toBe(true)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify permanent deletion
      expect(result.permanentlyDeletedImages).toBeGreaterThanOrEqual(1)

      // Verify image no longer exists (even in trash)
      const trashedImages = await payload.find({
        collection: 'images',
        where: {
          and: [{ id: { equals: image.id } }, { deletedAt: { exists: true } }],
        },
        trash: true,
      })
      expect(trashedImages.docs).toHaveLength(0)
    })
  })

  // ==========================================================================
  // PHASE B: FILE ORPHAN DETECTION
  // ==========================================================================

  describe('Phase B: File Orphan Detection', () => {
    it('trashes orphaned files (no references)', async () => {
      // Create an orphan file and backdate it
      const file = await testData.createFile(payload)
      await backdateCreatedAt(payload, 'files', file.id)

      // Verify file exists
      expect(await fileExists(payload, file.id)).toBe(true)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify file was trashed (not permanently deleted)
      expect(result.trashedFiles).toBeGreaterThanOrEqual(1)
      expect(await fileInTrash(payload, file.id)).toBe(true)
    })

    it('preserves files referenced by lessons.introAudio', async () => {
      // Create a file for introAudio
      const file = await testData.createFile(payload)
      await backdateCreatedAt(payload, 'files', file.id)

      // Create lesson with this file as introAudio
      await testData.createLesson(payload, { introAudio: file.id })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify file is preserved (not trashed)
      expect(await fileExists(payload, file.id)).toBe(true)
      expect(await fileInTrash(payload, file.id)).toBe(false)
    })

    it('preserves files referenced by lessons.panels[].video', async () => {
      // Create a video file
      const videoFile = await testData.createFile(payload, {}, 'video-30s.mp4')
      await backdateCreatedAt(payload, 'files', videoFile.id)

      // Create lesson with video panel
      await testData.createLesson(payload, {
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Cover Panel',
            quote: 'Test quote',
          },
          {
            blockType: 'video' as const,
            video: videoFile.id,
          },
        ],
      })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify file is preserved
      expect(await fileExists(payload, videoFile.id)).toBe(true)
      expect(await fileInTrash(payload, videoFile.id)).toBe(false)
    })
  })

  // ==========================================================================
  // PHASE B: IMAGE ORPHAN DETECTION
  // ==========================================================================

  describe('Phase B: Image Orphan Detection', () => {
    it('trashes orphaned images (no references, no tags)', async () => {
      // Create an orphan image and backdate it
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Verify image exists
      expect(await imageExists(payload, image.id)).toBe(true)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify image was trashed
      expect(result.trashedImages).toBeGreaterThanOrEqual(1)
      expect(await imageInTrash(payload, image.id)).toBe(true)
    })

    it('preserves images with tags (even if unreferenced)', async () => {
      // Create an image tag
      const tag = await testData.createImageTag(payload, { title: 'Preserve Tag' })

      // Create an image with that tag
      const image = await testData.createMediaImage(payload, { tags: [tag.id] })
      await backdateCreatedAt(payload, 'images', image.id)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify image was skipped (not trashed)
      expect(result.skippedImages).toBeGreaterThanOrEqual(1)
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by authors.image', async () => {
      // Create an image for author
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create author with this image (unique name to avoid slug collision)
      await testData.createAuthor(payload, { name: `Author ${uniqueId()}`, image: image.id })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by lectures.thumbnail', async () => {
      // Create an image for lecture thumbnail
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create lecture with this thumbnail
      await testData.createLecture(payload, { thumbnail: image.id })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by meditations.thumbnail', async () => {
      // Create an image for meditation thumbnail
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create meditation with this thumbnail (auto-creates narrator)
      await testData.createMeditation(payload, { thumbnail: image.id })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by lessons.icon', async () => {
      // Create an image for lesson icon
      // Note: lesson.icon references 'images' collection
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create lesson with this icon
      await testData.createLesson(payload, { icon: image.id })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by lessons.panels[].image', async () => {
      // Create an image for lesson panel
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create lesson with text panel containing this image
      await testData.createLesson(payload, {
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Cover Panel',
            quote: 'Test quote',
          },
          {
            blockType: 'text' as const,
            title: 'Text Panel',
            text: 'Panel content',
            image: image.id,
          },
        ],
      })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced in pages TextBoxBlock', async () => {
      // Create an image for TextBoxBlock
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create page with TextBoxBlock containing this image
      await testData.createPage(payload, {
        content: createLexicalWithTextBoxBlock(image.id),
      })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced in pages LayoutBlock', async () => {
      // Create an image for LayoutBlock
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create page with LayoutBlock containing this image
      await testData.createPage(payload, {
        content: createLexicalWithLayoutBlock(image.id),
      })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image is preserved
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced in pages GalleryBlock', async () => {
      // Create images for GalleryBlock (minRows: 3)
      const image1 = await testData.createMediaImage(payload)
      const image2 = await testData.createMediaImage(payload)
      const image3 = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image1.id)
      await backdateCreatedAt(payload, 'images', image2.id)
      await backdateCreatedAt(payload, 'images', image3.id)

      // Create page with GalleryBlock containing these images
      await testData.createPage(payload, {
        content: createLexicalWithGalleryBlock([image1.id, image2.id, image3.id]),
      })

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify images are preserved
      expect(await imageExists(payload, image1.id)).toBe(true)
      expect(await imageExists(payload, image2.id)).toBe(true)
      expect(await imageExists(payload, image3.id)).toBe(true)
      expect(await imageInTrash(payload, image1.id)).toBe(false)
      expect(await imageInTrash(payload, image2.id)).toBe(false)
      expect(await imageInTrash(payload, image3.id)).toBe(false)
    })
  })

  // ==========================================================================
  // GRACE PERIOD
  // ==========================================================================

  describe('Grace Period', () => {
    it('skips files created within grace period', async () => {
      // Create an orphan file (do NOT backdate - within grace period)
      const file = await testData.createFile(payload)

      // Verify file exists
      expect(await fileExists(payload, file.id)).toBe(true)

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify file was NOT trashed (protected by grace period)
      expect(await fileExists(payload, file.id)).toBe(true)
      expect(await fileInTrash(payload, file.id)).toBe(false)
    })

    it('skips images created within grace period', async () => {
      // Create an orphan image (do NOT backdate - within grace period)
      const image = await testData.createMediaImage(payload)

      // Verify image exists
      expect(await imageExists(payload, image.id)).toBe(true)

      // Run cleanup job
      await runCleanupJob(payload)

      // Verify image was NOT trashed (protected by grace period)
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles empty database gracefully', async () => {
      // Just run the job - should complete without errors
      const result = await runCleanupJob(payload)

      // Should return valid result with zero or more counts
      expect(result).toHaveProperty('permanentlyDeletedFiles')
      expect(result).toHaveProperty('permanentlyDeletedImages')
      expect(result).toHaveProperty('trashedFiles')
      expect(result).toHaveProperty('trashedImages')
      expect(result).toHaveProperty('skippedImages')
      expect(result).toHaveProperty('errors')
      expect(result.errors).toBe(0)
    })

    it('handles all media referenced (nothing to clean)', async () => {
      // Create media that is all properly referenced
      const image1 = await testData.createMediaImage(payload)
      const image2 = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image1.id)
      await backdateCreatedAt(payload, 'images', image2.id)

      // Reference both images (unique names to avoid slug collision)
      await testData.createAuthor(payload, { name: `Author ${uniqueId()}`, image: image1.id })
      await testData.createLecture(payload, { thumbnail: image2.id })

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Both images should be preserved
      expect(await imageExists(payload, image1.id)).toBe(true)
      expect(await imageExists(payload, image2.id)).toBe(true)
      expect(result.errors).toBe(0)
    })

    it('returns correct counts for mixed operations', async () => {
      // Setup: Create various scenarios
      // 1. Trashed file (will be permanently deleted)
      // Note: payload.delete() hard-deletes; use update() to set deletedAt for soft delete
      const trashedFile = await testData.createFile(payload)
      await payload.update({
        collection: 'files',
        id: trashedFile.id,
        data: { deletedAt: new Date().toISOString() },
      })

      // 2. Trashed image (will be permanently deleted)
      // Note: payload.delete() hard-deletes; use update() to set deletedAt for soft delete
      const trashedImage = await testData.createMediaImage(payload)
      await payload.update({
        collection: 'images',
        id: trashedImage.id,
        data: { deletedAt: new Date().toISOString() },
      })

      // 3. Orphan file (will be trashed)
      const orphanFile = await testData.createFile(payload)
      await backdateCreatedAt(payload, 'files', orphanFile.id)

      // 4. Orphan image (will be trashed)
      const orphanImage = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', orphanImage.id)

      // 5. Tagged image (will be skipped)
      const tag = await testData.createImageTag(payload, { title: 'Skip Tag' })
      const taggedImage = await testData.createMediaImage(payload, { tags: [tag.id] })
      await backdateCreatedAt(payload, 'images', taggedImage.id)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify counts
      expect(result.permanentlyDeletedFiles).toBeGreaterThanOrEqual(1)
      expect(result.permanentlyDeletedImages).toBeGreaterThanOrEqual(1)
      expect(result.trashedFiles).toBeGreaterThanOrEqual(1)
      expect(result.trashedImages).toBeGreaterThanOrEqual(1)
      expect(result.skippedImages).toBeGreaterThanOrEqual(1)
      expect(result.errors).toBe(0)

      // Verify states
      expect(await fileInTrash(payload, orphanFile.id)).toBe(true)
      expect(await imageInTrash(payload, orphanImage.id)).toBe(true)
      expect(await imageExists(payload, taggedImage.id)).toBe(true)
      expect(await imageInTrash(payload, taggedImage.id)).toBe(false)
    })
  })
})
