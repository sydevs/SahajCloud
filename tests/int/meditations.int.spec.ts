import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { KeyframeData } from '@/components/admin/MeditationFrameEditor/types'
import type { Meditation, Narrator, Image, Frame, MusicTag, MeditationTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Meditations Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Image
  let testTag1: MeditationTag
  let testTag2: MeditationTag
  let testMusicTag: MusicTag
  let testMeditation: Meditation
  let testFrame: Frame

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
    testFrame = await testData.createFrame(payload)

    // Create test meditation
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Morning Meditation',
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
        publishAt: publishDate.toISOString(), // TODO: This should be auto-populated if not specified
      },
    )

    expect(meditation.publishAt).toBeDefined()
  })
})

describe('Meditation-Frame Relationships', () => {
  let payload: Payload
  let cleanup: (() => Promise<void>) | undefined
  let testNarrator: Narrator
  let testImageMedia: Image
  let testFrame1: Frame
  let testFrame2: Frame

  beforeAll(async () => {
    try {
      const testEnv = await createTestEnvironment()
      payload = testEnv.payload
      cleanup = testEnv.cleanup

      // Create test dependencies
      testNarrator = await testData.createNarrator(payload)
      testImageMedia = await testData.createMediaImage(payload)
      testFrame1 = await testData.createFrame(payload)
      testFrame2 = await testData.createFrame(payload)
    } catch (error) {
      // Set cleanup to a no-op function to prevent errors
      cleanup = async () => {}
      throw error
    }
  })

  afterAll(async () => {
    if (cleanup) {
      await cleanup()
    }
  })

  it('creates meditation with frame relationships', async () => {
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        frames: [
          {
            id: String(testFrame1.id),
            timestamp: 0,
          },
          {
            id: String(testFrame2.id),
            timestamp: 15,
          },
        ],
      },
    )

    expect(meditation.frames).toBeDefined()
    expect(meditation.frames).toHaveLength(2)

    // Verify frames were added
    const frames = meditation.frames as KeyframeData[]
    expect(frames[0]?.timestamp).toBe(0)
    expect(frames[1]?.timestamp).toBe(15)
  })
})
