import type { Payload } from 'payload'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Image } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls in tests
// This mock is automatically hoisted to the top of the file by Vitest
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'))
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    // Keep the real extractVimeoId for unit tests
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

describe('Lectures Collection', () => {
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

  describe('populateFromNirmalaVidya hook', () => {
    it('auto-populates title and videoUrl from Nirmala Vidya on create', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Auto-populated Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
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
        subtitles: [],
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
        subtitles: [],
      })
      const imgBuf = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../files/image-1050x700.jpg'))
      vi.mocked(downloadToBuffer).mockResolvedValueOnce({
        data: new Uint8Array(imgBuf) as unknown as Buffer,
        mimetype: 'image/jpeg',
        name: 'lecture-thumbnail-999.jpg',
        size: imgBuf.length,
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
        subtitles: [],
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

  describe('Field editability after creation', () => {
    it('title can be updated after creation', async () => {
      const lecture = await testData.createLecture(payload)

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

  describe('Localized subtitle population', () => {
    it('populates subtitlesUrl per locale from API subtitle data', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture with Subtitles',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [
          { languageCode: 'en', url: 'https://example.com/subs/en.vtt' },
          { languageCode: 'ru', url: 'https://example.com/subs/ru.vtt' },
          { languageCode: 'zh-hans', url: 'https://example.com/subs/zh-hans.vtt' },
        ],
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/555555555',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      // English subtitle set via beforeChange (current locale)
      expect(lecture.subtitlesUrl).toBe('https://example.com/subs/en.vtt')

      // Russian subtitle set via afterChange
      const ruLecture = await payload.findByID({
        collection: 'lectures',
        id: lecture.id,
        locale: 'ru',
        fallbackLocale: false,
      })
      expect(ruLecture.subtitlesUrl).toBe('https://example.com/subs/ru.vtt')

      // German (not in API response) should be null/empty
      const deLecture = await payload.findByID({
        collection: 'lectures',
        id: lecture.id,
        locale: 'de',
        fallbackLocale: false,
      })
      expect(deLecture.subtitlesUrl).toBeFalsy()
    })

    it('handles lectures with no subtitles gracefully', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture without Subtitles',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/666666666',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(lecture.subtitlesUrl).toBeFalsy()
    })

    it('skips unrecognized language codes silently', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture with Unknown Langs',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [
          { languageCode: 'zh-hans', url: 'https://example.com/subs/zh-hans.vtt' },
          { languageCode: 'ja', url: 'https://example.com/subs/ja.vtt' },
        ],
      })

      // Should not throw — unmatched codes are silently skipped
      const lecture = await payload.create({
        collection: 'lectures',
        data: {
          nirmalVidyaVimeoUrl: 'https://vimeo.com/777777777',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(lecture.subtitlesUrl).toBeFalsy()
    })
  })

  // startTime/endTime tests moved to lecture-clips.int.spec.ts in #291 —
  // those fields now live on LectureClips, not Lectures.

  describe('NirmalaVidyaResponseSchema', () => {
    it('coerces subtitles: null to an empty array', async () => {
      // Bypass the mock to access the real schema
      const { NirmalaVidyaResponseSchema } = await vi.importActual<
        typeof import('@/lib/nirmalaVidyaApi')
      >('@/lib/nirmalaVidyaApi')

      const parsed = NirmalaVidyaResponseSchema.parse({
        name: 'Older Lecture',
        files: [{ link: 'https://example.com/stream.m3u8', quality: 'hls' }],
        thumbnail_url: 'https://example.com/thumb.jpg',
        subtitles: null,
      })

      expect(parsed.subtitles).toEqual([])
    })

    it('still accepts an omitted subtitles field', async () => {
      const { NirmalaVidyaResponseSchema } = await vi.importActual<
        typeof import('@/lib/nirmalaVidyaApi')
      >('@/lib/nirmalaVidyaApi')

      const parsed = NirmalaVidyaResponseSchema.parse({
        name: 'Lecture',
        files: [{ link: 'https://example.com/stream.m3u8', quality: 'hls' }],
      })

      expect(parsed.subtitles).toEqual([])
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
