/**
 * What the `meditation-transcripts` table itself enforces: who may read it,
 * that a meditation carries at most one transcript, and that the column's own
 * validator refuses a segment it cannot seek through.
 *
 * The read cases go through `payload.find` with `overrideAccess: false`.
 * Naming the slug in `RESTRICTED_COLLECTIONS` proves nothing on its own —
 * asserting `hasPermission` would have passed while the hole was open
 * (`docs/rules/access.md`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

type Caller = Record<string, unknown> | null

const EDITOR: Caller = {
  id: 9001,
  collection: 'managers',
  type: 'manager',
  roles: { en: ['meditations-editor'] },
}

const APP_CLIENT: Caller = {
  id: 1,
  collection: 'clients',
  _status: 'published',
  roles: ['wemeditate-app-client'],
}

const ATLAS_CLIENT: Caller = {
  id: 2,
  collection: 'clients',
  _status: 'published',
  roles: ['sahaj-atlas-client'],
}

describe('meditation transcripts', () => {
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

  describe('access', () => {
    it('keeps the collection from managers and from every published client key', async () => {
      const meditation = await testData.createMeditation(payload)
      await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'completed',
          language: 'en',
          segments: [{ text: 'Place your attention on the top of the head.', start: 0, end: 4 }],
        }),
      })

      // A client read carries `select`, or the query-validation hook refuses it
      // before access control ever runs — and the case would pass for the
      // wrong reason. `select: {}` is not equivalent; the gate 400s on it.
      const read = (user: Caller) =>
        payload.find({
          collection: 'meditation-transcripts',
          overrideAccess: false,
          user: user as never,
          select: idOnlySelect(),
        })

      await expect(read(EDITOR)).rejects.toThrow()
      await expect(read(APP_CLIENT)).rejects.toThrow()
      await expect(read(ATLAS_CLIENT)).rejects.toThrow()
    })
  })

  describe('the stored shape', () => {
    it('refuses a second transcript for a meditation that already has one', async () => {
      const meditation = await testData.createMeditation(payload)
      const transcript = () =>
        payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            status: 'queued',
          }),
        })

      await transcript()

      await expect(transcript()).rejects.toThrow()
    })

    it('refuses a segment missing `start`, and one carrying word timings', async () => {
      const meditation = await testData.createMeditation(payload)
      const withSegments = (segments: unknown) =>
        payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            status: 'completed',
            segments: segments as never,
          }),
        })

      await expect(withSegments([{ text: 'Breathe out.', end: 3 }])).rejects.toThrow()
      await expect(
        withSegments([
          { text: 'Breathe out.', start: 0, end: 3, words: [{ text: 'Breathe', start: 0, end: 1 }] },
        ]),
      ).rejects.toThrow()
    })

    it('corrects a segment’s spelling on write, without the caller asking', async () => {
      // The point of putting the pass on the collection: a later writer gets
      // the corrected spellings without remembering to call `applyGlossary`.
      const meditation = await testData.createMeditation(payload)

      const row = await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'completed',
          language: 'en',
          segments: [
            { text: 'Let the kundalini rise.', start: 0, end: 2 },
            { text: 'Feel it at the fontanel.', start: 2, end: 4 },
          ],
        }),
      })

      expect(row.segments).toEqual([
        { text: 'Let the Kundalini rise.', start: 0, end: 2 },
        { text: 'Feel it at the fontanelle.', start: 2, end: 4 },
      ])
    })

    it('reads the language off the stored row when an update omits it', async () => {
      const meditation = await testData.createMeditation(payload)
      const row = await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'queued',
          language: 'en',
        }),
      })

      const updated = await payload.update({
        collection: 'meditation-transcripts',
        id: row.id,
        data: { segments: [{ text: 'the kundalini', start: 0, end: 1 }] },
      })

      expect(updated.segments).toEqual([{ text: 'the Kundalini', start: 0, end: 1 }])
    })

    it('defaults `outdated` to false rather than leaving it unset', async () => {
      const meditation = await testData.createMeditation(payload)

      const row = await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({ meditation: meditation.id, status: 'queued' }),
      })

      expect(row.outdated).toBe(false)
    })
  })
})
