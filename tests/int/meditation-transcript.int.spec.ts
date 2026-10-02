/**
 * `GET`/`POST /api/meditations/:id/transcript` and the `transcribeMeditation`
 * job behind them.
 *
 * The test env pins `LEMONFOX_API_KEY` empty and names no Railway environment
 * (`vitest.config.mts`), so the job writes its sample transcript and no test
 * reaches Lemonfox. `NODE_ENV=test` also stops the POST starting the queue
 * itself, so each spec runs the job when it wants it to run.
 */
import type { Payload, PayloadRequest } from 'payload'

import fs from 'fs'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { requestMeditationTranscript } from '@/collections/Meditations/endpoints/requestTranscript'
import { meditationTranscript } from '@/collections/Meditations/endpoints/transcript'
import type { TranscriptView } from '@/lib/meditations/transcript'
import type { Meditation } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type Caller = Record<string, unknown> | null
type Endpoint = typeof meditationTranscript

const EDITOR: Caller = {
  id: 9001,
  collection: 'managers',
  type: 'manager',
  roles: { en: ['meditations-editor'] },
}

const STALL_AGO_MS = 20 * 60 * 1000

describe('meditation transcripts', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let frameId: number

  const call = async (
    endpoint: Endpoint,
    id: number | string,
    user: Caller = EDITOR,
    locale = 'en',
  ): Promise<{ status: number; body: TranscriptView & { errors?: { message: string }[] } }> => {
    const req = {
      payload,
      user,
      locale,
      routeParams: { id: String(id) },
      headers: new Headers(),
      query: {},
      context: {},
    } as unknown as PayloadRequest
    const response = (await endpoint.handler(req)) as Response
    return { status: response.status, body: await response.json() }
  }

  const pendingJobs = async (meditationId: number) => {
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'transcribeMeditation' } },
      limit: 0,
      pagination: false,
    })
    return docs.filter(
      (job) =>
        (job.input as { meditationId?: number }).meditationId === meditationId &&
        !job.completedAt &&
        !job.hasError,
    )
  }

  const versionCount = async (meditationId: number) =>
    (
      await payload.countVersions({
        collection: 'meditations',
        where: { parent: { equals: meditationId } },
      })
    ).totalDocs

  const replaceAudio = async (meditationId: number): Promise<Meditation> => {
    const audio = fs.readFileSync(path.join(process.cwd(), 'tests', 'files', 'audio-42s.mp3'))
    return payload.update({
      collection: 'meditations',
      id: meditationId,
      // Updating a meditation requires at least one frame.
      data: { frames: [{ id: frameId, timestamp: 0 }] },
      file: { data: audio, mimetype: 'audio/mpeg', name: 'replacement.mp3', size: audio.length },
      overrideAccess: true,
    })
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    frameId = (await testData.createFrame(payload, { imageSet: 'male' })).id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('access', () => {
    let meditation: Meditation

    beforeAll(async () => {
      meditation = await testData.createMeditation(payload)
    })

    it.each<[string, Caller]>([
      ['an anonymous caller', null],
      [
        'an API client that reads meditations',
        { id: 1, collection: 'clients', _status: 'published', roles: ['wemeditate-app-client'] },
      ],
      [
        'an inactive manager',
        { id: 2, collection: 'managers', type: 'inactive', roles: { en: ['meditations-editor'] } },
      ],
      [
        'a manager with no role',
        { id: 3, collection: 'managers', type: 'manager', roles: { en: [] } },
      ],
      [
        'a meditations editor in another locale',
        { id: 4, collection: 'managers', type: 'manager', roles: { fr: ['meditations-editor'] } },
      ],
    ])('refuses %s on both methods', async (_label, user) => {
      expect((await call(meditationTranscript, meditation.id, user)).status).toBe(403)
      expect((await call(requestMeditationTranscript, meditation.id, user)).status).toBe(403)
    })

    it('lets a manager who reads meditations read the transcript, but not request one', async () => {
      const translator = {
        id: 5,
        collection: 'managers',
        type: 'manager',
        roles: { en: ['web-translator'] },
      }

      expect((await call(meditationTranscript, meditation.id, translator)).status).toBe(200)
      expect((await call(requestMeditationTranscript, meditation.id, translator)).status).toBe(403)
    })

    it('admits an admin, who holds no roles', async () => {
      const admin = { id: 6, collection: 'managers', type: 'admin' }

      expect((await call(meditationTranscript, meditation.id, admin)).status).toBe(200)
    })

    it('answers 400 for a malformed id and 404 for an unknown meditation', async () => {
      expect((await call(meditationTranscript, 'abc')).status).toBe(400)
      expect((await call(meditationTranscript, 999999)).status).toBe(404)
      expect((await call(requestMeditationTranscript, 999999)).status).toBe(404)
    })

    it('keeps the collection itself from managers and API clients', async () => {
      const read = (user: Caller) =>
        payload.find({
          collection: 'meditation-transcripts',
          overrideAccess: false,
          user: user as never,
        })

      await expect(read(EDITOR)).rejects.toThrow()
      await expect(
        read({
          id: 1,
          collection: 'clients',
          _status: 'published',
          roles: ['wemeditate-app-client'],
        }),
      ).rejects.toThrow()
    })
  })

  describe('requesting a transcript', () => {
    it('reports none before any request', async () => {
      const meditation = await testData.createMeditation(payload)

      const { status, body } = await call(meditationTranscript, meditation.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ status: 'none', outdated: false, stalled: false, segments: [] })
    })

    it('queues one job however often it is clicked, then writes the sample transcript', async () => {
      const meditation = await testData.createMeditation(payload)
      const versionsBefore = await versionCount(meditation.id)

      const first = await call(requestMeditationTranscript, meditation.id)
      const second = await call(requestMeditationTranscript, meditation.id)

      expect(first.status).toBe(202)
      expect(first.body).toMatchObject({ status: 'queued', outdated: false })
      expect(second.body.status).toBe('queued')
      const jobs = await pendingJobs(meditation.id)
      expect(jobs).toHaveLength(1)
      expect(jobs[0].queue).toBe('transcription')
      expect(jobs[0].input).toEqual({
        meditationId: meditation.id,
        audioFilename: meditation.filename,
      })
      expect((await call(meditationTranscript, meditation.id)).body.status).toBe('queued')

      await payload.jobs.run({ queue: 'transcription' })

      const { body } = await call(meditationTranscript, meditation.id)
      expect(body).toMatchObject({ status: 'completed', provider: 'sample', error: null })
      expect(body.segments).toHaveLength(10)
      for (const segment of body.segments) {
        expect(segment.end).toBeLessThanOrEqual(meditation.duration!)
      }
      expect(await versionCount(meditation.id)).toBe(versionsBefore)
    })

    it('marks the transcript out of date once the audio is replaced, and transcribes afresh', async () => {
      const meditation = await testData.createMeditation(payload)
      await call(requestMeditationTranscript, meditation.id)
      await payload.jobs.run({ queue: 'transcription' })

      const replaced = await replaceAudio(meditation.id)
      expect(replaced.filename).not.toBe(meditation.filename)

      const outdated = await call(meditationTranscript, meditation.id)
      expect(outdated.body).toMatchObject({ status: 'completed', outdated: true })

      const requested = await call(requestMeditationTranscript, meditation.id)
      expect(requested.status).toBe(202)
      expect(requested.body).toMatchObject({ status: 'queued', outdated: false, segments: [] })
      expect((await pendingJobs(meditation.id))[0].input).toMatchObject({
        audioFilename: replaced.filename,
      })
    })

    it('lets a run for a replaced recording write nothing', async () => {
      const meditation = await testData.createMeditation(payload)
      await call(requestMeditationTranscript, meditation.id)
      const [staleJob] = await pendingJobs(meditation.id)

      const replaced = await replaceAudio(meditation.id)
      await call(requestMeditationTranscript, meditation.id)

      await payload.jobs.runByID({ id: staleJob.id })
      expect((await call(meditationTranscript, meditation.id)).body.status).toBe('queued')

      await payload.jobs.run({ queue: 'transcription' })
      const { body } = await call(meditationTranscript, meditation.id)
      expect(body).toMatchObject({ status: 'completed', outdated: false })
      const [row] = (
        await payload.find({
          collection: 'meditation-transcripts',
          where: { meditation: { equals: meditation.id } },
        })
      ).docs
      expect(row.audioFilename).toBe(replaced.filename)
    })

    it('treats a request untouched for 15 minutes as stalled, and accepts it again', async () => {
      const meditation = await testData.createMeditation(payload)
      await call(requestMeditationTranscript, meditation.id)
      const [row] = (
        await payload.find({
          collection: 'meditation-transcripts',
          where: { meditation: { equals: meditation.id } },
        })
      ).docs
      await payload.db.updateOne({
        collection: 'meditation-transcripts',
        id: row.id,
        data: {
          status: 'processing',
          updatedAt: new Date(Date.now() - STALL_AGO_MS).toISOString(),
        },
      })

      expect((await call(meditationTranscript, meditation.id)).body).toMatchObject({
        status: 'processing',
        stalled: true,
      })

      const retried = await call(requestMeditationTranscript, meditation.id)
      expect(retried.body).toMatchObject({ status: 'queued', stalled: false })
      expect(await pendingJobs(meditation.id)).toHaveLength(2)
    })

    it('fails clearly in production without a key, rather than writing sample text', async () => {
      const meditation = await testData.createMeditation(payload)
      await call(requestMeditationTranscript, meditation.id)
      const [job] = await pendingJobs(meditation.id)

      process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
      try {
        await payload.jobs.runByID({ id: job.id })
      } finally {
        delete process.env.RAILWAY_ENVIRONMENT_NAME
      }

      const { body } = await call(meditationTranscript, meditation.id)
      expect(body.status).toBe('failed')
      expect(body.error).toMatch(/LEMONFOX_API_KEY is not set/)
      expect(body.segments).toEqual([])
    })
  })
})
