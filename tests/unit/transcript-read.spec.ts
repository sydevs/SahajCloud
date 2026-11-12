/**
 * The shared reads over a recording's transcript row.
 *
 * The batch is the load-bearing case: the virtual `subtitles` field cannot take
 * Payload's `findMany` guard, so a page of `files` rows would otherwise pay one
 * `transcripts` query each. Only a query count fails when the batch is lost —
 * every cue still arrives. These cases pin the mechanism; the count a real page
 * pays is measured in `tests/int/file-transcripts.int.spec.ts`, since nothing
 * here knows whether Payload reaches the hook in one tick.
 */
import type { Payload, PayloadRequest, Where } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { readFileSubtitles, readFinishedFileTranscripts } from '@/lib/transcripts/read'

const cue = (content: string) => [{ content, startTimeMs: 0, endTimeMs: 1000 }]

/** The ids a `where` built by `fileSource` names, in order. */
function sourceIds(where: Where | undefined): Array<number | string> {
  const clauses = (where?.or ?? []) as Array<{ source?: { equals?: { value?: number | string } } }>
  return clauses.map((clause) => clause.source?.equals?.value as number | string)
}

function fakeReq(docs: unknown[]) {
  const find = vi.fn().mockResolvedValue({ docs })
  const req = { context: {}, payload: { find } } as unknown as PayloadRequest
  return { req, find }
}

describe('readFileSubtitles', () => {
  it('reads every file asked for in one tick with one query', async () => {
    const { req, find } = fakeReq([
      { source: { relationTo: 'files', value: 7 }, segments: cue('seven') },
      { source: { relationTo: 'files', value: 9 }, segments: cue('nine') },
    ])

    const [seven, eight, nine] = await Promise.all([
      readFileSubtitles(req, 7),
      readFileSubtitles(req, 8),
      readFileSubtitles(req, 9),
    ])

    expect(find).toHaveBeenCalledTimes(1)
    expect(sourceIds(find.mock.calls[0]![0].where)).toEqual([7, 8, 9])
    expect(seven).toEqual(cue('seven'))
    expect(nine).toEqual(cue('nine'))
    // A file with no transcript row, inside a batch that found others.
    expect(eight).toBeNull()
  })

  it('answers the same file twice from one read', async () => {
    const { req, find } = fakeReq([
      { source: { relationTo: 'files', value: 3 }, segments: cue('three') },
    ])

    await Promise.all([readFileSubtitles(req, 3), readFileSubtitles(req, 3)])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('opens a new batch for a read that arrives after the first closed', async () => {
    const { req, find } = fakeReq([
      { source: { relationTo: 'files', value: 1 }, segments: cue('one') },
    ])

    expect(await readFileSubtitles(req, 1)).toEqual(cue('one'))
    expect(await readFileSubtitles(req, 2)).toBeNull()

    expect(find).toHaveBeenCalledTimes(2)
    expect(sourceIds(find.mock.calls[1]![0].where)).toEqual([2])
  })

  it('answers null for a row whose cues are empty', async () => {
    const { req } = fakeReq([{ source: { relationTo: 'files', value: 4 }, segments: [] }])
    expect(await readFileSubtitles(req, 4)).toBeNull()
  })

  it('reads a transcribable file without joining the caller transaction', async () => {
    const { req, find } = fakeReq([])
    await readFileSubtitles(req, 5)
    expect(find.mock.calls[0]![0].req).toBeUndefined()
  })
})

describe('readFinishedFileTranscripts', () => {
  /** The transcripts query answers `transcripts`, the files query `files`. */
  const fakePayload = (transcripts: unknown[], files: unknown[]) => {
    const find = vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve({ docs: collection === 'transcripts' ? transcripts : files }),
    )
    return { find, payload: { find } as unknown as Payload }
  }

  // The language is the file's own (#1016), so it comes from the second query.
  it('names one source per file, asks only for finished rows, and reads their files', async () => {
    const { find, payload } = fakePayload(
      [{ source: { relationTo: 'files', value: 11 } }],
      [{ id: 11, spokenLanguage: 'cs' }],
    )

    const rows = await readFinishedFileTranscripts(payload, [11, 12])

    expect(rows).toEqual([{ fileId: 11, language: 'cs' }])
    const { where } = find.mock.calls[0]![0] as unknown as { where: { and: Where[] } }
    expect(sourceIds(where.and[0])).toEqual([11, 12])
    expect(where.and[1]).toEqual({ segmentCount: { greater_than: 0 } })
    expect(find.mock.calls[1]![0]).toMatchObject({ where: { id: { in: [11] } } })
  })

  it('reports no language rather than undefined, so the locale check can read it', async () => {
    const { payload } = fakePayload([{ source: { relationTo: 'files', value: 2 } }], [{ id: 2 }])
    const rows = await readFinishedFileTranscripts(payload, [2])
    expect(rows).toEqual([{ fileId: 2, language: null }])
  })

  it('reads no file when none is finished', async () => {
    const { find, payload } = fakePayload([], [])
    expect(await readFinishedFileTranscripts(payload, [3])).toEqual([])
    expect(find).toHaveBeenCalledOnce()
  })

  it('queries nothing for an empty set', async () => {
    const find = vi.fn()
    expect(await readFinishedFileTranscripts({ find } as unknown as Payload, [])).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })
})
