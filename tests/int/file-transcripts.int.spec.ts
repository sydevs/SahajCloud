/**
 * A file's transcript (#1016): an MP3 is transcribed when it is saved and again
 * when its spoken language changes, a video when Cloudflare Stream reports it
 * ready, the run detects a language the file does not state and writes it there,
 * and a Path Step reads its intro subtitles from the file rather than storing
 * them.
 *
 * **Fixture pre-mortem.** The vendor is mocked at
 * `@/jobs/TranscribeRecording/lemonfoxClient` — `tests/AGENTS.md`'s boundary
 * rule — so no case can make a paid call. Claims the fixtures make, each
 * checked against the code they stand in for:
 *
 * - The body is `verbose_json` with per-segment word timings and a top-level
 *   `language` name, which is what `src/lib/lemonfox/normalize.ts` reads.
 * - `getR2Url` is mocked at the `@/plugins/storage` barrel, where the job
 *   imports it: `CLOUDFLARE_R2_DELIVERY_URL` is unset in the lane, so the real
 *   one answers `undefined` and every run would refuse before the vendor.
 * - `runQueueSoon` is a no-op under `NODE_ENV=test`, so a queued run waits for
 *   `runTaskHandler` here.
 * - `path-editor` holds `files: ['create']` and no `update`, per locale
 *   (`src/plugins/access/config/roles.ts`), which is the grant the transcribe
 *   endpoint gates on.
 */
import type { Payload } from 'payload'

import { extractID } from 'payload/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { spokenLanguageOf, transcriptUrl } from '@/components/admin/TranscriptPanel/transcriptModel'
import { TranscribeRecording } from '@/jobs/TranscribeRecording/TranscribeRecording'
import { transcribeStreamVideo } from '@/lib/transcripts/sync'
import type { File, Lesson, Transcript } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const lemonfox = vi.hoisted(() => ({
  lemonfoxApiKey: vi.fn<() => string | undefined>(),
  requestLemonfoxTranscript: vi.fn<(args: { locale?: string }) => Promise<unknown>>(),
}))

vi.mock('@/jobs/TranscribeRecording/lemonfoxClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/jobs/TranscribeRecording/lemonfoxClient')>()),
  ...lemonfox,
}))

const storage = vi.hoisted(() => ({ getR2Url: vi.fn<(filename: string) => string | undefined>() }))

vi.mock('@/plugins/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/plugins/storage')>()),
  ...storage,
}))

/** Two cues once grouped, heard as Czech — the language a file run detects. */
const VENDOR_BODY = {
  language: 'czech',
  segments: [
    {
      start: 0,
      end: 4.25,
      text: ' Vítejte v prvním kroku cesty.',
      words: [
        { word: 'Vítejte', start: 0, end: 0.8 },
        { word: 'v', start: 0.8, end: 0.9 },
        { word: 'prvním', start: 0.9, end: 1.5 },
        { word: 'kroku', start: 1.5, end: 2.2 },
        { word: 'cesty.', start: 2.2, end: 4.25 },
      ],
    },
    {
      start: 4.25,
      end: 6,
      text: ' Zavřete oči.',
      words: [
        { word: 'Zavřete', start: 4.25, end: 5 },
        { word: 'oči.', start: 5, end: 6 },
      ],
    },
  ],
}

describe('file transcripts', () => {
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

  const queuedRunsFor = async (fileId: number) =>
    (
      await payload.find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: 'transcribeMeditation' } },
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
    ).docs.filter((job) => (job.input as { fileId?: number } | null)?.fileId === fileId)

  /**
   * Run the task the way the queue does: as the job row the transcript names.
   *
   * ⚠ **A case that replaces the row has to capture `job` first.** The task
   * tells its own row from a later request's by that id, so defaulting to the
   * row that exists now would hand a lost run the retry's identity.
   */
  const transcribe = async (file: File, job?: number) =>
    runTaskHandler(TranscribeRecording, {
      payload,
      input: { fileId: file.id, audioFilename: file.filename! },
      job: { id: job ?? Number(extractID((await transcriptOf(file.id))!.job!)) },
    })

  /** An MP3 whose run has finished, heard as Czech. */
  const completed = async (): Promise<File> => {
    const file = await testData.createFile(payload)
    await transcribe(file)
    return file
  }

  const fileOf = async (fileId: number): Promise<File> =>
    payload.findByID({ collection: 'files', id: fileId, depth: 0, overrideAccess: true })

  describe('an upload', () => {
    it('queues a run for an MP3 that states no language', async () => {
      const file = await testData.createFile(payload)

      const row = await transcriptOf(file.id)
      expect(row?.audioFilename).toBe(file.filename)
      expect(row?.segments ?? null).toBeNull()
      expect(file.spokenLanguage ?? null).toBeNull()
      expect(await queuedRunsFor(file.id)).toHaveLength(1)
    })

    it('queues nothing for an image', async () => {
      const file = await testData.createFile(payload, {}, 'image-1050x700.jpg')

      expect(await transcriptOf(file.id)).toBeUndefined()
    })

    // A video's MP4 exists only once Stream has processed it, so its transcript
    // waits for the webhook rather than starting a run that cannot fetch it.
    it('waits for Stream to report a video ready, then queues once', async () => {
      const file = await testData.createFile(payload, {}, 'video-30s.mp4')
      expect(await transcriptOf(file.id)).toBeUndefined()

      await transcribeStreamVideo(payload, file.filename!)
      await transcribeStreamVideo(payload, file.filename!)

      expect((await transcriptOf(file.id))?.audioFilename).toBe(file.filename)
      expect(await queuedRunsFor(file.id)).toHaveLength(1)
    })

    it('stores cues that already exist and pays for no run', async () => {
      const cues = [{ content: 'Hand-made line', startTimeMs: 0, endTimeMs: 900 }]
      const file = await payload.create({
        collection: 'files',
        data: { spokenLanguage: 'en' },
        filePath: 'tests/files/audio-42s.mp3',
        context: { importedSegments: cues },
      })

      const row = await transcriptOf(file.id)
      expect(row?.provider).toBe('imported')
      expect(row?.segments).toEqual(cues)
      expect(file.spokenLanguage).toBe('en')
      expect(await queuedRunsFor(file.id)).toHaveLength(0)
    })
  })

  describe('a run', () => {
    // The write-back is flagged, so the file's save hook does not read the
    // language it heard as a correction and queue a second, paid run.
    it('stores subtitle-length cues, and the language it heard on the file', async () => {
      const file = await testData.createFile(payload)

      const output = await transcribe(file)

      expect(output.status).toBe('completed')
      expect(lemonfox.requestLemonfoxTranscript.mock.calls[0]![0]).toMatchObject({
        audioUrl: `https://assets.test/${file.filename}`,
        locale: undefined,
        wordTimings: true,
      })
      const row = await transcriptOf(file.id)
      expect(row?.provider).toBe('lemonfox')
      expect(row?.segments).toEqual([
        { content: 'Vítejte v prvním kroku cesty.', startTimeMs: 0, endTimeMs: 4250 },
        { content: 'Zavřete oči.', startTimeMs: 4250, endTimeMs: 6000 },
      ])
      expect((await fileOf(file.id)).spokenLanguage).toBe('cs')
      expect(await queuedRunsFor(file.id)).toHaveLength(1)
    })

    // The glossary pass reads the language off the file, so the run has to
    // write what it heard there before the cues it corrects.
    it('corrects spellings in the language it heard', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({
        language: 'czech',
        segments: [
          {
            start: 0,
            end: 2,
            text: ' Probuďte kundalini.',
            words: [
              { word: 'Probuďte', start: 0, end: 1 },
              { word: 'kundalini.', start: 1, end: 2 },
            ],
          },
        ],
      })
      const file = await testData.createFile(payload)

      await transcribe(file)

      expect((await transcriptOf(file.id))?.segments).toEqual([
        { content: 'Probuďte Kundalini.', startTimeMs: 0, endTimeMs: 2000 },
      ])
    })

    it('asks in the language the file states, and leaves it', async () => {
      const file = await testData.createFile(payload, { spokenLanguage: 'de' })

      await transcribe(file)

      expect(lemonfox.requestLemonfoxTranscript.mock.calls[0]![0]).toMatchObject({ locale: 'de' })
      expect((await fileOf(file.id)).spokenLanguage).toBe('de')
    })

    it('leaves the language empty when no locale here speaks it', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({ ...VENDOR_BODY, language: 'sanskrit' })
      const file = await testData.createFile(payload)

      await transcribe(file)

      expect((await fileOf(file.id)).spokenLanguage ?? null).toBeNull()
      expect((await transcriptOf(file.id))?.segments).toHaveLength(2)
    })

    // A changed language replaces the row and keeps `audioFilename`, so a guard
    // reading only the filename passes here and then updates an id that is
    // gone — a throw where `superseded` is the answer. The language a person
    // stated meanwhile must survive the run that detected another.
    it('answers superseded when a language change replaced the row mid-run', async () => {
      const file = await testData.createFile(payload)
      const original = await transcriptOf(file.id)
      const job = Number(extractID(original!.job!))
      lemonfox.requestLemonfoxTranscript.mockImplementation(async () => {
        await payload.update({
          collection: 'files',
          id: file.id,
          data: { spokenLanguage: 'de' },
          overrideAccess: true,
        })
        return VENDOR_BODY
      })

      const output = await transcribe(file, job)

      expect(output.status).toBe('superseded')
      const row = await transcriptOf(file.id)
      expect(row?.id).not.toBe(original?.id)
      expect(row?.segments ?? null).toBeNull()
      expect((await fileOf(file.id)).spokenLanguage).toBe('de')
    })
  })

  describe('a saved file', () => {
    let editor: RestClient

    beforeAll(async () => {
      const pathEditor = await testData.createManager(payload, {
        type: 'manager',
        roles: { cs: ['path-editor'] },
      })
      editor = await createRestClientAs(env, pathEditor)
    })

    it('is transcribed again when its language changes', async () => {
      const file = await completed()

      await payload.update({
        collection: 'files',
        id: file.id,
        data: { spokenLanguage: 'de' },
        overrideAccess: true,
      })

      expect((await transcriptOf(file.id))?.segments ?? null).toBeNull()
      expect(await queuedRunsFor(file.id)).toHaveLength(2)
      await transcribe(file)
      expect(lemonfox.requestLemonfoxTranscript).toHaveBeenLastCalledWith(
        expect.objectContaining({ locale: 'de' }),
      )
    })

    it('is not transcribed again by a save that leaves the language alone', async () => {
      const file = await completed()

      await payload.update({ collection: 'files', id: file.id, data: {}, overrideAccess: true })

      expect((await transcriptOf(file.id))?.segments).toHaveLength(2)
      expect(await queuedRunsFor(file.id)).toHaveLength(1)
    })

    // The mismatch warning reads the language off the panel's own poll, so the
    // query `transcriptUrl` builds has to bring it — and bring nothing else of
    // the file, which an editor may read whole.
    it("comes back on the panel's transcript read, and nothing else of the file", async () => {
      const file = await completed()

      const { status, body } = await editor(transcriptUrl(file.id, 'cs', 'files')!)

      expect(status).toBe(200)
      const row = (body as { docs: Transcript[] }).docs[0]
      expect(spokenLanguageOf(row)).toBe('cs')
      // `deletedAt` is Payload's own, added to every populated trash-enabled row.
      expect(Object.keys(row?.source.value as object).sort()).toEqual([
        'deletedAt',
        'id',
        'spokenLanguage',
      ])
    })

    // Every editor role holds `files: create` and no `update`, so the language
    // is theirs to state on upload and an admin's to change after.
    it('refuses an editor changing the language', async () => {
      const file = await completed()

      const { status } = await editor(`/api/files/${file.id}?locale=cs`, {
        method: 'PATCH',
        json: { spokenLanguage: 'de' },
      })

      expect(status).toBe(403)
      expect((await fileOf(file.id)).spokenLanguage).toBe('cs')
    })

    // Its first run belongs to Stream's webhook; a language changed before then
    // reaches that run, which reads it off the file.
    it('re-runs a video for a language change only once its run has started', async () => {
      const file = await testData.createFile(payload, {}, 'video-30s.mp4')
      const setLanguage = (spokenLanguage: 'de' | 'fr') =>
        payload.update({
          collection: 'files',
          id: file.id,
          data: { spokenLanguage },
          overrideAccess: true,
        })

      await setLanguage('de')
      expect(await transcriptOf(file.id)).toBeUndefined()

      await transcribeStreamVideo(payload, file.filename!)
      await setLanguage('fr')
      expect(await queuedRunsFor(file.id)).toHaveLength(2)
    })
  })

  describe('POST /api/files/:id/transcribe', () => {
    let editor: RestClient
    let bystander: RestClient

    beforeAll(async () => {
      const pathEditor = await testData.createManager(payload, {
        type: 'manager',
        roles: { cs: ['path-editor'] },
      })
      const noRole = await testData.createManager(payload, { type: 'manager', roles: {} })
      editor = await createRestClientAs(env, pathEditor)
      bystander = await createRestClientAs(env, noRole)
    })

    // The lost-run case: no row at all, so the request creates one.
    it('asks again for a file whose transcript is gone', async () => {
      const file = await testData.createFile(payload)
      await payload.delete({
        collection: 'transcripts',
        where: { source: { equals: { relationTo: 'files', value: file.id } } },
        overrideAccess: true,
      })

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(200)
      expect((await transcriptOf(file.id))?.audioFilename).toBe(file.filename)
      expect(await queuedRunsFor(file.id)).toHaveLength(2)
    })

    it('refuses while a run is in flight, and keeps the row', async () => {
      const file = await testData.createFile(payload)
      const inFlight = await transcriptOf(file.id)

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(409)
      expect((await transcriptOf(file.id))?.id).toBe(inFlight?.id)
      expect(await queuedRunsFor(file.id)).toHaveLength(1)
    })

    it('refuses to re-run a finished transcript', async () => {
      const file = await completed()

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(409)
      expect((await transcriptOf(file.id))?.segments).toHaveLength(2)
    })

    it('refuses a file that is not audio or video', async () => {
      const file = await testData.createFile(payload, {}, 'image-1050x700.jpg')

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs`, {
        method: 'post',
      })

      expect(status).toBe(415)
    })

    // The #701 403: no `?locale=` resolves the default locale, and this
    // editor's role is Czech.
    it('denies a request naming no locale, and a manager who cannot upload', async () => {
      const file = await testData.createFile(payload)

      expect((await editor(`/api/files/${file.id}/transcribe`, { method: 'post' })).status).toBe(
        403,
      )
      expect(
        (await bystander(`/api/files/${file.id}/transcribe?locale=cs`, { method: 'post' })).status,
      ).toBe(403)
    })
  })

  describe('a Path Step', () => {
    it('reads its intro subtitles from the intro file, per locale', async () => {
      const english = await completed()
      const czech = await testData.createFile(payload)
      const lesson = await testData.createLesson(payload, { introAudio: english.id } as never)
      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'cs',
        data: { introAudio: czech.id },
      })

      const read = (locale: 'en' | 'cs' | 'all') =>
        payload.findByID({
          collection: 'lessons',
          id: lesson.id,
          locale,
          depth: 0,
        }) as Promise<Lesson>

      expect((await read('en')).introSubtitles).toHaveLength(2)
      // The Czech file has a transcript row, but no cues yet.
      expect((await read('cs')).introSubtitles ?? null).toBeNull()
      // Under `locale=all` there is no one language to answer for.
      expect((await read('all')).introSubtitles ?? null).toBeNull()
    })

    it('answers the subtitles to a read that selects only them', async () => {
      const file = await completed()
      const lesson = await testData.createLesson(payload, { introAudio: file.id } as never)

      const read = (await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'en',
        depth: 0,
        select: { introSubtitles: true },
      })) as Lesson

      expect(read.introSubtitles).toHaveLength(2)
    })

    // A join would answer bare ids here, at any depth — which is why the file
    // carries its cues as a virtual field (the `subtitles` field's `afterRead`).
    it("carries the file's cues through the populated upload", async () => {
      const file = await completed()
      const lesson = await testData.createLesson(payload, { introAudio: file.id } as never)

      const read = (await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'en',
        depth: 2,
      })) as Lesson

      const audio = read.introAudio as File
      expect(audio.subtitles).toHaveLength(2)
    })
  })

  // `readFileSubtitles` batches for a query count and nothing else: every cue
  // arrives without the batch, so only a count can fail. This is the read it
  // was built for, through the hooks Payload really runs.
  describe('a page of files', () => {
    it('costs one transcripts query for the whole page', async () => {
      const files = [await completed(), await completed(), await completed()]
      const find = vi.spyOn(payload, 'find')

      const { docs } = await payload.find({
        collection: 'files',
        where: { id: { in: files.map((file) => file.id) } },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })

      const reads = find.mock.calls.filter(([args]) => args.collection === 'transcripts')
      find.mockRestore()

      expect(docs).toHaveLength(3)
      for (const doc of docs) expect((doc as File).subtitles).toHaveLength(2)
      expect(reads).toHaveLength(1)
    })
  })
})
