/**
 * Transcription end to end: a recording is transcribed by itself, and a
 * replacement takes the old transcript with it.
 *
 * ⚠ A different suite from `meditation-transcripts.int.spec.ts`, which covers
 * what the table itself enforces (#957). This one covers the `meditations`
 * hook, the row's own queueing hook and the task. The derived status is pure,
 * and lives in `tests/unit/transcript-status.spec.ts`.
 *
 * **Fixture pre-mortem.** The vendor is mocked at
 * `@/jobs/TranscribeMeditation/lemonfox/transcribe` — `tests/AGENTS.md`'s boundary rule — so the
 * suite can drive a completed run and **cannot** make a paid call. Two claims
 * the fixtures make about the real configuration, both verified:
 *
 * - The body shape is `{ segments: [{ text, start, end }] }` in seconds.
 *   Checked against `src/collections/MeditationTranscripts/lemonfox.ts`, the
 *   one normaliser, which is the real code under these assertions.
 * - `LEMONFOX_API_KEY` is `''` in `vitest.config.mts`, so the unmocked key
 *   reader returns `undefined`. The mock's default overrides that on purpose:
 *   without it every case here would take the unavailable path.
 */
import type { Payload } from 'payload'

import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TranscribeMeditation } from '@/jobs/TranscribeMeditation/TranscribeMeditation'
import {
  RETRANSCRIBE_COOLDOWN_MS,
  TRANSCRIPTION_STALL_MS,
} from '@/lib/meditations/transcriptBounds'
import type { Meditation, MeditationTranscript } from '@/payload-types'

import {
  createRestClient,
  createRestClientAs,
  createRestClientWithAuth,
  type RestClient,
} from '../utils/restRequest'
import { seedLatestVersion } from '../utils/storeInvalidEvent'
import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const lemonfox = vi.hoisted(() => ({
  lemonfoxApiKey: vi.fn<() => string | undefined>(),
  requestLemonfoxTranscript: vi.fn<() => Promise<unknown>>(),
}))

// Partial: `TRANSCRIPTION_UNAVAILABLE_ERROR` lives here too, and the
// unavailable case asserts the row carries the real one.
vi.mock('@/jobs/TranscribeMeditation/lemonfox/transcribe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/jobs/TranscribeMeditation/lemonfox/transcribe')>()),
  ...lemonfox,
}))

/**
 * The recording's public URL, which is storage's business and not
 * transcription's. `CLOUDFLARE_R2_DELIVERY_URL` is unset in the lane, so the
 * real `getR2Url` answers `undefined` and the task would refuse every run
 * before reaching the vendor.
 */
vi.mock('@/plugins/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/plugins/storage')>()),
  getR2Url: (filename: string) => `https://assets.test/${filename}`,
}))

/** Two phrases, in the provider's seconds. `normalizeLemonfoxResponse` converts. */
const VENDOR_BODY = {
  segments: [
    { id: 0, text: ' Place your attention on the top of the head.', start: 0, end: 4.25 },
    { id: 1, text: ' Let the thoughts settle.', start: 4.25, end: 6.5 },
  ],
}

const SAMPLE_AUDIO = path.join(process.cwd(), 'tests/files/audio-42s.mp3')

describe('meditation transcription', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>
  /** Shared so each meditation costs one upload rather than three. */
  let deps: { narrator: number; thumbnail: number }
  /**
   * Every fixture meditation carries one frame, because `Meditations.frames`
   * refuses an **update** that leaves none — so a recording could not be
   * replaced without it.
   */
  let frames: Meditation['frames']

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const thumbnail = await testData.createMediaImage(
      payload,
      { alt: 'Meditation thumbnail', hidden: false },
      'image-1050x700.webp',
    )
    const narrator = await testData.createNarrator(payload, { name: 'Transcript Narrator' })
    deps = { narrator: narrator.id, thumbnail: thumbnail.id }

    const frame = await testData.createFrame(payload)
    frames = [{ id: frame.id, timestamp: 0 }] as unknown as Meditation['frames']
  })

  afterAll(async () => {
    await cleanup()
  })

  // Both halves matter: the call records are what the "never reached the
  // vendor" cases read, and the defaults are what every other case needs.
  beforeEach(() => {
    vi.clearAllMocks()
    lemonfox.lemonfoxApiKey.mockReturnValue('lf-test-key')
    lemonfox.requestLemonfoxTranscript.mockResolvedValue(VENDOR_BODY)
  })

  const createMeditation = (locale = 'en'): Promise<Meditation> =>
    testData.createMeditation(payload, deps, { frames, locale } as never)

  const transcriptOf = async (meditationId: number): Promise<MeditationTranscript | undefined> => {
    const { docs } = await payload.find({
      collection: 'meditation-transcripts',
      where: { meditation: { equals: meditationId } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return docs[0]
  }

  /** Queued `transcribeMeditation` rows for one meditation, however many. */
  const queuedJobs = async (meditationId: number): Promise<unknown[]> => {
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'transcribeMeditation' } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return docs.filter(
      (job) => (job.input as { meditationId?: number } | null)?.meditationId === meditationId,
    )
  }

  const versionCount = async (meditationId: number): Promise<number> =>
    (
      await payload.findVersions({
        collection: 'meditations',
        where: { parent: { equals: meditationId } },
        depth: 0,
        limit: 0,
        overrideAccess: true,
      })
    ).totalDocs

  /**
   * Take a meditation's recording away.
   *
   * Unreachable from the API — Payload refuses a create with no file, and
   * `restrictUploadToAdmin` refuses to clear one — so it is seeded underneath.
   * `seedLatestVersion` writes the version row too, which is the half that
   * matters here: `findMeditationRecording` reads the draft.
   */
  const takeAwayRecording = (meditationId: number): Promise<void> =>
    seedLatestVersion(payload, 'meditations', meditationId, { filename: null })

  /** Replace a meditation's recording, the way an editor does. */
  const replaceAudio = (meditationId: number): Promise<Meditation> => {
    const data = fs.readFileSync(SAMPLE_AUDIO)
    return payload.update({
      collection: 'meditations',
      id: meditationId,
      data: {},
      file: { data, mimetype: 'audio/mpeg', name: 'audio-42s-replacement.mp3', size: data.length },
      overrideAccess: true,
    }) as Promise<Meditation>
  }

  describe('a recording is transcribed by itself', () => {
    it('creates a row naming that recording, with the meditation locale, and queues one run', async () => {
      const meditation = await createMeditation('cs')

      const row = await transcriptOf(meditation.id)
      expect(row?.audioFilename).toBe(meditation.filename)
      expect(row?.language).toBe('cs')
      expect(row?.segments ?? null).toBeNull()
      // The row carries the run it queued, which is where `status` is read
      // from. A row without one derives `failed`.
      expect(row?.job).toBeTruthy()
      expect(await queuedJobs(meditation.id)).toHaveLength(1)
    })

    it('adds no meditation version, and leaves its _status alone', async () => {
      const meditation = await createMeditation()
      const before = await versionCount(meditation.id)

      await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })

      // The task writes `meditation-transcripts`, never the meditation. A write
      // there would push out a version an editor restores from.
      expect(await versionCount(meditation.id)).toBe(before)
      const after = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(after._status).toBe(meditation._status)
    })

    it('completes with the normalised cues, in milliseconds', async () => {
      const meditation = await createMeditation()

      const output = await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })
      expect(output.status).toBe('completed')

      const row = await transcriptOf(meditation.id)
      expect(row?.provider).toBe('lemonfox')
      // The vendor answers seconds. The cue shape is milliseconds, so a player
      // reading a transcript and one reading subtitles agree.
      expect(row?.segments).toEqual([
        {
          content: 'Place your attention on the top of the head.',
          startTimeMs: 0,
          endTimeMs: 4250,
        },
        { content: 'Let the thoughts settle.', startTimeMs: 4250, endTimeMs: 6500 },
      ])
    })

    it('writes no row for a meditation with no recording', async () => {
      const meditation = await createMeditation()
      await takeAwayRecording(meditation.id)
      await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: { title: 'Renamed with no recording' },
        overrideAccess: true,
      })

      // One row, from the upload that created it — the rename cannot add a
      // second, and nothing asks to transcribe a recording that is gone.
      expect(await queuedJobs(meditation.id)).toHaveLength(1)
    })
  })

  describe('what the task refuses to do', () => {
    it('throws for a run whose recording was replaced mid-flight, and writes nothing', async () => {
      const meditation = await createMeditation()
      const original = meditation.filename!
      await replaceAudio(meditation.id)

      // The replacement deleted the row this run was for, so there is nothing
      // to write and nothing wrong: the replacement queued its own run.
      const output = await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: original },
      })
      expect(output.status).toBe('superseded')

      const row = await transcriptOf(meditation.id)
      expect(row?.audioFilename).not.toBe(original)
      expect(row?.segments ?? null).toBeNull()
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })

    it('throws when the body carries no timestamped speech', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({ segments: [] })
      const meditation = await createMeditation()

      // The throw is the record: `retries: 0`, so the retained job row carries
      // the message and the row's `status` derives `failed` from it.
      await expect(
        runTaskHandler(TranscribeMeditation, {
          payload,
          input: { meditationId: meditation.id, audioFilename: meditation.filename! },
        }),
      ).rejects.toThrow()

      expect((await transcriptOf(meditation.id))?.segments ?? null).toBeNull()
    })

    it('throws, and invents no text, when transcription is unavailable', async () => {
      lemonfox.lemonfoxApiKey.mockReturnValue(undefined)
      const meditation = await createMeditation()

      await expect(
        runTaskHandler(TranscribeMeditation, {
          payload,
          input: { meditationId: meditation.id, audioFilename: meditation.filename! },
        }),
      ).rejects.toThrow()

      const row = await transcriptOf(meditation.id)
      expect(row?.segments ?? null).toBeNull()
      expect(row?.provider ?? null).toBeNull()
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })
  })

  describe('a replaced recording', () => {
    it('takes the old transcript with it, and asks for a new one', async () => {
      const meditation = await createMeditation()
      await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })
      const completed = await transcriptOf(meditation.id)
      expect(completed?.segments).toHaveLength(2)

      const replaced = await replaceAudio(meditation.id)

      // Cues produced from a recording nobody can hear any more are
      // misleading, not history, so the row goes rather than being marked.
      const row = await transcriptOf(meditation.id)
      expect(row?.id).not.toBe(completed?.id)
      expect(row?.audioFilename).toBe(replaced.filename)
      expect(row?.segments ?? null).toBeNull()
      expect(await queuedJobs(meditation.id)).toHaveLength(2)
    })

    it('completes the new recording on its own run', async () => {
      const meditation = await createMeditation()
      const replaced = await replaceAudio(meditation.id)

      const output = await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: replaced.filename! },
      })
      expect(output.status).toBe('completed')
      expect((await transcriptOf(meditation.id))?.segments).toHaveLength(2)
    })

    it('leaves the row alone for a save that does not touch the recording', async () => {
      const meditation = await createMeditation()
      const row = await transcriptOf(meditation.id)

      await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: { title: 'Retitled' },
        overrideAccess: true,
      })

      expect((await transcriptOf(meditation.id))?.id).toBe(row?.id)
      expect(await queuedJobs(meditation.id)).toHaveLength(1)
    })
  })
  /**
   * `POST /api/meditations/:id/transcribe` — the Transcript tab's
   * Transcribe-again button (#984).
   *
   * Driven through Payload's real REST pipeline rather than a hand-built `req`,
   * for two reasons: `req.locale` is **derived** there, which is the whole of
   * the #701 gate below, and the handler opens its own transaction, which a
   * plain object cannot be trusted to carry.
   *
   * **Fixture pre-mortem.** Two claims about the real configuration, both
   * verified against the code under test:
   *
   * - A row reads `failed` because its retained job row carries `hasError` —
   *   `deriveTranscriptStatus` (`src/lib/meditations/transcriptStatus.ts`) reads
   *   nothing else, since the collection stores no status column.
   *   `runTaskHandler` bypasses the queue, so a rejected run leaves that flag
   *   unset and the row would read `processing`.
   * - `createdAt` is what the cooldown measures, and Payload accepts it in
   *   `data` (`cleanup-orphaned-media.int.spec.ts` ages rows the same way).
   *   `updatedAt` is not writable — Payload overwrites it on every update —
   *   which is why the stalled case moves the clock instead.
   */
  describe('asking for a transcript again', () => {
    let rest: RestClient

    beforeAll(async () => {
      rest = await createRestClient(env)
    })

    const post = (meditationId: number | string, locale = 'en', caller: RestClient = rest) =>
      caller(`/api/meditations/${meditationId}/transcribe?locale=${locale}`, { method: 'POST' })

    /** Mark the run behind this meditation's transcript errored, so the row reads `failed`. */
    const failTheRun = async (meditationId: number): Promise<MeditationTranscript> => {
      const row = await transcriptOf(meditationId)
      await payload.update({
        collection: 'payload-jobs',
        id: Number(row!.job),
        data: { hasError: true, error: { message: 'Lemonfox refused the recording.' } },
        overrideAccess: true,
      })
      return row!
    }

    /** Put the last request behind the cooldown, which `createdAt` alone decides. */
    const backdate = (transcriptId: number) =>
      payload.update({
        collection: 'meditation-transcripts',
        id: transcriptId,
        data: {
          createdAt: new Date(Date.now() - RETRANSCRIBE_COOLDOWN_MS - 1000).toISOString(),
        },
        overrideAccess: true,
      })

    /** A meditation whose transcript failed long enough ago to be retryable. */
    const retryableMeditation = async (locale = 'en'): Promise<Meditation> => {
      const meditation = await createMeditation(locale)
      const row = await failTheRun(meditation.id)
      await backdate(row.id)
      return meditation
    }

    describe('what a retry does', () => {
      it('replaces the row for the same recording, and queues exactly one more run', async () => {
        const meditation = await retryableMeditation()
        const before = await transcriptOf(meditation.id)

        const { status, body } = await post(meditation.id)

        expect(status).toBe(200)
        expect(body.ok).toBe(true)
        const row = await transcriptOf(meditation.id)
        expect(row?.id).not.toBe(before?.id)
        expect(body.transcriptId).toBe(row?.id)
        // The recording did not change, so the new row names it and the task
        // will not read it as superseded.
        expect(row?.audioFilename).toBe(meditation.filename)
        expect(row?.language).toBe(meditation.locale)
        expect(row?.segments ?? null).toBeNull()
        // Queued by the new row's own afterChange, not by the handler.
        expect(row?.job).toBeTruthy()
        expect(await queuedJobs(meditation.id)).toHaveLength(2)
      })

      it('creates one for a recording whose row was lost, without a delete', async () => {
        const meditation = await createMeditation()
        const original = await transcriptOf(meditation.id)
        await payload.delete({
          collection: 'meditation-transcripts',
          id: original!.id,
          overrideAccess: true,
        })

        const { status } = await post(meditation.id)

        expect(status).toBe(200)
        expect(await transcriptOf(meditation.id)).toBeTruthy()
        expect(await queuedJobs(meditation.id)).toHaveLength(2)
      })

      it('allows a stalled row, which nothing else clears', async () => {
        const meditation = await createMeditation()
        // Only the clock can reach this state: `updatedAt` is Payload's to
        // write, and a stalled row is one whose run died with the row
        // `processing`.
        vi.useFakeTimers({ toFake: ['Date'] })
        try {
          vi.setSystemTime(new Date(Date.now() + TRANSCRIPTION_STALL_MS + 60_000))

          const { status } = await post(meditation.id)

          expect(status).toBe(200)
        } finally {
          vi.useRealTimers()
        }
        expect(await queuedJobs(meditation.id)).toHaveLength(2)
      })

      it('adds no meditation version, and writes nothing to the document', async () => {
        const meditation = await retryableMeditation()
        const before = await versionCount(meditation.id)

        expect((await post(meditation.id)).status).toBe(200)

        expect(await versionCount(meditation.id)).toBe(before)
        const after = await payload.findByID({
          collection: 'meditations',
          id: meditation.id,
          depth: 0,
          overrideAccess: true,
        })
        expect(after.updatedAt).toBe(meditation.updatedAt)
      })
    })

    describe('what it refuses', () => {
      it('refuses a completed transcript with a 409, and queues nothing', async () => {
        const meditation = await createMeditation()
        await runTaskHandler(TranscribeMeditation, {
          payload,
          input: { meditationId: meditation.id, audioFilename: meditation.filename! },
        })
        const completed = await transcriptOf(meditation.id)
        await backdate(completed!.id)

        const { status, body } = await post(meditation.id)

        expect(status).toBe(409)
        expect(String(JSON.stringify(body))).toContain('already has a transcript')
        expect((await transcriptOf(meditation.id))?.id).toBe(completed?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('refuses a run in flight with a 409', async () => {
        // A fresh row is `processing` inside the stall bound: the run this
        // meditation's upload queued is still owed an answer.
        const meditation = await createMeditation()
        const inFlight = await transcriptOf(meditation.id)
        await backdate(inFlight!.id)

        const { status, body } = await post(meditation.id)

        expect(status).toBe(409)
        expect(String(JSON.stringify(body))).toContain('already in progress')
        expect((await transcriptOf(meditation.id))?.id).toBe(inFlight?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('refuses a second ask inside the cooldown with a 429 naming the wait', async () => {
        const meditation = await createMeditation()
        const row = await failTheRun(meditation.id)

        const { status, body, headers } = await post(meditation.id)

        expect(status).toBe(429)
        expect(String(JSON.stringify(body))).toMatch(/Try again in \d+ minutes?\./)
        expect(Number(headers.get('Retry-After'))).toBeGreaterThan(0)
        expect((await transcriptOf(meditation.id))?.id).toBe(row.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('refuses a meditation with no recording with a 409', async () => {
        const meditation = await createMeditation()
        const row = await transcriptOf(meditation.id)
        await failTheRun(meditation.id)
        await backdate(row!.id)
        await takeAwayRecording(meditation.id)

        const { status } = await post(meditation.id)

        expect(status).toBe(409)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('answers 404 for a meditation that is not there', async () => {
        expect((await post(99_999_999)).status).toBe(404)
      })

      it('answers 400 for an id that is not a positive integer', async () => {
        expect((await post('not-a-number')).status).toBe(400)
      })
    })

    describe('the transaction', () => {
      it('leaves the previous row in place when the create fails', async () => {
        const meditation = await retryableMeditation()
        const before = await transcriptOf(meditation.id)
        const create = vi
          .spyOn(payload, 'create')
          .mockRejectedValueOnce(new Error('the replacement could not be written'))

        try {
          const { status } = await post(meditation.id)

          expect(status).toBe(500)
          expect(create).toHaveBeenCalledTimes(1)
        } finally {
          create.mockRestore()
        }

        // The delete rolled back with the create, so the editor still has the
        // failed row — and its notice — rather than nothing at all.
        const row = await transcriptOf(meditation.id)
        expect(row?.id).toBe(before?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      // A delete by `where` collects per-document failures instead of throwing,
      // so an unread result would fall through to the create and report a race.
      it('answers a refused delete with a 500 naming it, not a race', async () => {
        const meditation = await retryableMeditation()
        const before = await transcriptOf(meditation.id)
        const remove = vi.spyOn(payload, 'delete').mockResolvedValueOnce({
          docs: [],
          errors: [{ id: before!.id, message: 'the row would not go' }],
        } as never)

        try {
          const { status, body } = await post(meditation.id)

          expect(status).toBe(500)
          expect(String(JSON.stringify(body))).not.toContain('just asked for')
        } finally {
          remove.mockRestore()
        }

        expect((await transcriptOf(meditation.id))?.id).toBe(before?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('answers a lost delete with a 409, not a 500', async () => {
        const meditation = await retryableMeditation()
        const before = await transcriptOf(meditation.id)
        // Stands in for the interleaving this lane cannot schedule: the loser
        // of a race deletes nothing, because the winner already did, and its
        // insert then hits the `unique` index on `meditation`.
        const remove = vi.spyOn(payload, 'delete').mockResolvedValueOnce({
          docs: [],
          errors: [],
        } as never)

        try {
          const { status, body } = await post(meditation.id)

          expect(status).toBe(409)
          expect(String(JSON.stringify(body))).toContain('just asked for')
        } finally {
          remove.mockRestore()
        }

        expect((await transcriptOf(meditation.id))?.id).toBe(before?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      it('produces one row and one 409 for two retries racing', async () => {
        const meditation = await retryableMeditation()

        const [first, second] = await Promise.all([post(meditation.id), post(meditation.id)])

        expect([first.status, second.status].sort()).toEqual([200, 409])
        const { totalDocs } = await payload.find({
          collection: 'meditation-transcripts',
          where: { meditation: { equals: meditation.id } },
          depth: 0,
          overrideAccess: true,
        })
        expect(totalDocs).toBe(1)
        expect(await queuedJobs(meditation.id)).toHaveLength(2)
      })
    })

    /**
     * The gate. A manager's roles are per locale, so the answer depends on the
     * locale the request names — and a request naming none resolves the default
     * locale and denies anyone whose roles live elsewhere (#701). Only the REST
     * pipeline derives that, which is why these are here and not over a
     * hand-built `req`.
     */
    describe('who may ask', () => {
      const API_KEY = 'transcript-retry-client-key-20chars'
      let editorRest: RestClient
      let frenchRest: RestClient
      let clientRest: RestClient

      beforeAll(async () => {
        const editor = await testData.createManager(payload, {
          type: 'manager',
          roles: { en: ['meditations-editor'] },
        })
        editorRest = await createRestClientAs(env, editor)

        const frenchEditor = await testData.createManager(payload, {
          type: 'manager',
          roles: { fr: ['meditations-editor'] },
        })
        frenchRest = await createRestClientAs(env, frenchEditor)

        const owner = await testData.createManager(payload, { type: 'admin' })
        await testData.createClient(payload, owner.id, { apiKey: API_KEY })
        clientRest = createRestClientWithAuth(env, {
          Authorization: `clients API-Key ${API_KEY}`,
        })
      })

      // The whole point of the feature: an editor needs no administrator.
      it('admits a meditations editor, who may update the meditation', async () => {
        const meditation = await retryableMeditation()

        const { status } = await post(meditation.id, 'en', editorRest)

        expect(status).toBe(200)
        expect(await queuedJobs(meditation.id)).toHaveLength(2)
      })

      it('denies a manager whose roles live in another locale, and admits them in theirs', async () => {
        const english = await retryableMeditation()
        const french = await retryableMeditation('fr')

        expect((await post(english.id, 'en', frenchRest)).status).toBe(403)
        expect((await post(french.id, 'fr', frenchRest)).status).toBe(200)
      })

      /**
       * The grant is per locale and a meditation IS one language, so holding
       * the role is not enough — the row's own language has to match. Nothing
       * narrows this read: the gate proves `meditations: update`, and the
       * handler then reads with `overrideAccess`, so a `Where` reaches none of
       * it (#980). Without the comparison a `fr`-only editor deletes an `en`
       * transcript and buys a new run.
       */
      it('denies a meditation outside the language the editor is in', async () => {
        const meditation = await retryableMeditation()
        const row = await transcriptOf(meditation.id)

        const { status, body } = await post(meditation.id, 'fr', frenchRest)

        expect(status).toBe(403)
        expect(JSON.stringify(body)).toContain('language you are editing in')
        // The refusal is before the delete: the transcript it would have
        // replaced is still the one that was there.
        expect((await transcriptOf(meditation.id))?.id).toBe(row?.id)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })

      // The admin bypass answers before any of this, as it does for a write.
      it('admits an admin editing in another language', async () => {
        const meditation = await retryableMeditation()

        expect((await post(meditation.id, 'fr')).status).toBe(200)
      })

      it('denies a request that names no locale, because it resolves to the default', async () => {
        const meditation = await retryableMeditation()

        const { status } = await frenchRest(`/api/meditations/${meditation.id}/transcribe`, {
          method: 'POST',
        })

        expect(status).toBe(403)
      })

      // `requireManagerPermission` runs `requireActiveManager` first, so a
      // published API client is refused as a caller rather than on its grants.
      it('denies an API client, however published', async () => {
        const meditation = await retryableMeditation()

        const { status } = await post(meditation.id, 'en', clientRest)

        expect(status).toBe(403)
        expect(await queuedJobs(meditation.id)).toHaveLength(1)
      })
    })
  })
})
