import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, Narrator, Image, SongTag, MeditationTag, Album } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Meditations Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Image
  let testTag1: MeditationTag
  let testTag2: MeditationTag
  let testSongTag: SongTag
  let testMeditation: Meditation
  let testAlbum: Album

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testData.createNarrator(payload)
    testImageMedia = await testData.createMediaImage(payload)
    testTag1 = await testData.createMeditationTag(payload)
    testTag2 = await testData.createMeditationTag(payload)
    testSongTag = await testData.createSongTag(payload)
    testAlbum = await testData.createAlbum(payload)

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
        songTag: testSongTag.id,
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
      typeof testMeditation.songTag === 'object' && testMeditation.songTag
        ? testMeditation.songTag.id
        : testMeditation.songTag,
    ).toBe(testSongTag.id)
  })

  it('creates meditation as draft by default', async () => {
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Draft Meditation',
      },
    )

    expect(meditation._status).toBe('draft')
  })

  it('creates meditation with audio file', async () => {
    const meditation = await testData.createMeditation(payload, {
      narrator: testNarrator.id,
      thumbnail: testImageMedia.id,
    })

    expect(meditation).toBeDefined()
    expect(meditation.filename).toBeDefined()
  })

  describe('songUrl virtual field', () => {
    it('returns a URL when matching songs exist', async () => {
      // Create songs tagged with the songTag
      await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [testSongTag.id],
      })
      await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [testSongTag.id],
      })

      const result = await payload.findByID({
        collection: 'meditations',
        id: testMeditation.id,
        draft: true,
      })

      expect(result.songUrl).toBeDefined()
      expect(typeof result.songUrl).toBe('string')
      expect(result.songUrl).toMatch(/audio-42s/)
    })

    it('returns null when no songTag is set', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        {}, // No songTag
      )

      const result = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(result.songUrl).toBeNull()
    })

    it('returns null when no matching songs exist', async () => {
      // Create a different song tag with no songs
      const emptySongTag = await testData.createSongTag(payload, { title: 'Empty Tag' })

      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { songTag: emptySongTag.id },
      )

      const result = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(result.songUrl).toBeNull()
    })

    it('excludes soft-deleted songs', async () => {
      // Create a unique song tag for this test
      const isolatedTag = await testData.createSongTag(payload, { title: 'Isolated Tag' })

      // Create songs with this tag
      const song1 = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [isolatedTag.id],
      })
      const song2 = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [isolatedTag.id],
      })

      // Soft-delete both songs
      await payload.delete({ collection: 'songs', id: song1.id })
      await payload.delete({ collection: 'songs', id: song2.id })

      // Create meditation with this tag
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { songTag: isolatedTag.id },
      )

      const result = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(result.songUrl).toBeNull()
    })

    it('is excluded from relationship population via defaultPopulate', async () => {
      // defaultPopulate: { songUrl: false } prevents songUrl from being
      // computed when meditations are populated through relationship fields.
      // This is the primary performance optimization - avoiding N+1 song
      // queries when loading lists of meditations via relationships.

      // Create a song so songUrl would have a value if populated
      const tag = await testData.createSongTag(payload, { title: 'Default Test Tag' })
      await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [tag.id],
      })

      // Create meditation with type='lesson' so it can be referenced by a Lesson
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { songTag: tag.id, type: 'lesson' },
      )

      // Create a lesson that references this meditation
      const lesson = await testData.createLesson(payload, {
        meditation: meditation.id,
      })

      // Fetch the lesson with meditation populated - songUrl should be excluded
      const lessonResult = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 1, // Populate relationships
      })

      const populatedMeditation = lessonResult.meditation as Meditation
      expect(populatedMeditation).toBeDefined()
      expect(populatedMeditation.id).toBe(meditation.id)
      // songUrl should be excluded from relationship population due to defaultPopulate
      expect(populatedMeditation.songUrl).toBeFalsy()

      // Direct query should include songUrl (virtual fields always run on direct queries)
      const directResult = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(directResult.songUrl).toBeDefined()
      expect(typeof directResult.songUrl).toBe('string')
    })
  })
})
