/**
 * The Transcript tab's pure logic: which state it shows, how phrases fall into
 * paragraphs and silences, which phrase the playhead is in, and the URL it
 * reads.
 */
import { describe, expect, it } from 'vitest'

import {
  activeSegmentIndex,
  groupTranscript,
  transcriptPhase,
  transcriptUrl,
} from '@/components/admin/MeditationTranscript/transcriptModel'
import type { TranscriptSegment, TranscriptView } from '@/lib/meditations/transcript'

const segment = (start: number, end: number): TranscriptSegment => ({
  text: `${start}-${end}`,
  start,
  end,
  words: [],
})

const view = (overrides: Partial<TranscriptView>): TranscriptView => ({
  status: 'completed',
  stalled: false,
  outdated: false,
  provider: 'lemonfox',
  segments: [],
  error: null,
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...overrides,
})

describe('transcriptUrl', () => {
  it('names the admin locale', () => {
    expect(transcriptUrl(7, 'pt-BR')).toBe('/api/meditations/7/transcript?locale=pt-BR')
  })

  it('builds no URL without a locale, rather than letting the default stand in (#701)', () => {
    expect(transcriptUrl(7, undefined)).toBeNull()
    expect(transcriptUrl(undefined, 'en')).toBeNull()
  })
})

describe('transcriptPhase', () => {
  it.each([
    [view({ status: 'none' }), 'none'],
    [view({ status: 'queued' }), 'pending'],
    [view({ status: 'processing' }), 'pending'],
    [view({ status: 'processing', stalled: true }), 'stalled'],
    [view({ status: 'failed' }), 'failed'],
    [view({ status: 'completed' }), 'completed'],
  ] as const)('shows %o as %s', (input, phase) => {
    expect(transcriptPhase(input)).toBe(phase)
  })

  it('reports replaced audio over any status', () => {
    for (const status of ['queued', 'processing', 'failed', 'completed'] as const) {
      expect(transcriptPhase(view({ status, outdated: true }))).toBe('outdated')
    }
  })
})

describe('groupTranscript', () => {
  it('keeps phrases with short pauses in one paragraph', () => {
    const paragraphs = groupTranscript([segment(0, 2), segment(3, 5), segment(7.5, 9)])

    expect(paragraphs).toEqual([{ start: 0, segmentIndexes: [0, 1, 2], silenceAfter: false }])
  })

  it('starts a paragraph at a pause of three seconds', () => {
    const paragraphs = groupTranscript([segment(0, 2), segment(5, 6)])

    expect(paragraphs.map((paragraph) => paragraph.segmentIndexes)).toEqual([[0], [1]])
    expect(paragraphs[0].silenceAfter).toBe(false)
  })

  it('marks a silence after a paragraph followed by a pause of ten seconds', () => {
    const paragraphs = groupTranscript([segment(0, 2), segment(12, 14), segment(15, 16)])

    expect(paragraphs).toEqual([
      { start: 0, segmentIndexes: [0], silenceAfter: true },
      { start: 12, segmentIndexes: [1, 2], silenceAfter: false },
    ])
  })

  it('has nothing to group without phrases', () => {
    expect(groupTranscript([])).toEqual([])
  })
})

describe('activeSegmentIndex', () => {
  const segments = [segment(2, 4), segment(10, 12)]

  it('finds the phrase being spoken', () => {
    expect(activeSegmentIndex(segments, 3)).toBe(0)
    expect(activeSegmentIndex(segments, 10)).toBe(1)
  })

  it('keeps a phrase lit for half a second after it ends', () => {
    expect(activeSegmentIndex(segments, 4.4)).toBe(0)
  })

  it('lights nothing before the first phrase or in a pause', () => {
    expect(activeSegmentIndex(segments, 1)).toBe(-1)
    expect(activeSegmentIndex(segments, 6)).toBe(-1)
    expect(activeSegmentIndex(segments, 20)).toBe(-1)
  })
})
