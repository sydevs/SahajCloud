import type { PayloadRequest } from 'payload'

import { describe, it, expect } from 'vitest'

import { processFile } from '@/lib/fieldUtils'

describe('Field Utils', () => {
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
