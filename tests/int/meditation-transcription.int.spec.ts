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
import type { Meditation, MeditationTranscript } from '@/payload-types'

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
        { content: 'Place your attention on the top of the head.', startTimeMs: 0, endTimeMs: 4250 },
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
})
