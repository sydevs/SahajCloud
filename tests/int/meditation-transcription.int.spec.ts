/**
 * Transcription end to end: a recording is transcribed by itself, a
 * replacement marks the transcript out of date without destroying it, and every
 * state the Transcript tab can show is honest.
 *
 * ⚠ A different suite from `meditation-transcripts.int.spec.ts`, which covers
 * what the table itself enforces (#957). This one covers the hooks, the writer,
 * the task and the two endpoints.
 *
 * **Fixture pre-mortem.** The vendor is mocked at
 * `@/lib/lemonfox/transcribe` — `tests/AGENTS.md`'s boundary rule — so the
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
import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcript'
import type { Meditation, MeditationTranscript } from '@/payload-types'

import {
  createAnonRestClient,
  createRestClientAs,
  createRestClientWithAuth,
  type RestClient,
} from '../utils/restRequest'
import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const lemonfox = vi.hoisted(() => ({
  lemonfoxApiKey: vi.fn<() => string | undefined>(),
  requestLemonfoxTranscript: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@/lib/lemonfox/transcribe', () => lemonfox)

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
   * `restrictUploadToAdmin` refuses to clear one — so both rows are written
   * underneath it. The `latest: true` version row is the half that matters:
   * `findMeditationRecording` reads the draft, so seeding only the main row
   * leaves the endpoint reading the recording and the case passes for the
   * wrong reason (the same trap as `tests/utils/storeInvalidEvent.ts`).
   */
  const takeAwayRecording = async (meditationId: number): Promise<void> => {
    await payload.db.updateOne({
      collection: 'meditations',
      id: meditationId,
      data: { filename: null },
    })
    const { docs } = await payload.db.findVersions({
      collection: 'meditations',
      where: { parent: { equals: meditationId } },
      sort: '-updatedAt',
      limit: 1,
      pagination: false,
    })
    const latest = docs[0]
    if (!latest) throw new Error(`meditation ${meditationId} has no version row to seed`)
    await payload.db.updateVersion({
      collection: 'meditations',
      id: latest.id,
      versionData: {
        createdAt: new Date(latest.createdAt).toISOString(),
        latest: true,
        parent: meditationId,
        updatedAt: new Date().toISOString(),
        version: { ...latest.version, filename: null },
      },
    })
  }

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
    it('queues a request naming that recording, with the meditation locale', async () => {
      const meditation = await createMeditation('cs')

      const row = await transcriptOf(meditation.id)
      expect(row?.status).toBe('queued')
      expect(row?.audioFilename).toBe(meditation.filename)
      expect(row?.language).toBe('cs')
      expect(row?.outdated).toBe(false)
      expect(await queuedJobs(meditation.id)).toHaveLength(1)
    })

    it('adds no meditation version, and leaves its _status alone', async () => {
      const meditation = await createMeditation()
      const before = await versionCount(meditation.id)

      await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })

      expect(await versionCount(meditation.id)).toBe(before)
      const after = await payload.findByID({ collection: 'meditations', id: meditation.id })
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
      expect(row?.status).toBe('completed')
      expect(row?.provider).toBe('lemonfox')
      expect(row?.outdated).toBe(false)
      expect(row?.error).toBeFalsy()
      expect(row?.segments).toEqual([
        {
          content: 'Place your attention on the top of the head.',
          startTimeMs: 0,
          endTimeMs: 4250,
        },
        { content: 'Let the thoughts settle.', startTimeMs: 4250, endTimeMs: 6500 },
      ])
    })
  })

  describe('what the task refuses to do', () => {
    it('writes nothing for a run whose recording was replaced mid-flight', async () => {
      const meditation = await createMeditation()
      const staleFilename = meditation.filename!
      // The newer request: the row now names a different recording.
      await payload.update({
        collection: 'meditation-transcripts',
        id: (await transcriptOf(meditation.id))!.id,
        data: { audioFilename: 'a-newer-recording.mp3', status: 'queued' },
        overrideAccess: true,
      })

      const output = await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: staleFilename },
      })

      expect(output.status).toBe('superseded')
      const row = await transcriptOf(meditation.id)
      expect(row?.audioFilename).toBe('a-newer-recording.mp3')
      expect(row?.status).toBe('queued')
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })

    it('leaves a failed row, not a processing one, when the body carries no speech', async () => {
      const meditation = await createMeditation()
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({ segments: [] })

      const output = await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })

      expect(output.status).toBe('failed')
      const row = await transcriptOf(meditation.id)
      expect(row?.status).toBe('failed')
      expect(row?.error).toContain('no timestamped speech')
      expect(row?.segments ?? []).toHaveLength(0)
    })
  })

  describe('transcription is unavailable', () => {
    it('writes a failed row with a reason, queues nothing, and invents no text', async () => {
      lemonfox.lemonfoxApiKey.mockReturnValue(undefined)

      const meditation = await createMeditation()

      const row = await transcriptOf(meditation.id)
      expect(row?.status).toBe('failed')
      expect(row?.error).toBeTruthy()
      expect(row?.language).toBe('en')
      expect(row?.segments ?? []).toHaveLength(0)
      expect(await queuedJobs(meditation.id)).toHaveLength(0)
    })
  })

  describe('a replaced recording', () => {
    it('is marked out of date during that save, and queues no transcription', async () => {
      const meditation = await createMeditation()
      await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })
      const jobsBefore = (await queuedJobs(meditation.id)).length

      const replaced = await replaceAudio(meditation.id)

      expect(replaced.filename).not.toBe(meditation.filename)
      const row = await transcriptOf(meditation.id)
      expect(row?.outdated).toBe(true)
      // The row still names the recording its text belongs to.
      expect(row?.audioFilename).toBe(meditation.filename)
      expect(row?.status).toBe('completed')
      expect(await queuedJobs(meditation.id)).toHaveLength(jobsBefore)
    })

    it('keeps the previous transcript readable until a new run completes', async () => {
      const manager = await testData.createManager(payload, {
        type: 'manager',
        roles: { en: ['meditations-editor'] },
      })
      const rest = await createRestClientAs(env, manager)
      const meditation = await createMeditation()
      await runTaskHandler(TranscribeMeditation, {
        payload,
        input: { meditationId: meditation.id, audioFilename: meditation.filename! },
      })
      const replaced = await replaceAudio(meditation.id)
      const path = `/api/meditations/${meditation.id}/transcript?locale=en`

      const afterReplacement = await rest(path)
      expect(afterReplacement.status).toBe(200)
      expect(afterReplacement.body.outdated).toBe(true)
      expect(afterReplacement.body.segments).toHaveLength(2)

      // The redo: a run for the new recording, with the old text still there.
      const redo = await rest(path, { method: 'POST' })
      expect(redo.status).toBe(202)
      expect(redo.body.status).toBe('queued')
      expect(redo.body.segments).toHaveLength(2)
      const row = await transcriptOf(meditation.id)
      expect(row?.audioFilename).toBe(replaced.filename)
      expect(row?.outdated).toBe(false)
    })
  })

  describe('the endpoints', () => {
    let manager: Awaited<ReturnType<typeof testData.createManager>>
    let rest: RestClient

    beforeAll(async () => {
      manager = await testData.createManager(payload, {
        type: 'manager',
        roles: { en: ['meditations-editor'] },
      })
      rest = await createRestClientAs(env, manager)
    })

    it("answers 'none' for a meditation that was never transcribed", async () => {
      const meditation = await createMeditation()
      // `none` means no row exists. The upload's own request made one, so this
      // is the state of a meditation whose transcript was never asked for.
      await payload.delete({
        collection: 'meditation-transcripts',
        id: (await transcriptOf(meditation.id))!.id,
        overrideAccess: true,
      })

      const { status, body } = await rest(`/api/meditations/${meditation.id}/transcript?locale=en`)

      expect(status).toBe(200)
      expect(body).toMatchObject({
        status: 'none',
        stalled: false,
        outdated: false,
        provider: null,
        segments: [],
        error: null,
        updatedAt: null,
      })
    })

    it('queues no second job for a POST while one is in flight', async () => {
      const meditation = await createMeditation()
      const before = await queuedJobs(meditation.id)

      const { status, body } = await rest(`/api/meditations/${meditation.id}/transcript?locale=en`, {
        method: 'POST',
      })

      expect(status).toBe(202)
      expect(body.status).toBe('queued')
      expect(await queuedJobs(meditation.id)).toHaveLength(before.length)
    })

    it('accepts a POST on a stalled row, and queues a run', async () => {
      const meditation = await createMeditation()
      const row = (await transcriptOf(meditation.id))!
      const before = await queuedJobs(meditation.id)
      // Older than the stall bound, which is what makes "it never spins
      // forever" expressible: the tab offers Try again, and the POST takes it.
      //
      // Through the db layer, because `payload.update` stamps `updatedAt`
      // itself — a row can only be aged from underneath it.
      await payload.db.updateOne({
        collection: 'meditation-transcripts',
        id: row.id,
        data: {
          updatedAt: new Date(Date.now() - TRANSCRIPTION_STALL_MS - 60_000).toISOString(),
        },
      })

      const stalled = await rest(`/api/meditations/${meditation.id}/transcript?locale=en`)
      expect(stalled.body.stalled).toBe(true)

      const { status } = await rest(`/api/meditations/${meditation.id}/transcript?locale=en`, {
        method: 'POST',
      })

      expect(status).toBe(202)
      expect(await queuedJobs(meditation.id)).toHaveLength(before.length + 1)
    })

    it('refuses a malformed id and an unknown meditation', async () => {
      expect((await rest('/api/meditations/not-a-number/transcript?locale=en')).status).toBe(400)
      expect((await rest('/api/meditations/99999999/transcript?locale=en')).status).toBe(404)
    })

    it('refuses a POST for a meditation with no recording', async () => {
      const meditation = await createMeditation()
      await takeAwayRecording(meditation.id)

      const { status } = await rest(`/api/meditations/${meditation.id}/transcript?locale=en`, {
        method: 'POST',
      })

      expect(status).toBe(409)
    })

    describe('who is refused', () => {
      let meditationId: number

      beforeAll(async () => {
        meditationId = (await createMeditation()).id
      })

      it('refuses an anonymous caller', async () => {
        const anon = createAnonRestClient(env)
        expect((await anon(`/api/meditations/${meditationId}/transcript?locale=en`)).status).toBe(
          403,
        )
      })

      it('refuses a published API client, on its own API key', async () => {
        const client = await testData.createClient(payload, manager.id, {
          roles: ['wemeditate-app-client'],
        })
        // The credential a client actually presents. A `managers` session
        // minted for its id would refuse for the wrong reason — `clients` sets
        // `disableLocalStrategy` and holds no session at all.
        const asClient = createRestClientWithAuth(env, {
          Authorization: `clients API-Key ${client.apiKey}`,
        })

        expect(
          (await asClient(`/api/meditations/${meditationId}/transcript?locale=en`)).status,
        ).toBe(403)
      })

      it('refuses a manager whose project does not carry meditations', async () => {
        const atlasManager = await testData.createManager(payload, {
          type: 'manager',
          roles: { en: ['atlas-manager'] },
        })
        const asAtlas = await createRestClientAs(env, atlasManager)
        expect((await asAtlas(`/api/meditations/${meditationId}/transcript?locale=en`)).status).toBe(
          403,
        )
      })

      /**
       * ⚠ A translator **reads** it, and that is the existing rule, not a hole
       * this endpoint opens: implicit project read grants `meditations: read`
       * to every role in a project that carries the collection
       * (`docs/rules/access.md`). Transcribing is an `update`, which is not
       * implicit — so the GET and the POST diverge here, and nothing else in
       * the suite would show it.
       */
      it('lets a translator read, and refuses them the transcription', async () => {
        const translator = await testData.createManager(payload, {
          type: 'manager',
          roles: { en: ['web-translator'] },
        })
        const asTranslator = await createRestClientAs(env, translator)
        const url = `/api/meditations/${meditationId}/transcript?locale=en`

        expect((await asTranslator(url)).status).toBe(200)
        expect((await asTranslator(url, { method: 'POST' })).status).toBe(403)
      })

      /**
       * ⚠ The gate scopes on `req.locale`, which only the real REST pipeline
       * derives. A request naming no locale resolves to the **default** one, so
       * a French-only manager is refused — #701, and the reason the endpoint
       * docblocks tell the caller to send `?locale=`.
       */
      describe('a manager holding the role only in French', () => {
        let french: RestClient
        let url: string

        beforeAll(async () => {
          const frenchManager = await testData.createManager(payload, {
            type: 'manager',
            roles: { fr: ['meditations-editor'] },
          })
          french = await createRestClientAs(env, frenchManager)
          url = `/api/meditations/${meditationId}/transcript`
        })

        it('is refused with no locale named', async () => {
          expect((await french(url)).status).toBe(403)
        })

        it('is allowed under the locale the role lives in', async () => {
          expect((await french(`${url}?locale=fr`)).status).toBe(200)
        })

        it('is refused under a locale the role does not live in', async () => {
          expect((await french(`${url}?locale=en`)).status).toBe(403)
        })
      })
    })
  })
})
