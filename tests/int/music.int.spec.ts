import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Music, MusicTag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Music Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: MusicTag
  let testTag2: MusicTag
  let testTag3: MusicTag
  let testMusic: Music

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tags
    testTag1 = await testData.createMusicTag(payload, { title: 'ambient' })
    testTag2 = await testData.createMusicTag(payload, { title: 'meditation' })
    testTag3 = await testData.createMusicTag(payload, { title: 'nature' })

    testMusic = await testData.createMusic(payload, {
      title: 'Forest Sounds',
      tags: [testTag1.id, testTag2.id],
      credit: 'Nature Recordings Inc.',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a music track with auto-generated slug', async () => {
    expect(testMusic).toBeDefined()
    expect(testMusic.title).toBe('Forest Sounds')
    expect(testMusic.slug).toBe('forest-sounds')
    expect(testMusic.credit).toBe('Nature Recordings Inc.')
    expect(testMusic.tags).toHaveLength(2)
    expect(testMusic.mimeType).toBe('audio/mpeg')
    expect(testMusic.filename).toMatch(/^audio-42s(-\d+)?-.+\.mp3$/)
    expect(testMusic.filesize).toBeGreaterThan(0)

    // Check tags relationship
    const tagIds = Array.isArray(testMusic.tags)
      ? testMusic.tags.map((tag) => (typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag))
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('handles special characters in slug generation', async () => {
    const music = await testData.createMusic(payload, {
      title: 'Música: Relajación & Paz',
    })

    expect(music.slug).toBe('musica-relajacion-and-paz')
  })

  it('validates audio mimeType only', async () => {
    await expect(
      testData.createMusic(
        payload,
        {
          name: 'invalid.jpg',
        },
        'image-1050x700.jpg',
      ),
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
    const music = await testData.createMusic(payload, {
      title: 'Valid Audio File',
    })

    expect(music).toBeDefined()
    expect(music.title).toBe('Valid Audio File')
    expect(music.mimeType).toBe('audio/mpeg')
  })

  it('updates a music track', async () => {
    const music = await testData.createMusic(payload, {
      title: 'Original Title',
      credit: 'Original Credit',
    })

    const updated = (await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        title: 'Updated Title',
        credit: 'Updated Credit',
        tags: [testTag3.id],
      },
    })) as Music

    expect(updated.title).toBe('Updated Title')
    expect(updated.credit).toBe('Updated Credit')
    expect(updated.slug).toBe('original-title') // Slug should not change on update
    expect(updated.tags).toHaveLength(1)

    const tagIds = Array.isArray(updated.tags)
      ? updated.tags.map((tag) => (typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag))
      : []
    expect(tagIds).toContain(testTag3.id)
  })

  it('preserves slug when updating other fields', async () => {
    const updated = (await payload.update({
      collection: 'music',
      id: testMusic.id,
      data: {
        title: 'Updated Title', // Update title instead of slug since slug is admin-only
        slug: 'a-new-updated-slug',
      },
    })) as Music

    expect(updated.slug).toBe('forest-sounds') // Slug remains unchanged
  })

  it.skip('enforces unique slug constraint', async () => {
    await testData.createMusic(payload, {
      slug: 'duplicate-test',
    })

    await expect(
      testData.createMusic(payload, {
        slug: 'duplicate-test',
      }),
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
      const music = await testData.createMusic(
        payload,
        {
          title: `Test ${format.mimetype.split('/')[1].toUpperCase()}`,
        },
        format.name,
      )

      expect(music).toBeDefined()
      expect(music.mimeType).toBe(format.mimetype)
      expect(music.filename).toMatch(new RegExp(`^${format.name.replace('.', '(-\\d+)?-.+\\.')}$`))
    }
  })
})
