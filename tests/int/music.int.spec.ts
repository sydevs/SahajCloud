import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Album, Music, MusicTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Music Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: MusicTag
  let testTag2: MusicTag
  let testTag3: MusicTag
  let testAlbum: Album
  let testMusic: Music

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test album first (required for music tracks)
    testAlbum = await testData.createAlbum(payload, {
      title: 'Test Album',
      artist: 'Test Artist',
    })

    // Create test tags
    testTag1 = await testData.createMusicTag(payload, { title: 'ambient' })
    testTag2 = await testData.createMusicTag(payload, { title: 'meditation' })
    testTag3 = await testData.createMusicTag(payload, { title: 'nature' })

    testMusic = await testData.createMusic(payload, {
      title: 'Forest Sounds',
      album: testAlbum.id,
      tags: [testTag1.id, testTag2.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a music track with album relationship', async () => {
    expect(testMusic).toBeDefined()
    expect(testMusic.title).toBe('Forest Sounds')
    expect(testMusic.tags).toHaveLength(2)
    expect(testMusic.mimeType).toBe('audio/mpeg')
    expect(testMusic.filename).toMatch(/^audio-42s(-\d+)?-.+\.mp3$/)
    expect(testMusic.filesize).toBeGreaterThan(0)

    // Check album relationship
    const albumId = typeof testMusic.album === 'object' ? testMusic.album.id : testMusic.album
    expect(albumId).toBe(testAlbum.id)

    // Check tags relationship
    const tagIds = Array.isArray(testMusic.tags)
      ? testMusic.tags.map((tag) => (typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag))
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('requires album relationship', async () => {
    await expect(
      // @ts-expect-error - Intentionally omitting required field to test validation
      payload.create({
        collection: 'music',
        data: {
          title: 'Track Without Album',
        },
        file: {
          data: Buffer.from('fake audio content'),
          mimetype: 'audio/mpeg',
          name: 'test.mp3',
          size: 1000,
        },
      }),
    ).rejects.toThrow()
  })

  it('validates audio mimeType only', async () => {
    // Use payload.create directly with image mimetype to test validation
    // The helper forces audio mimetype, so we need direct control
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'tests/files/image-1050x700.jpg')
    const fileBuffer = fs.readFileSync(filePath)

    await expect(
      payload.create({
        collection: 'music',
        data: {
          title: 'Invalid Format',
          album: testAlbum.id,
        },
        file: {
          data: fileBuffer,
          mimetype: 'image/jpeg', // Explicitly pass image mimetype
          name: 'image-1050x700.jpg',
          size: fileBuffer.length,
        },
      }),
    ).rejects.toThrow() // Should reject image mimeType
  })

  it('accepts valid audio file within size limit', async () => {
    const music = await testData.createMusic(payload, {
      title: 'Valid Audio File',
      album: testAlbum.id,
    })

    expect(music).toBeDefined()
    expect(music.title).toBe('Valid Audio File')
    expect(music.mimeType).toBe('audio/mpeg')
  })

  it('updates a music track', async () => {
    const music = await testData.createMusic(payload, {
      title: 'Original Title',
      album: testAlbum.id,
    })

    const updated = (await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        title: 'Updated Title',
        tags: [testTag3.id],
      },
    })) as Music

    expect(updated.title).toBe('Updated Title')
    expect(updated.tags).toHaveLength(1)

    const tagIds = Array.isArray(updated.tags)
      ? updated.tags.map((tag) => (typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag))
      : []
    expect(tagIds).toContain(testTag3.id)
  })

  it('can change album relationship', async () => {
    // Create a second album
    const secondAlbum = await testData.createAlbum(payload, {
      title: 'Second Album',
      artist: 'Another Artist',
    })

    const music = await testData.createMusic(payload, {
      title: 'Movable Track',
      album: testAlbum.id,
    })

    const updated = (await payload.update({
      collection: 'music',
      id: music.id,
      data: {
        album: secondAlbum.id,
      },
    })) as Music

    const albumId = typeof updated.album === 'object' ? updated.album.id : updated.album
    expect(albumId).toBe(secondAlbum.id)
  })

  it.skip('supports localized title field', async () => {
    // TODO: Investigate PayloadCMS localization fallback behavior
    // Create music with explicit English locale
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'tests/files/audio-42s.mp3')
    const fileBuffer = fs.readFileSync(filePath)

    const music = (await payload.create({
      collection: 'music',
      locale: 'en',
      data: {
        title: 'English Track Title',
        album: testAlbum.id,
      },
      file: {
        data: fileBuffer,
        mimetype: 'audio/mpeg',
        name: 'audio-42s.mp3',
        size: fileBuffer.length,
      },
    })) as Music

    // Update with Spanish title
    const updated = (await payload.update({
      collection: 'music',
      id: music.id,
      locale: 'es',
      data: {
        title: 'Titulo de Pista en Espanol',
      },
    })) as Music

    expect(updated.title).toBe('Titulo de Pista en Espanol')

    // Verify English title is preserved
    const englishTrack = (await payload.findByID({
      collection: 'music',
      id: music.id,
      locale: 'en',
    })) as Music

    expect(englishTrack.title).toBe('English Track Title')
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
          album: testAlbum.id,
        },
        format.name,
      )

      expect(music).toBeDefined()
      expect(music.mimeType).toBe(format.mimetype)
      expect(music.filename).toMatch(new RegExp(`^${format.name.replace('.', '(-\\d+)?-.+\\.')}$`))
    }
  })

  it('deletes a music track', async () => {
    const music = await testData.createMusic(payload, {
      title: 'Track to Delete',
      album: testAlbum.id,
    })

    await payload.delete({
      collection: 'music',
      id: music.id,
    })

    // Verify deletion (should be soft deleted due to trash: true)
    const result = await payload.find({
      collection: 'music',
      where: {
        id: {
          equals: music.id,
        },
        deletedAt: {
          exists: false,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds music by album', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Searchable Album',
      artist: 'Search Artist',
    })

    await testData.createMusic(payload, {
      title: 'Track in Searchable Album 1',
      album: album.id,
    })

    await testData.createMusic(payload, {
      title: 'Track in Searchable Album 2',
      album: album.id,
    })

    const result = await payload.find({
      collection: 'music',
      where: {
        album: {
          equals: album.id,
        },
      },
    })

    expect(result.docs).toHaveLength(2)
    result.docs.forEach((track) => {
      const trackAlbumId = typeof track.album === 'object' ? track.album.id : track.album
      expect(trackAlbumId).toBe(album.id)
    })
  })

  it('populates album data when depth is set', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Album for Population Test',
      artist: 'Population Artist',
    })

    const music = await testData.createMusic(payload, {
      title: 'Track with Populated Album',
      album: album.id,
    })

    // Fetch with depth to populate album
    const fetchedMusic = (await payload.findByID({
      collection: 'music',
      id: music.id,
      depth: 1,
    })) as Music

    // Check that album is populated
    expect(typeof fetchedMusic.album).toBe('object')
    if (typeof fetchedMusic.album === 'object' && fetchedMusic.album !== null) {
      expect(fetchedMusic.album.title).toBe('Album for Population Test')
      expect(fetchedMusic.album.artist).toBe('Population Artist')
    }
  })
})
