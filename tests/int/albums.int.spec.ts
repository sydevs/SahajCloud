import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Albums Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('artistUrl (#1236)', () => {
    /**
     * The per-field message off a rejected write. Payload's ValidationError
     * keeps a generic summary on `.message` and the message a human reads on
     * `.data.errors[]`.
     */
    const fieldErrorMessage = async (write: Promise<unknown>): Promise<string> => {
      try {
        await write
        throw new Error('expected the write to be rejected on "artistUrl"')
      } catch (error) {
        const data = (error as { data?: { errors?: Array<{ path: string; message: string }> } })
          .data
        const match = (data?.errors ?? []).find((entry) => entry.path === 'artistUrl')
        if (!match) throw error
        return match.message
      }
    }

    // The website publishes it as a MusicRecording's `byArtist` URL and drops
    // anything its own `isSafeHttpUrl` gate refuses, so a malformed value is
    // refused here instead of travelling and being dropped there.
    it('refuses a value that is not a URL', async () => {
      const message = await fieldErrorMessage(
        testData.createAlbum(payload, { artistUrl: 'not a url' }),
      )
      expect(message).toMatch(/valid URL/i)
    })

    it('refuses a URL on another scheme', async () => {
      const message = await fieldErrorMessage(
        testData.createAlbum(payload, { artistUrl: 'javascript:alert(1)' }),
      )
      expect(message).toMatch(/http/i)
    })

    it('accepts an https URL and leaves it blank when unset', async () => {
      const named = await testData.createAlbum(payload, {
        artistUrl: 'https://example.invalid/artist',
      })
      expect(named.artistUrl).toBe('https://example.invalid/artist')

      const bare = await testData.createAlbum(payload)
      expect(bare.artistUrl).toBeNull()
    })
  })

  describe('Parent deletion cascade', () => {
    it('deletes child songs when the album is deleted', async () => {
      const album = await testData.createAlbum(payload)
      const song1 = await testData.createSong(payload, { album: album.id })
      const song2 = await testData.createSong(payload, { album: album.id })

      await payload.delete({ collection: 'albums', id: album.id })

      const remaining = await payload.find({
        collection: 'songs',
        where: { id: { in: [song1.id, song2.id] } },
        trash: true,
        depth: 0,
      })
      expect(remaining.docs).toHaveLength(0)
    })

    it('does not touch songs belonging to other albums', async () => {
      const albumA = await testData.createAlbum(payload)
      const albumB = await testData.createAlbum(payload)
      const songA = await testData.createSong(payload, { album: albumA.id })
      const songB = await testData.createSong(payload, { album: albumB.id })

      await payload.delete({ collection: 'albums', id: albumA.id })

      const survivor = await payload.findByID({
        collection: 'songs',
        id: songB.id,
        depth: 0,
      })
      expect(survivor.id).toBe(songB.id)

      await expect(
        payload.findByID({ collection: 'songs', id: songA.id, depth: 0 }),
      ).rejects.toThrow()
    })

    it('does not cascade on soft-delete (deletedAt set via update)', async () => {
      const album = await testData.createAlbum(payload)
      const song = await testData.createSong(payload, { album: album.id })

      // Soft-delete is an update setting `deletedAt`, not a delete operation —
      // so the cascade hook should not fire.
      await payload.update({
        collection: 'albums',
        id: album.id,
        data: { deletedAt: new Date().toISOString() },
      })

      const stillThere = await payload.findByID({
        collection: 'songs',
        id: song.id,
        depth: 0,
      })
      expect(stillThere.id).toBe(song.id)
    })
  })
})
