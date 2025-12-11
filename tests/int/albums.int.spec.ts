import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Album, Music } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Albums Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testAlbum: Album

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create a test album with image
    testAlbum = await testData.createAlbum(payload, {
      title: 'Nature Sounds Collection',
      artist: 'Various Artists',
      artistUrl: 'https://example.com/artists/various',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates an album with required fields', async () => {
    expect(testAlbum).toBeDefined()
    expect(testAlbum.title).toBe('Nature Sounds Collection')
    expect(testAlbum.artist).toBe('Various Artists')
    expect(testAlbum.artistUrl).toBe('https://example.com/artists/various')
    // Accept both image/jpeg and image/jpg (detected based on file content)
    expect(['image/jpeg', 'image/jpg']).toContain(testAlbum.mimeType)
    expect(testAlbum.filename).toMatch(/^image-1050x700(-\d+)?-.+\.jpg$/)
    expect(testAlbum.filesize).toBeGreaterThan(0)
  })

  it('creates an album with minimal fields', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Minimal Album',
      artist: 'Solo Artist',
    })

    expect(album).toBeDefined()
    expect(album.title).toBe('Minimal Album')
    expect(album.artist).toBe('Solo Artist')
    // Database returns null for empty optional fields
    expect(album.artistUrl).toBeNull()
  })

  it('validates required title field', async () => {
    // Use payload.create directly to test validation without helper defaults
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'tests/files/image-1050x700.jpg')
    const fileBuffer = fs.readFileSync(filePath)

    await expect(
      payload.create({
        collection: 'albums',
        data: {
          artist: 'Artist Without Title',
          // title intentionally omitted
        },
        file: {
          data: fileBuffer,
          mimetype: 'image/jpeg',
          name: 'test.jpg',
          size: fileBuffer.length,
        },
      }),
    ).rejects.toThrow()
  })

  it('validates required artist field', async () => {
    // Use payload.create directly to test validation without helper defaults
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'tests/files/image-1050x700.jpg')
    const fileBuffer = fs.readFileSync(filePath)

    await expect(
      payload.create({
        collection: 'albums',
        data: {
          title: 'Album Without Artist',
          // artist intentionally omitted
        },
        file: {
          data: fileBuffer,
          mimetype: 'image/jpeg',
          name: 'test.jpg',
          size: fileBuffer.length,
        },
      }),
    ).rejects.toThrow()
  })

  it.skip('supports localized title field', async () => {
    // TODO: Investigate PayloadCMS localization fallback behavior
    const album = await testData.createAlbum(payload, {
      title: 'English Title',
      artist: 'Test Artist',
    })

    // Update with Spanish title
    const updated = (await payload.update({
      collection: 'albums',
      id: album.id,
      locale: 'es',
      data: {
        title: 'Titulo en Espanol',
      },
    })) as Album

    expect(updated.title).toBe('Titulo en Espanol')

    // Verify English title is preserved
    const englishAlbum = (await payload.findByID({
      collection: 'albums',
      id: album.id,
      locale: 'en',
    })) as Album

    expect(englishAlbum.title).toBe('English Title')
  })

  it('supports localized artist field', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Test Album',
      artist: 'English Artist Name',
    })

    // Update with different locale
    const updated = (await payload.update({
      collection: 'albums',
      id: album.id,
      locale: 'de',
      data: {
        artist: 'Deutscher Kunstlername',
      },
    })) as Album

    expect(updated.artist).toBe('Deutscher Kunstlername')
  })

  it('updates an album', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Original Title',
      artist: 'Original Artist',
    })

    const updated = (await payload.update({
      collection: 'albums',
      id: album.id,
      data: {
        title: 'Updated Title',
        artist: 'Updated Artist',
        artistUrl: 'https://example.com/new-url',
      },
    })) as Album

    expect(updated.title).toBe('Updated Title')
    expect(updated.artist).toBe('Updated Artist')
    expect(updated.artistUrl).toBe('https://example.com/new-url')
  })

  it('deletes an album', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Album to Delete',
      artist: 'Temporary Artist',
    })

    await payload.delete({
      collection: 'albums',
      id: album.id,
    })

    // Verify deletion (should be soft deleted due to trash: true)
    const result = await payload.find({
      collection: 'albums',
      where: {
        id: {
          equals: album.id,
        },
        deletedAt: {
          exists: false,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds albums with filters', async () => {
    const album1 = await testData.createAlbum(payload, {
      title: 'Jazz Collection',
      artist: 'Jazz Band',
    })

    await testData.createAlbum(payload, {
      title: 'Rock Anthology',
      artist: 'Rock Stars',
    })

    const result = await payload.find({
      collection: 'albums',
      where: {
        artist: {
          contains: 'Jazz',
        },
      },
    })

    expect(result.docs.length).toBeGreaterThanOrEqual(1)
    expect(result.docs.some((doc) => doc.id === album1.id)).toBe(true)
  })

  it('has join relationship to music tracks', async () => {
    // Create album
    const album = await testData.createAlbum(payload, {
      title: 'Test Album for Music',
      artist: 'Test Artist',
    })

    // Create music tracks linked to this album
    const track1 = (await testData.createMusic(payload, {
      title: 'Track 1',
      album: album.id,
    })) as Music

    const track2 = (await testData.createMusic(payload, {
      title: 'Track 2',
      album: album.id,
    })) as Music

    // Fetch album with populated music join field
    const albumWithMusic = (await payload.findByID({
      collection: 'albums',
      id: album.id,
      depth: 1,
    })) as Album

    // Check that music tracks are populated via join field
    expect(albumWithMusic.music).toBeDefined()
    if (albumWithMusic.music && 'docs' in albumWithMusic.music) {
      expect(albumWithMusic.music.docs).toHaveLength(2)
      const trackIds = albumWithMusic.music.docs.map((track) =>
        typeof track === 'object' ? track.id : track,
      )
      expect(trackIds).toContain(track1.id)
      expect(trackIds).toContain(track2.id)
    }
  })

  it('supports different image formats', async () => {
    const formats = [
      { mimetypes: ['image/jpeg', 'image/jpg'], name: 'image-1050x700.jpg' },
      { mimetypes: ['image/png'], name: 'image-1050x700.png' },
      { mimetypes: ['image/webp'], name: 'image-1050x700.webp' },
    ]

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i]
      const album = await testData.createAlbum(
        payload,
        {
          title: `Album with ${format.name.split('.')[1].toUpperCase()}`,
          artist: 'Format Test Artist',
        },
        format.name,
      )

      expect(album).toBeDefined()
      // Accept any of the valid mimetypes for this format
      expect(format.mimetypes).toContain(album.mimeType)
      expect(album.filename).toMatch(new RegExp(`^${format.name.replace('.', '(-\\d+)?-.+\\.')}$`))
    }
  })

  it('rejects invalid image formats', async () => {
    // Use payload.create directly with audio mimetype to test validation
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'tests/files/audio-42s.mp3')
    const fileBuffer = fs.readFileSync(filePath)

    await expect(
      payload.create({
        collection: 'albums',
        data: {
          title: 'Album with Invalid Image',
          artist: 'Error Test',
        },
        file: {
          data: fileBuffer,
          mimetype: 'audio/mpeg', // Explicitly pass audio mimetype
          name: 'audio-42s.mp3',
          size: fileBuffer.length,
        },
      }),
    ).rejects.toThrow() // Should reject audio mimeType
  })
})
