import { describe, expect, it } from 'vitest'

import { subtitlesJsonSchema, subtitlesZodSchema } from '@/lib/utilities/subtitles'

/**
 * The subtitles JSON Schema is *derived* from the Zod schema
 * (`z.toJSONSchema`), and Payload feeds it to both Ajv (write validation) and
 * the TypeScript generator. So the derivation itself is the contract: a Zod
 * edit that silently changes it also changes the public API type and what a
 * client is allowed to POST. These cases pin the parts that matter.
 */
describe('subtitlesJsonSchema', () => {
  const items = subtitlesJsonSchema.schema.items as {
    additionalProperties?: boolean
    properties?: Record<string, { type?: string }>
    required?: string[]
    type?: string
  }

  it('targets draft-07 — the dialect Ajv’s default export understands', () => {
    expect(subtitlesJsonSchema.schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
  })

  it('describes an array of cue objects', () => {
    expect(subtitlesJsonSchema.schema.type).toBe('array')
    expect(items.type).toBe('object')
  })

  it('requires content + the time bounds, leaving durationMs optional', () => {
    expect(items.required).toEqual(['content', 'startTimeMs', 'endTimeMs'])
    expect(Object.keys(items.properties ?? {}).sort()).toEqual([
      'content',
      'durationMs',
      'endTimeMs',
      'startTimeMs',
    ])
  })

  it('pins each cue property to its scalar type', () => {
    expect(items.properties?.content.type).toBe('string')
    expect(items.properties?.startTimeMs.type).toBe('number')
    expect(items.properties?.endTimeMs.type).toBe('number')
    expect(items.properties?.durationMs.type).toBe('number')
  })

  it('tolerates extra keys, so a legacy cue field still saves', () => {
    // Stored rows carry legacy cue keys (`startOfParagraph`, …). The Zod-based
    // field validator this schema replaces accepted them, and `false` here
    // would 400 every later save of a lesson or video holding one.
    expect(items.additionalProperties).not.toBe(false)
  })

  it('still parses the same values as the Zod source of truth', () => {
    expect(
      subtitlesZodSchema.safeParse([{ content: 'Hello', startTimeMs: 0, endTimeMs: 1500 }]).success,
    ).toBe(true)
    expect(
      subtitlesZodSchema.safeParse([{ content: 'Hello', startTimeMs: '0', endTimeMs: 1500 }])
        .success,
    ).toBe(false)
  })
})
