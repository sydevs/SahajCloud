/**
 * `normalizeLemonfoxResponse` — the `verbose_json` body reduced to the stored
 * cue shape: seconds in, milliseconds out.
 *
 * Fixture pre-mortem: these bodies claim to be what Lemonfox's
 * OpenAI-compatible `verbose_json` returns. Verified against the shape the
 * normaliser declares in `src/collections/MeditationTranscripts/lemonfox.ts` —
 * `segments[]` of `{ text, start, end }`, with word timings arriving either on
 * each segment (WhisperX) or in one top-level list (OpenAI). Nothing stores
 * the timings, so both layouts must reduce to the same answer.
 */
import { describe, expect, it } from 'vitest'

import { normalizeLemonfoxResponse } from '@/collections/MeditationTranscripts/lemonfox'
import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'

const PER_SEGMENT_WORDS = {
  text: 'Place your attention. Let the thoughts settle.',
  segments: [
    {
      id: 0,
      text: ' Place your attention.',
      start: 0.0,
      end: 2.5,
      words: [
        { word: 'Place', start: 0.0, end: 0.6 },
        { word: 'your', start: 0.6, end: 1.0 },
        { word: 'attention.', start: 1.0, end: 2.5 },
      ],
    },
    {
      id: 1,
      text: ' Let the thoughts settle.',
      start: 2.5,
      end: 5.0,
      words: [{ word: 'Let', start: 2.5, end: 2.9 }],
    },
  ],
}

const TOP_LEVEL_WORDS = {
  text: 'Place your attention. Let the thoughts settle.',
  segments: [
    { id: 0, text: ' Place your attention.', start: 0.0, end: 2.5 },
    { id: 1, text: ' Let the thoughts settle.', start: 2.5, end: 5.0 },
  ],
  words: [
    { word: 'Place', start: 0.0, end: 0.6 },
    { word: 'Let', start: 2.5, end: 2.9 },
  ],
}

const EXPECTED = [
  { content: 'Place your attention.', startTimeMs: 0, endTimeMs: 2500 },
  { content: 'Let the thoughts settle.', startTimeMs: 2500, endTimeMs: 5000 },
]

describe('normalizeLemonfoxResponse', () => {
  it('returns phrase segments from the per-segment word layout', () => {
    expect(normalizeLemonfoxResponse(PER_SEGMENT_WORDS)).toEqual(EXPECTED)
  })

  it('returns the same from the top-level word layout', () => {
    expect(normalizeLemonfoxResponse(TOP_LEVEL_WORDS)).toEqual(EXPECTED)
  })

  it('orders by start time and drops a segment with no speech', () => {
    const out = normalizeLemonfoxResponse({
      segments: [
        { text: 'second', start: 9, end: 10 },
        { text: '   ', start: 4, end: 5 },
        { text: 'first', start: 1, end: 2 },
      ],
    })

    expect(out.map((segment) => segment.content)).toEqual(['first', 'second'])
  })

  it('rounds to the millisecond and never ends before it starts', () => {
    const [segment] = normalizeLemonfoxResponse({
      segments: [{ text: 'drifting', start: 1.00051, end: 0.5 }],
    })

    expect(segment).toEqual({ content: 'drifting', startTimeMs: 1001, endTimeMs: 1001 })
  })

  it('clamps a negative timestamp to the start of the recording', () => {
    // The stored cue shape takes any number, so this clamp is the only thing
    // keeping a provider's negative offset out of the column.
    const [segment] = normalizeLemonfoxResponse({
      segments: [{ text: 'before the beginning', start: -2, end: 1 }],
    })

    expect(segment).toEqual({ content: 'before the beginning', startTimeMs: 0, endTimeMs: 1000 })
  })

  it('refuses a body it cannot read, and one with no timestamped speech', () => {
    expect(() => normalizeLemonfoxResponse({ segments: 'nope' })).toThrow(/cannot read/)
    expect(() => normalizeLemonfoxResponse({ segments: [] })).toThrow(/no timestamped speech/)
    // No speech is an answer about the recording; an unreadable body is not.
    expect(() => normalizeLemonfoxResponse({ segments: [] })).toThrow(ExpectedJobFailure)
    expect(() => normalizeLemonfoxResponse({ segments: 'nope' })).not.toThrow(ExpectedJobFailure)
    expect(() => normalizeLemonfoxResponse({})).toThrow(/no timestamped speech/)
  })
})
