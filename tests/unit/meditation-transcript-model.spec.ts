/**
 * The Transcript tab's pure logic: which state it shows, how phrases fall into
 * paragraphs and silences, which phrase and word the playhead is in, and the
 * URL it reads.
 */
import { describe, expect, it } from 'vitest'

import {
  activeSegmentIndex,
  activeWordIndex,
  alignWords,
  estimatePlaybackTime,
  groupTranscript,
  nextPlaybackReport,
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

  it('lights a phrase from the whole second it starts in, where a click seeks to', () => {
    expect(activeSegmentIndex([segment(91.12, 95)], 91)).toBe(0)
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

describe('alignWords', () => {
  const word = (text: string, start: number) => ({ text, start, end: start + 0.3 })

  it('ties each written token to its timed word, punctuation and case aside', () => {
    expect(
      alignWords('Close your eyes.', [word('close', 0), word('your', 1), word('eyes', 2)]),
    ).toEqual([
      { text: 'Close', wordIndex: 0 },
      { text: 'your', wordIndex: 1 },
      { text: 'eyes.', wordIndex: 2 },
    ])
  })

  it('keeps a word Whisper could not time, untied, and aligns the rest', () => {
    expect(
      alignWords('Count to 108 slowly.', [word('Count', 0), word('to', 1), word('slowly.', 3)]),
    ).toEqual([
      { text: 'Count', wordIndex: 0 },
      { text: 'to', wordIndex: 1 },
      { text: '108', wordIndex: null },
      { text: 'slowly.', wordIndex: 2 },
    ])
  })

  it('reads in full when no word is timed', () => {
    expect(alignWords('  Sit   up. ', []).map((token) => token.text)).toEqual(['Sit', 'up.'])
  })
})

describe('activeWordIndex', () => {
  const words = [
    { text: 'Sit', start: 1, end: 1.4 },
    { text: 'up.', start: 1.5, end: 2 },
  ]

  it('finds the word being spoken, holding it through the gap to the next', () => {
    expect(activeWordIndex(words, 1.2)).toBe(0)
    expect(activeWordIndex(words, 1.45)).toBe(0)
    expect(activeWordIndex(words, 1.9)).toBe(1)
  })

  it('marks no word before the first starts', () => {
    expect(activeWordIndex(words, 0.5)).toBe(-1)
  })
})

describe('playback smoothing', () => {
  const report = (time: number, at: number, playing = false) => ({ time, at, playing })

  it('reads one-second ticks arriving on time as playback', () => {
    expect(nextPlaybackReport(report(10, 1000), 11, 2000).playing).toBe(true)
  })

  it('reads a jump, a repeat or a late tick as no playback', () => {
    expect(nextPlaybackReport(report(10, 1000), 40, 1100).playing).toBe(false)
    expect(nextPlaybackReport(report(10, 1000), 10, 2000).playing).toBe(false)
    expect(nextPlaybackReport(report(10, 1000), 11, 4000).playing).toBe(false)
  })

  it('carries a playing second forward by the clock, never past the next one', () => {
    expect(estimatePlaybackTime(report(11, 2000, true), 2400)).toBeCloseTo(11.4)
    expect(estimatePlaybackTime(report(11, 2000, true), 3200)).toBe(12)
  })

  it('holds the reported second once the next report is overdue', () => {
    // The preview reports every second while it plays, so a report this late
    // means it stopped. `playing` is only recomputed when a NEW second
    // arrives, and a pause sends none — so carrying on would leave the
    // highlight a second ahead of the audio for as long as the tab is open.
    expect(estimatePlaybackTime(report(11, 2000, true), 5000)).toBe(11)
  })

  it('shows a paused or seeked second as it is', () => {
    expect(estimatePlaybackTime(report(40, 1100), 1900)).toBe(40)
  })
})
