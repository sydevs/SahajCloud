import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Meditation, Narrator, Media, Frame, MusicTag, MeditationTag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Meditations Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Media
  let testTag1: MeditationTag
  let testTag2: MeditationTag
  let testMusicTag: MusicTag
  let testMeditation: Meditation

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testData.createNarrator(payload)
    testImageMedia = await testData.createMediaImage(payload)
    testTag1 = await testData.createMeditationTag(payload)
    testTag2 = await testData.createMeditationTag(payload)
    testMusicTag = await testData.createMusicTag(payload)

    // Create test meditation
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Morning Meditation',
        duration: 15,
        isPublished: false,
        tags: [testTag1.id, testTag2.id],
        musicTag: testMusicTag.id,
      },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a meditation with auto-generated slug', async () => {
    expect(testMeditation).toBeDefined()
    expect(testMeditation.title).toBe('Morning Meditation')
    expect(testMeditation.slug).toBe('morning-meditation')
    expect(testMeditation.duration).toBe(42) // Auto-populated from audio file
    expect(testMeditation.filename).toBeDefined() // Now has direct audio upload
    expect(
      typeof testMeditation.narrator === 'object'
        ? testMeditation.narrator.id
        : testMeditation.narrator,
    ).toBe(testNarrator.id)
    expect(testMeditation.tags).toHaveLength(2)
    // Tags may be populated objects or IDs
    const tagIds = Array.isArray(testMeditation.tags)
      ? testMeditation.tags.map((tag) =>
          typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag,
        )
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
    expect(
      typeof testMeditation.musicTag === 'object' && testMeditation.musicTag
        ? testMeditation.musicTag.id
        : testMeditation.musicTag,
    ).toBe(testMusicTag.id)
  })

  it('handles special characters in slug generation', async () => {
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Meditación: Relajación & Paz',
        duration: 10,
      },
    )

    expect(meditation.slug).toBe('meditaci-n-relajaci-n-paz')
  })

  it('validates duration minimum value', async () => {
    await expect(
      payload.create({
        collection: 'meditations',
        data: {
          title: 'Invalid Duration',
          duration: 0,
          thumbnail: testImageMedia.id,
          narrator: testNarrator.id,
          locale: 'en',
        },
      }),
    ).rejects.toThrow()
  })

  it('preserves slug on update', async () => {
    const originalSlug = testMeditation.slug
    const updated = (await payload.update({
      collection: 'meditations',
      id: testMeditation.id,
      data: {
        title: 'Updated Title',
        slug: 'attempted-slug-change', // This should be ignored
      },
    })) as Meditation

    expect(updated.title).toBe('Updated Title')
    expect(updated.slug).toBe(originalSlug) // Slug should remain unchanged
  })

  it('publishes meditation with date', async () => {
    const publishDate = new Date()
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Published Meditation',
        duration: 30,
        publishAt: publishDate.toISOString(), // TODO: This should be auto-populated if not specified
      },
    )

    expect(meditation.publishAt).toBeDefined()
  })
})

describe('Meditation-Frame Relationships', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Media
  let testFrame1: Frame
  let testFrame2: Frame

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testData.createNarrator(payload)
    testImageMedia = await testData.createMediaImage(payload)
    testFrame1 = await testData.createFrame(payload)
    testFrame2 = await testData.createFrame(payload)
  })

  afterAll(async () => {
    await cleanup()
  })

  it('created with sorted and rounded frame relationships', async () => {
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        frames: [
          {
            frame: testFrame2.id,
            timestamp: 23.3,
          },
          {
            frame: testFrame1.id,
            timestamp: 15.7,
          },
        ],
      },
    )

    expect(meditation.frames).toBeDefined()
    expect(meditation.frames).toHaveLength(2)

    // Check that frames are sorted by timestamp and rounded
    const frames = meditation.frames as Array<{ frame: string | { id: string }; timestamp: number }>
    expect(frames[0]?.timestamp).toBe(16)
    expect(frames[1]?.timestamp).toBe(23)

    const frame1Id = typeof frames[0]?.frame === 'object' ? frames[0].frame.id : frames[0]?.frame
    const frame2Id = typeof frames[1]?.frame === 'object' ? frames[1].frame.id : frames[1]?.frame

    expect(frame1Id).toBe(testFrame1.id)
    expect(frame2Id).toBe(testFrame2.id)
  })
})
