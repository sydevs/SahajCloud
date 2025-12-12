import type { PayloadRequest } from 'payload'

import { describe, it, expect } from 'vitest'

import { sanitizeFilename, processFile } from '@/lib/fieldUtils'

describe('Field Utils', () => {
  describe('sanitizeFilename', () => {
    it('converts filename to URL-safe slug', async () => {
      const mockFile = {
        name: 'My Test File.jpg',
        data: Buffer.from('test'),
        mimetype: 'image/jpeg',
        size: 100,
      }
      const req = { file: mockFile } as unknown as PayloadRequest

      await sanitizeFilename({ req } as { req: PayloadRequest })

      // Check that filename is slugified and has random suffix
      expect(mockFile.name).toMatch(/^my-test-file-[a-z0-9]+\.jpg$/)
    })

    it('adds random suffix for uniqueness', async () => {
      const mockFile1 = {
        name: 'test.png',
        data: Buffer.from('test'),
        mimetype: 'image/png',
        size: 100,
      }
      const mockFile2 = {
        name: 'test.png',
        data: Buffer.from('test'),
        mimetype: 'image/png',
        size: 100,
      }
      const req1 = { file: mockFile1 } as unknown as PayloadRequest
      const req2 = { file: mockFile2 } as unknown as PayloadRequest

      await sanitizeFilename({ req: req1 } as { req: PayloadRequest })
      await sanitizeFilename({ req: req2 } as { req: PayloadRequest })

      // Both should be slugified but with different random suffixes
      expect(mockFile1.name).toMatch(/^test-[a-z0-9]+\.png$/)
      expect(mockFile2.name).toMatch(/^test-[a-z0-9]+\.png$/)
      expect(mockFile1.name).not.toBe(mockFile2.name)
    })

    it('preserves file extension', async () => {
      const extensions = ['jpg', 'png', 'webp', 'mp3', 'mp4', 'pdf']

      for (const ext of extensions) {
        const mockFile = {
          name: `test-file.${ext}`,
          data: Buffer.from('test'),
          mimetype: 'application/octet-stream',
          size: 100,
        }
        const req = { file: mockFile } as unknown as PayloadRequest

        await sanitizeFilename({ req } as { req: PayloadRequest })

        expect(mockFile.name).toMatch(new RegExp(`\\.${ext}$`))
      }
    })

    it('handles special characters', async () => {
      const mockFile = {
        name: "My Photo (1) - Copy & Paste's.jpg",
        data: Buffer.from('test'),
        mimetype: 'image/jpeg',
        size: 100,
      }
      const req = { file: mockFile } as unknown as PayloadRequest

      await sanitizeFilename({ req } as { req: PayloadRequest })

      // Special characters should be removed or converted
      expect(mockFile.name).toMatch(/^[a-z0-9-]+\.jpg$/)
      expect(mockFile.name).not.toContain('(')
      expect(mockFile.name).not.toContain(')')
      expect(mockFile.name).not.toContain('&')
      expect(mockFile.name).not.toContain("'")
    })

    it('handles empty file gracefully', async () => {
      const req = { file: undefined } as unknown as PayloadRequest

      // Should not throw
      await expect(sanitizeFilename({ req } as { req: PayloadRequest })).resolves.not.toThrow()
    })

    it('converts to lowercase', async () => {
      const mockFile = {
        name: 'MyUpperCaseFile.PNG',
        data: Buffer.from('test'),
        mimetype: 'image/png',
        size: 100,
      }
      const req = { file: mockFile } as unknown as PayloadRequest

      await sanitizeFilename({ req } as { req: PayloadRequest })

      // First part should be lowercase
      expect(mockFile.name).toMatch(/^myuppercasefile-[a-z0-9]+\.PNG$/)
    })
  })

  describe('processFile', () => {
    it('validates image file size (10MB default limit)', async () => {
      const hook = processFile({})

      // Create mock file exceeding 10MB
      const oversizedFile = {
        data: Buffer.alloc(11 * 1024 * 1024), // 11MB
        mimetype: 'image/jpeg',
        size: 11 * 1024 * 1024,
        name: 'large-image.jpg',
      }
      const req = { file: oversizedFile } as unknown as PayloadRequest

      await expect(hook({ data: {}, req } as never)).rejects.toThrow(/exceeds maximum allowed size/)
    })

    it('validates audio file size (50MB default limit)', async () => {
      const hook = processFile({})

      // Create mock file exceeding 50MB
      const oversizedFile = {
        data: Buffer.alloc(51 * 1024 * 1024), // 51MB
        mimetype: 'audio/mpeg',
        size: 51 * 1024 * 1024,
        name: 'large-audio.mp3',
      }
      const req = { file: oversizedFile } as unknown as PayloadRequest

      await expect(hook({ data: {}, req } as never)).rejects.toThrow(/exceeds maximum allowed size/)
    })

    it('validates video file size (100MB default limit)', async () => {
      const hook = processFile({})

      // Create mock file exceeding 100MB
      const oversizedFile = {
        data: Buffer.alloc(101 * 1024 * 1024), // 101MB
        mimetype: 'video/mp4',
        size: 101 * 1024 * 1024,
        name: 'large-video.mp4',
      }
      const req = { file: oversizedFile } as unknown as PayloadRequest

      await expect(hook({ data: {}, req } as never)).rejects.toThrow(/exceeds maximum allowed size/)
    })

    it('accepts files within size limits', async () => {
      const hook = processFile({})

      const validFile = {
        data: Buffer.alloc(5 * 1024 * 1024), // 5MB
        mimetype: 'image/jpeg',
        size: 5 * 1024 * 1024,
        name: 'valid-image.jpg',
      }
      const req = { file: validFile } as unknown as PayloadRequest

      const result = await hook({ data: {}, req } as never)

      expect(result).toBeDefined()
      expect(result?.fileMetadata).toBeDefined()
    })

    it('allows custom maxMB limits', async () => {
      const hook = processFile({ maxMB: 5 })

      // File at 6MB should exceed custom 5MB limit
      const oversizedFile = {
        data: Buffer.alloc(6 * 1024 * 1024), // 6MB
        mimetype: 'image/jpeg',
        size: 6 * 1024 * 1024,
        name: 'medium-image.jpg',
      }
      const req = { file: oversizedFile } as unknown as PayloadRequest

      await expect(hook({ data: {}, req } as never)).rejects.toThrow(/exceeds maximum allowed size/)
    })

    it('handles missing file gracefully', async () => {
      const hook = processFile({})

      const req = { file: undefined } as unknown as PayloadRequest
      const data = { title: 'Test' }

      const result = await hook({ data, req } as never)

      expect(result).toEqual(data)
    })

    it('initializes fileMetadata field', async () => {
      const hook = processFile({})

      const validFile = {
        data: Buffer.alloc(1024), // 1KB
        mimetype: 'image/jpeg',
        size: 1024,
        name: 'small-image.jpg',
      }
      const req = { file: validFile } as unknown as PayloadRequest

      const result = await hook({ data: {}, req } as never)

      expect(result?.fileMetadata).toBeDefined()
      expect(typeof result?.fileMetadata).toBe('object')
    })
  })
})
