import type { Payload } from 'payload'

import fs from 'fs'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { backfillSongDurations } from '../../scripts/song-durations'

vi.mock('../../src/plugins/storage', () => ({
  getR2Url: (filename: string) => `https://assets.test/${filename}`,
}))

const SAMPLE_FILES_DIR = path.resolve(__dirname, '../files')
const audio = (name: string) => fs.readFileSync(path.join(SAMPLE_FILES_DIR, name))

interface StubSong {
  id: number
  title: string
  filename?: string | null
  duration?: number | null
}

/**
 * A `Payload` with the two operations the routine calls. `find` answers the
 * rows that match its `duration exists: false` filter, so the stub applies that
 * filter itself — which is what makes a second run assert idempotence.
 */
const stubPayload = (rows: StubSong[]) => {
  const update = vi.fn(async ({ id, data }: { id: number; data: { duration: number } }) => {
    const row = rows.find((candidate) => candidate.id === id)
    if (row) row.duration = data.duration
    return row
  })
  const find = vi.fn(async () => ({ docs: rows.filter((row) => row.duration == null) }))
  return { payload: { find, update } as unknown as Payload, find, update }
}

afterEach(() => vi.unstubAllGlobals())

/** Every fetch answers with `files`' bytes, unless the URL names a status instead. */
const stubFetch = (files: Record<string, Buffer | number>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const answer = files[url.split('/').pop() ?? '']
      const bytes = typeof answer === 'number' ? Buffer.from('refused') : answer
      return {
        // A refusal still carries a body, so only `response.ok` tells it from audio.
        ok: typeof answer !== 'number',
        status: typeof answer === 'number' ? answer : 200,
        headers: new Headers(),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes))
            controller.close()
          },
        }),
      } as unknown as Response
    }),
  )

describe('backfillSongDurations', () => {
  it('writes the stored audio duration of every song holding none', async () => {
    const { payload, update } = stubPayload([
      { id: 1, title: 'Long', filename: 'long.mp3' },
      { id: 2, title: 'Short', filename: 'short.wav' },
    ])
    stubFetch({ 'long.mp3': audio('audio-42s.mp3'), 'short.wav': audio('audio-5s.wav') })

    const result = await backfillSongDurations(payload)

    expect(result.written).toEqual([
      { id: 1, title: 'Long', duration: 42 },
      { id: 2, title: 'Short', duration: 6 },
    ])
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('writes nothing on a second run', async () => {
    const { payload, update } = stubPayload([{ id: 1, title: 'Long', filename: 'long.mp3' }])
    stubFetch({ 'long.mp3': audio('audio-42s.mp3') })

    await backfillSongDurations(payload)
    const second = await backfillSongDurations(payload)

    expect(second).toEqual({ written: [], skipped: [] })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('reads and reports without writing on a dry run', async () => {
    const { payload, update } = stubPayload([{ id: 1, title: 'Long', filename: 'long.mp3' }])
    stubFetch({ 'long.mp3': audio('audio-42s.mp3') })

    const result = await backfillSongDurations(payload, { dryRun: true })

    expect(result.written).toEqual([{ id: 1, title: 'Long', duration: 42 }])
    expect(update).not.toHaveBeenCalled()
  })

  it('skips a song it cannot read and carries on with the rest', async () => {
    const { payload, update } = stubPayload([
      { id: 1, title: 'Gone', filename: 'gone.mp3' },
      { id: 2, title: 'No duration', filename: 'silent.mp3' },
      { id: 3, title: 'Fileless' },
      { id: 4, title: 'Long', filename: 'long.mp3' },
    ])
    stubFetch({
      'gone.mp3': 404,
      'silent.mp3': audio('audio-no-duration.mp3'),
      'long.mp3': audio('audio-42s.mp3'),
    })

    const result = await backfillSongDurations(payload)

    expect(result.written).toEqual([{ id: 4, title: 'Long', duration: 42 }])
    expect(result.skipped).toEqual([
      { id: 1, title: 'Gone', reason: 'fetch failed with 404' },
      { id: 2, title: 'No duration', reason: 'audio states no duration' },
      { id: 3, title: 'Fileless', reason: 'no audio file' },
    ])
    expect(update).toHaveBeenCalledTimes(1)
  })
})
