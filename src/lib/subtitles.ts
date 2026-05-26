import type { JSONSchema4 } from 'json-schema'
import type { JSONFieldValidation } from 'payload'

import { z } from 'zod'

// Zod schema and JSON schema below mirror each other. If you change one,
// change the other — they describe the same shape but feed different
// systems (Zod = runtime validation, JSON schema = `typescriptSchema`
// for generated TypeScript types).
export const subtitlesZodSchema = z.object({
  captions: z.array(
    z.object({
      duration: z.number(),
      content: z.string(),
      startTime: z.string(),
    }),
  ),
})

export type Subtitles = z.infer<typeof subtitlesZodSchema>

// Mirrors `subtitlesZodSchema` — see the note above.
export const subtitlesJsonSchema: JSONSchema4 = {
  type: 'object',
  properties: {
    captions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          duration: { type: 'number' },
          content: { type: 'string' },
          startTime: { type: 'string' },
        },
        required: ['duration', 'content', 'startTime'],
      },
    },
  },
  required: ['captions'],
}

const isEmpty = (value: unknown): boolean => {
  if (value === undefined || value === null) return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return true
  return false
}

// Workers-safe replacement for Payload's built-in jsonSchema validation,
// which compiles via AJV's `new Function(...)` and is blocked by the V8
// isolate (issue #317). Uses Zod, which is already a project dependency
// and runs cleanly under Workers.
export const parseSubtitles = (value: unknown): true | string => {
  if (isEmpty(value)) return true

  const result = subtitlesZodSchema.safeParse(value)
  if (result.success) return true

  return result.error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

export const validateSubtitles: JSONFieldValidation = (value) => parseSubtitles(value)
