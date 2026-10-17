/**
 * The Transcript tab's pure logic: the query it reads, which state it shows,
 * how phrases fall into paragraphs and silences, and which phrase the playhead
 * is in.
 *
 * Every cue time here is **milliseconds**, as `meditation-transcripts` stores
 * them; the playhead the preview reports is **seconds**.
 */
import { describe, expect, it } from 'vitest'

import {
  activeSegmentIndex,
  groupTranscript,
  seekSecond,
  transcriptPhase,
  transcriptUrl,
} from '@/components/admin/MeditationTranscript/transcriptModel'
import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcript'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

const cue = (startTimeMs: number, endTimeMs: number): TranscriptSegment => ({
  content: `${startTimeMs}-${endTimeMs}`,
  startTimeMs,
  endTimeMs,
})

const NOW = Date.parse('2026-10-17T12:00:00.000Z')

const row = (
  overrides: Partial<Pick<MeditationTranscript, 'status' | 'updatedAt'>>,
): Pick<MeditationTranscript, 'status' | 'updatedAt'> => ({
  status: 'completed',
  updatedAt: new Date(NOW).toISOString(),
  ...overrides,
})

describe('transcriptUrl', () => {
  it('filters on the meditation and names the admin locale', () => {
    expect(transcriptUrl(7, 'pt-BR')).toBe(
      '/api/meditation-transcripts?where[meditation][equals]=7&limit=1&depth=0&locale=pt-BR',
    )
  })

  it('builds no URL without a locale, rather than letting the default stand in (#701)', () => {
    expect(transcriptUrl(7, undefined)).toBeNull()
    expect(transcriptUrl(undefined, 'en')).toBeNull()
  })
})

describe('transcriptPhase', () => {
  it('reads no row as nothing transcribed yet', () => {
    expect(transcriptPhase(undefined, NOW)).toBe('none')
  })

  it.each([
    ['processing', 'pending'],
    ['failed', 'failed'],
    ['completed', 'completed'],
  ] as const)('reads a fresh %s row as %s', (status, phase) => {
    expect(transcriptPhase(row({ status }), NOW)).toBe(phase)
  })

  it('reads a processing row older than the stall bound as stalled', () => {
    const stale = new Date(NOW - TRANSCRIPTION_STALL_MS - 1000).toISOString()

    expect(transcriptPhase(row({ status: 'processing', updatedAt: stale }), NOW)).toBe('stalled')
  })

  it('leaves a processing row inside the stall bound pending', () => {
    const recent = new Date(NOW - TRANSCRIPTION_STALL_MS + 1000).toISOString()

    expect(transcriptPhase(row({ status: 'processing', updatedAt: recent }), NOW)).toBe('pending')
  })

  it('does not stall a failed or completed row, however old', () => {
    const ancient = new Date(NOW - TRANSCRIPTION_STALL_MS * 100).toISOString()

    expect(transcriptPhase(row({ status: 'failed', updatedAt: ancient }), NOW)).toBe('failed')
    expect(transcriptPhase(row({ status: 'completed', updatedAt: ancient }), NOW)).toBe('completed')
  })
})

describe('groupTranscript', () => {
  it('keeps phrases with pauses under three seconds in one paragraph', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(3000, 5000), cue(7500, 9000)])

    expect(paragraphs).toEqual([{ startTimeMs: 0, segmentIndexes: [0, 1, 2], silenceAfter: false }])
  })

  it('starts a paragraph at a pause of exactly three seconds', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(5000, 6000)])

    expect(paragraphs.map((paragraph) => paragraph.segmentIndexes)).toEqual([[0], [1]])
    expect(paragraphs[0].silenceAfter).toBe(false)
  })

  it('marks a silence after a paragraph a pause of ten seconds ended', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(12000, 14000), cue(15000, 16000)])

    expect(paragraphs).toEqual([
      { startTimeMs: 0, segmentIndexes: [0], silenceAfter: true },
      { startTimeMs: 12000, segmentIndexes: [1, 2], silenceAfter: false },
    ])
  })

  it('leaves a pause just under ten seconds unmarked', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(11999, 13000)])

    expect(paragraphs[0].silenceAfter).toBe(false)
  })

  it('has nothing to group without phrases', () => {
    expect(groupTranscript([])).toEqual([])
  })
})

describe('activeSegmentIndex', () => {
  const segments = [cue(2000, 4000), cue(10000, 12000)]

  it('finds the phrase being spoken from a seconds playhead', () => {
    expect(activeSegmentIndex(segments, 3)).toBe(0)
    expect(activeSegmentIndex(segments, 10)).toBe(1)
  })

  it('lights a phrase from the whole second a click seeks to', () => {
    expect(seekSecond(91120)).toBe(91)
    expect(activeSegmentIndex([cue(91120, 95000)], 91)).toBe(0)
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
