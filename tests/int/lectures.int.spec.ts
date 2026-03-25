import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Image, Lecture } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls in tests
// This mock is automatically hoisted to the top of the file by Vitest
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    // Keep the real extractVimeoId for unit tests
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: Buffer.from('fake-image-data'),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail-123456789.jpg',
      size: 15,
    }),
  }
})

describe('Lectures Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUser: Awaited<ReturnType<typeof createTestEnvironment>>['adminUser']

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUser = testEnv.adminUser
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('populateFromNirmalaVidya hook', () => {
    it('auto-populates title and videoUrl from Nirmala Vidya on create', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Auto-populated Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/123456789',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(lecture.title).toBe('Auto-populated Title')
      expect(lecture.videoUrl).toBe('https://example.com/stream.m3u8')
      expect(lecture.nirmalVidyaVimeoUrl).toBe('https://vimeo.com/123456789')
    })

    it('preserves user-provided title when one is supplied on create', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'API Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/111111111',
          title: 'User Provided Title',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      // User-provided title takes precedence over API title
      expect(lecture.title).toBe('User Provided Title')
      expect(lecture.videoUrl).toBe('https://example.com/stream.m3u8')
    })

    it('creates thumbnail image when downloadToBuffer succeeds', async () => {
      const { fetchNirmalaVidyaVideo, downloadToBuffer } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture with Thumbnail',
        thumbnailUrl: 'https://example.com/specific-thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
      })
      vi.mocked(downloadToBuffer).mockResolvedValueOnce({
        data: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        name: 'lecture-thumbnail-999.jpg',
        size: 15,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/999999999',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      // Thumbnail should have been created and linked
      expect(lecture.thumbnail).toBeDefined()
      expect(typeof lecture.thumbnail === 'number' || typeof lecture.thumbnail === 'object').toBe(
        true,
      )
    })

    it('continues without thumbnail when downloadToBuffer fails (non-fatal)', async () => {
      const { fetchNirmalaVidyaVideo, downloadToBuffer } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'No Thumbnail Lecture',
        thumbnailUrl: 'https://example.com/broken-thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
      })
      vi.mocked(downloadToBuffer).mockRejectedValueOnce(new Error('Download failed'))

      // Should not throw — thumbnail failure is non-fatal
      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/888888888',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(lecture.videoUrl).toBe('https://example.com/stream.m3u8')
      // Thumbnail is null (not undefined) — PayloadCMS stores null for empty relationship fields
      expect(lecture.thumbnail).toBeNull()
    })

    it('throws a validation error when the Vimeo URL is invalid', async () => {
      await expect(
        payload.create({
          collection: 'lectures',
          data: {
            nirmalVidyaVimeoUrl: 'https://youtube.com/watch?v=abc123',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).rejects.toThrow()
    })

    it('throws a validation error when the Nirmala Vidya API call fails', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockRejectedValueOnce(
        new Error('Video not found on Nirmala Vidya (Vimeo ID: 404). Check that the URL is correct.'),
      )

      await expect(
        payload.create({
          collection: 'lectures',
          data: {
            nirmalVidyaVimeoUrl: 'https://vimeo.com/404',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).rejects.toThrow()
    })

    it('skips population on update operations', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')

      const lecture = await testData.createLecture(payload)
      const callCountAfterCreate = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length

      // Update the lecture — hook should not call the API
      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: {
          title: 'Manually Updated Title',
        },
      })

      // No additional API calls should have been made
      expect(vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length).toBe(callCountAfterCreate)
      expect(updated.title).toBe('Manually Updated Title')
    })
  })

  describe('createLecture factory', () => {
    it('creates a lecture with default test data', async () => {
      const lecture = await testData.createLecture(payload)

      expect(lecture.id).toBeDefined()
      expect(lecture.nirmalVidyaVimeoUrl).toBe('https://vimeo.com/123456789')
    })

    it('creates a lecture with custom overrides', async () => {
      const thumbMedia = await testData.createMediaImage(payload)
      const lecture = await testData.createLecture(payload, { thumbnail: thumbMedia.id })

      expect(lecture.thumbnail).toBeDefined()
    })
  })

  describe('Field access control', () => {
    it('nirmalVidyaVimeoUrl cannot be updated via payload.update', async () => {
      const lecture = await testData.createLecture(payload)

      // Attempt to update nirmalVidyaVimeoUrl — should be blocked by access.update: () => false
      // Must pass overrideAccess: false to enforce field-level access control
      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/changed-url',
        },
        overrideAccess: false,
        user: adminUser,
      })

      // The URL should remain unchanged
      expect(updated.nirmalVidyaVimeoUrl).toBe(lecture.nirmalVidyaVimeoUrl)
    })

    it('title can be updated after creation', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Original API Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
      })

      const lecture = (await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/777777777',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as Lecture

      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { title: 'Manually Edited Title' },
      })

      expect(updated.title).toBe('Manually Edited Title')
    })

    it('thumbnail can be replaced after creation', async () => {
      const lecture = await testData.createLecture(payload)
      const newThumbnail = await testData.createMediaImage(payload)

      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: {
          thumbnail: newThumbnail.id,
        },
      })

      const thumbnailId =
        typeof updated.thumbnail === 'object' && updated.thumbnail !== null
          ? (updated.thumbnail as Image).id
          : updated.thumbnail

      expect(thumbnailId).toBe(newThumbnail.id)
    })
  })

  describe('extractVimeoId', () => {
    // The mock delegates to the real implementation via importOriginal
    it('parses https://vimeo.com/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/nirmalaVidyaApi')
      expect(extractVimeoId('https://vimeo.com/123456789')).toBe('123456789')
    })

    it('parses https://player.vimeo.com/video/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/nirmalaVidyaApi')
      expect(extractVimeoId('https://player.vimeo.com/video/123456789')).toBe('123456789')
    })

    it('parses https://vimeo.com/channels/name/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/nirmalaVidyaApi')
      expect(extractVimeoId('https://vimeo.com/channels/name/123456789')).toBe('123456789')
    })

    it('returns null for non-Vimeo URLs', async () => {
      const { extractVimeoId } = await import('@/lib/nirmalaVidyaApi')
      expect(extractVimeoId('https://youtube.com/watch?v=abc123')).toBeNull()
      expect(extractVimeoId('https://example.com/123456')).toBeNull()
      expect(extractVimeoId('not-a-url')).toBeNull()
    })
  })
})
