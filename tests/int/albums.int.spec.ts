import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Album, Song } from '@/payload-types'

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
    expect(testAlbum.artwork).toBeDefined()
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
    const img = await testData.createMediaImage(payload, { alt: 'Test artwork' })

    await expect(
      // @ts-expect-error - Intentionally omitting required field to test validation
      payload.create({
        collection: 'albums',
        data: {
          artist: 'Artist Without Title',
          artwork: img.id,
          // title intentionally omitted
        },
      }),
    ).rejects.toThrow()
  })

  it('validates required artist field', async () => {
    const img = await testData.createMediaImage(payload, { alt: 'Test artwork' })

    await expect(
      // @ts-expect-error - Intentionally omitting required field to test validation
      payload.create({
        collection: 'albums',
        data: {
          title: 'Album Without Artist',
          artwork: img.id,
          // artist intentionally omitted
        },
      }),
    ).rejects.toThrow()
  })

  it('supports localized artist field', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Test Album',
      artist: 'English Artist Name',
    })

    // Update with different locale
    // Note: overrideAccess needed since test environment lacks proper user context for locale-based access
    // Note: Both title and artist are localized and required, so we must provide both for the new locale
    const updated = (await payload.update({
      collection: 'albums',
      id: album.id,
      locale: 'de',
      overrideAccess: true,
      data: {
        title: 'Testalbum',
        artist: 'Deutscher Kunstlername',
      },
    })) as Album

    expect(updated.artist).toBe('Deutscher Kunstlername')
    expect(updated.title).toBe('Testalbum')
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

  it('has join relationship to song tracks', async () => {
    // Create album
    const album = await testData.createAlbum(payload, {
      title: 'Test Album for Songs',
      artist: 'Test Artist',
    })

    // Create song tracks linked to this album
    const track1 = (await testData.createSong(payload, {
      title: 'Track 1',
      album: album.id,
    })) as Song

    const track2 = (await testData.createSong(payload, {
      title: 'Track 2',
      album: album.id,
    })) as Song

    // Fetch album with populated songs join field
    const albumWithSongs = (await payload.findByID({
      collection: 'albums',
      id: album.id,
      depth: 1,
    })) as Album

    // Check that song tracks are populated via join field
    expect(albumWithSongs.songs).toBeDefined()
    if (albumWithSongs.songs && 'docs' in albumWithSongs.songs && albumWithSongs.songs.docs) {
      expect(albumWithSongs.songs.docs).toHaveLength(2)
      const trackIds = albumWithSongs.songs.docs.map((track) =>
        typeof track === 'object' ? track.id : track,
      )
      expect(trackIds).toContain(track1.id)
      expect(trackIds).toContain(track2.id)
    }
  })

  it('populates artwork relationship at depth 1', async () => {
    const album = await testData.createAlbum(payload, {
      title: 'Album with Artwork',
      artist: 'Artwork Artist',
    })

    const fetched = (await payload.findByID({
      collection: 'albums',
      id: album.id,
      depth: 1,
    })) as Album

    expect(fetched.artwork).toBeDefined()
    expect(typeof fetched.artwork).toBe('object')
    const artwork = fetched.artwork as { id: number; alt: string }
    expect(artwork.id).toBeDefined()
    expect(artwork.alt).toBe('Album artwork')
  })
})
