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
    // Proves the urlField() validator is actually wired onto this field — a
    // plain `type: 'text'` field would accept this, and the website then drops
    // the value at its own isSafeHttpUrl gate with the row left wrong.
    // tests/unit/url-field.spec.ts covers the validator's own logic.
    it('rejects a value that is not an http(s) URL', async () => {
      try {
        await testData.createAlbum(payload, { artistUrl: 'not a url' })
        throw new Error('expected create to throw — an invalid URL should be rejected')
      } catch (err) {
        const data = (err as { data?: { errors?: Array<{ path: string; message: string }> } }).data
        const fieldErr = (data?.errors ?? []).find((e) => e.path === 'artistUrl')
        expect(fieldErr?.message).toBe('Please enter a valid URL')
      }
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
