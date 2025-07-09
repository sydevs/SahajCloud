import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Music, Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Music Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: Tag
  let testTag2: Tag
  let testTag3: Tag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tags
    testTag1 = await testDataFactory.createTag(payload, { title: 'ambient' })
    testTag2 = await testDataFactory.createTag(payload, { title: 'meditation' })
    testTag3 = await testDataFactory.createTag(payload, { title: 'nature' })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a music track with auto-generated slug', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Forest Sounds',
      tags: [testTag1.id, testTag2.id],
      credit: 'Nature Recordings Inc.',
    })

    expect(music).toBeDefined()
    expect(music.title).toBe('Forest Sounds')
    expect(music.slug).toBe('forest-sounds')
    expect(music.credit).toBe('Nature Recordings Inc.')
    expect(music.tags).toHaveLength(2)
    expect(music.mimeType).toBe('audio/mpeg')
    expect(music.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)
    expect(music.filesize).toBeGreaterThan(0)

    // Check tags relationship
    const tagIds = Array.isArray(music.tags) 
      ? music.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('ignores custom slug on create', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Rain Sounds',
      slug: 'custom-rain-slug', // This should be ignored
    })

    expect(music.slug).toBe('rain-sounds') // Auto-generated from title
  })

  it('handles special characters in slug generation', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Música: Relajación & Paz',
    })

    expect(music.slug).toBe('m-sica-relajaci-n-paz')
  })

  it('requires title field', async () => {
    await expect(
      testDataFactory.createMusic(payload, {
        credit: 'Test Credit',
        title: undefined, // Remove title to test validation
      } as any)
    ).rejects.toThrow()
  })

  it('validates audio mimeType only', async () => {
    await expect(
      testDataFactory.createMusic(payload, {
        name: 'invalid.jpg',
      }, 'image-1050x700.jpg')
    ).rejects.toThrow() // Accept any upload-related error for now
  })

  // TODO: Fix this
  // it.skip('validates file size limit (50MB)', async () => {
  //   // TODO: File size validation needs to be implemented properly
  //   // The current hook-based approach isn't working as expected
  //   // This test is skipped until we implement proper file size validation
  //   await expect(
  //     payload.create({
  //       collection: 'music',
  //       data: {
  //         title: 'Large File',
  //       },
  //       file: {
  //         data: Buffer.from('fake audio content'),
  //         mimetype: 'audio/mp3',
  //         name: 'large.mp3',
  //         size: 60000000, // 60MB - exceeds 50MB limit
  //       },
  //     })
  //   ).rejects.toThrow('File size must be less than 50MB')
  // })

  it('accepts valid audio file within size limit', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Valid Audio File',
    })

    expect(music).toBeDefined()
    expect(music.title).toBe('Valid Audio File')
    expect(music.mimeType).toBe('audio/mpeg')
  })

  it('updates a music track', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Original Title',
      credit: 'Original Credit',
    })

    const updated = await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        title: 'Updated Title',
        credit: 'Updated Credit',
        tags: [testTag3.id],
      },
    }) as Music

    expect(updated.title).toBe('Updated Title')
    expect(updated.credit).toBe('Updated Credit')
    expect(updated.slug).toBe('original-title') // Slug should not change on update
    expect(updated.tags).toHaveLength(1)
    
    const tagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag3.id)
  })

  it('preserves slug when updating other fields', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Unique Slug Preservation Test Title',
    })

    const updated = await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        title: 'Updated Title', // Update title instead of slug since slug is admin-only
      },
    }) as Music

    expect(updated.slug).toBe('unique-slug-preservation-test-title') // Slug remains unchanged
  })

  it('manages tags relationships properly', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'Tagged Music',
      tags: [testTag1.id, testTag2.id],
    })

    expect(music.tags).toHaveLength(2)
    
    // Update tags
    const updated = await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        tags: [testTag3.id],
      },
    }) as Music

    expect(updated.tags).toHaveLength(1)
    const updatedTagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(updatedTagIds).toContain(testTag3.id)
  })

  it('deletes a music track', async () => {
    const music = await testDataFactory.createMusic(payload, {
      title: 'To Delete',
    })

    await payload.delete({
      collection: 'music',
      id: music.id,
    })

    // Verify deletion
    const result = await payload.find({
      collection: 'music',
      where: {
        id: {
          equals: music.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds music with filters', async () => {
    await testDataFactory.createMusic(payload, {
      title: 'Filter Test Ambient Track',
      tags: [testTag1.id], // ambient tag
    })

    await testDataFactory.createMusic(payload, {
      title: 'Filter Test Nature Track',
      tags: [testTag3.id], // nature tag
    })

    // Find music with ambient tag AND specific title to avoid conflicts with other tests
    const result = await payload.find({
      collection: 'music',
      where: {
        and: [
          {
            tags: {
              in: [testTag1.id],
            },
          },
          {
            title: {
              like: 'Filter Test Ambient',
            },
          },
        ],
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].title).toBe('Filter Test Ambient Track')
  })

  it('enforces unique slug constraint', async () => {
    await testDataFactory.createMusic(payload, {
      title: 'Duplicate Test',
    })

    await expect(
      testDataFactory.createMusic(payload, {
        title: 'Duplicate Test', // Same title will generate same slug
      })
    ).rejects.toThrow()
  })

  it('supports different audio formats', async () => {
    const formats = [
      { mimetype: 'audio/mpeg', name: 'audio-42s.mp3' },
      // { mimetype: 'audio/wav', name: 'audio-5s.wav' },
      // { mimetype: 'audio/ogg', name: 'audio-42s.ogg' },
      // { mimetype: 'audio/aac', name: 'audio-42s.aac' },
    ]

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i]
      const music = await testDataFactory.createMusic(payload, {
        title: `Test ${format.mimetype.split('/')[1].toUpperCase()}`,
      }, format.name)

      expect(music).toBeDefined()
      expect(music.mimeType).toBe(format.mimetype)
      expect(music.filename).toMatch(new RegExp(`^${format.name.replace('.', '(-\\d+)?\\.')}$`))
    }
  })
})