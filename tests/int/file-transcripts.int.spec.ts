/**
 * A file's transcript (#1016): an MP3 is transcribed when it is saved, a video
 * when Cloudflare Stream reports it ready, the run detects the language, and a
 * Path Step reads its intro subtitles from the file rather than storing them.
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

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { transcribeStreamVideo } from '@/collections/Files/transcribeStreamVideo'
import { TranscribeRecording } from '@/jobs/TranscribeRecording/TranscribeRecording'
import type { File, Lesson, Transcript } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
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

  const transcribe = (file: File) =>
    runTaskHandler(TranscribeRecording, {
      payload,
      input: { fileId: file.id, audioFilename: file.filename! },
    })

  /** An MP3 whose run has finished, heard as Czech. */
  const completed = async (): Promise<File> => {
    const file = await testData.createFile(payload)
    await transcribe(file)
    return file
  }

  describe('an upload', () => {
    it('queues a run for an MP3, with no language yet', async () => {
      const file = await testData.createFile(payload)

      const row = await transcriptOf(file.id)
      expect(row?.audioFilename).toBe(file.filename)
      expect(row?.language ?? null).toBeNull()
      expect(row?.segments ?? null).toBeNull()
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
        data: {},
        filePath: 'tests/files/audio-42s.mp3',
        context: { importedTranscript: { language: 'en', segments: cues } },
      })

      const row = await transcriptOf(file.id)
      expect(row?.provider).toBe('imported')
      expect(row?.language).toBe('en')
      expect(row?.segments).toEqual(cues)
      expect(await queuedRunsFor(file.id)).toHaveLength(0)
    })
  })

  describe('a run', () => {
    it('stores subtitle-length cues and the language it heard', async () => {
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
      expect(row?.language).toBe('cs')
      expect(row?.segments).toEqual([
        { content: 'Vítejte v prvním kroku cesty.', startTimeMs: 0, endTimeMs: 4250 },
        { content: 'Zavřete oči.', startTimeMs: 4250, endTimeMs: 6000 },
      ])
    })

    it('asks in the language a row names, and keeps it', async () => {
      const file = await testData.createFile(payload)
      const row = await transcriptOf(file.id)
      await payload.update({
        collection: 'transcripts',
        id: row!.id,
        data: { language: 'de' },
        overrideAccess: true,
      })

      await transcribe(file)

      expect(lemonfox.requestLemonfoxTranscript.mock.calls[0]![0]).toMatchObject({ locale: 'de' })
      expect((await transcriptOf(file.id))?.language).toBe('de')
    })

    it('leaves the language empty when no locale here speaks it', async () => {
      lemonfox.requestLemonfoxTranscript.mockResolvedValue({ ...VENDOR_BODY, language: 'sanskrit' })
      const file = await testData.createFile(payload)

      await transcribe(file)

      const row = await transcriptOf(file.id)
      expect(row?.language ?? null).toBeNull()
      expect(row?.segments).toHaveLength(2)
    })

    // A corrected language replaces the row and keeps `audioFilename`, so a
    // guard reading only the filename passes here and then updates an id that
    // is gone — a throw where `superseded` is the answer.
    it('answers superseded when a language change replaced the row mid-run', async () => {
      const file = await testData.createFile(payload)
      const original = await transcriptOf(file.id)
      lemonfox.requestLemonfoxTranscript.mockImplementation(async () => {
        await payload.delete({ collection: 'transcripts', id: original!.id, overrideAccess: true })
        await payload.create({
          collection: 'transcripts',
          data: createData<'transcripts'>({
            audioFilename: file.filename!,
            language: 'de',
            source: { relationTo: 'files', value: file.id },
          }),
          overrideAccess: true,
        })
        return VENDOR_BODY
      })

      const output = await transcribe(file)

      expect(output.status).toBe('superseded')
      const row = await transcriptOf(file.id)
      expect(row?.id).not.toBe(original?.id)
      expect(row?.segments ?? null).toBeNull()
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

    it('re-runs a finished transcript in a corrected language', async () => {
      const file = await completed()

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs&language=de`, {
        method: 'post',
      })

      expect(status).toBe(200)
      const row = await transcriptOf(file.id)
      expect(row?.language).toBe('de')
      expect(row?.segments ?? null).toBeNull()
      expect(await queuedRunsFor(file.id)).toHaveLength(2)
    })

    it('refuses to re-run a finished transcript in the same language', async () => {
      const file = await completed()

      const { status } = await editor(`/api/files/${file.id}/transcribe?locale=cs&language=cs`, {
        method: 'post',
      })

      expect(status).toBe(409)
      expect((await transcriptOf(file.id))?.segments).toHaveLength(2)
    })

    it('refuses a language no locale here offers', async () => {
      const file = await testData.createFile(payload)

      const { status } = await editor(
        `/api/files/${file.id}/transcribe?locale=cs&language=klingon`,
        { method: 'post' },
      )

      expect(status).toBe(400)
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
    // carries its cues as a virtual field (`subtitlesFromTranscript`).
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
})
