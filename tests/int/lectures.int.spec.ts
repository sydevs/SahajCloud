import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { LectureMetadata } from '@/lib/lectures/nirmalaVidya'
import type { Image } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls in tests.
vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
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
    it('writes the full API response into metadata JSON on create', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Auto-populated Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [
          { languageCode: 'en', url: 'https://example.com/subs/en.vtt' },
          { languageCode: 'cs', url: 'https://example.com/subs/cs.vtt' },
        ],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({
          nirmalVidyaVimeoUrl: 'https://vimeo.com/123456789',
        }),
      })

      expect(lecture.title).toBe('Auto-populated Title')

      const metadata = lecture.metadata as LectureMetadata
      expect(metadata.title).toBe('Auto-populated Title')
      expect(metadata.hlsUrl).toBe('https://example.com/stream.m3u8')
      expect(metadata.thumbnailUrl).toBe('https://example.com/thumb.jpg')
      expect(metadata.subtitles).toEqual({
        en: 'https://example.com/subs/en.vtt',
        cs: 'https://example.com/subs/cs.vtt',
      })
      expect(metadata.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('preserves user-provided title when one is supplied on create', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'API Title',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({
          nirmalVidyaVimeoUrl: 'https://vimeo.com/111111111',
          title: 'User Provided Title',
        }),
      })

      // User-provided title takes precedence over the API title in the editor-
      // visible field, but metadata.title still captures the canonical API value.
      expect(lecture.title).toBe('User Provided Title')
      expect((lecture.metadata as LectureMetadata).title).toBe('API Title')
    })

    it('does not auto-upload a thumbnail (editor override only)', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'No Auto-Thumbnail',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({
          nirmalVidyaVimeoUrl: 'https://vimeo.com/222222222',
        }),
      })

      // `thumbnail` stays null — the endpoint falls back to metadata.thumbnailUrl.
      expect(lecture.thumbnail).toBeNull()
      expect((lecture.metadata as LectureMetadata).thumbnailUrl).toBe(
        'https://example.com/thumb.jpg',
      )
    })

    it('maps unrecognized language codes to null and skips them silently', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture with Unknown Langs',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [
          { languageCode: 'en', url: 'https://example.com/subs/en.vtt' },
          { languageCode: 'zh-hans', url: 'https://example.com/subs/zh-hans.vtt' },
          { languageCode: 'ja', url: 'https://example.com/subs/ja.vtt' },
        ],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({
          nirmalVidyaVimeoUrl: 'https://vimeo.com/777777777',
        }),
      })

      const metadata = lecture.metadata as LectureMetadata
      // zh-hans and ja have no matching CMS locale → dropped
      expect(metadata.subtitles).toEqual({
        en: 'https://example.com/subs/en.vtt',
      })
    })

    it('normalizes "pt" to "pt-BR"', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Brazilian Portuguese Lecture',
        thumbnailUrl: null,
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [{ languageCode: 'pt', url: 'https://example.com/subs/pt.vtt' }],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({ nirmalVidyaVimeoUrl: 'https://vimeo.com/333333333' }),
      })

      expect((lecture.metadata as LectureMetadata).subtitles['pt-BR']).toBe(
        'https://example.com/subs/pt.vtt',
      )
    })

    it('throws a validation error when the Vimeo URL is invalid', async () => {
      await expect(
        payload.create({
          collection: 'lectures',
          data: createData<'lectures'>({
            nirmalVidyaVimeoUrl: 'https://youtube.com/watch?v=abc123',
          }),
        }),
      ).rejects.toThrow()
    })

    it('throws a validation error when the Nirmala Vidya API call fails', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockRejectedValueOnce(
        new Error(
          'Video not found on Nirmala Vidya (Vimeo ID: 404). Check that the URL is correct.',
        ),
      )

      await expect(
        payload.create({
          collection: 'lectures',
          data: createData<'lectures'>({
            nirmalVidyaVimeoUrl: 'https://vimeo.com/404',
          }),
        }),
      ).rejects.toThrow()
    })

    it('skips population on update operations', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')

      const lecture = await testData.createLecture(payload)
      const callCountAfterCreate = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length

      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: {
          title: 'Manually Updated Title',
        },
      })

      expect(vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length).toBe(callCountAfterCreate)
      expect(updated.title).toBe('Manually Updated Title')
    })
  })

  describe('metadata non-localization', () => {
    it('returns the same metadata object regardless of request locale', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Non-localized Metadata',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [
          { languageCode: 'en', url: 'https://example.com/subs/en.vtt' },
          { languageCode: 'ru', url: 'https://example.com/subs/ru.vtt' },
        ],
        duration: null,
      })

      const lecture = await payload.create({
        collection: 'lectures',
        data: createData<'lectures'>({ nirmalVidyaVimeoUrl: 'https://vimeo.com/444444444' }),
      })

      const en = await payload.findByID({
        collection: 'lectures',
        id: lecture.id,
        locale: 'en',
        fallbackLocale: false,
      })
      const cs = await payload.findByID({
        collection: 'lectures',
        id: lecture.id,
        locale: 'cs',
        fallbackLocale: false,
      })

      // Metadata is non-localized — identical across locales.
      expect((en.metadata as LectureMetadata).subtitles).toEqual(
        (cs.metadata as LectureMetadata).subtitles,
      )
      expect((en.metadata as LectureMetadata).hlsUrl).toBe((cs.metadata as LectureMetadata).hlsUrl)
    })
  })

  describe('createLecture factory', () => {
    it('creates a lecture with default test data', async () => {
      const lecture = await testData.createLecture(payload)

      expect(lecture.id).toBeDefined()
      // Factory generates a unique numeric vimeo id per call so each call lands
      // on a distinct URL. Uniqueness is no longer enforced at the DB level
      // (after #330 excerpts share the parent's URL).
      expect(lecture.nirmalVidyaVimeoUrl).toMatch(/^https:\/\/vimeo\.com\/\d+$/)
    })

    it('creates a lecture with an editor-supplied thumbnail', async () => {
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

    it('thumbnail can be set after creation as an editor override', async () => {
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

  describe('Merged schema (#330, #338)', () => {
    it('stopTime > startTime validator rejects stopTime <= startTime when both set', async () => {
      const lecture = await testData.createLecture(payload)
      await expect(
        payload.update({
          collection: 'lectures',
          id: lecture.id,
          data: { startTime: 100, stopTime: 50 },
        }),
      ).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'lectures',
          id: lecture.id,
          data: { startTime: 100, stopTime: 100 },
        }),
      ).rejects.toThrow()
    })

    it('stopTime validator catches startTime-only updates that violate the invariant', async () => {
      const lecture = await testData.createLecture(payload)
      await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { startTime: 0, stopTime: 60 },
      })
      // stopTime is unchanged at 60. New startTime=100 should violate stopTime > startTime.
      await expect(
        payload.update({
          collection: 'lectures',
          id: lecture.id,
          data: { startTime: 100 },
        }),
      ).rejects.toThrow()
    })

    it('startTime/stopTime are optional — either field may be left null', async () => {
      const lecture = await testData.createLecture(payload)
      // startTime alone — passes
      const updated = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { startTime: 30 },
      })
      expect(updated.startTime).toBe(30)
      expect(updated.stopTime).toBeNull()
      // stopTime alone — passes
      const updated2 = await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { startTime: null, stopTime: 200 },
      })
      expect(updated2.startTime).toBeNull()
      expect(updated2.stopTime).toBe(200)
    })

    it('fullLecture relationship persists round-trip on a clip', async () => {
      const parent = await testData.createLecture(payload)
      const excerpt = await testData.createLectureExcerpt(payload, { fullLecture: parent.id })
      const fetched = await payload.findByID({
        collection: 'lectures',
        id: excerpt.id,
        depth: 0,
      })
      expect(fetched.fullLecture).toBe(parent.id)
      expect(fetched.type).toBe('clip')
    })

    it('subtitles array persists per-locale override entries on a clip', async () => {
      const clip = await testData.createLectureExcerpt(payload)
      const updated = await payload.update({
        collection: 'lectures',
        id: clip.id,
        data: {
          subtitles: [
            { locale: 'en', url: 'https://example.com/override-en.vtt' },
            { locale: 'es', url: 'https://example.com/override-es.vtt' },
          ],
        },
      })
      expect(updated.subtitles).toHaveLength(2)
      expect(updated.subtitles?.[0].locale).toBe('en')
      expect(updated.subtitles?.[0].url).toBe('https://example.com/override-en.vtt')
    })

    it('clips join surfaces clips pointing at this full lecture via fullLecture', async () => {
      const parent = await testData.createLecture(payload)
      const excerpt1 = await testData.createLectureExcerpt(payload, { fullLecture: parent.id })
      const excerpt2 = await testData.createLectureExcerpt(payload, { fullLecture: parent.id })

      const fetched = await payload.findByID({
        collection: 'lectures',
        id: parent.id,
        depth: 0,
      })
      const clipDocs =
        (fetched.clips as { docs?: Array<number | { id: number }> } | undefined)?.docs ?? []
      const clipIds = clipDocs.map((c) => (typeof c === 'number' ? c : c.id)).sort()
      expect(clipIds).toEqual([excerpt1.id, excerpt2.id].sort())
    })
  })

  describe('type field (#338)', () => {
    it('defaults to "full" when not specified', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Default Type Test',
        thumbnailUrl: null,
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
        duration: null,
      })
      const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`
      const lecture = await payload.create({
        collection: 'lectures',

        data: createData<'lectures'>({ nirmalVidyaVimeoUrl: `https://vimeo.com/${uniqueId}` }),
      })
      expect(lecture.type).toBe('full')
    })

    it('rejects a second full lecture with the same Vimeo URL — message includes admin path', async () => {
      const first = await testData.createLecture(payload)
      const dupUrl = first.nirmalVidyaVimeoUrl as string

      try {
        await payload.create({
          collection: 'lectures',

          data: createData<'lectures'>({ type: 'full', nirmalVidyaVimeoUrl: dupUrl }),
        })
        throw new Error('expected create to throw — duplicate URL should be rejected')
      } catch (err) {
        // Payload's ValidationError exposes per-field messages on `.data.errors`.
        const data = (err as { data?: { errors?: Array<{ path: string; message: string }> } }).data
        const errors = data?.errors ?? []
        const fieldErr = errors.find((e) => e.path === 'nirmalVidyaVimeoUrl')
        expect(fieldErr?.message).toContain(`/admin/collections/lectures/${first.id}`)
      }
    })
  })

  describe('clip create flow (#338)', () => {
    it('rejects a clip with neither nirmalVidyaVimeoUrl nor fullLecture', async () => {
      await expect(
        payload.create({
          collection: 'lectures',

          data: createData<'lectures'>({ type: 'clip' }),
        }),
      ).rejects.toThrow()
    })

    it('links to existing full lecture when its URL is supplied', async () => {
      const parent = await testData.createLecture(payload)
      const parentUrl = parent.nirmalVidyaVimeoUrl as string

      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      const callCountBefore = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length

      const clip = await payload.create({
        collection: 'lectures',

        data: createData<'lectures'>({ type: 'clip', nirmalVidyaVimeoUrl: parentUrl }),
      })

      // Clip linked to existing parent — no NV API call (parent already exists).
      expect(vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length).toBe(callCountBefore)
      const fullLectureId =
        typeof clip.fullLecture === 'object' && clip.fullLecture !== null
          ? clip.fullLecture.id
          : clip.fullLecture
      expect(fullLectureId).toBe(parent.id)
      // URL nulled — it was a creation-time lookup key only.
      expect(clip.nirmalVidyaVimeoUrl).toBeNull()
      // Clip has no own metadata.
      expect(clip.metadata).toBeFalsy()
    })

    it('auto-creates a parent full lecture when supplied URL has no match', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Brand New Parent',
        thumbnailUrl: 'https://example.com/parent.jpg',
        hlsUrl: 'https://example.com/parent.m3u8',
        subtitles: [],
        duration: null,
      })

      const newUrl = `https://vimeo.com/${Date.now()}999`
      const clip = await payload.create({
        collection: 'lectures',

        data: createData<'lectures'>({ type: 'clip', nirmalVidyaVimeoUrl: newUrl }),
      })

      const parentId =
        typeof clip.fullLecture === 'object' && clip.fullLecture !== null
          ? clip.fullLecture.id
          : clip.fullLecture
      expect(parentId).toBeDefined()

      // Parent was auto-created with type='full' and the original URL.
      const parent = await payload.findByID({
        collection: 'lectures',
        id: parentId as number,
      })
      expect(parent.type).toBe('full')
      expect(parent.nirmalVidyaVimeoUrl).toBe(newUrl)

      // Clip's URL is nulled.
      expect(clip.nirmalVidyaVimeoUrl).toBeNull()
    })

    it('accepts a clip with only fullLecture set (no URL)', async () => {
      const parent = await testData.createLecture(payload)
      const clip = await payload.create({
        collection: 'lectures',

        data: createData<'lectures'>({ type: 'clip', fullLecture: parent.id }),
      })
      const parentId =
        typeof clip.fullLecture === 'object' && clip.fullLecture !== null
          ? clip.fullLecture.id
          : clip.fullLecture
      expect(parentId).toBe(parent.id)
      expect(clip.nirmalVidyaVimeoUrl).toBeNull()
      expect(clip.metadata).toBeFalsy()
    })

    it('does not call the Nirmala Vidya API when a clip is created with fullLecture', async () => {
      const parent = await testData.createLecture(payload)
      const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
      const callCountBefore = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length

      await payload.create({
        collection: 'lectures',

        data: createData<'lectures'>({ type: 'clip', fullLecture: parent.id }),
      })

      expect(vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length).toBe(callCountBefore)
    })
  })

  describe('NirmalaVidyaResponseSchema', () => {
    it('coerces subtitles: null to an empty array', async () => {
      const { NirmalaVidyaResponseSchema } = await vi.importActual<
        typeof import('@/lib/lectures/nirmalaVidyaApi')
      >('@/lib/lectures/nirmalaVidyaApi')

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
        typeof import('@/lib/lectures/nirmalaVidyaApi')
      >('@/lib/lectures/nirmalaVidyaApi')

      const parsed = NirmalaVidyaResponseSchema.parse({
        name: 'Lecture',
        files: [{ link: 'https://example.com/stream.m3u8', quality: 'hls' }],
      })

      expect(parsed.subtitles).toEqual([])
    })
  })

  describe('extractVimeoId', () => {
    it('parses https://vimeo.com/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/lectures/nirmalaVidyaApi')
      expect(extractVimeoId('https://vimeo.com/123456789')).toBe('123456789')
    })

    it('parses https://player.vimeo.com/video/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/lectures/nirmalaVidyaApi')
      expect(extractVimeoId('https://player.vimeo.com/video/123456789')).toBe('123456789')
    })

    it('parses https://vimeo.com/channels/name/123456789', async () => {
      const { extractVimeoId } = await import('@/lib/lectures/nirmalaVidyaApi')
      expect(extractVimeoId('https://vimeo.com/channels/name/123456789')).toBe('123456789')
    })

    it('returns null for non-Vimeo URLs', async () => {
      const { extractVimeoId } = await import('@/lib/lectures/nirmalaVidyaApi')
      expect(extractVimeoId('https://youtube.com/watch?v=abc123')).toBeNull()
      expect(extractVimeoId('https://example.com/123456')).toBeNull()
      expect(extractVimeoId('not-a-url')).toBeNull()
    })
  })
})
