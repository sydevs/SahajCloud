import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Frame, Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testDataFactory } from '../utils/testDataFactory'

describe('Frames Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: Tag
  let testTag2: Tag
  let testTag3: Tag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tags
    testTag1 = await testDataFactory.createTag(payload, { title: 'yoga' })
    testTag2 = await testDataFactory.createTag(payload, { title: 'poses' })
    testTag3 = await testDataFactory.createTag(payload, { title: 'beginner' })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a frame with image', async () => {
    const frame = await testDataFactory.createFrame(payload, {
      name: 'Mountain Pose',
      imageSet: 'male',
      tags: [testTag1.id, testTag2.id],
    })

    expect(frame).toBeDefined()
    expect(frame.name).toBe('Mountain Pose')
    expect(frame.imageSet).toBe('male')
    expect(frame.tags).toHaveLength(2)
    expect(frame.mimeType).toBe('image/jpeg') // Original format preserved for now
    expect(frame.filename).toMatch(/^image-1050x700(-\d+)?\.jpg$/)
    expect(frame.filesize).toBeGreaterThan(0)
    // Dimensions should be auto-populated by Payload for images
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)
    expect(frame.duration).toBeUndefined() // No duration for images

    // Check tags relationship
    const tagIds = Array.isArray(frame.tags) 
      ? frame.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('creates a frame with video', async () => {
    const frame = await testDataFactory.createFrame(payload, {
      name: 'Warrior Pose Flow',
      imageSet: 'female',
      tags: [testTag2.id, testTag3.id],
    }, 'video-30s.mp4')

    expect(frame).toBeDefined()
    expect(frame.name).toBe('Warrior Pose Flow')
    expect(frame.imageSet).toBe('female')
    expect(frame.tags).toHaveLength(2)
    expect(frame.mimeType).toBe('video/mp4') // Original format preserved for now
    expect(frame.filename).toMatch(/^video-30s(-\d+)?\.mp4$/)
    expect(frame.filesize).toBeGreaterThan(0)
    // Duration and dimensions are now automatically extracted
    expect(frame.duration).toBe(29.5) // Mock duration from test environment
    expect(frame.dimensions).toEqual({ width: 1920, height: 1080 }) // Mock dimensions from test environment

    // Check tags relationship
    const tagIds = Array.isArray(frame.tags) 
      ? frame.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag2.id)
    expect(tagIds).toContain(testTag3.id)
  })

  it('requires name field', async () => {
    await expect(
      testDataFactory.createFrame(payload, {
        imageSet: 'male',
        name: undefined, // Remove name to test validation
      } as any)
    ).rejects.toThrow()
  })

  it('requires imageSet field', async () => {
    await expect(
      testDataFactory.createFrame(payload, {
        name: 'Test Frame',
        imageSet: undefined, // Remove imageSet to test validation
      } as any)
    ).rejects.toThrow()
  })

  it('validates imageSet options', async () => {
    await expect(
      testDataFactory.createFrame(payload, {
        name: 'Test Frame',
        imageSet: 'invalid' as any, // Invalid option
      })
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
      const frame = await testDataFactory.createFrame(payload, {
        title: `Test ${format.mimetype.split('/')[1].toUpperCase()}`,
      }, format.name)

      expect(frame).toBeDefined()
      expect(frame.mimeType).toBe(format.mimetype)
      expect(frame.filename).toMatch(new RegExp(`^${format.name.replace('.', '(-\\d+)?\\.')}$`))
    }
  })

  it.skip('validates file size limit for images (10MB)', async () => {
    // TODO: File size validation needs to be tested with actual large files
    // The current hook-based approach needs to be verified
    await expect(
      payload.create({
        collection: 'frames',
        data: {
          name: 'Large Image',
          imageSet: 'male',
        },
        file: {
          data: Buffer.alloc(11 * 1024 * 1024, 'fake'), // 11MB - exceeds 10MB limit
          mimetype: 'image/jpeg',
          name: 'large.jpg',
          size: 11 * 1024 * 1024,
        },
      })
    ).rejects.toThrow()
  })

  it.skip('validates file size limit for videos (100MB)', async () => {
    // TODO: File size validation needs to be tested with actual large files
    await expect(
      payload.create({
        collection: 'frames',
        data: {
          name: 'Large Video',
          imageSet: 'female',
        },
        file: {
          data: Buffer.alloc(101 * 1024 * 1024, 'fake'), // 101MB - exceeds 100MB limit
          mimetype: 'video/mp4',
          name: 'large.mp4',
          size: 101 * 1024 * 1024,
        },
      })
    ).rejects.toThrow()
  })

  it.skip('validates video duration limit (30 seconds)', async () => {
    // TODO: Duration validation needs to be tested with actual long video files
    // This requires a sample video longer than 30 seconds
  })

  it('updates a frame', async () => {
    const frame = await testDataFactory.createFrame(payload, {
      name: 'Original Name',
      imageSet: 'male',
    })

    const updated = await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        name: 'Updated Name',
        imageSet: 'female',
        tags: [testTag3.id],
      },
    }) as Frame

    expect(updated.name).toBe('Updated Name')
    expect(updated.imageSet).toBe('female')
    expect(updated.tags).toHaveLength(1)
    
    const tagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag3.id)
  })

  it('manages tags relationships properly', async () => {
    const frame = await testDataFactory.createFrame(payload, {
      name: 'Tagged Frame',
      tags: [testTag1.id, testTag2.id],
    })

    expect(frame.tags).toHaveLength(2)
    
    // Update tags
    const updated = await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        tags: [testTag3.id],
      },
    }) as Frame

    expect(updated.tags).toHaveLength(1)
    const updatedTagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(updatedTagIds).toContain(testTag3.id)
  })

  it('deletes a frame', async () => {
    const frame = await testDataFactory.createFrame(payload, {
      name: 'To Delete',
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
    await testDataFactory.createFrame(payload, {
      name: 'Filter Test Yoga Frame',
      tags: [testTag1.id], // yoga tag
      imageSet: 'male',
    })

    await testDataFactory.createFrame(payload, {
      name: 'Filter Test Beginner Frame',
      tags: [testTag3.id], // beginner tag
      imageSet: 'female',
    }, 'video-30s.mp4')

    // Find frames with yoga tag AND specific name to avoid conflicts with other tests
    const result = await payload.find({
      collection: 'frames',
      where: {
        and: [
          {
            tags: {
              in: [testTag1.id],
            },
          },
          {
            name: {
              like: 'Filter Test Yoga',
            },
          },
        ],
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].name).toBe('Filter Test Yoga Frame')
  })

  it('finds frames by imageSet', async () => {
    await testDataFactory.createFrame(payload, {
      name: 'Male Frame Test',
      imageSet: 'male',
    })

    await testDataFactory.createFrame(payload, {
      name: 'Female Frame Test',
      imageSet: 'female',
    }, 'video-30s.mp4')

    const maleFrames = await payload.find({
      collection: 'frames',
      where: {
        and: [
          {
            imageSet: {
              equals: 'male',
            },
          },
          {
            name: {
              like: 'Male Frame Test',
            },
          },
        ],
      },
    })

    expect(maleFrames.docs).toHaveLength(1)
    expect(maleFrames.docs[0].imageSet).toBe('male')
  })

  it('supports mixed media types in same collection', async () => {
    const imageFrame = await testDataFactory.createFrame(payload, {
      name: 'Mixed Test Image',
    })

    const videoFrame = await testDataFactory.createFrame(payload, {
      name: 'Mixed Test Video',
    }, 'video-30s.mp4')

    expect(imageFrame.mimeType).toBe('image/jpeg')
    expect(imageFrame.width).toBeGreaterThan(0)
    expect(imageFrame.height).toBeGreaterThan(0)
    expect(imageFrame.duration).toBeUndefined()

    expect(videoFrame.mimeType).toBe('video/mp4')
    expect(videoFrame.duration).toBe(29.5) // Mock duration from test environment
    expect(videoFrame.dimensions).toEqual({ width: 1920, height: 1080 }) // Mock dimensions from test environment
  })
})