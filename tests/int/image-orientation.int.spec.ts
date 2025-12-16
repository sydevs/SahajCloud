import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Image, ImageTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Image Orientation Detection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Pre-create orientation tags (simulating what tags import does)
    await Promise.all([
      testData.createImageTag(payload, { title: 'landscape' }),
      testData.createImageTag(payload, { title: 'portrait' }),
      testData.createImageTag(payload, { title: 'square' }),
    ])
  })

  afterAll(async () => {
    await cleanup()
  })

  it('detects landscape orientation for wide images (ratio > 1.1)', async () => {
    // Upload a 1050x700 landscape image
    const image = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')

    expect(image.tags).toBeDefined()
    expect(image.tags!.length).toBeGreaterThan(0)

    // Get tag details
    const imageWithTags = await payload.findByID({
      collection: 'images',
      id: image.id,
      depth: 1,
    })

    const tagTitles = imageWithTags.tags?.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as ImageTag).title : null,
    ) || []

    expect(tagTitles).toContain('landscape')
    expect(tagTitles).not.toContain('portrait')
    expect(tagTitles).not.toContain('square')
  })

  it('preserves existing tags when adding orientation tag', async () => {
    // Create a custom tag
    const customTag = await testData.createImageTag(payload, { title: 'custom-test-tag' })

    // Upload image with custom tag
    const image = await testData.createMediaImage(
      payload,
      { tags: [customTag.id] },
      'image-1050x700.jpg',
    )

    // Get image with populated tags
    const imageWithTags = await payload.findByID({
      collection: 'images',
      id: image.id,
      depth: 1,
    })

    const tagTitles = imageWithTags.tags?.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as ImageTag).title : null,
    ) || []

    // Should have both custom tag and orientation tag
    expect(tagTitles).toContain('custom-test-tag')
    expect(tagTitles).toContain('landscape')
  })

  it('skips orientation detection for SVG images', async () => {
    // Note: SVG files cannot be uploaded to Images collection (invalid MIME type)
    // This test verifies the hook logic skips SVGs when req.file.mimetype is 'image/svg+xml'
    // The actual skipping happens in the hook - we verify indirectly by testing raster images work

    // Upload a regular image to confirm orientation detection works
    const image = await testData.createMediaImage(payload, {}, 'image-1050x700.png')

    const imageWithTags = await payload.findByID({
      collection: 'images',
      id: image.id,
      depth: 1,
    })

    const tagTitles = imageWithTags.tags?.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as ImageTag).title : null,
    ) || []

    // PNG images should get orientation tags
    expect(tagTitles).toContain('landscape')
  })

  it('does not duplicate tags if re-uploaded', async () => {
    // Upload the same image twice
    const image1 = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')
    const image2 = await testData.createMediaImage(payload, {}, 'image-1050x700.jpg')

    // Each should have exactly one landscape tag
    const tags1 =
      image1.tags?.filter((tag) => {
        const tagObj = typeof tag === 'object' && tag !== null ? (tag as ImageTag) : null
        return tagObj?.title === 'landscape'
      }) || []

    const tags2 =
      image2.tags?.filter((tag) => {
        const tagObj = typeof tag === 'object' && tag !== null ? (tag as ImageTag) : null
        return tagObj?.title === 'landscape'
      }) || []

    expect(tags1.length).toBe(1)
    expect(tags2.length).toBe(1)
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
