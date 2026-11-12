/**
 * The shared reads over a recording's transcript row.
 *
 * The `source` clause is the load-bearing case: the polymorphic value has to be
 * named one `equals` per file, or a meditation of the same number matches too.
 */
import type { Payload, Where } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { readFinishedFileTranscripts, transcriptHasCues } from '@/lib/transcripts/read'

const cue = (content: string) => [{ content, startTimeMs: 0, endTimeMs: 1000 }]

/** The ids a `where` built by `fileSource` names, in order. */
function sourceIds(where: Where | undefined): Array<number | string> {
  const clauses = (where?.or ?? []) as Array<{ source?: { equals?: { value?: number | string } } }>
  return clauses.map((clause) => clause.source?.equals?.value as number | string)
}

describe('readFinishedFileTranscripts', () => {
  it('names one source per file and asks only for finished rows', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ source: { relationTo: 'files', value: 11 }, language: 'cs' }],
    })
    const payload = { find } as unknown as Payload

    const rows = await readFinishedFileTranscripts(payload, [11, 12])

    expect(rows).toEqual([{ fileId: 11, language: 'cs' }])
    const { where } = find.mock.calls[0]![0]
    expect(sourceIds(where.and[0])).toEqual([11, 12])
    expect(where.and[1]).toEqual({ segmentCount: { greater_than: 0 } })
  })

  it('reports no language rather than undefined, so the locale check can read it', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ source: { relationTo: 'files', value: 2 } }] })
    const rows = await readFinishedFileTranscripts({ find } as unknown as Payload, [2])
    expect(rows).toEqual([{ fileId: 2, language: null }])
  })

  it('queries nothing for an empty set', async () => {
    const find = vi.fn()
    expect(await readFinishedFileTranscripts({ find } as unknown as Payload, [])).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })
})

describe('transcriptHasCues', () => {
  it.each([
    [{ segments: cue('a') }, true],
    [{ segments: [] }, false],
    [{ segments: null }, false],
    [{}, false],
    [null, false],
    [undefined, false],
  ])('answers %o as %s', (row, expected) => {
    expect(transcriptHasCues(row)).toBe(expected)
  })
})
