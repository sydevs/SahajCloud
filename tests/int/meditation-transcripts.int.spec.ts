/**
 * What the `transcripts` table itself enforces: who may read it, that every row
 * names exactly one source, that a source carries at most one transcript, that
 * a row's lifetime is its source's, and that the column's own validator refuses
 * a segment it cannot seek through.
 *
 * ⚠ A different suite from `meditation-transcription.int.spec.ts`, which covers
 * the run that fills a row in.
 *
 * The read cases go through `payload.find` with `overrideAccess: false`.
 * Project membership proves nothing on its own — asserting `hasPermission`
 * would have passed while the hole was open (`docs/rules/access.md`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Meditation, Transcript } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

describe('transcripts', () => {
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

  /** A row for one source, which is most of this file's setup. */
  const createTranscript = (
    relationTo: 'meditations' | 'files',
    value: number,
    extra: Partial<Parameters<typeof createData<'transcripts'>>[0]> = {},
  ) =>
    payload.create({
      collection: 'transcripts',
      data: createData<'transcripts'>({
        source: { relationTo, value },
        language: 'en',
        ...extra,
      }),
    })

  /**
   * A meditation with no transcript row, which is what every case below builds
   * its own row on.
   *
   * ⚠ Since #953 an upload asks for a transcription by itself, so the row
   * already exists and `source` is unique. The cases that assert a refusal
   * would otherwise be refused by that constraint instead of by the rule under
   * test — green, and testing nothing.
   */
  /**
   * A file these cases give a transcript row by hand. An image, because an MP3
   * is transcribed as it is saved (#1016), which would create the very row a
   * case means to create — and `source` is unique.
   */
  const createFileWithoutTranscript = () => testData.createFile(payload, {}, 'image-1050x700.jpg')

  const createMeditationWithoutTranscript = async (
    overrides: FixtureOverrides<Meditation> = { _status: 'published' },
  ): Promise<Meditation> => {
    const meditation = await testData.createMeditation(payload, undefined, overrides)
    await payload.delete({
      collection: 'transcripts',
      where: { source: { equals: { relationTo: 'meditations', value: meditation.id } } },
      overrideAccess: true,
    })
    return meditation
  }

  describe('access', () => {
    it('answers a manager who may read the recording', async () => {
      const meditation = await createMeditationWithoutTranscript()
      await createTranscript('meditations', meditation.id, {
        segments: [
          {
            content: 'Place your attention on the top of the head.',
            startTimeMs: 0,
            endTimeMs: 4000,
          },
        ],
      })

      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })

      const read = await payload.find({
        collection: 'transcripts',
        overrideAccess: false,
        user: editor as Parameters<typeof payload.find>[0]['user'],
        where: { source: { equals: { relationTo: 'meditations', value: meditation.id } } },
        select: idOnlySelect(),
        depth: 0,
      })
      expect(read.totalDocs).toBe(1)
    })

    /**
     * ⚠ **Project membership is the whole gate, and that is a priced
     * exposure rather than an oversight.** A client used to read a transcript
     * only where its meditation was published and untrashed, spelled
     * `meditation._status` — and a polymorphic `source` cannot carry that path
     * at all: Payload resolves `source`, `source.relationTo` and
     * `source.value` and throws `Not supported` on anything deeper. So the
     * narrowing went and nothing replaced it, which reopens #968 on purpose:
     * a transcript holds no personal data, and a client reading one is one
     * that reads the recording. ⚠ It is wider than the cues — `audioFilename`
     * resolves to a public, unsigned R2 URL — and that was priced too
     * (#1043, #1075).
     *
     * Both directions are the assertion. A refusal that denied every client
     * would pass a test that only checked the Atlas key, and a grant that
     * admitted every client would pass one that only checked the two We
     * Meditate keys.
     *
     * Real clients, not stubs. A caller the access layer cannot interpret — a
     * client that was never published — is refused for the wrong reason, which
     * reads exactly like a working restriction.
     */
    it('answers a client whose project carries meditations, and no other', async () => {
      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })

      const read = (user: unknown) =>
        payload.find({
          collection: 'transcripts',
          overrideAccess: false,
          user: user as Parameters<typeof payload.find>[0]['user'],
          // A client read carries `select`, or the query-validation hook
          // refuses it before access control runs. `select: {}` 400s too, and
          // the default depth of 2 is refused without `populate` — which an
          // answer below would otherwise pass on, for the wrong reason.
          select: idOnlySelect(),
          depth: 0,
        })

      for (const roles of [['wemeditate-app-client'], ['wemeditate-web-client']] as const) {
        await expect(
          read(await testData.createClient(payload, editor.id, { roles: [...roles] })),
        ).resolves.toBeTruthy()
      }

      // `sahaj-atlas` names neither `meditations` nor `transcripts`, so its key
      // reaches no row — the half that makes the grant above a project test
      // rather than a blanket one.
      await expect(
        read(await testData.createClient(payload, editor.id, { roles: ['sahaj-atlas-client'] })),
      ).rejects.toThrow()
    })
  })

  describe('the join field on meditations', () => {
    it('carries the transcript to whoever may read the recording', async () => {
      const meditation = await createMeditationWithoutTranscript()
      await createTranscript('meditations', meditation.id, {
        segments: [{ content: 'Let your hands rest open.', startTimeMs: 0, endTimeMs: 3000 }],
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
      expect((row as Transcript).segments).toEqual([
        { content: 'Let your hands rest open.', startTimeMs: 0, endTimeMs: 3000 },
      ])
    })

    /**
     * ⚠ **The join is the canonical client read**, so it is the one that
     * breaks first. `sanitizeJoinQuery` suppresses a join whose child access
     * answers `false`, which empties this field on every client key without
     * failing a read — the whole visible cost of refusing the collection to
     * clients, and invisible to a direct-read assertion (#1075).
     */
    it('carries the transcript to a client key through the join', async () => {
      const meditation = await createMeditationWithoutTranscript()
      await createTranscript('meditations', meditation.id, {
        segments: [{ content: 'Breathe out slowly.', startTimeMs: 0, endTimeMs: 2500 }],
      })

      const editor = await testData.createManager(payload, {
        roles: { en: ['meditations-editor'] },
      })
      const client = await testData.createClient(payload, editor.id, {
        roles: ['wemeditate-web-client'],
      })

      const read = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        depth: 1,
        overrideAccess: false,
        user: client as Parameters<typeof payload.findByID>[0]['user'],
        select: { transcript: true },
      })

      const [row] = read.transcript?.docs ?? []
      expect(typeof row).toBe('object')
      expect((row as Transcript).segments).toEqual([
        { content: 'Breathe out slowly.', startTimeMs: 0, endTimeMs: 2500 },
      ])
    })

    /**
     * ⚠ Payload correlates a polymorphic join per target itself, and the two
     * collections number their rows independently — so a file-sourced row must
     * never reach a meditation's join, whatever its id.
     */
    it('lists the meditation’s row and no file-sourced one', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const own = await createTranscript('meditations', meditation.id)
      const file = await createFileWithoutTranscript()
      const other = await createTranscript('files', file.id)

      const read = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        depth: 0,
        overrideAccess: true,
      })
      const listed = (read.transcript?.docs ?? []).map((doc) =>
        typeof doc === 'number' ? doc : doc.id,
      )
      expect(listed).toEqual([own.id])
      expect(listed).not.toContain(other.id)
    })
  })

  describe('the source field', () => {
    it('refuses a row that names no source', async () => {
      await expect(
        payload.create({
          collection: 'transcripts',
          data: createData<'transcripts'>({ language: 'en' } as never),
        }),
      ).rejects.toThrow()
    })

    it('refuses a second transcript for a meditation that already has one', async () => {
      const meditation = await createMeditationWithoutTranscript()

      await createTranscript('meditations', meditation.id)

      await expect(createTranscript('meditations', meditation.id)).rejects.toThrow()
    })

    /**
     * ⚠ The rels table holds one unique index per target, and Postgres treats
     * nulls as distinct — so a file-sourced row must not collide with the
     * meditation-sourced rows beside it, whatever their ids.
     */
    it('reads a files-sourced row back through the object form', async () => {
      const file = await createFileWithoutTranscript()
      const row = await createTranscript('files', file.id, {
        segments: [{ content: 'Welcome to this path.', startTimeMs: 0, endTimeMs: 1500 }],
      })

      const { docs } = await payload.find({
        collection: 'transcripts',
        where: { source: { equals: { relationTo: 'files', value: file.id } } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      expect(docs.map((doc) => doc.id)).toEqual([row.id])
    })

    /**
     * The row is the request, so a file-sourced one queues a run for its file
     * as a meditation's does (#1016) — the task reads `fileId` for it.
     */
    it('queues a transcription for a files-sourced row, naming the file', async () => {
      const file = await createFileWithoutTranscript()
      const row = await createTranscript('files', file.id)

      // `job` is what the hook writes back when it queues. Read back rather
      // than returned: the write-back is a second update.
      const reread = await payload.findByID({
        collection: 'transcripts',
        id: row.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(reread.job).toBeTruthy()
      const job = await payload.findByID({
        collection: 'payload-jobs',
        id: typeof reread.job === 'object' ? reread.job!.id : reread.job!,
        depth: 0,
        overrideAccess: true,
      })
      expect(job.input).toMatchObject({ fileId: file.id })
    })

    // A file's language is detected by its first run, so its row starts with
    // none (#1016); the glossary pass skips a row until it has one.
    it('accepts a row with no language yet', async () => {
      const file = await createFileWithoutTranscript()

      const row = await payload.create({
        collection: 'transcripts',
        data: createData<'transcripts'>({
          source: { relationTo: 'files', value: file.id },
        } as never),
        overrideAccess: true,
      })

      expect(row.language ?? null).toBeNull()
    })

    it('refuses a segment missing `start`, and one carrying word timings', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const withSegments = (segments: unknown) =>
        payload.create({
          collection: 'transcripts',
          data: createData<'transcripts'>({
            source: { relationTo: 'meditations', value: meditation.id },
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

      const row = await createTranscript('meditations', meditation.id, {
        segments: [
          { content: 'Let the kundalini rise.', startTimeMs: 0, endTimeMs: 2000 },
          { content: 'Feel it at the fontanel.', startTimeMs: 2000, endTimeMs: 4000 },
        ],
      })

      expect(row.segments).toEqual([
        { content: 'Let the Kundalini rise.', startTimeMs: 0, endTimeMs: 2000 },
        { content: 'Feel it at the fontanelle.', startTimeMs: 2000, endTimeMs: 4000 },
      ])
    })

    it('reads the language off the stored row when an update omits it', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const row = await createTranscript('meditations', meditation.id)

      const updated = await payload.update({
        collection: 'transcripts',
        id: row.id,
        data: { segments: [{ content: 'the kundalini', startTimeMs: 0, endTimeMs: 1000 }] },
      })

      expect(updated.segments).toEqual([
        { content: 'the Kundalini', startTimeMs: 0, endTimeMs: 1000 },
      ])
    })
  })

  /**
   * `status` and `error` are computed on read from the stored cue count and the
   * job row, and `select` strips a stored field before the afterRead field
   * hooks run. So a caller selecting `status` alone was told every finished
   * transcript had failed — all 121 of production's completed rows (#1084).
   */
  describe('the derived status survives a select', () => {
    const createCompleted = async () => {
      const meditation = await createMeditationWithoutTranscript()
      return await createTranscript('meditations', meditation.id, {
        segments: [{ content: 'Let the thoughts settle.', startTimeMs: 0, endTimeMs: 2000 }],
      })
    }

    it('answers completed for a select naming status alone', async () => {
      const row = await createCompleted()

      const selected = await payload.findByID({
        collection: 'transcripts',
        id: row.id,
        select: { status: true },
      })

      expect(selected.status).toBe('completed')
    })

    it('answers the same status as a read selecting nothing', async () => {
      const row = await createCompleted()

      const [selected, whole] = await Promise.all([
        payload.find({
          collection: 'transcripts',
          where: { id: { equals: row.id } },
          select: { status: true },
        }),
        payload.find({
          collection: 'transcripts',
          where: { id: { equals: row.id } },
        }),
      ])

      expect(selected.docs[0]?.status).toBe(whole.docs[0]?.status)
      expect(selected.docs[0]?.status).toBe('completed')
    })

    it('answers completed without sending the cues back', async () => {
      const row = await createCompleted()

      const selected = await payload.findByID({
        collection: 'transcripts',
        id: row.id,
        select: { status: true },
      })

      // The stored count is what buys this (#1087 review): a client feed
      // asking whether a transcript is ready was served every cue in it, and
      // this collection is reachable with a client key.
      expect(selected.status).toBe('completed')
      // Outside the declared select, so the narrowed type has to be widened to
      // say it is absent — which is the whole claim.
      expect((selected as typeof selected & Pick<Transcript, 'segments'>).segments).toBeUndefined()
    })

    it('stamps the count on every write that names the cues', async () => {
      const row = await createCompleted()

      const cleared = await payload.update({
        collection: 'transcripts',
        id: row.id,
        data: { segments: null },
        overrideAccess: true,
      })
      const renamed = await payload.update({
        collection: 'transcripts',
        id: row.id,
        data: { audioFilename: 'replaced.mp3' },
        overrideAccess: true,
      })

      expect(row.segmentCount).toBe(1)
      expect(cleared.segmentCount).toBe(0)
      // A patch naming no cues leaves the count where the last cue write put it.
      expect(renamed.segmentCount).toBe(0)
    })

    /**
     * A row with no cues, whose run then errored — so `error` has something to
     * answer. A row created without cues queues its own job and gets `job`
     * written back, which is the id this errors.
     */
    const createFailed = async () => {
      const meditation = await createMeditationWithoutTranscript()
      const row = await createTranscript('meditations', meditation.id)
      await payload.update({
        collection: 'payload-jobs',
        id: Number(row.job),
        data: { hasError: true, error: { message: 'Lemonfox refused the recording.' } },
        overrideAccess: true,
      })
      return row
    }

    it('resolves `error` for a select that names it without the job', async () => {
      const row = await createFailed()

      const selected = await payload.findByID({
        collection: 'transcripts',
        id: row.id,
        select: { error: true },
      })

      // The `job` column this select never named is what carries the message.
      expect(selected.error).toBe('Lemonfox refused the recording.')
    })
  })

  /**
   * The cascade that replaced the orphan sweep (#1043). With the source in a
   * rels table there is no column for a delete to null, and the rels row's own
   * foreign keys cascade — so without `deleteChildren` a deleted parent leaves a
   * transcript with no source at all, which `required` makes unloadable and
   * unsaveable through the admin.
   */
  describe('the cascade from each parent', () => {
    const rowExists = async (id: number) =>
      (
        await payload.count({
          collection: 'transcripts',
          where: { id: { equals: id } },
          overrideAccess: true,
        })
      ).totalDocs === 1

    it('deletes a meditation’s transcript when the meditation goes', async () => {
      const meditation = await createMeditationWithoutTranscript()
      const row = await createTranscript('meditations', meditation.id)

      await payload.delete({ collection: 'meditations', id: meditation.id, overrideAccess: true })

      expect(await rowExists(row.id)).toBe(false)
    })

    it('deletes a file’s transcript when the file goes', async () => {
      const file = await createFileWithoutTranscript()
      const row = await createTranscript('files', file.id)

      await payload.delete({ collection: 'files', id: file.id, overrideAccess: true })

      expect(await rowExists(row.id)).toBe(false)
    })

    /**
     * ⚠ `beforeDelete` fires per document inside the bulk loop, so a
     * `delete({ where })` taking several parents at once is covered too — but
     * nothing says so except this case.
     */
    it('covers a delete by `where` that takes several meditations', async () => {
      const first = await createMeditationWithoutTranscript()
      const second = await createMeditationWithoutTranscript()
      const rows = await Promise.all(
        [first, second].map((meditation) => createTranscript('meditations', meditation.id)),
      )

      await payload.delete({
        collection: 'meditations',
        where: { id: { in: [first.id, second.id] } },
        overrideAccess: true,
      })

      expect(await Promise.all(rows.map((row) => rowExists(row.id)))).toEqual([false, false])
    })

    /**
     * ⚠ **Trashing is an `update`, so it fires no `beforeDelete`.** A trashed
     * parent keeps its transcript, and the permanent delete that follows is what
     * takes it — which is also the path `CleanupOrphanedMedia` and the nightly
     * retention sweep both go through.
     */
    it('keeps a transcript while its file is only trashed, and takes it on the real delete', async () => {
      const file = await createFileWithoutTranscript()
      const row = await createTranscript('files', file.id)

      await payload.update({
        collection: 'files',
        id: file.id,
        data: { deletedAt: new Date().toISOString() },
        overrideAccess: true,
      })
      expect(await rowExists(row.id)).toBe(true)

      await payload.delete({
        collection: 'files',
        id: file.id,
        trash: true,
        overrideAccess: true,
      })
      expect(await rowExists(row.id)).toBe(false)
    })
  })
})
