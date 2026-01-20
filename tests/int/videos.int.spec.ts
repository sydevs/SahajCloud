import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { VideoTag, Video } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Videos Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testVideo: Video
  let testTag: VideoTag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create a tag for testing relationships
    testTag = await testData.createVideoTag(payload, { title: 'test-category' })

    // Create test video
    testVideo = await testData.createVideo(payload, {
      title: 'Test Video',
      tags: [testTag.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a video with required fields', async () => {
    expect(testVideo).toBeDefined()
    expect(testVideo.id).toBeDefined()
    expect(testVideo.title).toBe('Test Video')
    expect(testVideo.filename).toBeDefined()
  })

  it('stores video file metadata', async () => {
    // Videos uploaded to local storage should have basic file info
    expect(testVideo.mimeType).toBe('video/mp4')
    expect(testVideo.filesize).toBeGreaterThan(0)
  })

  it('has title field configured', async () => {
    // Verify title field exists in the collection
    const config = payload.collections['videos'].config
    const titleField = config.fields.find(
      (f) => 'name' in f && f.name === 'title',
    )

    expect(titleField).toBeDefined()
    expect(titleField).toHaveProperty('type', 'text')
    expect(titleField).toHaveProperty('required', true)

    // Create video with title
    const video = await testData.createVideo(payload, {
      title: 'Test Title Field',
    })

    expect(video.title).toBe('Test Title Field')
  })

  it('supports subtitles JSON field', async () => {
    const subtitles = [
      { startTime: 0, endTime: 5, text: 'Hello' },
      { startTime: 5, endTime: 10, text: 'World' },
    ]

    const videoWithSubtitles = await testData.createVideo(payload, {
      title: 'Video with Subtitles',
      subtitles: subtitles,
    })

    expect(videoWithSubtitles.subtitles).toBeDefined()
    expect(videoWithSubtitles.subtitles).toEqual(subtitles)
  })

  it('has read-only fileMetadata field', async () => {
    const config = payload.collections['videos'].config
    const fileMetadataField = config.fields.find(
      (f) => 'name' in f && f.name === 'fileMetadata',
    )

    expect(fileMetadataField).toBeDefined()
    expect(fileMetadataField).toHaveProperty('admin')
    expect((fileMetadataField as { admin: { readOnly: boolean } }).admin.readOnly).toBe(true)
  })

  it('supports tag relationships (hasMany)', async () => {
    const tag1 = await testData.createVideoTag(payload, { title: 'category-1' })
    const tag2 = await testData.createVideoTag(payload, { title: 'category-2' })

    const videoWithTags = await testData.createVideo(payload, {
      title: 'Multi-tag Video',
      tags: [tag1.id, tag2.id],
    })

    expect(videoWithTags.tags).toBeDefined()
    expect(videoWithTags.tags!.length).toBe(2)

    // Verify populated tags
    const fetchedVideo = await payload.findByID({
      collection: 'videos',
      id: videoWithTags.id,
      depth: 1,
    })

    const tagIds = fetchedVideo.tags?.map((tag) =>
      typeof tag === 'object' && tag !== null ? (tag as VideoTag).id : tag,
    )
    expect(tagIds).toContain(tag1.id)
    expect(tagIds).toContain(tag2.id)
  })

  it('accepts only video MIME types', async () => {
    const config = payload.collections['videos'].config
    const mimeTypes = config.upload && typeof config.upload === 'object'
      ? config.upload.mimeTypes
      : undefined

    expect(mimeTypes).toBeDefined()
    expect(mimeTypes).toContain('video/mp4')
    expect(mimeTypes).toContain('video/webm')
    expect(mimeTypes).toContain('video/quicktime')
    expect(mimeTypes).not.toContain('image/jpeg')
    expect(mimeTypes).not.toContain('audio/mpeg')
  })

  it('uses title as admin display field', async () => {
    const config = payload.collections['videos'].config
    expect(config.admin?.useAsTitle).toBe('title')
  })

  it('is in Content admin group', async () => {
    const config = payload.collections['videos'].config
    expect(config.admin?.group).toBe('Content')
  })

  it('has correct default columns configuration', async () => {
    const config = payload.collections['videos'].config
    expect(config.admin?.defaultColumns).toContain('title')
    expect(config.admin?.defaultColumns).toContain('tags')
    expect(config.admin?.defaultColumns).toContain('previewUrl')
  })

  it('supports different video formats', async () => {
    // Test MP4
    const mp4Video = await testData.createVideo(payload, {
      title: 'MP4 Video',
    }, 'video-30s.mp4')
    expect(mp4Video.mimeType).toBe('video/mp4')

    // Test WebM
    const webmVideo = await testData.createVideo(payload, {
      title: 'WebM Video',
    }, 'video-30s.webm')
    expect(webmVideo.mimeType).toBe('video/webm')

    // Test MOV (QuickTime)
    const movVideo = await testData.createVideo(payload, {
      title: 'MOV Video',
    }, 'video-30s.mov')
    // MOV files can be detected as video/quicktime or video/mpeg
    expect(movVideo.mimeType).toMatch(/video\/(quicktime|mpeg)/)
  })

  it('generates virtual url field', async () => {
    // In test environment (local storage), url should be the PayloadCMS static URL
    // When Cloudflare Stream is configured, it would be the Stream MP4 URL
    const video = await testData.createVideo(payload, {
      title: 'URL Test Video',
    })

    // URL should be defined (local fallback or Cloudflare Stream)
    expect(video.url).toBeDefined()
    // In local storage, URL contains the collection path
    expect(video.url).toContain('/api/videos/file/')
  })

  it('has previewUrl virtual field configured', async () => {
    // Verify the previewUrl field is configured in the collection
    const config = payload.collections['videos'].config
    const previewUrlField = config.fields.find(
      (f) => 'name' in f && f.name === 'previewUrl',
    )

    expect(previewUrlField).toBeDefined()
    expect(previewUrlField).toHaveProperty('virtual', true)

    // In test environment without Cloudflare Stream, previewUrl will return undefined
    // (and undefined virtual fields don't appear in API responses)
    // The field is properly configured to generate thumbnails when Cloudflare Stream is available
  })
})
