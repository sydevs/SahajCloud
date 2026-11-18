import type { Payload } from 'payload'

import fs from 'fs'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { backfillSongDurations } from '@/lib/audio/backfillSongDurations'

vi.mock('@/plugins/storage', () => ({
  getR2Url: (filename: string) => (filename ? `https://assets.test/${filename}` : undefined),
}))

const FIXTURE_FILES = path.join(process.cwd(), 'src', 'fixture', 'files')
const audio = (name: string) => fs.readFileSync(path.join(FIXTURE_FILES, name))

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

/** Every fetch answers with `file`'s bytes, unless the URL names a missing one. */
const stubFetch = (files: Record<string, Buffer | number>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const answer = files[url.split('/').pop() ?? '']
      // A refusal still carries a body, so only `response.ok` tells it from audio.
      if (typeof answer === 'number') {
        return {
          ok: false,
          status: answer,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as Response
      }
      return {
        ok: true,
        arrayBuffer: async () =>
          answer.buffer.slice(answer.byteOffset, answer.byteOffset + answer.byteLength),
      } as unknown as Response
    }),
  )

describe('backfillSongDurations', () => {
  it('writes the stored audio duration of every song holding none', async () => {
    const { payload, update } = stubPayload([
      { id: 1, title: 'Long', filename: 'long.mp3' },
      { id: 2, title: 'Short', filename: 'short.mp3' },
    ])
    stubFetch({
      'long.mp3': audio('fixture-audio.mp3'),
      'short.mp3': audio('fixture-audio-short.mp3'),
    })

    const result = await backfillSongDurations(payload)

    expect(result.written).toEqual([
      { id: 1, title: 'Long', duration: 42 },
      { id: 2, title: 'Short', duration: 9 },
    ])
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('writes nothing on a second run', async () => {
    const rows = [{ id: 1, title: 'Long', filename: 'long.mp3' }]
    const { payload, update } = stubPayload(rows)
    stubFetch({ 'long.mp3': audio('fixture-audio.mp3') })

    await backfillSongDurations(payload)
    const second = await backfillSongDurations(payload)

    expect(second).toEqual({ scanned: 0, written: [], skipped: [] })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('reads and reports without writing on a dry run', async () => {
    const { payload, update } = stubPayload([{ id: 1, title: 'Long', filename: 'long.mp3' }])
    stubFetch({ 'long.mp3': audio('fixture-audio.mp3') })

    const result = await backfillSongDurations(payload, { dryRun: true })

    expect(result.written).toEqual([{ id: 1, title: 'Long', duration: 42 }])
    expect(update).not.toHaveBeenCalled()
  })

  it('skips a song it cannot read and carries on with the rest', async () => {
    const { payload, update } = stubPayload([
      { id: 1, title: 'Gone', filename: 'gone.mp3' },
      { id: 2, title: 'Corrupt', filename: 'junk.mp3' },
      { id: 3, title: 'Fileless' },
      { id: 4, title: 'Long', filename: 'long.mp3' },
    ])
    stubFetch({
      'gone.mp3': 404,
      'junk.mp3': audio('fixture-audio-unreadable.mp3'),
      'long.mp3': audio('fixture-audio.mp3'),
    })

    const result = await backfillSongDurations(payload)

    expect(result.scanned).toBe(4)
    expect(result.written).toEqual([{ id: 4, title: 'Long', duration: 42 }])
    expect(result.skipped).toEqual([
      { id: 1, title: 'Gone', reason: 'fetch failed with 404' },
      { id: 2, title: 'Corrupt', reason: 'audio states no duration' },
      { id: 3, title: 'Fileless', reason: 'no audio file' },
    ])
    expect(update).toHaveBeenCalledTimes(1)
  })
})
