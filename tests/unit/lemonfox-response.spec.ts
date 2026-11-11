/**
 * `normalizeLemonfoxResponse` — the body reduced to phrases, as the library's
 * existing transcripts are stored. `normalizeLemonfoxCues` — the body reduced to
 * what a run stores: the word timings, grouped into subtitle-length cues, seconds in and
 * milliseconds out (#1016). And `lemonfoxDetectedLanguage`, the language a run
 * asked for none of reports hearing.
 *
 * Fixture pre-mortem: these bodies claim to be what Lemonfox's
 * OpenAI-compatible `verbose_json` returns. Verified against the shape the
 * normaliser declares in `src/lib/lemonfox/normalize.ts` —
 * `segments[]` of `{ text, start, end }`, with word timings arriving either on
 * each segment (WhisperX) or in one top-level list (OpenAI).
 */
import { describe, expect, it } from 'vitest'

import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'
import {
  lemonfoxDetectedLanguage,
  normalizeLemonfoxCues,
  normalizeLemonfoxResponse,
  normalizeLemonfoxWords,
} from '@/lib/lemonfox/normalize'

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

describe('normalizeLemonfoxCues', () => {
  it('groups the words into cues of at most 30 characters', () => {
    expect(
      normalizeLemonfoxCues({
        words: [
          { word: 'Place', start: 0, end: 0.6 },
          { word: 'your', start: 0.6, end: 1.0 },
          { word: 'attention', start: 1.0, end: 1.8 },
          { word: 'gently', start: 1.8, end: 2.2 },
          { word: 'on', start: 2.2, end: 2.4 },
          { word: 'the', start: 2.4, end: 2.5 },
          { word: 'heart.', start: 2.5, end: 3.0 },
        ],
      }),
    ).toEqual([
      { content: 'Place your attention gently on', startTimeMs: 0, endTimeMs: 2400 },
      { content: 'the heart.', startTimeMs: 2400, endTimeMs: 3000 },
    ])
  })

  it('reads the per-segment word layout', () => {
    expect(normalizeLemonfoxCues(PER_SEGMENT_WORDS)).toEqual([
      { content: 'Place your attention. Let', startTimeMs: 0, endTimeMs: 2900 },
    ])
  })

  it('refuses a body it cannot read, and one with no timed speech', () => {
    expect(() => normalizeLemonfoxCues({ segments: 'nope' })).toThrow(/cannot read/)
    expect(() => normalizeLemonfoxCues({ segments: [] })).toThrow(/no timestamped speech/)
    // No speech is an answer about the recording; an unreadable body is not.
    expect(() => normalizeLemonfoxCues({ segments: [] })).toThrow(ExpectedJobFailure)
    expect(() => normalizeLemonfoxCues({ segments: 'nope' })).not.toThrow(ExpectedJobFailure)
    // Segments without word timings carry no cue either.
    expect(() => normalizeLemonfoxCues({ segments: [{ text: 'hmm', start: 0, end: 4 }] })).toThrow(
      /no timestamped speech/,
    )
  })
})

describe('lemonfoxDetectedLanguage', () => {
  it('reads the language the vendor reports', () => {
    expect(lemonfoxDetectedLanguage({ language: 'czech', segments: [] })).toBe('czech')
  })

  it('answers nothing for a body without one, or one it cannot read', () => {
    expect(lemonfoxDetectedLanguage({ segments: [] })).toBeUndefined()
    expect(lemonfoxDetectedLanguage(null)).toBeUndefined()
  })
})

/**
 * `normalizeLemonfoxWords` — the two layouts read for their word timings, which
 * `normalizeLemonfoxCues` groups (#1016).
 *
 * The two fixtures carry **different** word lists on purpose — the WhisperX one
 * names every word, the OpenAI one only two — so neither expectation can be
 * satisfied by reading the wrong layout.
 */
describe('normalizeLemonfoxWords', () => {
  it('reads the WhisperX layout, with words on each segment', () => {
    expect(normalizeLemonfoxWords(PER_SEGMENT_WORDS)).toEqual([
      { content: 'Place', startTimeMs: 0, endTimeMs: 600 },
      { content: 'your', startTimeMs: 600, endTimeMs: 1000 },
      { content: 'attention.', startTimeMs: 1000, endTimeMs: 2500 },
      { content: 'Let', startTimeMs: 2500, endTimeMs: 2900 },
    ])
  })

  it('reads the OpenAI layout, with one top-level word list', () => {
    expect(normalizeLemonfoxWords(TOP_LEVEL_WORDS)).toEqual([
      { content: 'Place', startTimeMs: 0, endTimeMs: 600 },
      { content: 'Let', startTimeMs: 2500, endTimeMs: 2900 },
    ])
  })

  // ⚠ The ancestor these readers were lifted from (`edefc00b`) divided by 1000
  // again, so it answered seconds at millisecond precision. Cues built from
  // that run 1000× too fast, and nothing but this assertion says so.
  it('converts seconds to milliseconds, not to seconds at millisecond precision', () => {
    expect(
      normalizeLemonfoxWords({
        segments: [
          { start: 0, end: 2.5, text: 'Place', words: [{ word: 'Place', start: 1.25, end: 2.5 }] },
        ],
      }),
    ).toEqual([{ content: 'Place', startTimeMs: 1250, endTimeMs: 2500 }])
  })

  // Estimating the missing half would seek to the wrong place, which is worse
  // than one word fewer — the word still reads in its segment's own text.
  it('drops a word missing either timestamp rather than estimating one', () => {
    const words = normalizeLemonfoxWords({
      segments: [
        {
          start: 0,
          end: 1.6,
          text: 'Place your',
          words: [
            { word: 'Place', start: 0.1, end: 0.6 },
            { word: 'no-end', start: 0.6 },
            { word: 'no-start', end: 1.2 },
            { word: 'neither' },
            { word: 'your', start: 1.2, end: 1.6 },
          ],
        },
      ],
    })

    expect(words.map((word) => word.content)).toEqual(['Place', 'your'])
  })

  it('takes the OpenAI spelling of a word as well as the WhisperX one', () => {
    expect(
      normalizeLemonfoxWords({ words: [{ text: ' attention. ', start: 1.4, end: 2.5 }] }),
    ).toEqual([{ content: 'attention.', startTimeMs: 1400, endTimeMs: 2500 }])
  })

  // A mixed body: one segment carries its own words, the other does not. Read
  // unconditionally, both halves, the first segment's words are listed twice.
  it('lists a word once when a body carries both layouts', () => {
    const words = normalizeLemonfoxWords({
      segments: [
        { start: 0, end: 1, text: 'Place', words: [{ word: 'Place', start: 0.1, end: 0.6 }] },
        { start: 1.4, end: 2.5, text: 'attention.' },
      ],
      words: [
        { word: 'Place', start: 0.1, end: 0.6 },
        { word: 'attention.', start: 1.4, end: 2.5 },
      ],
    })

    expect(words.map((word) => word.content)).toEqual(['Place', 'attention.'])
  })

  // `words: []` is present but carries nothing, so it is a segment that carries
  // none — the bucketed top-level words are the only ones it can have.
  it('buckets top-level words into a segment whose own list is empty', () => {
    const words = normalizeLemonfoxWords({
      segments: [
        { start: 0, end: 1, text: 'Place', words: [] },
        { start: 1.4, end: 2.5, text: 'attention.', words: [] },
      ],
      words: [
        { word: 'Place', start: 0.1, end: 0.6 },
        { word: 'attention.', start: 1.4, end: 2.5 },
      ],
    })

    expect(words.map((word) => word.content)).toEqual(['Place', 'attention.'])
  })

  it('answers words in spoken order, whatever order the segments arrive in', () => {
    const words = normalizeLemonfoxWords({
      segments: [
        {
          start: 1.4,
          end: 2.5,
          text: 'attention.',
          words: [{ word: 'attention.', start: 1.4, end: 2.5 }],
        },
        { start: 0, end: 0.6, text: 'Place', words: [{ word: 'Place', start: 0.12, end: 0.6 }] },
      ],
    })

    expect(words.map((word) => word.content)).toEqual(['Place', 'attention.'])
  })

  // Music or silence. An answer about the recording rather than a failure to
  // read the body — so no throw here: `normalizeLemonfoxCues` words it.
  it('answers no words for a body with no aligned speech', () => {
    expect(normalizeLemonfoxWords({ segments: [{ start: 0, end: 4, text: 'hmm' }] })).toEqual([])
    expect(normalizeLemonfoxWords({})).toEqual([])
  })

  it('refuses a body it cannot read', () => {
    expect(() => normalizeLemonfoxWords({ segments: 'nope' })).toThrow(/cannot read/)
    expect(() => normalizeLemonfoxWords(null)).toThrow()
  })

  // A cue before the recording starts cannot be seeked to, and one that ends
  // before it starts is not a span. Both are the vendor's to produce and ours
  // not to pass on.
  it('clamps a negative timestamp and never ends a word before it starts', () => {
    expect(normalizeLemonfoxWords({ words: [{ word: 'Place', start: -2, end: 0.5 }] })).toEqual([
      { content: 'Place', startTimeMs: 0, endTimeMs: 500 },
    ])
    expect(normalizeLemonfoxWords({ words: [{ word: 'Place', start: 2, end: 1 }] })).toEqual([
      { content: 'Place', startTimeMs: 2000, endTimeMs: 2000 },
    ])
  })
})
