import { json as jsonFieldValidation } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { jsonField } from '@/fields/jsonField'
import {
  groupWordsIntoCues,
  SUBTITLE_CUE_MAX_CHARS,
  subtitlesSchema,
  subtitlesZodSchema,
  type TimedWord,
} from '@/lib/utilities/subtitles'

/**
 * The Zod schema and the JSON Schema describe the same cues for two different
 * consumers: Zod parses a third-party payload in the Storyblok importer, the
 * JSON Schema is what Payload validates and types the column with.
 *
 * Nothing forces them to agree, so this pins them against one fixture set in
 * both directions. It replaces the `parseSubtitles` cases, which asserted the
 * Zod half twice — once directly, once as the field validator it no longer is.
 * `tests/unit/json-field-schemas.spec.ts` covers the field side.
 */
const req = { t: (key: string) => key } as never

/** What every `subtitles` column declares, built the one way a field may. */
const subtitlesJsonSchema = jsonField({
  name: 'subtitles',
  schemaTitle: 'Subtitles',
  schema: subtitlesSchema,
}).jsonSchema

const acceptedByJsonSchema = (value: unknown): boolean =>
  jsonFieldValidation(
    value as never,
    {
      jsonSchema: subtitlesJsonSchema,
      req,
      required: false,
    } as never,
  ) === true

const accepted: unknown[] = [
  [{ startTimeMs: 0, endTimeMs: 1500, durationMs: 1500, content: 'Hello' }],
  [
    { startTimeMs: 0, endTimeMs: 1500, content: 'Hello' },
    { startTimeMs: 1500, endTimeMs: 3500, durationMs: 2000, content: 'World' },
  ],
]

const rejected: unknown[] = [
  'a string',
  42,
  { subtitles: 'not-an-array' },
  [{ startTimeMs: 0, content: 'no endTimeMs' }],
  [{ startTimeMs: '0', endTimeMs: 1000, content: 'wrong type' }],
]

describe('the subtitles schemas agree', () => {
  it.each(accepted.map((value, i) => [i, value]))('both accept fixture %i', (_i, value) => {
    expect(subtitlesZodSchema.safeParse(value).success).toBe(true)
    expect(acceptedByJsonSchema(value)).toBe(true)
  })

  it.each(rejected.map((value, i) => [i, value]))('both reject fixture %i', (_i, value) => {
    expect(subtitlesZodSchema.safeParse(value).success).toBe(false)
    expect(acceptedByJsonSchema(value)).toBe(false)
  })

  it('both tolerate an unknown cue key', () => {
    // Zod ignores it, the schema accepts it. Neither refuses, which is what
    // keeps a row that already stores one saveable.
    const withExtra = [{ startTimeMs: 0, endTimeMs: 1000, content: 'ok', speaker: 'Anna' }]
    expect(subtitlesZodSchema.safeParse(withExtra).success).toBe(true)
    expect(acceptedByJsonSchema(withExtra)).toBe(true)
  })

  it('diverges only on empty values, which the column allows either way', () => {
    // Payload skips `null`, `undefined`, `{}` and `[]` before reaching Ajv, so
    // an optional column accepts all four. Zod sees them as data and rejects
    // the two that are not arrays — which is correct for the importer, whose
    // input is a response body rather than a possibly-absent column.
    for (const empty of [null, undefined, {}, []]) {
      expect(acceptedByJsonSchema(empty)).toBe(true)
    }
    expect(subtitlesZodSchema.safeParse([]).success).toBe(true)
    expect(subtitlesZodSchema.safeParse({}).success).toBe(false)
  })
})

/**
 * The grouper (#1016), the only net-new logic in the subtitles path.
 *
 * Fixture pre-mortem: the words below claim nothing about repo config. The one
 * number that is a decision is the 30-character limit, and that is
 * `SUBTITLE_CUE_MAX_CHARS` itself, read here rather than retyped — so a change
 * to the house length moves these assertions with it instead of reddening them.
 */
describe('groupWordsIntoCues', () => {
  const words = (...pairs: [string, number, number][]): TimedWord[] =>
    pairs.map(([content, startTimeMs, endTimeMs]) => ({ content, startTimeMs, endTimeMs }))

  const phrase = (): TimedWord[] =>
    words(
      ['Close', 120, 400],
      ['your', 400, 700],
      ['eyes', 700, 1100],
      ['and', 1100, 1300],
      ['take', 1300, 1700],
      ['a', 1700, 1800],
      ['breath', 1800, 2400],
    )

  it('fills a cue to the limit and no further', () => {
    const cues = groupWordsIntoCues(phrase())

    expect(cues.map((cue) => cue.content)).toEqual(['Close your eyes and take a', 'breath'])
    for (const cue of cues) {
      expect(cue.content.length).toBeLessThanOrEqual(SUBTITLE_CUE_MAX_CHARS)
    }
  })

  it('takes each cue start from its first word and its end from its last', () => {
    const [first, second] = groupWordsIntoCues(phrase())

    expect(first).toMatchObject({ startTimeMs: 120, endTimeMs: 1800 })
    expect(second).toMatchObject({ startTimeMs: 1800, endTimeMs: 2400 })
  })

  // A cue stretched to meet the next one puts words on screen through a
  // silence, which is what a player following the cues would then highlight.
  it('preserves a gap between cues rather than filling it', () => {
    const cues = groupWordsIntoCues(
      words(
        ['Breathing', 0, 500],
        ['slowly', 500, 900],
        ['inwards', 900, 1400],
        ['now', 1400, 1700],
        // 7.3 seconds of silence, which the first cue must not cover.
        ['deeply', 9000, 9800],
      ),
    )

    expect(cues).toHaveLength(2)
    expect(cues[0]!.endTimeMs).toBe(1700)
    expect(cues[1]!.startTimeMs).toBe(9000)
  })

  // Splitting a word mid-syllable reads worse than one long line, so this cue
  // exceeds the limit deliberately — and alone, rather than dragging a
  // neighbour over with it.
  it('gives a word longer than the limit a cue of its own', () => {
    const long = 'incomprehensibilities'.padEnd(SUBTITLE_CUE_MAX_CHARS + 5, 'x')
    const cues = groupWordsIntoCues(words(['Say', 0, 300], [long, 300, 2000], ['now', 2000, 2300]))

    expect(cues.map((cue) => cue.content)).toEqual(['Say', long, 'now'])
  })

  // The orphan: one word left over once the cue before it filled up. It is a
  // cue of its own, not a word appended past the limit and not a word dropped.
  it('emits a trailing orphan word as its own cue', () => {
    const cues = groupWordsIntoCues(
      words(
        ['Breathing', 0, 500],
        ['slowly', 500, 900],
        ['inwards', 900, 1400],
        ['now', 1400, 1700],
        ['deeply', 1700, 2200],
      ),
    )

    expect(cues.map((cue) => cue.content)).toEqual(['Breathing slowly inwards now', 'deeply'])
    expect(cues[1]).toMatchObject({ startTimeMs: 1700, endTimeMs: 2200 })
  })

  it('skips a blank word rather than emitting an empty cue', () => {
    const cues = groupWordsIntoCues(
      words(['Hello', 0, 400], ['   ', 400, 450], ['there', 450, 900]),
    )

    expect(cues.map((cue) => cue.content)).toEqual(['Hello there'])
  })

  it('answers no cues for no words', () => {
    expect(groupWordsIntoCues([])).toEqual([])
  })

  // The one coupling between the grouper and the schema above: every cue it
  // emits is a cue the stored column accepts.
  it('emits cues the stored column accepts', () => {
    const cues = groupWordsIntoCues(words(['Breathe', 0, 900], ['in', 900, 1200]))

    expect(acceptedByJsonSchema(cues)).toBe(true)
    expect(subtitlesZodSchema.safeParse(cues).success).toBe(true)
  })
})
