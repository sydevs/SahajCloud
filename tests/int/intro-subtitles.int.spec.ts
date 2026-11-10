/**
 * A Path Step's intro recording and its subtitles, per language, and the
 * endpoint that makes the cues (#1016).
 *
 * ⚠ A different suite from `lessons.int.spec.ts`, which covers what the
 * collection itself enforces. This one covers the two newly localized fields
 * and `POST /api/files/:id/subtitles`. The grouper and the word reader are pure
 * and live in `tests/unit/subtitles.spec.ts` and
 * `tests/unit/lemonfox-response.spec.ts`.
 *
 * **Fixture pre-mortem.** Three claims these fixtures make about the real
 * configuration, each verified against the file named:
 *
 * - The vendor is mocked at `@/lib/lemonfox/transcribe` (`tests/AGENTS.md`'s
 *   boundary rule), so this suite can drive a completed run and **cannot** make
 *   a paid call. `LEMONFOX_API_KEY` is `''` in `vitest.config.mts`, so the
 *   unmocked key reader answers `undefined` — the mock's default overrides that
 *   on purpose, or every case here would take the unavailable path.
 * - The vendor body is `{ segments: [{ text, start, end, words }] }` in
 *   seconds. Checked against `src/lib/lemonfox/normalize.ts`, which is the real
 *   code under these assertions.
 * - `path-editor` is the role granting `lessons: ['update']`, and it is granted
 *   per locale. Checked against `src/plugins/access/config/roles.ts`.
 *
 * The REST cases drive Payload's own pipeline through `createRestClientAs`,
 * because how `req.locale` is DERIVED lives only there: a request naming no
 * locale resolves the default one, and that is the #701 403 a hand-built `req`
 * cannot see.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocaleCode } from '@/lib/locales'
import { SUBTITLE_CUE_MAX_CHARS, type Subtitles } from '@/lib/utilities/subtitles'
import type { File, Lesson, Transcript } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const lemonfox = vi.hoisted(() => ({
  lemonfoxApiKey: vi.fn<() => string | undefined>(),
  requestLemonfoxTranscript: vi.fn<() => Promise<unknown>>(),
}))

// Partial: `TRANSCRIPTION_UNAVAILABLE_ERROR` lives here too, and the
// unavailable case asserts the response carries the real one.
vi.mock('@/lib/lemonfox/transcribe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lemonfox/transcribe')>()),
  ...lemonfox,
}))

/**
 * The recording's public address, which is storage's business and not
 * subtitles'. `CLOUDFLARE_R2_DELIVERY_URL` is unset in the lane, so the real
 * `getR2Url` answers `undefined` and `files.url` falls back to the **relative**
 * `/api/files/file/<name>` — which the endpoint refuses, because the vendor
 * fetches that address itself and cannot resolve one with no host.
 *
 * Mocked at `r2NativeAdapter`, which is where `urlFields.ts` imports it from,
 * so the virtual `url` field resolves through the mock and every case below
 * sends the shape production sends.
 */
const storage = vi.hoisted(() => ({
  getR2Url: vi.fn<(filename: string) => string | undefined>(),
}))

vi.mock('@/plugins/storage/r2NativeAdapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/plugins/storage/r2NativeAdapter')>()),
  ...storage,
}))

/**
 * Word timings in the provider's seconds, long enough that the grouper has to
 * break them into more than one cue.
 */
const VENDOR_BODY = {
  segments: [
    {
      start: 0,
      end: 3.2,
      text: ' Close your eyes and take a breath.',
      words: [
        { word: 'Close', start: 0.1, end: 0.5 },
        { word: 'your', start: 0.5, end: 0.8 },
        { word: 'eyes', start: 0.8, end: 1.2 },
        { word: 'and', start: 1.2, end: 1.4 },
        { word: 'take', start: 1.4, end: 1.8 },
        { word: 'a', start: 1.8, end: 1.9 },
        { word: 'breath.', start: 1.9, end: 3.2 },
      ],
    },
  ],
}

describe('intro subtitles', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    lemonfox.lemonfoxApiKey.mockReturnValue('lf-test-key')
    lemonfox.requestLemonfoxTranscript.mockResolvedValue(VENDOR_BODY)
    storage.getR2Url.mockImplementation((filename) => `https://assets.test/${filename}`)
  })

  const createRecording = (name = 'audio-42s.mp3'): Promise<File> =>
    testData.createFile(payload, {}, name)

  const transcriptOf = async (fileId: number): Promise<Transcript | undefined> => {
    const { docs } = await payload.find({
      collection: 'transcripts',
      where: { source: { equals: { relationTo: 'files', value: fileId } } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return docs[0]
  }

  const transcribeJobCount = async (): Promise<number> =>
    (
      await payload.find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: 'transcribeMeditation' } },
        depth: 0,
        limit: 0,
        overrideAccess: true,
      })
    ).totalDocs

  const readLesson = (id: number, locale: LocaleCode, fallback = true): Promise<Lesson> =>
    payload.findByID({
      collection: 'lessons',
      id,
      locale,
      fallbackLocale: fallback ? undefined : false,
      depth: 0,
    }) as Promise<Lesson>

  describe('both fields are per locale', () => {
    it('leaves the English values untouched when another locale is written', async () => {
      const english = await createRecording()
      const czech = await createRecording()
      const lesson = await testData.createLesson(payload, {
        introAudio: english.id,
        introSubtitles: [{ content: 'English line', startTimeMs: 0, endTimeMs: 900 }],
      } as never)

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'cs',
        data: {
          introAudio: czech.id,
          introSubtitles: [{ content: 'Česká věta', startTimeMs: 0, endTimeMs: 900 }],
        },
      })

      const en = await readLesson(lesson.id, 'en')
      const cs = await readLesson(lesson.id, 'cs')

      expect(en.introAudio).toBe(english.id)
      expect((en.introSubtitles as Subtitles)[0]!.content).toBe('English line')
      expect(cs.introAudio).toBe(czech.id)
      expect((cs.introSubtitles as Subtitles)[0]!.content).toBe('Česká věta')
    })

    // Fallback is on, which is what keeps every untranslated locale reading
    // exactly what it read before the fields were localized.
    it('falls back to the English value in a locale with none of its own', async () => {
      const english = await createRecording()
      const lesson = await testData.createLesson(payload, {
        introAudio: english.id,
        introSubtitles: [{ content: 'English line', startTimeMs: 0, endTimeMs: 900 }],
      } as never)

      const withFallback = await readLesson(lesson.id, 'fr')
      expect(withFallback.introAudio).toBe(english.id)
      expect((withFallback.introSubtitles as Subtitles)[0]!.content).toBe('English line')

      // And the locale genuinely holds nothing of its own, which is what the
      // readiness check reads.
      const own = await readLesson(lesson.id, 'fr', false)
      expect(own.introAudio ?? null).toBeNull()
      expect(own.introSubtitles ?? null).toBeNull()
    })

    // ⚠ Neither field may be `required`: Payload validates a required localized
    // field against that locale's own value, so it would refuse every write in
    // a locale that carries neither (`src/collections/Lessons/AGENTS.md`).
    it('accepts a write in a second locale that sets neither field', async () => {
      const lesson = await testData.createLesson(payload, {
        introAudio: (await createRecording()).id,
      } as never)

      await expect(
        payload.update({
          collection: 'lessons',
          id: lesson.id,
          locale: 'de',
          data: { title: 'Deutscher Titel' },
        }),
      ).resolves.toMatchObject({ id: lesson.id })
    })

    it('refuses a recording that is not an MP3, through the field itself', async () => {
      const video = await createRecording('video-30s.mp4')

      await expect(
        testData.createLesson(payload, { introAudio: video.id } as never),
      ).rejects.toThrow()
    })
  })

  describe('POST /api/files/:id/subtitles', () => {
    let rest: RestClient
    let englishOnly: RestClient
    let noRole: RestClient

    beforeAll(async () => {
      const czechEditor = await testData.createManager(payload, {
        type: 'manager',
        roles: { cs: ['path-editor'] },
      })
      const englishEditor = await testData.createManager(payload, {
        type: 'manager',
        roles: { en: ['path-editor'] },
      })
      const bystander = await testData.createManager(payload, { type: 'manager', roles: {} })
      rest = await createRestClientAs(env, czechEditor)
      englishOnly = await createRestClientAs(env, englishEditor)
      noRole = await createRestClientAs(env, bystander)
    })

    it('returns cues to a manager holding lessons: update in the request locale', async () => {
      const recording = await createRecording()

      const { status, body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(200)
      const cues = body.cues as Subtitles
      expect(cues.length).toBeGreaterThan(1)
      for (const cue of cues) {
        expect(cue.content.length).toBeLessThanOrEqual(SUBTITLE_CUE_MAX_CHARS)
      }
      expect(cues[0]).toMatchObject({ startTimeMs: 100 })
      expect(cues.at(-1)).toMatchObject({ endTimeMs: 3200 })
    })

    // ⚠ The #701 403, which only the REST layer can show: no `?locale=` means
    // Payload resolves the default locale, and this manager's role is Czech.
    it('denies a request naming no locale, because it resolves to the default', async () => {
      const recording = await createRecording()

      const { status } = await rest(`/api/files/${recording.id}/subtitles`, { method: 'post' })

      expect(status).toBe(403)
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
      expect(await transcriptOf(recording.id)).toBeUndefined()
    })

    it('denies it under a locale the manager holds no role in', async () => {
      const recording = await createRecording()

      const { status } = await rest(`/api/files/${recording.id}/subtitles?locale=en`, {
        method: 'post',
      })

      expect(status).toBe(403)
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })

    it('denies a manager holding no Path role at all', async () => {
      const recording = await createRecording()

      const { status } = await noRole(`/api/files/${recording.id}/subtitles?locale=en`, {
        method: 'post',
      })

      expect(status).toBe(403)
    })

    // The cue row records the language the run was made in, which is what the
    // glossary pass keys on.
    it('records the request locale as the row language, and names the file', async () => {
      const recording = await createRecording()

      await rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' })
      const row = await transcriptOf(recording.id)

      expect(row).toMatchObject({
        language: 'cs',
        provider: 'lemonfox',
        audioFilename: recording.filename,
      })
      expect(row?.source).toMatchObject({ relationTo: 'files' })
    })

    it('asks the vendor for word timings, in the request locale', async () => {
      const recording = await createRecording()

      await rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' })

      expect(lemonfox.requestLemonfoxTranscript).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'cs', wordTimings: true }),
      )
    })

    // ⚠ Both halves: the row names `file`, so the queueing hook has no
    // `meditationId` to start a run with — and a run it started would resolve
    // nothing (`Transcripts/hooks/queueTranscription.ts`).
    it('queues no transcription job for a file-sourced row', async () => {
      const recording = await createRecording()
      // A delta, not a total: every `createLesson` above builds a meditation,
      // and a meditation with a recording queues a run of its own.
      const before = await transcribeJobCount()

      await rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' })

      expect(await transcribeJobCount()).toBe(before)
      expect(await transcriptOf(recording.id)).toMatchObject({ job: null })
    })

    // ⚠ A run costs money, so a second press answers from the stored row.
    it('answers a second call from the stored cues without paying for a run', async () => {
      const recording = await createRecording()

      const first = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' })
      expect(lemonfox.requestLemonfoxTranscript).toHaveBeenCalledTimes(1)

      const second = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(second.status).toBe(200)
      expect(second.body.reused).toBe(true)
      expect(second.body.cues).toEqual(first.body.cues)
      expect(lemonfox.requestLemonfoxTranscript).toHaveBeenCalledTimes(1)
    })

    // ⚠ `source` is `unique`, so two admins pressing at once race on the
    // insert. The loser answers from the winner's row: those cues are for this
    // same recording, and an unhandled refusal there is a 500 for a request
    // that succeeded in every way the caller can see.
    it('answers from the winner when two runs race on the same file', async () => {
      const recording = await createRecording()

      const [first, second] = await Promise.all([
        rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' }),
        rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' }),
      ])

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(first.body.cues).toEqual(second.body.cues)
      // One row, not two, and nothing left half-written.
      const { totalDocs } = await payload.find({
        collection: 'transcripts',
        where: { source: { equals: { relationTo: 'files', value: recording.id } } },
        depth: 0,
        limit: 0,
        overrideAccess: true,
      })
      expect(totalDocs).toBe(1)
    })

    // ⚠ `applyGlossaryToSegments` is a `beforeChange` hook on `transcripts`, so
    // the row holds our spellings while the vendor's body holds its own (#1084).
    // Answering with what was sent would hand the admin uncorrected words on the
    // first press and corrected ones on the second, for one recording.
    it('answers with the stored cues, after the glossary has corrected them', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({
        segments: [
          {
            start: 0,
            end: 1.2,
            text: ' mooladhara',
            words: [{ word: 'mooladhara', start: 0.1, end: 1.2 }],
          },
        ],
      })
      const recording = await createRecording()

      const { body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      const cues = body.cues as Subtitles
      expect(cues[0]!.content).toBe('Mooladhara')
      // And the second press agrees with the first, rather than differing by
      // exactly the correction.
      const again = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })
      expect(again.body.cues).toEqual(cues)
      expect((await transcriptOf(recording.id))?.segments).toEqual(cues)
    })

    // ⚠ The vendor fetches this address itself, so a host is the whole
    // requirement — and with no delivery URL configured `files.url` is the
    // relative `/api/files/file/<name>`, which a non-empty test passes and the
    // vendor then cannot resolve. That is local dev, and this is the refusal it
    // gets instead of an opaque vendor error.
    it('refuses a recording whose address has no host', async () => {
      storage.getR2Url.mockReturnValue(undefined)
      const recording = await createRecording()

      const { status, body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(409)
      expect(message(body)).toMatch(/public address/)
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
      expect(await transcriptOf(recording.id)).toBeUndefined()
    })

    it('sends the vendor an absolute address', async () => {
      const recording = await createRecording()

      await rest(`/api/files/${recording.id}/subtitles?locale=cs`, { method: 'post' })

      expect(lemonfox.requestLemonfoxTranscript).toHaveBeenCalledWith(
        expect.objectContaining({ audioUrl: expect.stringMatching(/^https:\/\//) }),
      )
    })

    it('refuses an id that is not a file id', async () => {
      const { status } = await rest('/api/files/not-a-number/subtitles?locale=cs', {
        method: 'post',
      })

      expect(status).toBe(400)
    })

    it('refuses a file that does not exist', async () => {
      const { status } = await rest('/api/files/987654/subtitles?locale=cs', { method: 'post' })

      expect(status).toBe(404)
    })

    // Worded so the admin knows the recording is wrong rather than the server.
    // No offer to retry, because pressing again cannot help — which is what
    // "Attach one and try again" said before this assertion existed.
    it('refuses anything that is not an MP3, in plain words', async () => {
      const video = await createRecording('video-30s.mp4')

      const { status, body } = await rest(`/api/files/${video.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(415)
      expect(message(body)).toMatch(/MP3/)
      expect(message(body)).not.toMatch(/try again/i)
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })

    it('refuses with 503 and the real message when the deployment has no key', async () => {
      lemonfox.lemonfoxApiKey.mockReturnValue(undefined)
      const recording = await createRecording()

      const { status, body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(503)
      expect(message(body)).toContain('no Lemonfox API key')
      // Never an empty success: a 200 with no cues reads as a recording with
      // no speech, which is a different thing to tell an admin.
      expect(body.cues).toBeUndefined()
      expect(await transcriptOf(recording.id)).toBeUndefined()
    })

    it('writes no row when the vendor run fails, and returns its reason', async () => {
      lemonfox.requestLemonfoxTranscript.mockRejectedValue(new Error('Lemonfox returned 429'))
      const recording = await createRecording()

      const { status, body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(502)
      expect(message(body)).toContain('Lemonfox returned 429')
      expect(await transcriptOf(recording.id)).toBeUndefined()
    })

    it('writes no row for a recording with no recognised speech', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({ segments: [] })
      const recording = await createRecording()

      const { status, body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(422)
      expect(message(body)).toMatch(/no speech/i)
      expect(await transcriptOf(recording.id)).toBeUndefined()
    })

    // `?locale=all` is a locale Payload resolves and a role scope nothing
    // holds, so it must not reach the vendor or the row's `language` column.
    it('refuses a request whose locale is not one language', async () => {
      const recording = await createRecording()

      const { status } = await englishOnly(`/api/files/${recording.id}/subtitles?locale=all`, {
        method: 'post',
      })

      expect(status).toBeGreaterThanOrEqual(400)
      expect(lemonfox.requestLemonfoxTranscript).not.toHaveBeenCalled()
    })

    it('stores cues the lesson column then accepts, in the locale that made them', async () => {
      const recording = await createRecording()
      const { body } = await rest(`/api/files/${recording.id}/subtitles?locale=cs`, {
        method: 'post',
      })
      const lesson = await testData.createLesson(payload)

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'cs',
        data: { introAudio: recording.id, introSubtitles: body.cues as Subtitles },
      })

      const cs = await readLesson(lesson.id, 'cs', false)
      expect(cs.introSubtitles).toEqual(body.cues)
      const en = await readLesson(lesson.id, 'en', false)
      expect(en.introSubtitles ?? null).toBeNull()
    })
  })
})

/** The first message of Payload's error envelope. */
function message(body: Record<string, unknown>): string {
  const errors = body.errors as { message?: string }[] | undefined
  return errors?.[0]?.message ?? ''
}
