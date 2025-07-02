import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { Meditation, Narrator, Media, Tag } from '@/payload-types'

let payload: Payload
let testNarrator: Narrator
let testMedia: Media
let testTag1: Tag
let testTag2: Tag
let testTag3: Tag
let testTag4: Tag
let testTag5: Tag

describe('Meditations Collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Create test narrator
    testNarrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator',
        gender: 'male',
      },
    }) as Narrator

    // Create test media (reuse for both thumbnail and audio in tests)
    testMedia = await payload.create({
      collection: 'media',
      data: {
        alt: 'Test media file',
      },
      file: {
        data: Buffer.from('test content'),
        mimetype: 'audio/mp3',
        name: 'test-file.mp3',
        size: 1000,
      },
    }) as Media

    // Create test tags
    testTag1 = await payload.create({
      collection: 'tags',
      data: {
        title: 'morning',
      },
    }) as Tag

    testTag2 = await payload.create({
      collection: 'tags',
      data: {
        title: 'peaceful',
      },
    }) as Tag

    testTag3 = await payload.create({
      collection: 'tags',
      data: {
        title: 'beginner',
      },
    }) as Tag

    testTag4 = await payload.create({
      collection: 'tags',
      data: {
        title: 'breathing',
      },
    }) as Tag

    testTag5 = await payload.create({
      collection: 'tags',
      data: {
        title: 'evening',
      },
    }) as Tag
  })

  afterEach(async () => {
    await payload.delete({
      collection: 'meditations',
      where: {},
    })
    // Clean up any additional tags created during tests
    await payload.delete({
      collection: 'tags',
      where: {
        id: {
          not_in: [testTag1.id, testTag2.id, testTag3.id, testTag4.id, testTag5.id],
        },
      },
    })
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
        musicTag: 'ambient',
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
    expect(meditation.musicTag).toBe('ambient')
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
        } as any, // Use any to bypass TypeScript validation for this negative test
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
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Meditation with Relationships',
        duration: 25,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    // Test that relationships are set correctly (IDs)
    expect(typeof meditation.narrator === 'object' ? meditation.narrator.id : meditation.narrator).toBe(testNarrator.id)
    expect(typeof meditation.audioFile === 'object' ? meditation.audioFile.id : meditation.audioFile).toBe(testMedia.id)
    expect(typeof meditation.thumbnail === 'object' ? meditation.thumbnail.id : meditation.thumbnail).toBe(testMedia.id)
  })

  it('finds meditations with filters', async () => {
    await payload.create({
      collection: 'meditations',
      data: {
        title: 'Published Meditation',
        duration: 30,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: true,
        publishedDate: new Date().toISOString(),
      },
    })

    await payload.create({
      collection: 'meditations',
      data: {
        title: 'Unpublished Meditation',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: false,
      },
    })

    const result = await payload.find({
      collection: 'meditations',
      where: {
        isPublished: {
          equals: true,
        },
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].title).toBe('Published Meditation')
  })

  it('updates a meditation', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Original Title',
        duration: 20,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        isPublished: false,
      },
    }) as Meditation

    const updated = await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: {
        title: 'Updated Title',
        duration: 25,
        isPublished: true,
        publishedDate: new Date().toISOString(),
      },
    }) as Meditation

    expect(updated.title).toBe('Updated Title')
    expect(updated.duration).toBe(25)
    expect(updated.isPublished).toBe(true)
    expect(updated.publishedDate).toBeDefined()
    expect(updated.slug).toBe('original-title') // Slug should not change on update
  })

  it('cannot update slug', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Original Title',
        duration: 20,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    }) as Meditation

    const updated = await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: {
        slug: 'new-slug', // This should be ignored due to access control
      },
    }) as Meditation

    expect(updated.slug).toBe('original-title') // Slug remains unchanged
  })

  it('manages tags relationships properly', async () => {
    const meditation = await payload.create({
      collection: 'meditations',
      data: {
        title: 'Tagged Meditation',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
        tags: [testTag1.id, testTag3.id, testTag4.id], // morning, beginner, breathing
      },
    }) as Meditation

    expect(meditation.tags).toHaveLength(3)
    const tagIds = Array.isArray(meditation.tags) 
      ? meditation.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag3.id)
    expect(tagIds).toContain(testTag4.id)

    // Update tags
    const updated = await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: {
        tags: [testTag5.id, testTag2.id], // evening, peaceful
      },
    }) as Meditation

    expect(updated.tags).toHaveLength(2)
    const updatedTagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(updatedTagIds).toContain(testTag5.id)
    expect(updatedTagIds).toContain(testTag2.id)
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

  it('enforces unique slug constraint', async () => {
    await payload.create({
      collection: 'meditations',
      data: {
        title: 'Duplicate Test',
        duration: 15,
        thumbnail: testMedia.id,
        audioFile: testMedia.id,
        narrator: testNarrator.id,
      },
    })

    await expect(
      payload.create({
        collection: 'meditations',
        data: {
          title: 'Duplicate Test', // Same title will generate same slug
          duration: 20,
          thumbnail: testMedia.id,
          audioFile: testMedia.id,
          narrator: testNarrator.id,
        },
      })
    ).rejects.toThrow()
  })
})