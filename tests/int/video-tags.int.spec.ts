import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { VideoTag, Video } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('VideoTags Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag: VideoTag
  let testVideo: Video

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tag
    testTag = await testData.createVideoTag(payload, {
      title: 'tutorial',
    })

    // Create test video with the tag
    testVideo = await testData.createVideo(payload, {
      tags: [testTag.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a video tag with title', async () => {
    expect(testTag).toBeDefined()
    expect(testTag.title).toBe('tutorial')
    expect(testTag.id).toBeDefined()
  })

  it('auto-generates slug from title', async () => {
    const tag = await testData.createVideoTag(payload, {
      title: 'Test Video Category',
    })

    expect(tag.slug).toBeDefined()
    expect(tag.slug).toBe('test-video-category')
  })

  it('allows videos to have tags', async () => {
    // Fetch video with populated tags
    const videoWithTags = await payload.findByID({
      collection: 'videos',
      id: testVideo.id,
      depth: 1,
    })

    expect(videoWithTags.tags).toBeDefined()
    expect(videoWithTags.tags!.length).toBeGreaterThan(0)

    const tagIds = videoWithTags.tags!.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as VideoTag).id : tag,
    )
    expect(tagIds).toContain(testTag.id)
  })

  it('supports multiple tags per video', async () => {
    const tag2 = await testData.createVideoTag(payload, { title: 'meditation' })
    const tag3 = await testData.createVideoTag(payload, { title: 'guided' })

    const multiTagVideo = await testData.createVideo(payload, {
      tags: [testTag.id, tag2.id, tag3.id],
    })

    expect(multiTagVideo.tags).toBeDefined()
    expect(multiTagVideo.tags!.length).toBe(3)

    // Verify the tags include all assigned tags
    const videoWithTags = await payload.findByID({
      collection: 'videos',
      id: multiTagVideo.id,
      depth: 1,
    })

    const tagTitles =
      videoWithTags.tags?.map((tag) =>
        typeof tag === 'object' && tag !== null ? (tag as VideoTag).title : null,
      ) || []

    expect(tagTitles).toContain('tutorial')
    expect(tagTitles).toContain('meditation')
    expect(tagTitles).toContain('guided')
  })

  it('uses title as admin display field', async () => {
    const config = payload.collections['video-tags'].config
    expect(config.admin?.useAsTitle).toBe('title')
  })

  it('supports filtering videos by tag', async () => {
    // Create a unique tag for filtering test
    const filterTag = await testData.createVideoTag(payload, { title: 'filter-test-tag' })

    // Create video with the filter tag
    await testData.createVideo(payload, { tags: [filterTag.id] })

    // Create video without the filter tag
    await testData.createVideo(payload, { tags: [] })

    // Query videos by tag
    const filteredVideos = await payload.find({
      collection: 'videos',
      where: {
        tags: { contains: filterTag.id },
      },
    })

    expect(filteredVideos.docs.length).toBeGreaterThan(0)

    // All returned videos should have the filter tag
    for (const video of filteredVideos.docs) {
      const tagIds = video.tags?.map((tag) =>
        typeof tag === 'object' && tag !== null ? (tag as VideoTag).id : tag,
      )
      expect(tagIds).toContain(filterTag.id)
    }
  })

  it('has join field for bidirectional relationship', async () => {
    // Create a fresh tag and video for this test
    const joinTag = await testData.createVideoTag(payload, { title: 'join-test' })
    await testData.createVideo(payload, { tags: [joinTag.id] })

    // Fetch the tag with the join field populated
    const tagWithJoin = await payload.findByID({
      collection: 'video-tags',
      id: joinTag.id,
      depth: 1,
    })

    // The videos join field should contain the related video
    expect(tagWithJoin.videos).toBeDefined()
    expect((tagWithJoin.videos as { docs: Video[] }).docs.length).toBeGreaterThan(0)
  })

  it('has title field configured', async () => {
    // Verify title field exists in the collection
    const config = payload.collections['video-tags'].config
    const titleField = config.fields.find(
      (f) => 'name' in f && f.name === 'title',
    )

    expect(titleField).toBeDefined()
    expect(titleField).toHaveProperty('type', 'text')
    expect(titleField).toHaveProperty('required', true)

    // Create tag with title
    const tag = await testData.createVideoTag(payload, {
      title: 'Test Title Field',
    })

    expect(tag.title).toBe('Test Title Field')
  })
})
