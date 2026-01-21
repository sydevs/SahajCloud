import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Image Orientation Detection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Image tags are now inline enum strings
  const customTag = 'thumbnail' // Use an existing enum value for custom tag tests

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    // No need to pre-create orientation tags - they are now inline enum strings
  })

  afterAll(async () => {
    await cleanup()
  })

  it('detects landscape orientation for wide images (ratio > 1.1)', async () => {
    // Upload a 1050x700 landscape image
    const image = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')

    expect(image.tags).toBeDefined()
    expect(image.tags!.length).toBeGreaterThan(0)

    // Tags are now string arrays
    expect(image.tags).toContain('landscape')
    expect(image.tags).not.toContain('portrait')
    expect(image.tags).not.toContain('square')
  })

  it('preserves existing tags when adding orientation tag', async () => {
    // Upload image with custom tag (now a string enum value)
    const image = await testData.createMediaImage(
      payload,
      { tags: [customTag] },
      'image-1050x700.jpg',
    )

    // Tags are now string arrays
    expect(image.tags).toContain(customTag)
    expect(image.tags).toContain('landscape')
  })

  it('does not duplicate tags if re-uploaded', async () => {
    // Upload the same image twice
    const image1 = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')
    const image2 = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')

    // Each should have exactly one landscape tag (tags are now strings)
    const landscapeCount1 = image1.tags?.filter((tag) => tag === 'landscape').length || 0
    const landscapeCount2 = image2.tags?.filter((tag) => tag === 'landscape').length || 0

    expect(landscapeCount1).toBe(1)
    expect(landscapeCount2).toBe(1)
  })

  it('only runs on create operations (not update)', async () => {
    // Create an image
    const image = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')

    // Clear tags
    await payload.update({
      collection: 'images',
      id: image.id,
      data: { tags: [] },
    })

    // Verify tags were cleared (update should not re-add orientation tag)
    const updatedImage = await payload.findByID({
      collection: 'images',
      id: image.id,
      depth: 1,
    })

    expect(updatedImage.tags).toEqual([])
  })
})
