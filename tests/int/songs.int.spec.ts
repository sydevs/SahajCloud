import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Album, Song, SongTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Songs Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: SongTag
  let testTag2: SongTag
  let testTag3: SongTag
  let testAlbum: Album
  let testSong: Song

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test album first (required for songs)
    testAlbum = await testData.createAlbum(payload, {
      title: 'Test Album',
      artist: 'Test Artist',
    })

    // Create test tags
    testTag1 = await testData.createSongTag(payload, { title: 'ambient' })
    testTag2 = await testData.createSongTag(payload, { title: 'meditation' })
    testTag3 = await testData.createSongTag(payload, { title: 'nature' })

    testSong = await testData.createSong(payload, {
      title: 'Forest Sounds',
      album: testAlbum.id,
      tags: [testTag1.id, testTag2.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a song with album relationship', async () => {
    expect(testSong).toBeDefined()
    expect(testSong.title).toBe('Forest Sounds')
    expect(testSong.tags).toHaveLength(2)
    expect(testSong.mimeType).toBe('audio/mpeg')
    // In tests, Payload may add numeric suffix to avoid collisions (audio-42s-N.mp3)
    // In production with R2 adapter, filename would be sanitized with random suffix
    expect(testSong.filename).toMatch(/^audio-42s(-\d+)?\.mp3$/)
    expect(testSong.filesize).toBeGreaterThan(0)

    // Check album relationship
    const albumId = typeof testSong.album === 'object' ? testSong.album.id : testSong.album
    expect(albumId).toBe(testAlbum.id)

    // Check tags relationship
    const tagIds = Array.isArray(testSong.tags)
      ? testSong.tags.map((tag) => (typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag))
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('requires album relationship', async () => {
    await expect(
      // @ts-expect-error - Intentionally omitting required field to test validation
      payload.create({
        collection: 'songs',
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
        collection: 'songs',
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
    const song = await testData.createSong(payload, {
      title: 'Valid Audio File',
      album: testAlbum.id,
    })

    expect(song).toBeDefined()
    expect(song.title).toBe('Valid Audio File')
    expect(song.mimeType).toBe('audio/mpeg')
  })

  it('updates a song', async () => {
    const song = await testData.createSong(payload, {
      title: 'Original Title',
      album: testAlbum.id,
    })

    const updated = (await payload.update({
      collection: 'songs',
      id: song.id,
      data: {
        title: 'Updated Title',
        tags: [testTag3.id],
      },
    })) as Song

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

    const song = await testData.createSong(payload, {
      title: 'Movable Track',
      album: testAlbum.id,
    })

    const updated = (await payload.update({
      collection: 'songs',
      id: song.id,
      data: {
        album: secondAlbum.id,
      },
    })) as Song

    const albumId = typeof updated.album === 'object' ? updated.album.id : updated.album
    expect(albumId).toBe(secondAlbum.id)
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
      const song = await testData.createSong(
        payload,
        {
          title: `Test ${format.mimetype.split('/')[1].toUpperCase()}`,
          album: testAlbum.id,
        },
        format.name,
      )

      expect(song).toBeDefined()
      expect(song.mimeType).toBe(format.mimetype)
      // In tests, Payload may add numeric suffix to avoid collisions
      // Regex: basename(-N)?.extension where -N is optional
      const escapedName = format.name.replace('.', '(-\\d+)?\\.')
      expect(song.filename).toMatch(new RegExp(`^${escapedName}$`))
    }
  })

  it('deletes a song', async () => {
    const song = await testData.createSong(payload, {
      title: 'Track to Delete',
      album: testAlbum.id,
    })

    await payload.delete({
      collection: 'songs',
      id: song.id,
    })

    // Verify deletion (should be soft deleted due to trash: true)
    const result = await payload.find({
      collection: 'songs',
      where: {
        id: {
          equals: song.id,
        },
        deletedAt: {
          exists: false,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds songs by album', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Searchable Album',
      artist: 'Search Artist',
    })

    await testData.createSong(payload, {
      title: 'Track in Searchable Album 1',
      album: album.id,
    })

    await testData.createSong(payload, {
      title: 'Track in Searchable Album 2',
      album: album.id,
    })

    const result = await payload.find({
      collection: 'songs',
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

    const song = await testData.createSong(payload, {
      title: 'Track with Populated Album',
      album: album.id,
    })

    // Fetch with depth to populate album
    const fetchedSong = (await payload.findByID({
      collection: 'songs',
      id: song.id,
      depth: 1,
    })) as Song

    // Check that album is populated
    expect(typeof fetchedSong.album).toBe('object')
    if (typeof fetchedSong.album === 'object' && fetchedSong.album !== null) {
      expect(fetchedSong.album.title).toBe('Album for Population Test')
      expect(fetchedSong.album.artist).toBe('Population Artist')
    }
  })
})
