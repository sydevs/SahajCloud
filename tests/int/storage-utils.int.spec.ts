/**
 * Integration tests for storage utilities and URL field factories
 *
 * Tests the URL field generation logic, MIME utilities, and R2 adapter filename sanitization.
 *
 * NOTE: These tests use dynamic imports to ensure environment variables are set
 * BEFORE modules are loaded. This is necessary because the storage adapters now
 * use validated serverEnv which is evaluated at module load time.
 */
import type { S3Client } from '@aws-sdk/client-s3'
import type { Field, FieldHook } from 'payload'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { generateCloudflareImageId, generateR2Key } from '@/plugins/storage/filenameUtils'
import { getMimeCategory } from '@/plugins/storage/mimeUtils'
import {
  createR2FilenameBeforeOperationHook,
  R2_PREASSIGNED_FILENAME_CONTEXT_KEY,
} from '@/plugins/storage/r2FilenameHook'

// Helper to extract the afterRead hook from a field
const getAfterReadHook = (field: Field): FieldHook | undefined => {
  if ('hooks' in field && field.hooks?.afterRead?.[0]) {
    return field.hooks.afterRead[0]
  }
  return undefined
}

// Type for test hook data
type TestHookData = { filename?: string; mimeType?: string; url?: string } | null

// Helper to call a hook with test data (avoids `as never` casts throughout tests)
const callHook = (hook: FieldHook, data: TestHookData): unknown => {
  return hook({ data } as Parameters<FieldHook>[0])
}

// Mock S3 client for R2 adapter tests. `send` captures the AWS SDK command
// objects so assertions can inspect `command.input` (Bucket / Key / Body).
const makeMockS3 = () => {
  const send = vi.fn().mockResolvedValue({})
  return { client: { send } as unknown as S3Client, send }
}

// Read the Key off a captured PutObject/DeleteObject command.
const sentKey = (send: ReturnType<typeof vi.fn>, callIndex = 0): string =>
  (send.mock.calls[callIndex][0] as { input: { Key: string } }).input.Key

describe('URL Field Factories', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment and module cache for each test
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('virtualUrlField', () => {
    it('generates Cloudflare Images URL when CLOUDFLARE_IMAGES_DELIVERY_URL is set', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      // Dynamic import AFTER setting env vars
      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      expect(hook).toBeDefined()

      const url = callHook(hook!, { filename: 'test-image-id' })
      expect(url).toBe('https://imagedelivery.net/abc123/test-image-id/public')
    })

    it('falls back to local URL when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'test-image.jpg' })
      expect(url).toBe('/api/images/file/test-image.jpg')
    })

    it('generates R2 URL when CLOUDFLARE_R2_DELIVERY_URL is set', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'meditations',
        adapter: 'r2',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'meditation-file.mp3' })
      expect(url).toBe('https://assets.example.com/meditation-file.mp3')
    })

    it('falls back to data.url when R2 delivery URL is not set', async () => {
      delete process.env.CLOUDFLARE_R2_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'meditations',
        adapter: 'r2',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {
        filename: 'meditation.mp3',
        url: '/api/meditations/file/meditation.mp3',
      })
      expect(url).toBe('/api/meditations/file/meditation.mp3')
    })

    it('returns undefined when collection is not an upload collection and no filename', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'pages',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { url: '/api/pages/some-page' })
      expect(url).toBeUndefined()
    })

    it('returns undefined when no filename or url is provided', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {})
      expect(url).toBeUndefined()
    })

    it('handles null data gracefully', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/plugins/storage/urlFields')

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, null)
      expect(url).toBeUndefined()
    })
  })

  describe('previewUrlField', () => {
    it('generates Cloudflare Stream thumbnail URL for videos', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe(
        'https://customer-test.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg?height=320',
      )
    })

    it('generates Cloudflare Images thumbnail URL for images', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image-id', mimeType: 'image/jpeg' })
      expect(url).toBe(
        'https://imagedelivery.net/abc123/image-id/format=auto,width=320,height=320,fit=cover',
      )
    })

    it('returns undefined for videos when CLOUDFLARE_STREAM_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video.mp4', mimeType: 'video/mp4' })
      expect(url).toBeUndefined()
    })

    it('falls back to local URL for images when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image.jpg', mimeType: 'image/jpeg' })
      expect(url).toBe('/api/frames/file/image.jpg')
    })

    it('uses default height parameter when not explicitly provided', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe(
        'https://customer-test.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg?height=320',
      )
    })

    it('handles files with no MIME type as other', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'files', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf' })
      expect(url).toBe('/api/files/file/document.pdf')
    })

    it('returns undefined when no filename is provided', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {})
      expect(url).toBeUndefined()
    })

    it('handles null data gracefully', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/plugins/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, null)
      expect(url).toBeUndefined()
    })
  })

  describe('mixedMediaUrlField', () => {
    it('generates Cloudflare Images URL for images', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image-id', mimeType: 'image/png' })
      expect(url).toBe('https://imagedelivery.net/abc123/image-id/public')
    })

    it('generates Cloudflare Stream HLS manifest URL for videos', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      // `url` resolves to the HLS manifest (live immediately after transcode);
      // the MP4 download 404s until the Stream webhook enables it (see `mp4Url`).
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/manifest/video.m3u8')
    })

    it('generates R2 URL for other file types', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf', mimeType: 'application/pdf' })
      expect(url).toBe('https://assets.example.com/document.pdf')
    })

    it('falls back to local URL for images when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image.jpg', mimeType: 'image/jpeg' })
      expect(url).toBe('/api/files/file/image.jpg')
    })

    it('falls back to local URL for videos when CLOUDFLARE_STREAM_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video.mp4', mimeType: 'video/mp4' })
      expect(url).toBe('/api/files/file/video.mp4')
    })

    it('falls back to local URL when R2 delivery URL is not set', async () => {
      delete process.env.CLOUDFLARE_R2_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf', mimeType: 'application/pdf' })
      expect(url).toBe('/api/files/file/document.pdf')
    })

    it('handles files with no MIME type as other category', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'file.txt' })
      expect(url).toBe('https://assets.example.com/file.txt')
    })

    it('returns undefined when no filename or url is provided', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {})
      expect(url).toBeUndefined()
    })

    it('handles null data gracefully', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/plugins/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, null)
      expect(url).toBeUndefined()
    })
  })

  describe('hlsUrlField', () => {
    it('returns the HLS manifest URL for video MIME types', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { hlsUrlField } = await import('@/plugins/storage/urlFields')
      const field = hlsUrlField({ collection: 'videos' })
      expect((field as { name: string }).name).toBe('hlsUrl')

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/manifest/video.m3u8')
    })

    it('returns null for non-video MIME types', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { hlsUrlField } = await import('@/plugins/storage/urlFields')
      const field = hlsUrlField({ collection: 'frames' })

      const hook = getAfterReadHook(field)
      expect(callHook(hook!, { filename: 'image-id', mimeType: 'image/png' })).toBeNull()
      expect(callHook(hook!, { filename: 'doc.pdf', mimeType: 'application/pdf' })).toBeNull()
    })

    it('falls back to local URL when CLOUDFLARE_STREAM_DELIVERY_URL is not set (video)', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { hlsUrlField } = await import('@/plugins/storage/urlFields')
      const field = hlsUrlField({ collection: 'frames' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video.mp4', mimeType: 'video/mp4' })
      expect(url).toBe('/api/frames/file/video.mp4')
    })
  })

  describe('mp4UrlField', () => {
    it('returns the MP4 download URL for video MIME types', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mp4UrlField } = await import('@/plugins/storage/urlFields')
      const field = mp4UrlField({ collection: 'videos' })
      expect((field as { name: string }).name).toBe('mp4Url')

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/downloads/default.mp4')
    })

    it('returns null for non-video MIME types (mixed-media collections)', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mp4UrlField } = await import('@/plugins/storage/urlFields')
      const field = mp4UrlField({ collection: 'frames' })

      const hook = getAfterReadHook(field)
      expect(callHook(hook!, { filename: 'image.jpg', mimeType: 'image/jpeg' })).toBeNull()
      expect(callHook(hook!, { filename: 'audio.mp3', mimeType: 'audio/mpeg' })).toBeNull()
    })
  })
})

describe('MIME Utilities', () => {
  describe('getMimeCategory', () => {
    it('categorizes image MIME types', () => {
      expect(getMimeCategory('image/jpeg')).toBe('image')
      expect(getMimeCategory('image/png')).toBe('image')
      expect(getMimeCategory('image/webp')).toBe('image')
      expect(getMimeCategory('image/svg+xml')).toBe('image')
    })

    it('categorizes video MIME types', () => {
      expect(getMimeCategory('video/mp4')).toBe('video')
      expect(getMimeCategory('video/webm')).toBe('video')
      expect(getMimeCategory('video/quicktime')).toBe('video')
    })

    it('categorizes other MIME types as other', () => {
      expect(getMimeCategory('audio/mpeg')).toBe('other')
      expect(getMimeCategory('application/pdf')).toBe('other')
      expect(getMimeCategory('text/plain')).toBe('other')
    })

    it('handles undefined MIME type', () => {
      expect(getMimeCategory(undefined)).toBe('other')
    })

    it('handles empty string', () => {
      expect(getMimeCategory('')).toBe('other')
    })
  })
})

describe('Filename Utilities', () => {
  describe('generateR2Key', () => {
    it('converts filename to URL-safe slug with extension', () => {
      const result = generateR2Key('My Audio File.mp3')
      expect(result).toMatch(/^my-audio-file-[a-z0-9]{6}\.mp3$/)
    })

    it('removes special characters', () => {
      const result = generateR2Key('File (1) [test].mp3')
      expect(result).toMatch(/^file-1-test-[a-z0-9]{6}\.mp3$/)
    })

    it('preserves only the final file extension', () => {
      const result = generateR2Key('test.tar.gz')
      // Multi-dot filename: dots in base are removed (not converted to hyphens)
      expect(result).toMatch(/^testtar-[a-z0-9]{6}\.gz$/)
    })

    it('handles files without extension', () => {
      const result = generateR2Key('README')
      expect(result).toMatch(/^readme-[a-z0-9]{6}$/)
    })

    it('adds a unique random suffix each call', () => {
      const result1 = generateR2Key('test.mp3')
      const result2 = generateR2Key('test.mp3')
      expect(result1).not.toBe(result2)
      expect(result1).toMatch(/^test-[a-z0-9]{6}\.mp3$/)
      expect(result2).toMatch(/^test-[a-z0-9]{6}\.mp3$/)
    })

    it('handles Unicode characters', () => {
      const result = generateR2Key('文件名.mp3')
      expect(result).toMatch(/^[a-z0-9-]+\.mp3$/)
    })

    it('handles multiple dots in filename', () => {
      const result = generateR2Key('my.file.name.mp3')
      expect(result).toMatch(/^myfilename-[a-z0-9]{6}\.mp3$/)
    })
  })

  describe('generateCloudflareImageId', () => {
    it('produces a slug with no extension', () => {
      const result = generateCloudflareImageId('My Photo.jpg')
      expect(result).toMatch(/^my-photo-[a-z0-9]{6}$/)
      expect(result).not.toContain('.')
    })

    it('handles filenames without extensions', () => {
      const result = generateCloudflareImageId('README')
      expect(result).toMatch(/^readme-[a-z0-9]{6}$/)
    })

    it('handles filenames with multiple dots', () => {
      const result = generateCloudflareImageId('my.lecture.thumbnail.jpg')
      // Final ".jpg" is dropped; dots in base are stripped by slugify
      expect(result).toMatch(/^mylecturethumbnail-[a-z0-9]{6}$/)
    })

    it('adds a unique random suffix each call', () => {
      const a = generateCloudflareImageId('photo.jpg')
      const b = generateCloudflareImageId('photo.jpg')
      expect(a).not.toBe(b)
    })

    it('strips characters CF Image IDs cannot contain', () => {
      const result = generateCloudflareImageId('weird/name:with spaces?.png')
      expect(result).toMatch(/^[a-z0-9-]+$/)
    })

    it('does not start with a hyphen for all-Unicode filenames', () => {
      // slugify(strict) drops all non-ASCII; the helper falls back to "file"
      // so the resulting ID never begins with a hyphen (CF Images rejects those).
      const result = generateCloudflareImageId('文件名.jpg')
      expect(result).toMatch(/^file-[a-z0-9]{6}$/)
      expect(result.startsWith('-')).toBe(false)
    })
  })
})

describe('R2 filename preassignment hook', () => {
  // Pin to the production Railway environment so storage isolation is OFF —
  // these assert the baseline R2 key the hook preassigns (no preview prefix).
  // Non-prod prefixing is covered in tests/unit/previewIsolation.spec.ts.
  const originalEnvName = process.env.RAILWAY_ENVIRONMENT_NAME
  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
  })
  afterEach(() => {
    if (originalEnvName === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME
    else process.env.RAILWAY_ENVIRONMENT_NAME = originalEnvName
  })

  const callR2Hook = async (
    mode: 'always' | 'other-only',
    req: Record<string, unknown>,
    operation: 'create' | 'update' = 'create',
  ) => {
    const hook = createR2FilenameBeforeOperationHook(mode)
    const args = { req }
    const result = await hook({ args, operation } as never)
    return { args, result }
  }

  it('preassigns a generated R2 key before Payload derives upload metadata', async () => {
    const req = {
      file: {
        name: 'Ready to Upload -- Meditation -- Path Step 18.mp3',
        mimetype: 'audio/mpeg',
      },
    }

    const { args, result } = await callR2Hook('always', req)

    expect(req.file.name).toMatch(/^ready-to-upload-meditation-path-step-18-[a-z0-9]{6}\.mp3$/)
    expect(req).toHaveProperty(['context', R2_PREASSIGNED_FILENAME_CONTEXT_KEY], true)
    expect(result).toBe(args)
  })

  it('only preassigns other-file keys for mixed media collections', async () => {
    const imageReq = {
      file: {
        name: 'Hero Image.png',
        mimetype: 'image/png',
      },
    }
    const audioReq = {
      file: {
        name: 'Intro Audio.mp3',
        mimetype: 'audio/mpeg',
      },
    }

    await callR2Hook('other-only', imageReq)
    await callR2Hook('other-only', audioReq)

    expect(imageReq.file.name).toBe('Hero Image.png')
    expect(imageReq).not.toHaveProperty('context')
    expect(audioReq.file.name).toMatch(/^intro-audio-[a-z0-9]{6}\.mp3$/)
    expect(audioReq).toHaveProperty(['context', R2_PREASSIGNED_FILENAME_CONTEXT_KEY], true)
  })
})

describe('Storage Adapter handleUpload', () => {
  const originalEnv = process.env
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
      CLOUDFLARE_IMAGES_DELIVERY_URL: 'https://imagedelivery.net/test-hash',
      CLOUDFLARE_STREAM_DELIVERY_URL: 'https://customer-test.cloudflarestream.com',
      CLOUDFLARE_R2_DELIVERY_URL: 'https://assets.test',
      // Pin to the production Railway environment so storage isolation is OFF —
      // these assert the baseline (production) upload behaviour. Non-prod
      // prefixing/tagging is covered in the unit specs.
      RAILWAY_ENVIRONMENT_NAME: 'production',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // Build a minimal req object with logger stubs
  const makeReq = () => ({
    payload: {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    },
    file: { name: 'original-input.jpg' },
    context: {} as Record<string, unknown>,
  })

  const makeImageFile = (filename = 'lecture-thumbnail-167289004.jpg') => ({
    filename,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mimeType: 'image/jpeg',
    filesize: 4,
  })

  const makeVideoFile = (filename = 'my-video.mp4') => ({
    filename,
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x20]),
    mimeType: 'video/mp4',
    filesize: 4,
  })

  describe('cloudflareImagesAdapter.handleUpload', () => {
    it('sends a custom id and returns filename + fileMetadata from the response', async () => {
      const { cloudflareImagesAdapter } = await import('@/plugins/storage/cloudflareImagesAdapter')
      let sentFormData: FormData | undefined

      const fetchMock = vi.fn(async (_url, init) => {
        sentFormData = init?.body as FormData
        const sentId = sentFormData.get('id') as string
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { id: sentId, filename: 'lecture-thumbnail-167289004.jpg' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
      vi.stubGlobal('fetch', fetchMock)

      const adapter = cloudflareImagesAdapter({
        accountId: 'test-account',
        apiKey: 'test-key',
        deliveryUrl: 'https://imagedelivery.net/test-hash',
      })({ collection: { slug: 'images' } as never, prefix: undefined })

      const data: Record<string, unknown> = {}
      const file = makeImageFile()
      const req = makeReq()

      const result = await adapter.handleUpload({
        data,
        file: file as never,
        req: req as never,
        clientUploadContext: undefined,
        collection: { slug: 'images' } as never,
      })

      expect(fetchMock).toHaveBeenCalledOnce()
      expect(sentFormData).toBeDefined()
      const sentId = sentFormData!.get('id')
      expect(sentId).toMatch(/^lecture-thumbnail-167289004-[a-z0-9]{6}$/)

      expect(result).toEqual({
        filename: sentId,
        fileMetadata: { originalFilename: 'lecture-thumbnail-167289004.jpg' },
      })

      // In-memory mirror — downstream afterChange hooks see the new filename
      expect(data.filename).toBe(sentId)
      expect(data.fileMetadata).toEqual({ originalFilename: 'lecture-thumbnail-167289004.jpg' })
      expect(file.filename).toBe(sentId)
    })

    it('throws when Cloudflare returns success:false', async () => {
      const { cloudflareImagesAdapter } = await import('@/plugins/storage/cloudflareImagesAdapter')
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                success: false,
                errors: [{ code: 5400, message: 'Duplicate ID' }],
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            ),
        ),
      )

      const adapter = cloudflareImagesAdapter({
        accountId: 'test-account',
        apiKey: 'test-key',
        deliveryUrl: 'https://imagedelivery.net/test-hash',
      })({ collection: { slug: 'images' } as never, prefix: undefined })

      await expect(
        adapter.handleUpload({
          data: {},
          file: makeImageFile() as never,
          req: makeReq() as never,
          clientUploadContext: undefined,
          collection: { slug: 'images' } as never,
        }),
      ).rejects.toThrow(/Duplicate ID/)
    })
  })

  describe('cloudflareStreamAdapter.handleUpload', () => {
    it('returns the CF-generated videoId as filename and does not send a custom id', async () => {
      const { cloudflareStreamAdapter } = await import('@/plugins/storage/cloudflareStreamAdapter')
      let sentFormData: FormData | undefined

      const fetchMock = vi.fn(async (_url, init) => {
        sentFormData = init?.body as FormData
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { uid: 'cf-video-uid-abc123' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
      vi.stubGlobal('fetch', fetchMock)

      const adapter = cloudflareStreamAdapter({
        accountId: 'test-account',
        apiKey: 'test-key',
        deliveryUrl: 'https://customer-test.cloudflarestream.com',
      })({ collection: { slug: 'frames' } as never, prefix: undefined })

      const data: Record<string, unknown> = {}
      const file = makeVideoFile()

      const result = await adapter.handleUpload({
        data,
        file: file as never,
        req: makeReq() as never,
        clientUploadContext: undefined,
        collection: { slug: 'frames' } as never,
      })

      // Stream API doesn't accept custom IDs — make sure we didn't send one
      expect(sentFormData!.has('id')).toBe(false)

      expect(result).toEqual({
        filename: 'cf-video-uid-abc123',
        fileMetadata: { originalFilename: 'my-video.mp4' },
      })
      expect(data.filename).toBe('cf-video-uid-abc123')
      expect(file.filename).toBe('cf-video-uid-abc123')
    })
  })

  describe('r2NativeAdapter.handleUpload', () => {
    it('writes a sanitized R2 key and returns it as the filename', async () => {
      const { r2NativeAdapter } = await import('@/plugins/storage/r2NativeAdapter')

      const { client, send } = makeMockS3()

      const adapter = r2NativeAdapter({
        client,
        bucket: 'test-bucket',
        publicUrl: 'https://assets.test',
      })({ collection: { slug: 'meditations' } as never, prefix: 'meditations' })

      const data: Record<string, unknown> = {}
      const file = {
        filename: 'My Audio (1).mp3',
        buffer: Buffer.from([0x00, 0x01]),
        mimeType: 'audio/mpeg',
        filesize: 2,
      }

      const result = await adapter.handleUpload({
        data,
        file: file as never,
        req: makeReq() as never,
        clientUploadContext: undefined,
        collection: { slug: 'meditations' } as never,
      })

      expect(result).toMatchObject({
        filename: expect.stringMatching(/^my-audio-1-[a-z0-9]{6}\.mp3$/),
      })
      expect(send).toHaveBeenCalledOnce()
      expect(sentKey(send)).toBe(`meditations/${(result as { filename: string }).filename}`)
      expect(data.filename).toBe((result as { filename: string }).filename)
    })

    it('reuses a preassigned R2 key instead of appending a second suffix', async () => {
      const { r2NativeAdapter } = await import('@/plugins/storage/r2NativeAdapter')

      const { client, send } = makeMockS3()

      const adapter = r2NativeAdapter({
        client,
        bucket: 'test-bucket',
        publicUrl: 'https://assets.test',
      })({ collection: { slug: 'meditations' } as never, prefix: 'meditations' })

      const data: Record<string, unknown> = {}
      const file = {
        filename: 'my-audio-1-abc123.mp3',
        buffer: Buffer.from([0x00, 0x01]),
        mimeType: 'audio/mpeg',
        filesize: 2,
      }
      const req = makeReq()
      req.context[R2_PREASSIGNED_FILENAME_CONTEXT_KEY] = true

      const result = await adapter.handleUpload({
        data,
        file: file as never,
        req: req as never,
        clientUploadContext: undefined,
        collection: { slug: 'meditations' } as never,
      })

      // Returns undefined to skip the cloud-storage plugin's follow-up payload.update()
      // (the filename is already persisted by beforeChange, so no update is needed).
      expect(result).toBeUndefined()
      expect(send).toHaveBeenCalledOnce()
      expect(sentKey(send)).toBe('meditations/my-audio-1-abc123.mp3')
      // applyFilename still runs, keeping in-memory state consistent
      expect(data.filename).toBe('my-audio-1-abc123.mp3')
    })
  })

  describe('mixedMediaAdapter.handleUpload', () => {
    it('forwards the inner adapter return value (filename + fileMetadata)', async () => {
      const { mixedMediaAdapter } = await import('@/plugins/storage/mixedMediaAdapter')

      // Inner adapter mock that returns a known payload — proves the mixed
      // adapter doesn't accidentally swallow the return.
      const innerReturn = {
        filename: 'inner-image-id-abc123',
        fileMetadata: { originalFilename: 'photo.jpg' },
      }
      const innerHandleUpload = vi.fn().mockResolvedValue(innerReturn)
      const innerAdapter = vi.fn().mockReturnValue({
        name: 'inner-images',
        handleUpload: innerHandleUpload,
        handleDelete: vi.fn(),
        staticHandler: vi.fn(),
      })

      const r2Adapter = vi.fn().mockReturnValue({
        name: 'r2',
        handleUpload: vi.fn(),
        handleDelete: vi.fn(),
        staticHandler: vi.fn(),
      })

      const adapter = mixedMediaAdapter({
        routes: { 'image/': innerAdapter as never },
        r2Adapter: r2Adapter as never,
      })({ collection: { slug: 'files' } as never, prefix: undefined })

      const args = {
        data: {},
        file: makeImageFile() as never,
        req: makeReq() as never,
        clientUploadContext: undefined,
        collection: { slug: 'files' } as never,
      }

      const result = await adapter.handleUpload(args)

      expect(innerHandleUpload).toHaveBeenCalledOnce()
      expect(result).toEqual(innerReturn)
    })
  })
})

/**
 * End-to-end wiring test for the R2 filename preassignment.
 *
 * Catches the bug class this PR exists to prevent: a new R2-backed collection
 * added to `cloudStoragePlugin`'s collections block but missing from
 * `r2FilenameHookModes`, which would silently reintroduce DB↔R2 filename drift.
 *
 * Drives `storagePlugin` directly with a synthetic config (R2 S3 creds come from
 * env), captures the hooks it attaches, and verifies hook + adapter cooperate
 * through the actual contract (preassignment → adapter no-op).
 */
describe('storagePlugin R2 filename hook wiring', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/payload_test',
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      CLOUDFLARE_API_KEY: 'test-api-key-with-20-chars-min',
      CLOUDFLARE_IMAGES_DELIVERY_URL: 'https://imagedelivery.net/test-hash',
      CLOUDFLARE_STREAM_DELIVERY_URL: 'https://customer-test.cloudflarestream.com',
      CLOUDFLARE_R2_DELIVERY_URL: 'https://assets.test',
      R2_BUCKET: 'test-bucket',
      R2_ACCESS_KEY_ID: 'test-access-key-id',
      R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
      // Pin to the production Railway environment so storage isolation is OFF —
      // this verifies the baseline hook→adapter key contract (no preview prefix).
      RAILWAY_ENVIRONMENT_NAME: 'production',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  // Minimal config shape that `storagePlugin` reads. We don't need a real
  // SanitizedConfig, but `cloudStoragePlugin` iterates `collection.fields`
  // when injecting its own field hooks, so an empty array is required.
  const buildSyntheticConfig = (slugs: string[]) => ({
    collections: slugs.map((slug) => ({ slug, hooks: {}, fields: [] })),
  })

  const runStoragePlugin = async (slugs: string[]) => {
    const { storagePlugin } = await import('@/plugins/storage/storagePlugin')
    const inputConfig = buildSyntheticConfig(slugs)
    return await storagePlugin({ enabled: true })(inputConfig as never)
  }

  it('attaches a beforeOperation hook to every R2-backed collection (and only those)', async () => {
    // Cover every collection currently in `r2FilenameHookModes` plus a
    // non-R2 collection (`pages`) and the pure Cloudflare-Images collection
    // (`images`) which must NOT receive the hook.
    const r2Backed = ['meditations', 'songs', 'user-choices', 'song-tags', 'frames', 'files']
    const nonR2 = ['pages', 'images', 'videos']
    const result = (await runStoragePlugin([...r2Backed, ...nonR2])) as {
      collections: Array<{ slug: string; hooks?: { beforeOperation?: unknown[] } }>
    }

    for (const slug of r2Backed) {
      const collection = result.collections.find((c) => c.slug === slug)
      expect(
        collection?.hooks?.beforeOperation?.length,
        `expected ${slug} to receive a preassignment hook`,
      ).toBeGreaterThanOrEqual(1)
    }

    for (const slug of nonR2) {
      const collection = result.collections.find((c) => c.slug === slug)
      expect(
        collection?.hooks?.beforeOperation?.length ?? 0,
        `expected ${slug} NOT to receive a preassignment hook`,
      ).toBe(0)
    }
  })

  it('round-trips a meditation upload: hook preassigns, adapter respects the flag', async () => {
    // The DB↔R2 drift bug manifests when the hook's renamed filename is NOT
    // the same as the key the adapter uploads under. Drive both through the
    // real wiring and assert they agree.
    const { client, send } = makeMockS3()

    const result = (await runStoragePlugin(['meditations'])) as {
      collections: Array<{ slug: string; hooks?: { beforeOperation?: unknown[] } }>
    }

    const meditationsCollection = result.collections.find((c) => c.slug === 'meditations')
    const beforeOpHook = meditationsCollection?.hooks?.beforeOperation?.[0] as (args: {
      args: { req: Record<string, unknown> }
      operation: 'create' | 'update'
    }) => unknown
    expect(beforeOpHook).toBeDefined()

    // Stage 1 — Payload's `beforeOperation` phase: hook renames req.file.name
    // to a final R2 key and sets the context flag.
    const req: Record<string, unknown> = {
      file: { name: 'My Audio Track (1).mp3', mimetype: 'audio/mpeg' },
      context: {} as Record<string, unknown>,
    }
    await beforeOpHook({ args: { req }, operation: 'create' })

    const preassignedFilename = (req.file as { name: string }).name
    expect(preassignedFilename).toMatch(/^my-audio-track-1-[a-z0-9]{6}\.mp3$/)
    expect(req.context).toHaveProperty(R2_PREASSIGNED_FILENAME_CONTEXT_KEY, true)

    // Stage 2 — Payload's `afterChange` phase: storage adapter uploads. The
    // `file.filename` Payload passes here mirrors what was written to the DB
    // (= req.file.name post-hook). The adapter must NOT regenerate the key.
    const { r2NativeAdapter } = await import('@/plugins/storage/r2NativeAdapter')
    const adapter = r2NativeAdapter({
      client,
      bucket: 'test-bucket',
      publicUrl: 'https://assets.test',
    })({
      collection: { slug: 'meditations' } as never,
      prefix: 'meditations',
    })

    const data: Record<string, unknown> = {}
    const adapterResult = await adapter.handleUpload({
      data,
      file: {
        filename: preassignedFilename,
        buffer: Buffer.from([0x00]),
        mimeType: 'audio/mpeg',
        filesize: 1,
      } as never,
      req: {
        ...req,
        payload: { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      } as never,
      clientUploadContext: undefined,
      collection: { slug: 'meditations' } as never,
    })

    // Adapter returns undefined — filename is already in the DB from beforeChange,
    // so no follow-up payload.update() should be triggered by the plugin.
    // In-memory state (data.filename) and the actual R2 key must still agree.
    expect(adapterResult).toBeUndefined()
    expect(data.filename).toBe(preassignedFilename)
    expect(send).toHaveBeenCalledOnce()
    expect(sentKey(send)).toBe(`meditations/${preassignedFilename}`)
  })
})
