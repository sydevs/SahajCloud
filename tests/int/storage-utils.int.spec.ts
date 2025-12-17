/**
 * Integration tests for storage utilities and URL field factories
 *
 * Tests the URL field generation logic and R2 adapter filename sanitization.
 */
import type { Field, FieldHook } from 'payload'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  virtualUrlField,
  previewUrlField,
  streamMp4UrlField,
} from '@/lib/storage/urlFields'
import { sanitizeFilename } from '@/lib/storage/r2NativeAdapter'

// Helper to extract the afterRead hook from a field
const getAfterReadHook = (field: Field): FieldHook | undefined => {
  if ('hooks' in field && field.hooks?.afterRead?.[0]) {
    return field.hooks.afterRead[0]
  }
  return undefined
}

describe('URL Field Factories', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment for each test
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('virtualUrlField', () => {
    it('generates Cloudflare Images URL when CLOUDFLARE_IMAGES_DELIVERY_URL is set', () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      expect(hook).toBeDefined()

      const url = hook!({ data: { filename: 'test-image-id' } } as never)
      expect(url).toBe('https://imagedelivery.net/abc123/test-image-id/')
    })

    it('falls back to local URL when CLOUDFLARE_IMAGES_DELIVERY_URL is not set', () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL

      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'test-image.jpg' } } as never)
      expect(url).toBe('/api/images/file/test-image.jpg')
    })

    it('generates Cloudflare Stream URL when CLOUDFLARE_STREAM_DELIVERY_URL is set', () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

      const field = virtualUrlField({
        collection: 'frames',
        adapter: 'cloudflare-stream',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'video-id' } } as never)
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/downloads/default.mp4')
    })

    it('falls back to local URL when CLOUDFLARE_STREAM_DELIVERY_URL is not set', () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL

      const field = virtualUrlField({
        collection: 'frames',
        adapter: 'cloudflare-stream',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'test-video.mp4' } } as never)
      expect(url).toBe('/api/frames/file/test-video.mp4')
    })

    it('generates R2 URL when CLOUDFLARE_R2_DELIVERY_URL is set', () => {
      process.env.CLOUDFLARE_R2_DELIVERY_URL = 'https://assets.example.com'

      const field = virtualUrlField({
        collection: 'meditations',
        adapter: 'r2',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'meditation-file.mp3' } } as never)
      expect(url).toBe('https://assets.example.com/meditation-file.mp3')
    })

    it('falls back to data.url when R2 delivery URL is not set', () => {
      delete process.env.CLOUDFLARE_R2_DELIVERY_URL

      const field = virtualUrlField({
        collection: 'meditations',
        adapter: 'r2',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'test.mp3', url: '/local/path/test.mp3' } } as never)
      expect(url).toBe('/local/path/test.mp3')
    })

    it('returns undefined when no filename is present', () => {
      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: {} } as never)
      expect(url).toBeUndefined()
    })

    it('returns undefined when data is null', () => {
      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: null } as never)
      expect(url).toBeUndefined()
    })

    it('creates a virtual field with correct name and type', () => {
      const field = virtualUrlField({
        collection: 'images',
        adapter: 'cloudflare-images',
      })

      expect(field.name).toBe('url')
      expect(field.type).toBe('text')
      expect('virtual' in field && field.virtual).toBe(true)
    })
  })

  describe('previewUrlField', () => {
    it('generates Cloudflare Stream thumbnail URL for videos', () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

      const field = previewUrlField({
        collection: 'frames',
        width: 320,
        height: 320,
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'video-id', mimeType: 'video/mp4' } } as never)
      expect(url).toBe(
        'https://customer-test.cloudflarestream.com/video-id/thumbnails/thumbnail.jpg?height=320',
      )
    })

    it('generates Cloudflare Images thumbnail URL for images', () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'

      const field = previewUrlField({
        collection: 'frames',
        width: 320,
        height: 320,
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'image-id', mimeType: 'image/jpeg' } } as never)
      expect(url).toBe('https://imagedelivery.net/abc123/image-id/format=auto,width=320,height=320,fit=cover')
    })

    it('uses default dimensions of 320x320', () => {
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net/abc123'

      const field = previewUrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'image-id', mimeType: 'image/jpeg' } } as never)
      expect(url).toContain('width=320')
      expect(url).toContain('height=320')
    })

    it('falls back to local URL for videos when Stream URL is not set', () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL

      const field = previewUrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'video.mp4', mimeType: 'video/mp4' } } as never)
      expect(url).toBe('/api/frames/file/video.mp4')
    })

    it('falls back to local URL for images when Images URL is not set', () => {
      delete process.env.CLOUDFLARE_IMAGES_DELIVERY_URL

      const field = previewUrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'image.jpg', mimeType: 'image/jpeg' } } as never)
      expect(url).toBe('/api/frames/file/image.jpg')
    })

    it('returns local URL for unknown MIME types', () => {
      const field = previewUrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'file.pdf', mimeType: 'application/pdf' } } as never)
      expect(url).toBe('/api/frames/file/file.pdf')
    })

    it('returns undefined when no filename', () => {
      const field = previewUrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { mimeType: 'video/mp4' } } as never)
      expect(url).toBeUndefined()
    })

    it('creates a field named previewUrl', () => {
      const field = previewUrlField({
        collection: 'frames',
      })

      expect(field.name).toBe('previewUrl')
      expect(field.type).toBe('text')
      expect('virtual' in field && field.virtual).toBe(true)
    })
  })

  describe('streamMp4UrlField', () => {
    it('generates Cloudflare Stream MP4 URL for videos', () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

      const field = streamMp4UrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'video-id', mimeType: 'video/mp4' } } as never)
      expect(url).toBe('https://customer-test.cloudflarestream.com/video-id/downloads/default.mp4')
    })

    it('returns undefined for non-video MIME types', () => {
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

      const field = streamMp4UrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'image.jpg', mimeType: 'image/jpeg' } } as never)
      expect(url).toBeUndefined()
    })

    it('returns undefined when no filename', () => {
      const field = streamMp4UrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { mimeType: 'video/mp4' } } as never)
      expect(url).toBeUndefined()
    })

    it('falls back to local URL when Stream URL is not set', () => {
      delete process.env.CLOUDFLARE_STREAM_DELIVERY_URL

      const field = streamMp4UrlField({
        collection: 'frames',
      })

      const hook = getAfterReadHook(field)
      const url = hook!({ data: { filename: 'video.mp4', mimeType: 'video/mp4' } } as never)
      expect(url).toBe('/api/frames/file/video.mp4')
    })

    it('creates a field named streamMp4Url', () => {
      const field = streamMp4UrlField({
        collection: 'frames',
      })

      expect(field.name).toBe('streamMp4Url')
      expect(field.type).toBe('text')
      expect('virtual' in field && field.virtual).toBe(true)
    })
  })

})

describe('R2 Adapter Filename Sanitization', () => {
  // Tests use the exported sanitizeFilename function from r2NativeAdapter
  // This validates the actual implementation used in production

  it('converts filename to URL-safe slug', () => {
    const result = sanitizeFilename('My Test File.mp3')
    expect(result).toMatch(/^my-test-file-[a-z0-9]+\.mp3$/)
  })

  it('adds random suffix for uniqueness', () => {
    const result1 = sanitizeFilename('test.mp3')
    const result2 = sanitizeFilename('test.mp3')
    expect(result1).toMatch(/^test-[a-z0-9]+\.mp3$/)
    expect(result2).toMatch(/^test-[a-z0-9]+\.mp3$/)
    expect(result1).not.toBe(result2)
  })

  it('preserves file extension', () => {
    const extensions = ['mp3', 'aac', 'ogg', 'wav']

    for (const ext of extensions) {
      const result = sanitizeFilename(`test-file.${ext}`)
      expect(result).toMatch(new RegExp(`\\.${ext}$`))
    }
  })

  it('handles special characters', () => {
    const result = sanitizeFilename("My Photo (1) - Copy & Paste's.mp3")
    expect(result).toMatch(/^[a-z0-9-]+\.mp3$/)
    expect(result).not.toContain('(')
    expect(result).not.toContain(')')
    expect(result).not.toContain('&')
    expect(result).not.toContain("'")
  })

  it('converts to lowercase', () => {
    const result = sanitizeFilename('MyUpperCaseFile.MP3')
    // Slugify converts the name to lowercase, extension case is preserved
    expect(result).toMatch(/^myuppercasefile-[a-z0-9]+\.MP3$/)
  })

  it('handles filenames without extension', () => {
    const result = sanitizeFilename('my-file-without-extension')
    expect(result).toMatch(/^my-file-without-extension-[a-z0-9]+$/)
    expect(result).not.toContain('.')
  })

  it('handles filenames with multiple dots', () => {
    const result = sanitizeFilename('my.file.name.mp3')
    // Slugify removes dots, so they become merged (my.file.name -> myfilename)
    expect(result).toMatch(/^myfilename-[a-z0-9]+\.mp3$/)
  })
})
