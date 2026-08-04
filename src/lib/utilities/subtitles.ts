import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { z } from 'zod'

/**
 * The subtitle-cue contract, and the single source of truth for it. The
 * Storyblok seed importer parses raw subtitle files with this schema, and
 * `subtitlesJsonSchema` below is derived from it — so the field's write
 * validation and its generated TypeScript type can't drift from the parser.
 */
export const subtitlesZodSchema = z.array(
  z.object({
    content: z.string(),
    startTimeMs: z.number(),
    endTimeMs: z.number(),
    durationMs: z.number().optional(),
  }),
)

export type Subtitles = z.infer<typeof subtitlesZodSchema>

const SUBTITLES_SCHEMA_URI = 'https://sahajcloud.dev/schemas/subtitles.json'

/**
 * `jsonSchema` for every subtitles field (Videos, Lessons). Payload uses it to
 * BOTH validate on write — Ajv rejects a malformed cue, raising a
 * `ValidationError` (a 400 over REST) — AND generate the field's TypeScript
 * type in `payload-types.ts`, which would otherwise be `unknown`.
 *
 * Emitted at `draft-7` because Ajv's default export, the one Payload's json
 * validator instantiates, is a draft-07 instance.
 *
 * Empty values (`undefined` / `null` / `[]` / `{}`) skip validation entirely —
 * Payload's json validator treats them as "no value" — so the field stays
 * optional with no special-casing here.
 */
export const subtitlesJsonSchema: NonNullable<JSONField['jsonSchema']> = {
  uri: SUBTITLES_SCHEMA_URI,
  fileMatch: [SUBTITLES_SCHEMA_URI],
  schema: z.toJSONSchema(subtitlesZodSchema, { target: 'draft-7' }) as JSONSchema4,
}
