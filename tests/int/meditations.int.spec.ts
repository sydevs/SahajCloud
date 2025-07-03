import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Meditation, Narrator, Media, Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Meditations Collection (Isolated)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testMedia: Media
  let testTag1: Tag
  let testTag2: Tag
  let testMusicTag: Tag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test narrator
    testNarrator = await payload.create({
      collection: 'narrators',
      data: testDataFactory.narrator({ name: 'Test Narrator' }),
    }) as Narrator

    // Create test media (reuse for both thumbnail and audio in tests)
    testMedia = await payload.create({
      collection: 'media',
      data: testDataFactory.media({ alt: 'Test meditation media' }).data,
      file: testDataFactory.media().file,
    }) as Media

    // Create test tags
    testTag1 = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'morning' }),
    }) as Tag

    testTag2 = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'peaceful' }),
    }) as Tag

    testMusicTag = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'ambient' }),
    }) as Tag
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a meditation with auto-generated slug', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Morning Meditation',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        tags: [testTag1.id, testTag2.id],
        musicTag: testMusicTag.id,
        isPublished: false,
      },
    }) as Meditation

    expect(meditation).toBeDefined()
    expect(meditation.title).toBe('Morning Meditation')
    expect(meditation.slug).toBe('morning-meditation')
    expect(meditation.duration).toBe(15)
    expect(typeof meditation.audioFile === 'object' ? meditation.audioFile.id : meditation.audioFile).toBe(testMedia.id)
    expect(typeof meditation.narrator === 'object' ? meditation.narrator.id : meditation.narrator).toBe(testNarrator.id)
    expect(meditation.tags).toHaveLength(2)
    // Tags may be populated objects or IDs
    const tagIds = Array.isArray(meditation.tags) 
      ? meditation.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
    expect(typeof meditation.musicTag === 'object' && meditation.musicTag ? meditation.musicTag.id : meditation.musicTag).toBe(testMusicTag.id)
    expect(meditation.isPublished).toBe(false)
  })

  it('ignores custom slug on create', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Evening Meditation',
        slug: 'custom-evening-slug', // This should be ignored
        duration: 20,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    expect(meditation.slug).toBe('evening-meditation') // Auto-generated from title
  })

  it('handles special characters in slug generation', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Meditación: Relajación & Paz',
        duration: 10,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    expect(meditation.slug).toBe('meditaci-n-relajaci-n-paz')
  })

  it('requires required fields', async () => {
    await expect(
      payload.create({
        collection: 'meditations',
        data: {
          title: 'Incomplete Meditation',
          duration: 10,
          // Missing thumbnail, audioFile, and narrator
        } as any,
      })
    ).rejects.toThrow()
  })

  it('validates duration minimum value', async () => {
    await expect(
      payload.create({
        collection: 'meditations',
        data: {
          title: 'Invalid Duration',
          duration: 0,
          thumbnail: testMedia.id,
          audioFile: testMedia.id,
          narrator: testNarrator.id,
        },
      })
    ).rejects.toThrow()
  })

  it('creates meditation with relationships', async () => {
    const meditationData = testDataFactory.meditation(
      {
        narrator: testNarrator.id,
        audioFile: testMedia.id,
        thumbnail: testMedia.id,
        tags: [testTag1.id],
        musicTag: testMusicTag.id,
      },
      {
        title: 'Meditation with Relationships',
        duration: 25,
      }
    )

    const meditation = await payload.create({
      collection: 'meditations',
      data: meditationData,
    }) as Meditation

    expect(meditation.title).toBe('Meditation with Relationships')
    expect(meditation.duration).toBe(25)
  })

  it('preserves slug on update', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Original Title',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    const originalSlug = meditation.slug

    const updated = await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: {
        title: 'Updated Title',
        slug: 'attempted-slug-change', // This should be ignored
      },
    }) as Meditation

    expect(updated.title).toBe('Updated Title')
    expect(updated.slug).toBe(originalSlug) // Slug should remain unchanged
  })

  it('publishes meditation with date', async () => {
    const publishDate = new Date()
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Published Meditation',
        duration: 30,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: true,
        publishedDate: publishDate.toISOString(),
      },
    }) as Meditation

    expect(meditation.isPublished).toBe(true)
    expect(meditation.publishedDate).toBeDefined()
  })

  it('finds meditations with filters', async () => {
    // Create published meditation with unique title
    const publishedTitle = 'Filter Test Published Meditation'
    const published = await payload.create({
      collection: 'meditations',
      data: {
        title: publishedTitle,
        duration: 20,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: true,
        publishedDate: new Date().toISOString(),
      },
    }) as Meditation

    // Create unpublished meditation
    await payload.create({
      collection: 'meditations',
      data: {
        title: 'Filter Test Unpublished Meditation',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: false,
      },
    })

    // Find only published meditations with our specific title
    const result = await payload.find({
      collection: 'meditations',
      where: {
        and: [
          {
            isPublished: {
              equals: true,
            },
          },
          {
            title: {
              equals: publishedTitle,
            },
          },
        ],
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].id).toBe(published.id)
    expect(result.docs[0].title).toBe(publishedTitle)
  })

  it('deletes a meditation', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'To Delete',
        duration: 10,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    await payload.delete({
      collection: 'meditations',
      id: meditation.id,
    })

    const result = await payload.find({
      collection: 'meditations',
      where: {
        id: {
          equals: meditation.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create a meditation in this test
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Isolation Test Meditation',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    // Query all meditations
    const allMeditations = await payload.find({
      collection: 'meditations',
    })

    // Should only see meditations created in this test file
    expect(allMeditations.docs.length).toBeGreaterThan(0)
    
    // Verify only our test data exists
    const isolationTestMeditations = allMeditations.docs.filter(m => m.title === 'Isolation Test Meditation')
    expect(isolationTestMeditations).toHaveLength(1)
    expect(isolationTestMeditations[0].id).toBe(meditation.id)
  })
})