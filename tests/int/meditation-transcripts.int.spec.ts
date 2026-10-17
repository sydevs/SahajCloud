/**
 * What the `meditation-transcripts` table itself enforces: who may read it,
 * that a meditation carries at most one transcript, and that the column's own
 * validator refuses a segment it cannot seek through.
 *
 * The read cases go through `payload.find` with `overrideAccess: false`.
 * Project membership proves nothing on its own — asserting `hasPermission`
 * would have passed while the hole was open (`docs/rules/access.md`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Meditation } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

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

  /**
   * A meditation with no transcript row, which is what every case below builds
   * its own row on.
   *
   * ⚠ Since #953 an upload asks for a transcription by itself, so the row
   * already exists and `meditation` is unique. The two cases that assert a
   * refusal would otherwise be refused by that constraint instead of by the
   * rule under test — green, and testing nothing.
   */
  const createMeditationWithoutTranscript = async (): Promise<Meditation> => {
    const meditation = await testData.createMeditation(payload)
    const { docs } = await payload.find({
      collection: 'meditation-transcripts',
      where: { meditation: { equals: meditation.id } },
      pagination: false,
      overrideAccess: true,
    })
    for (const row of docs) {
      await payload.delete({ collection: 'meditation-transcripts', id: row.id })
    }
    return meditation
  }

  describe('access', () => {
    it('answers whoever may read the recording, and refuses whoever may not', async () => {
      const meditation = await createMeditationWithoutTranscript()
      await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'completed',
          language: 'en',
          segments: [
            {
              content: 'Place your attention on the top of the head.',
              startTimeMs: 0,
              endTimeMs: 4000,
            },
          ],
        }),
      })

      // Real rows, not stubs. A caller the access layer cannot interpret — an
      // id matching nothing, a client that was never published — is refused
      // for the wrong reason, which reads exactly like a working restriction.
      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })
      const read = (user: unknown) =>
        payload.find({
          collection: 'meditation-transcripts',
          overrideAccess: false,
          user: user as Parameters<typeof payload.find>[0]['user'],
          // A client read carries `select`, or the query-validation hook
          // refuses it before access control runs. `select: {}` 400s too, and
          // the default depth of 2 is refused without `populate` — which the
          // refusal below would otherwise pass on, for the wrong reason.
          select: idOnlySelect(),
          depth: 0,
        })

      for (const user of [
        editor,
        await testData.createClient(payload, editor.id, { roles: ['wemeditate-app-client'] }),
        await testData.createClient(payload, editor.id, { roles: ['wemeditate-web-client'] }),
      ]) {
        expect((await read(user)).totalDocs).toBe(1)
      }

      // The atlas project carries images and files, not meditations, so its
      // key reads neither a recording nor what was said in one. Both
      // directions are asserted: membership granting read to everyone would
      // pass a one-sided case.
      await expect(
        read(await testData.createClient(payload, editor.id, { roles: ['sahaj-atlas-client'] })),
      ).rejects.toThrow()
    })
  })

  describe('the stored shape', () => {
    it('refuses a second transcript for a meditation that already has one', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const transcript = () =>
        payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            status: 'queued',
            language: 'en',
          }),
        })

      await transcript()

      await expect(transcript()).rejects.toThrow()
    })

    it('refuses a row with no language, which would skip the glossary pass', async () => {
      const meditation = await createMeditationWithoutTranscript()

      await expect(
        payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            status: 'queued',
          } as never),
        }),
      ).rejects.toThrow()
    })

    it('refuses a segment missing `start`, and one carrying word timings', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const withSegments = (segments: unknown) =>
        payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            status: 'completed',
            language: 'en',
            segments: segments as never,
          }),
        })

      await expect(withSegments([{ content: 'Breathe out.', endTimeMs: 3000 }])).rejects.toThrow()
      await expect(
        withSegments([
          {
            content: 'Breathe out.',
            startTimeMs: 0,
            endTimeMs: 3000,
            words: [{ content: 'Breathe', startTimeMs: 0, endTimeMs: 1000 }],
          },
        ]),
      ).rejects.toThrow()
    })

    it('corrects a segment’s spelling on write, without the caller asking', async () => {
      const meditation = await createMeditationWithoutTranscript()

      const row = await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'completed',
          language: 'en',
          segments: [
            { content: 'Let the kundalini rise.', startTimeMs: 0, endTimeMs: 2000 },
            { content: 'Feel it at the fontanel.', startTimeMs: 2000, endTimeMs: 4000 },
          ],
        }),
      })

      expect(row.segments).toEqual([
        { content: 'Let the Kundalini rise.', startTimeMs: 0, endTimeMs: 2000 },
        { content: 'Feel it at the fontanelle.', startTimeMs: 2000, endTimeMs: 4000 },
      ])
    })

    it('reads the language off the stored row when an update omits it', async () => {
      const meditation = await createMeditationWithoutTranscript()
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
        data: { segments: [{ content: 'the kundalini', startTimeMs: 0, endTimeMs: 1000 }] },
      })

      expect(updated.segments).toEqual([
        { content: 'the Kundalini', startTimeMs: 0, endTimeMs: 1000 },
      ])
    })

    it('defaults `outdated` to false rather than leaving it unset', async () => {
      const meditation = await createMeditationWithoutTranscript()

      const row = await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          status: 'queued',
          language: 'en',
        }),
      })

      expect(row.outdated).toBe(false)
    })
  })
})
