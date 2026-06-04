import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, Narrator, Image, SongTag, Album } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Meditations Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Image
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

  describe('randomSongUrl virtual field', () => {
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

      expect(result.randomSongUrl).toBeDefined()
      expect(typeof result.randomSongUrl).toBe('string')
      expect(result.randomSongUrl).toMatch(/audio-42s/)
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

      expect(result.randomSongUrl).toBeNull()
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

      expect(result.randomSongUrl).toBeNull()
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

      expect(result.randomSongUrl).toBeNull()
    })

    it('excludes songs with includeForMeditations false', async () => {
      // Create a unique tag for isolation
      const tag = await testData.createSongTag(payload, { title: 'Exclude Test Tag' })

      // Create two songs: one normal, one excluded
      await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [tag.id],
      })
      const excludedSong = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [tag.id],
      })

      // Manually opt the song out of meditations
      await payload.update({
        collection: 'songs',
        id: excludedSong.id,
        data: { includeForMeditations: false },
      })

      // Create meditation with this tag
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { songTag: tag.id },
      )

      // Run multiple times - the excluded song should never appear
      for (let i = 0; i < 5; i++) {
        const result = await payload.findByID({
          collection: 'meditations',
          id: meditation.id,
          draft: true,
        })
        expect(result.randomSongUrl).toBeDefined()
        expect(result.randomSongUrl).not.toContain(excludedSong.filename)
      }
    })

    it('returns null when all matching songs are excluded', async () => {
      const tag = await testData.createSongTag(payload, { title: 'All Excluded Tag' })

      const song = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [tag.id],
      })

      await payload.update({
        collection: 'songs',
        id: song.id,
        data: { includeForMeditations: false },
      })

      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { songTag: tag.id },
      )

      const result = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(result.randomSongUrl).toBeNull()
    })

    it('auto-sets includeForMeditations to false on creation when song has vocals tag', async () => {
      // Create a song tag with the 'vocals' slug
      const vocalsTag = await testData.createSongTag(payload, {
        title: 'Vocals',
        slug: 'vocals',
      })

      const song = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [vocalsTag.id],
      })

      const fetched = await payload.findByID({
        collection: 'songs',
        id: song.id,
      })
      expect(fetched.includeForMeditations).toBe(false)
    })

    it('does not change includeForMeditations after creation when tags change', async () => {
      const vocalsTag = await payload.find({
        collection: 'song-tags',
        where: { slug: { equals: 'vocals' } },
        limit: 1,
      })

      // The vocals tag should exist from the previous test
      const vocalsId = vocalsTag.docs[0]?.id
      expect(vocalsId).toBeDefined()

      const otherTag = await testData.createSongTag(payload, { title: 'Other Tag' })

      // Song created with vocals → auto-set to false
      const vocalSong = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [vocalsId!, otherTag.id],
      })
      let fetched = await payload.findByID({ collection: 'songs', id: vocalSong.id })
      expect(fetched.includeForMeditations).toBe(false)

      // Removing the vocals tag must NOT flip it back to true (manual control only)
      await payload.update({
        collection: 'songs',
        id: vocalSong.id,
        data: { tags: [otherTag.id] },
      })
      fetched = await payload.findByID({ collection: 'songs', id: vocalSong.id })
      expect(fetched.includeForMeditations).toBe(false)

      // Song created without vocals → default to true
      const instrumentalSong = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [otherTag.id],
      })
      fetched = await payload.findByID({ collection: 'songs', id: instrumentalSong.id })
      expect(fetched.includeForMeditations).toBe(true)

      // Adding the vocals tag later must NOT flip it to false (manual control only)
      await payload.update({
        collection: 'songs',
        id: instrumentalSong.id,
        data: { tags: [vocalsId!, otherTag.id] },
      })
      fetched = await payload.findByID({ collection: 'songs', id: instrumentalSong.id })
      expect(fetched.includeForMeditations).toBe(true)
    })

    it('is excluded from relationship population via defaultPopulate', async () => {
      // defaultPopulate: { randomSongUrl: false } prevents randomSongUrl from being
      // computed when meditations are populated through relationship fields.
      // This is the primary performance optimization - avoiding N+1 song
      // queries when loading lists of meditations via relationships.

      // Create a song so randomSongUrl would have a value if populated
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

      // Fetch the lesson with meditation populated - randomSongUrl should be excluded
      const lessonResult = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 1, // Populate relationships
      })

      // meditation is polymorphic — unwrap the { relationTo, value } wrapper
      const populatedMeditation = (lessonResult.meditation as { value: Meditation }).value
      expect(populatedMeditation).toBeDefined()
      expect(populatedMeditation.id).toBe(meditation.id)
      // randomSongUrl should be excluded from relationship population due to defaultPopulate
      expect(populatedMeditation.randomSongUrl).toBeFalsy()

      // Direct query should include randomSongUrl (virtual fields always run on direct queries)
      const directResult = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        draft: true,
      })

      expect(directResult.randomSongUrl).toBeDefined()
      expect(typeof directResult.randomSongUrl).toBe('string')
    })
  })

  describe('Locale filtering', () => {
    let enMeditation1: Meditation
    let enMeditation2: Meditation
    let csMeditation: Meditation
    let deMeditation: Meditation

    beforeAll(async () => {
      // Create meditations in different locales
      enMeditation1 = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { title: 'English Meditation 1', locale: 'en' },
      )
      enMeditation2 = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { title: 'English Meditation 2', locale: 'en' },
      )
      csMeditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { title: 'Czech Meditation', locale: 'cs' },
      )
      deMeditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { title: 'German Meditation', locale: 'de' },
      )
    })

    it('filters meditations by English locale', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'en',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(enMeditation1.id)
      expect(ids).toContain(enMeditation2.id)
      expect(ids).not.toContain(csMeditation.id)
      expect(ids).not.toContain(deMeditation.id)
      // All returned docs should have locale 'en'
      expect(result.docs.every((doc) => doc.locale === 'en')).toBe(true)
    })

    it('filters meditations by Czech locale', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'cs',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(csMeditation.id)
      expect(ids).not.toContain(enMeditation1.id)
      expect(ids).not.toContain(deMeditation.id)
      expect(result.docs.every((doc) => doc.locale === 'cs')).toBe(true)
    })

    it('returns all meditations when locale is all', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'all',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(enMeditation1.id)
      expect(ids).toContain(csMeditation.id)
      expect(ids).toContain(deMeditation.id)
    })

    it('returns specific meditation by ID regardless of locale mismatch', async () => {
      // Query a German meditation with locale set to English
      const result = await payload.findByID({
        collection: 'meditations',
        id: deMeditation.id,
        locale: 'en',
        draft: true,
      })

      expect(result).toBeDefined()
      expect(result.id).toBe(deMeditation.id)
      expect(result.locale).toBe('de')
    })

    it('count respects locale filtering', async () => {
      const enCount = await payload.count({
        collection: 'meditations',
        locale: 'en',
      })
      const csCount = await payload.count({
        collection: 'meditations',
        locale: 'cs',
      })
      const allCount = await payload.count({
        collection: 'meditations',
        locale: 'all',
      })

      expect(csCount.totalDocs).toBe(1)
      expect(enCount.totalDocs).toBeGreaterThan(csCount.totalDocs)
      expect(allCount.totalDocs).toBeGreaterThanOrEqual(enCount.totalDocs + csCount.totalDocs)
    })

    it('preserves existing where clauses alongside locale filter', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'en',
        draft: true,
        depth: 0,
        where: {
          title: { equals: 'English Meditation 1' },
        },
      })

      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(enMeditation1.id)
    })

    it('defaults to English locale when no locale specified', async () => {
      // PayloadCMS defaults req.locale to 'en' when not specified
      const result = await payload.find({
        collection: 'meditations',
        draft: true,
        depth: 0,
      })

      // Should only contain English meditations
      expect(result.docs.every((doc) => doc.locale === 'en')).toBe(true)
      expect(result.docs.map((doc) => doc.id)).not.toContain(csMeditation.id)
      expect(result.docs.map((doc) => doc.id)).not.toContain(deMeditation.id)
    })
  })

  describe('Type field', () => {
    it('creates meditation with quick type by default', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { title: 'Quick Default Test' },
      )

      expect(meditation.type).toBe('quick')
    })

    it('creates meditation with lesson type', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        {
          title: 'Lesson Meditation',
          type: 'lesson',
        },
      )

      expect(meditation.type).toBe('lesson')
    })
  })
})
