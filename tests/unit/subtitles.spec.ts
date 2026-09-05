import { json as jsonFieldValidation } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { subtitlesFieldSchema, subtitlesZodSchema } from '@/lib/utilities/subtitles'

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

const acceptedByJsonSchema = (value: unknown): boolean =>
  jsonFieldValidation(value as never, {
    jsonSchema: subtitlesFieldSchema,
    req,
    required: false,
  } as never) === true

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

  it('strips an unknown key in Zod, and refuses one at the column', () => {
    // Not drift. The importer writes `safeParse(...).data`, which Zod has
    // already stripped, so the value reaching the column never carries the
    // extra key that `additionalProperties: false` would refuse
    // (`seeds/storyblok/import.ts` — `parseSubtitles` returns `result.data`).
    const withExtra = [{ startTimeMs: 0, endTimeMs: 1000, content: 'ok', speaker: 'extra' }]
    const parsed = subtitlesZodSchema.safeParse(withExtra)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data[0]).not.toHaveProperty('speaker')
    expect(acceptedByJsonSchema(withExtra)).toBe(false)
    expect(acceptedByJsonSchema(parsed.success ? parsed.data : null)).toBe(true)
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
