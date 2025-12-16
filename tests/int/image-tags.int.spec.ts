import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { ImageTag, Image } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('ImageTags Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag: ImageTag
  let testImage: Image

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tag
    testTag = await testData.createImageTag(payload, {
      title: 'thumbnail',
    })

    // Create test image with the tag
    testImage = await testData.createMediaImage(payload, {
      tags: [testTag.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates an image tag with title', async () => {
    expect(testTag).toBeDefined()
    expect(testTag.title).toBe('thumbnail')
    expect(testTag.id).toBeDefined()
  })

  it('allows images to have tags', async () => {
    // Fetch image with populated tags
    const imageWithTags = await payload.findByID({
      collection: 'images',
      id: testImage.id,
      depth: 1,
    })

    expect(imageWithTags.tags).toBeDefined()
    expect(imageWithTags.tags!.length).toBeGreaterThan(0)

    const tagIds = imageWithTags.tags!.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as ImageTag).id : tag,
    )
    expect(tagIds).toContain(testTag.id)
  })

  it('supports multiple tags per image', async () => {
    const tag2 = await testData.createImageTag(payload, { title: 'meditation' })
    const tag3 = await testData.createImageTag(payload, { title: 'icon' })

    const multiTagImage = await testData.createMediaImage(payload, {
      tags: [testTag.id, tag2.id, tag3.id],
    })

    expect(multiTagImage.tags).toBeDefined()
    // Expect 4 tags: thumbnail, meditation, icon + auto-detected orientation (landscape)
    expect(multiTagImage.tags!.length).toBe(4)

    // Verify the tags include both manual and auto-detected
    const imageWithTags = await payload.findByID({
      collection: 'images',
      id: multiTagImage.id,
      depth: 1,
    })

    const tagTitles =
      imageWithTags.tags?.map((tag) =>
        typeof tag === 'object' && tag !== null ? (tag as ImageTag).title : null,
      ) || []

    expect(tagTitles).toContain('thumbnail')
    expect(tagTitles).toContain('meditation')
    expect(tagTitles).toContain('icon')
    expect(tagTitles).toContain('landscape') // Auto-detected
  })

  it('creates all expected image tags', async () => {
    // Expected tags from IMAGE_TAGS constant
    const expectedTags = [
      'thumbnail',
      'author',
      'icon',
      'stock-photo',
      'placeholder',
      'graphic',
      'treatment',
      'lesson',
      'meditation',
      'subtle-system',
      'music',
      'landscape',
      'portrait',
      'square',
    ]

    // Create all expected tags
    const createdTags = await Promise.all(
      expectedTags.map((title) => testData.createImageTag(payload, { title })),
    )

    expect(createdTags.length).toBe(14)

    // Verify each tag was created successfully
    for (const tag of createdTags) {
      expect(tag.id).toBeDefined()
      expect(tag.title).toBeDefined()
    }
  })

  it('uses title as admin display field', async () => {
    const config = payload.collections['image-tags'].config
    expect(config.admin?.useAsTitle).toBe('title')
  })

  it('supports filtering images by tag', async () => {
    // Create a unique tag for filtering test
    const filterTag = await testData.createImageTag(payload, { title: 'filter-test-tag' })

    // Create image with the filter tag
    await testData.createMediaImage(payload, { tags: [filterTag.id] })

    // Create image without the filter tag
    await testData.createMediaImage(payload, { tags: [] })

    // Query images by tag
    const filteredImages = await payload.find({
      collection: 'images',
      where: {
        tags: { contains: filterTag.id },
      },
    })

    expect(filteredImages.docs.length).toBeGreaterThan(0)

    // All returned images should have the filter tag
    for (const image of filteredImages.docs) {
      const tagIds = image.tags?.map((tag) =>
        typeof tag === 'object' && tag !== null ? (tag as ImageTag).id : tag,
      )
      expect(tagIds).toContain(filterTag.id)
    }
  })
})
