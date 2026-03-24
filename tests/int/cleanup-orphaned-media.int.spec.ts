import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createLexicalWithGalleryBlock,
  createLexicalWithLayoutBlock,
  createLexicalWithTextBoxBlock,
  uniqueId,
} from '../utils/lexicalTestHelpers'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — testData.createLecture() triggers the
// beforeChange hook which calls fetchNirmalaVidyaVideo
vi.mock('@/lib/nirmalaVidyaApi', () => ({
  extractVimeoId: vi.fn((url: string) => {
    const match = url.match(/\/(\d+)(?:[/?#]|$)/)
    return match?.[1] ?? null
  }),
  fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
    title: 'Test Lecture',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    hlsUrl: 'https://example.com/video.m3u8',
  }),
  downloadToBuffer: vi.fn().mockResolvedValue({
    data: Buffer.from('fake-image-data'),
    mimetype: 'image/jpeg',
    name: 'lecture-thumbnail.jpg',
    size: 15,
  }),
}))

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
 * Run cleanup job by invoking handler directly with a test-friendly date range.
 * This date range includes files backdated to 48 hours ago but excludes files
 * created "now" (respecting the 24h grace period).
 */
async function runCleanupJob(payload: Payload): Promise<CleanupResult> {
  const { CleanupOrphanedMedia } = await import('@/jobs/tasks/CleanupOrphanedMedia')

  const mockReq = {
    payload,
  } as PayloadRequest

  // Test-friendly date range that:
  // - Includes files backdated to 48 hours ago
  // - Excludes files created "now" (respecting grace period)
  const rangeStart = new Date()
  rangeStart.setHours(rangeStart.getHours() - 72)
  const rangeEnd = new Date()
  rangeEnd.setHours(rangeEnd.getHours() - 25) // Outside 24h grace period

  // The handler type can be a string (for queued jobs) or function (inline)
  // Our job uses inline handler, so we can safely call it
  const handler = CleanupOrphanedMedia.handler as (args: {
    req: PayloadRequest
    input: Record<string, unknown>
  }) => Promise<{ output: CleanupResult }>
  const result = await handler({
    req: mockReq,
    input: {
      testDateRange: {
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
      },
    },
  })
  return result.output
}

/**
 * Run cleanup job with default date range calculation (month-based rotation).
 * Used for tests that verify the date range rotation logic works correctly.
 */
async function runCleanupJobWithDefaultRange(payload: Payload): Promise<CleanupResult> {
  const { CleanupOrphanedMedia } = await import('@/jobs/tasks/CleanupOrphanedMedia')

  const mockReq = {
    payload,
  } as PayloadRequest

  // Don't pass testDateRange - uses default month-based calculation
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

    it('preserves files referenced by lessons.panels[].media', async () => {
      // Create a video file
      const videoFile = await testData.createFile(payload, {}, 'video-30s.mp4')
      await backdateCreatedAt(payload, 'files', videoFile.id)

      // Create lesson with media panel
      await testData.createLesson(payload, {
        panels: [
          {
            title: 'Cover Panel',
            text: 'Test text',
          },
          {
            media: videoFile.id,
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
    it('trashes orphaned images (no references, only auto-generated orientation tags)', async () => {
      // Create an orphan image and backdate it
      // Note: Images now get orientation tags automatically via beforeChange hook
      // The cleanup job ignores orientation tags when determining orphan status
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Verify image exists (it should have auto-generated orientation tag)
      expect(await imageExists(payload, image.id)).toBe(true)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify image was trashed (orientation tags don't protect from cleanup)
      expect(result.trashedImages).toBeGreaterThanOrEqual(1)
      expect(await imageInTrash(payload, image.id)).toBe(true)
    })

    it('preserves images with tags (even if unreferenced)', async () => {
      // Image tags are now inline enum strings
      // Use a non-orientation tag to test preservation
      const preserveTag = 'thumbnail'

      // Create an image with that tag
      const image = await testData.createMediaImage(payload, { tags: [preserveTag] })
      await backdateCreatedAt(payload, 'images', image.id)

      // Run cleanup job
      const result = await runCleanupJob(payload)

      // Verify image was skipped (not trashed)
      expect(result.skippedImages).toBeGreaterThanOrEqual(1)
      expect(await imageExists(payload, image.id)).toBe(true)
      expect(await imageInTrash(payload, image.id)).toBe(false)
    })

    it('preserves images referenced by authors.photo', async () => {
      // Create an image for author
      const image = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', image.id)

      // Create author with this photo (unique name to avoid slug collision)
      await testData.createAuthor(payload, { name: `Author ${uniqueId()}`, photo: image.id })

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
        content: createLexicalWithLayoutBlock([image.id]),
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
      await testData.createAuthor(payload, { name: `Author ${uniqueId()}`, photo: image1.id })
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

      // 4. Orphan image (will be trashed - orientation tags are ignored)
      const orphanImage = await testData.createMediaImage(payload)
      await backdateCreatedAt(payload, 'images', orphanImage.id)

      // 5. Tagged image (will be skipped)
      // Image tags are now inline enum strings
      const skipTag = 'author' // Use a non-orientation tag
      const taggedImage = await testData.createMediaImage(payload, { tags: [skipTag] })
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

  // ==========================================================================
  // DATE RANGE ROTATION
  // ==========================================================================

  describe('Date Range Rotation', () => {
    it('processes 0-1 month range when month % 3 === 0', async () => {
      // Mock date to January (month 0)
      const mockDate = new Date('2025-01-15T12:00:00Z')
      vi.setSystemTime(mockDate)

      // Create files at different ages
      // 2 weeks old (should be in 0-1 month range)
      const file2weeksOld = await testData.createFile(payload)
      const twoWeeksAgo = new Date(mockDate)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      await payload.update({
        collection: 'files',
        id: file2weeksOld.id,
        data: { createdAt: twoWeeksAgo.toISOString() },
      })

      // 2 months old (should NOT be in 0-1 month range)
      const file2moOld = await testData.createFile(payload)
      const twoMonthsAgo = new Date(mockDate)
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
      await payload.update({
        collection: 'files',
        id: file2moOld.id,
        data: { createdAt: twoMonthsAgo.toISOString() },
      })

      // Run cleanup job with default (month-based) date range
      await runCleanupJobWithDefaultRange(payload)

      // Verify: Only 0-1 month old file processed
      expect(await fileInTrash(payload, file2weeksOld.id)).toBe(true)
      expect(await fileInTrash(payload, file2moOld.id)).toBe(false)

      // Restore real time
      vi.useRealTimers()
    })

    it('processes 1-2 month range when month % 3 === 1', async () => {
      // Mock date to February (month 1)
      const mockDate = new Date('2025-02-15T12:00:00Z')
      vi.setSystemTime(mockDate)

      // Create files at different ages
      // 1.5 months old (should be in 1-2 month range)
      const file1p5moOld = await testData.createFile(payload)
      const onePointFiveMonthsAgo = new Date(mockDate)
      onePointFiveMonthsAgo.setMonth(onePointFiveMonthsAgo.getMonth() - 1)
      onePointFiveMonthsAgo.setDate(onePointFiveMonthsAgo.getDate() - 15)
      await payload.update({
        collection: 'files',
        id: file1p5moOld.id,
        data: { createdAt: onePointFiveMonthsAgo.toISOString() },
      })

      // 2 weeks old (should NOT be in 1-2 month range)
      const file2weeksOld = await testData.createFile(payload)
      const twoWeeksAgo = new Date(mockDate)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      await payload.update({
        collection: 'files',
        id: file2weeksOld.id,
        data: { createdAt: twoWeeksAgo.toISOString() },
      })

      // Run cleanup job with default (month-based) date range
      await runCleanupJobWithDefaultRange(payload)

      // Verify: Only 1-2 month old file processed
      expect(await fileInTrash(payload, file1p5moOld.id)).toBe(true)
      expect(await fileInTrash(payload, file2weeksOld.id)).toBe(false)

      // Restore real time
      vi.useRealTimers()
    })

    it('processes 2-3 month range when month % 3 === 2', async () => {
      // Mock date to March (month 2)
      const mockDate = new Date('2025-03-15T12:00:00Z')
      vi.setSystemTime(mockDate)

      // Create files at different ages
      // 2.5 months old (should be in 2-3 month range)
      const file2p5moOld = await testData.createFile(payload)
      const twoPointFiveMonthsAgo = new Date(mockDate)
      twoPointFiveMonthsAgo.setMonth(twoPointFiveMonthsAgo.getMonth() - 2)
      twoPointFiveMonthsAgo.setDate(twoPointFiveMonthsAgo.getDate() - 15)
      await payload.update({
        collection: 'files',
        id: file2p5moOld.id,
        data: { createdAt: twoPointFiveMonthsAgo.toISOString() },
      })

      // 1 month old (should NOT be in 2-3 month range)
      const file1moOld = await testData.createFile(payload)
      const oneMonthAgo = new Date(mockDate)
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
      await payload.update({
        collection: 'files',
        id: file1moOld.id,
        data: { createdAt: oneMonthAgo.toISOString() },
      })

      // Run cleanup job with default (month-based) date range
      await runCleanupJobWithDefaultRange(payload)

      // Verify: Only 2-3 month old file processed
      expect(await fileInTrash(payload, file2p5moOld.id)).toBe(true)
      expect(await fileInTrash(payload, file1moOld.id)).toBe(false)

      // Restore real time
      vi.useRealTimers()
    })

    it('Phase A always processes trashed items regardless of age', async () => {
      // Mock date to January (month 0, which processes 0-1 month range)
      const mockDate = new Date('2025-01-15T12:00:00Z')
      vi.setSystemTime(mockDate)

      // Create trashed file from 6 months ago (outside any Phase B range)
      const trashedFile = await testData.createFile(payload)
      const sixMonthsAgo = new Date(mockDate)
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      await payload.update({
        collection: 'files',
        id: trashedFile.id,
        data: {
          createdAt: sixMonthsAgo.toISOString(),
          deletedAt: new Date(mockDate).toISOString(),
        },
      })

      // Verify file is in trash
      expect(await fileInTrash(payload, trashedFile.id)).toBe(true)

      // Run cleanup job with default (month-based) date range
      const result = await runCleanupJobWithDefaultRange(payload)

      // Verify file was permanently deleted even though it's outside Phase B date range
      expect(result.permanentlyDeletedFiles).toBeGreaterThanOrEqual(1)

      // Verify file no longer exists (even in trash)
      const trashedFiles = await payload.find({
        collection: 'files',
        where: {
          and: [{ id: { equals: trashedFile.id } }, { deletedAt: { exists: true } }],
        },
        trash: true,
      })
      expect(trashedFiles.docs).toHaveLength(0)

      // Restore real time
      vi.useRealTimers()
    })
  })
})
