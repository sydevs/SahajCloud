/**
 * Integration tests for storage utilities and URL field factories
 *
 * Tests the URL field generation logic, MIME utilities, and R2 adapter filename sanitization.
 *
 * NOTE: These tests use dynamic imports to ensure environment variables are set
 * BEFORE modules are loaded. This is necessary because the storage adapters now
 * use validated serverEnv which is evaluated at module load time.
 */
import type { Field, FieldHook } from 'payload'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { getMimeCategory } from '@/lib/storage/mimeUtils'
import { sanitizeFilename } from '@/lib/storage/r2NativeAdapter'

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
      const { virtualUrlField } = await import('@/lib/storage/urlFields')

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

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'test-image.jpg' })
      expect(url).toBe('/api/images/file/test-image.jpg')
    })

    it('generates Cloudflare Stream URL when CLOUDFLARE_STREAM_DELIVERY_URL is set', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

      const field = virtualUrlField({
        collection: 'frames',
        adapter: 'cloudflare-stream',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id' })
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/downloads/default.mp4')
    })

    it('falls back to local URL when CLOUDFLARE_STREAM_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

      const field = virtualUrlField({
        collection: 'frames',
        adapter: 'cloudflare-stream',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'test-video.mp4' })
      expect(url).toBe('/api/frames/file/test-video.mp4')
    })

    it('generates R2 URL when CLOUDFLARE_R2_DELIVERY_URL is set', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

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

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

      const field = virtualUrlField({
        collection: 'meditations',
        adapter: 'r2',
      })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'meditation.mp3', url: '/api/meditations/file/meditation.mp3' })
      expect(url).toBe('/api/meditations/file/meditation.mp3')
    })

    it('returns undefined when collection is not an upload collection and no filename', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

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

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

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

      const { virtualUrlField } = await import('@/lib/storage/urlFields')

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

      const { previewUrlField } = await import('@/lib/storage/urlFields')

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

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image-id', mimeType: 'image/jpeg' })
      expect(url).toBe('https://imagedelivery.net/abc123/image-id/format=auto,width=320,height=320,fit=cover')
    })

    it('returns undefined for videos when CLOUDFLARE_STREAM_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video.mp4', mimeType: 'video/mp4' })
      expect(url).toBeUndefined()
    })

    it('falls back to local URL for images when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image.jpg', mimeType: 'image/jpeg' })
      expect(url).toBe('/api/frames/file/image.jpg')
    })

    it('uses default height parameter when not explicitly provided', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'frames' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg?height=320')
    })

    it('handles files with no MIME type as other', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'files', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf' })
      expect(url).toBe('/api/files/file/document.pdf')
    })

    it('returns undefined when no filename is provided', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

      const field = previewUrlField({ collection: 'frames', width: 320, height: 320 })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {})
      expect(url).toBeUndefined()
    })

    it('handles null data gracefully', async () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { previewUrlField } = await import('@/lib/storage/urlFields')

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

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image-id', mimeType: 'image/png' })
      expect(url).toBe('https://imagedelivery.net/abc123/image-id/public')
    })

    it('generates Cloudflare Stream MP4 URL for videos', async () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video-id', mimeType: 'video/mp4' })
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/downloads/default.mp4')
    })

    it('generates R2 URL for other file types', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf', mimeType: 'application/pdf' })
      expect(url).toBe('https://assets.example.com/document.pdf')
    })

    it('falls back to local URL for images when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'image.jpg', mimeType: 'image/jpeg' })
      expect(url).toBe('/api/files/file/image.jpg')
    })

    it('falls back to local URL for videos when CLOUDFLARE_STREAM_DELIVERY_URL is not set', async () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'video.mp4', mimeType: 'video/mp4' })
      expect(url).toBe('/api/files/file/video.mp4')
    })

    it('falls back to local URL when R2 delivery URL is not set', async () => {
      delete process.env.CLOUDFLARE_R2_DELIVERY_URL
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'document.pdf', mimeType: 'application/pdf' })
      expect(url).toBe('/api/files/file/document.pdf')
    })

    it('handles files with no MIME type as other category', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, { filename: 'file.txt' })
      expect(url).toBe('https://assets.example.com/file.txt')
    })

    it('returns undefined when no filename or url is provided', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, {})
      expect(url).toBeUndefined()
    })

    it('handles null data gracefully', async () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'
      process.env.PAYLOAD_SECRET = 'test-secret-key-with-32-chars-minimum'

      const { mixedMediaUrlField } = await import('@/lib/storage/urlFields')

      const field = mixedMediaUrlField({ collection: 'files' })

      const hook = getAfterReadHook(field)
      const url = callHook(hook!, null)
      expect(url).toBeUndefined()
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

describe('R2 Native Adapter', () => {
  describe('sanitizeFilename', () => {
    it('converts filename to URL-safe slug', () => {
      const result = sanitizeFilename('My Audio File.mp3')
      expect(result).toMatch(/^my-audio-file-[a-z0-9]{8,11}\.mp3$/)
    })

    it('removes special characters', () => {
      const result = sanitizeFilename('File (1) [test].mp3')
      expect(result).toMatch(/^file-1-test-[a-z0-9]{8,11}\.mp3$/)
    })

    it('preserves file extension', () => {
      const result = sanitizeFilename('test.tar.gz')
      // Multi-dot filename: dots are removed (not converted to hyphens)
      expect(result).toMatch(/^testtar-[a-z0-9]{8,11}\.gz$/)
    })

    it('handles files without extension', () => {
      const result = sanitizeFilename('README')
      expect(result).toMatch(/^readme-[a-z0-9]{8,11}$/)
    })

    it('adds unique random suffix', () => {
      const result1 = sanitizeFilename('test.mp3')
      const result2 = sanitizeFilename('test.mp3')

      expect(result1).not.toBe(result2)
      expect(result1).toMatch(/^test-[a-z0-9]{8,11}\.mp3$/)
      expect(result2).toMatch(/^test-[a-z0-9]{8,11}\.mp3$/)
    })

    it('handles Unicode characters', () => {
      const result = sanitizeFilename('文件名.mp3')
      // Slugify converts non-ASCII to empty, then adds suffix
      expect(result).toMatch(/^[a-z0-9-]+\.mp3$/)
    })

    it('handles multiple dots in filename', () => {
      const result = sanitizeFilename('my.file.name.mp3')
      // Multi-dot filename: dots are removed (not converted to hyphens)
      expect(result).toMatch(/^myfilename-[a-z0-9]{8,11}\.mp3$/)
    })
  })
})
