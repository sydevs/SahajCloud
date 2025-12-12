import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { FRAME_CATEGORIES } from '@/lib/data'
import type { Frame } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Frames Collection', () => {
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

  it('creates a frame with image', async () => {
    const frame = await testData.createFrame(payload, {
      imageSet: 'male',
      category: FRAME_CATEGORIES[0],
    })

    expect(frame).toBeDefined()
    expect(frame.filename).toBeDefined()
    expect(frame.imageSet).toBe('male')
    // Tags should be empty array when no tags are provided
    expect(frame.tags).toEqual([])
    expect(frame.mimeType).toBe('image/jpeg') // Original format preserved for now
    // Filename is preserved as-is (sanitizeFilename removed - Cloudflare provides unique IDs)
    expect(frame.filename).toBeDefined()
    expect(frame.filesize).toBeGreaterThan(0)
    // Dimensions should be auto-populated by Payload for images
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)
    // fileMetadata is empty for images (Sharp disabled for Cloudflare Workers)
    expect(frame.fileMetadata).toEqual({})

    // Check category field
    expect(frame.category).toBe(FRAME_CATEGORIES[0])
  })

  it('creates a frame with video', async () => {
    const frame = await testData.createFrame(
      payload,
      {
        imageSet: 'female',
        category: FRAME_CATEGORIES[1],
      },
      'video-30s.mp4',
    )

    expect(frame).toBeDefined()
    expect(frame.filename).toBeDefined()
    expect(frame.imageSet).toBe('female')
    // Tags should be empty array when no tags are provided
    expect(frame.tags).toEqual([])
    expect(frame.mimeType).toBe('video/mp4') // Original format preserved for now
    // Filename is preserved as-is (sanitizeFilename removed - Cloudflare provides unique IDs)
    expect(frame.filename).toBeDefined()
    expect(frame.filesize).toBeGreaterThan(0)
    // fileMetadata is empty for videos (FFmpeg processing removed for Cloudflare Workers)
    expect(frame.fileMetadata).toEqual({})

    // Check category field
    expect(frame.category).toBe(FRAME_CATEGORIES[1])
  })

  it('uses default imageSet when none provided', async () => {
    const frame = await testData.createFrame(payload, {
      // No imageSet provided, should use default
    })

    expect(frame.imageSet).toBeDefined()
    expect(['male', 'female']).toContain(frame.imageSet)
  })

  it('validates imageSet options', async () => {
    await expect(
      testData.createFrame(payload, {
        imageSet: 'invalid', // Invalid option
      }),
    ).rejects.toThrow()
  })

  it('supports different formats', async () => {
    const formats = [
      { mimetype: 'image/jpeg', name: 'image-1050x700.jpg' },
      { mimetype: 'image/png', name: 'image-1050x700.png' },
      { mimetype: 'image/webp', name: 'image-1050x700.webp' },
      { mimetype: 'video/mp4', name: 'video-30s.mp4' },
      { mimetype: 'video/webm', name: 'video-30s.webm' },
    ]

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i]
      const frame = await testData.createFrame(
        payload,
        {
          imageSet: 'male',
        },
        format.name,
      )

      expect(frame).toBeDefined()
      expect(frame.mimeType).toBe(format.mimetype)
      // Filename is preserved as-is (sanitizeFilename removed - Cloudflare provides unique IDs)
      expect(frame.filename).toBeDefined()
    }
  })

  it('updates a frame', async () => {
    const frame = await testData.createFrame(payload, {
      imageSet: 'male',
    })

    const updated = (await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        imageSet: 'female',
        category: FRAME_CATEGORIES[2],
      },
    })) as Frame

    expect(updated.imageSet).toBe('female')
    expect(updated.category).toBe(FRAME_CATEGORIES[2])
  })

  it('manages category field properly', async () => {
    const frame = await testData.createFrame(payload, {
      imageSet: 'male',
      category: FRAME_CATEGORIES[0],
    })

    expect(frame.category).toBe(FRAME_CATEGORIES[0])

    // Update category
    const updated = (await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        category: FRAME_CATEGORIES[2],
      },
    })) as Frame

    expect(updated.category).toBe(FRAME_CATEGORIES[2])
  })

  it('deletes a frame', async () => {
    const frame = await testData.createFrame(payload, {
      imageSet: 'male',
    })

    await payload.delete({
      collection: 'frames',
      id: frame.id,
    })

    // Verify deletion
    const result = await payload.find({
      collection: 'frames',
      where: {
        id: {
          equals: frame.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds frames with filters', async () => {
    await testData.createFrame(payload, {
      imageSet: 'male',
      category: FRAME_CATEGORIES[0],
    })

    await testData.createFrame(
      payload,
      {
        imageSet: 'female',
        category: FRAME_CATEGORIES[2],
      },
      'video-30s.mp4',
    )

    // Find frames with specific category to avoid conflicts with other tests
    const result = await payload.find({
      collection: 'frames',
      where: {
        category: {
          equals: FRAME_CATEGORIES[0],
        },
      },
    })

    expect(result.docs.length).toBeGreaterThanOrEqual(1)
    expect(result.docs[0].category).toBe(FRAME_CATEGORIES[0])
  })

  it('finds frames by imageSet', async () => {
    await testData.createFrame(payload, {
      imageSet: 'male',
    })

    await testData.createFrame(
      payload,
      {
        imageSet: 'female',
      },
      'video-30s.mp4',
    )

    const maleFrames = await payload.find({
      collection: 'frames',
      where: {
        imageSet: {
          equals: 'male',
        },
      },
    })

    expect(maleFrames.docs.length).toBeGreaterThanOrEqual(1)
    expect(maleFrames.docs[0].imageSet).toBe('male')
  })

  it('supports mixed media types in same collection', async () => {
    const imageFrame = await testData.createFrame(payload, {
      imageSet: 'male',
    })

    const videoFrame = await testData.createFrame(
      payload,
      {
        imageSet: 'female',
      },
      'video-30s.mp4',
    )

    expect(imageFrame.mimeType).toBe('image/jpeg')
    expect(imageFrame.width).toBeGreaterThan(0)
    expect(imageFrame.height).toBeGreaterThan(0)
    // fileMetadata is empty for images (Sharp disabled for Cloudflare Workers)
    expect(imageFrame.fileMetadata).toEqual({})

    expect(videoFrame.mimeType).toBe('video/mp4')
    // fileMetadata is empty for videos (FFmpeg processing removed for Cloudflare Workers)
    expect(videoFrame.fileMetadata).toEqual({})
  })
})
