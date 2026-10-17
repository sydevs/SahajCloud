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

import type { Meditation, MeditationTranscript } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
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
   * ⚠ Published, because `_status` defaults to `draft` and a client now reads
   * a transcript only while its recording is readable. Left at the default,
   * the access case below would assert its refusal for the wrong reason.
   *
   * ⚠ Since #953 an upload asks for a transcription by itself, so the row
   * already exists and `meditation` is unique. The two cases that assert a
   * refusal would otherwise be refused by that constraint instead of by the
   * rule under test — green, and testing nothing.
   */
  const createMeditationWithoutTranscript = async (
    overrides: FixtureOverrides<Meditation> = { _status: 'published' },
  ): Promise<Meditation> => {
    const meditation = await testData.createMeditation(payload, undefined, overrides)
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

    /**
     * A client reads a transcript because it may read the recording. The
     * published-only clause and the trash filter are per collection, so
     * without the narrowing in `accessConfigs.ts` this row carried a draft
     * meditation's full spoken text — and its R2 key — out to every client
     * key (#968). A manager's read is unchanged: drafts are their work.
     */
    it('refuses a client the transcript of a meditation it cannot read', async () => {
      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })
      const client = await testData.createClient(payload, editor.id, {
        roles: ['wemeditate-web-client'],
      })

      const transcriptFor = async (overrides: FixtureOverrides<Meditation>) => {
        const meditation = await createMeditationWithoutTranscript(overrides)
        const row = await payload.create({
          collection: 'meditation-transcripts',
          data: createData<'meditation-transcripts'>({
            meditation: meditation.id,
            language: 'en',
            segments: [{ content: 'Unpublished words.', startTimeMs: 0, endTimeMs: 2000 }],
          }),
        })
        return { meditation, row }
      }

      const draft = await transcriptFor({ _status: 'draft' })
      const published = await transcriptFor({ _status: 'published' })
      const trashed = await transcriptFor({ _status: 'published' })
      // ⚠ Scoped to these three rows. Every case above leaves its own row in
      // the suite's schema, and an unscoped count reads them as this one's.
      const theseRows = [draft.row.id, published.row.id, trashed.row.id]

      // Payload's `trash` filter never reaches this collection: the row
      // carries no `deletedAt` of its own, which is half of what the
      // narrowing replaces.
      await payload.update({
        collection: 'meditations',
        id: trashed.meditation.id,
        data: { deletedAt: new Date().toISOString() },
      })

      const readAs = async (user: unknown) =>
        (
          await payload.find({
            collection: 'meditation-transcripts',
            overrideAccess: false,
            user: user as Parameters<typeof payload.find>[0]['user'],
            where: { id: { in: theseRows } },
            select: idOnlySelect(),
            depth: 0,
            pagination: false,
          })
        ).docs.map((row) => row.id)

      expect(await readAs(client)).toEqual([published.row.id])
      // The editor is the control: a narrowing that denied everyone would
      // pass the line above while emptying the admin panel.
      expect((await readAs(editor)).sort()).toEqual([...theseRows].sort())
    })
  })

  describe('the join field on meditations', () => {
    it('carries the transcript to whoever may read the recording', async () => {
      const meditation = await createMeditationWithoutTranscript()
      await payload.create({
        collection: 'meditation-transcripts',
        data: createData<'meditation-transcripts'>({
          meditation: meditation.id,
          language: 'en',
          segments: [
            { content: 'Let your hands rest open.', startTimeMs: 0, endTimeMs: 3000 },
          ],
        }),
      })

      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })
      const read = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        depth: 1,
        overrideAccess: false,
        user: editor as Parameters<typeof payload.findByID>[0]['user'],
      })

      // The cues themselves, not the row's id: a join resolving to a bare id
      // is what a restricted collection answers, and it reads as working.
      const [row] = read.transcript?.docs ?? []
      expect(typeof row).toBe('object')
      expect((row as MeditationTranscript).segments).toEqual([
        { content: 'Let your hands rest open.', startTimeMs: 0, endTimeMs: 3000 },
      ])
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

  })
})
