import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { z } from 'zod'

/** The subtitle-cue contract, and the single source of truth for it. */
const subtitleCue = z.object({
  content: z.string(),
  startTimeMs: z.number(),
  endTimeMs: z.number(),
  durationMs: z.number().optional(),
})

/**
 * Strict cue list — the Storyblok seed importer parses raw subtitle files with
 * this, which drops any key not declared above.
 */
export const subtitlesZodSchema = z.array(subtitleCue)

export type Subtitles = z.infer<typeof subtitlesZodSchema>

const SUBTITLES_SCHEMA_URI = 'https://sahajcloud.dev/schemas/subtitles.json'

/**
 * `jsonSchema` for every subtitles field (Videos, Lessons). Payload uses it to
 * BOTH validate on write — Ajv rejects a malformed cue, raising a
 * `ValidationError` (a 400 over REST) — AND generate the field's TypeScript
 * type in `payload-types.ts`, which would otherwise be `unknown`.
 *
 * Derived from the **loose** cue so an unrecognised key is tolerated rather
 * than rejected. That is deliberate and load-bearing: stored rows carry legacy
 * cue keys (`startOfParagraph`, …), the Zod-based field validator this replaces
 * accepted them, and rejecting them here would 400 every later save of an
 * otherwise untouched lesson or video. Sharing `subtitleCue` keeps the declared
 * fields identical to the strict parser above — only the tolerance differs.
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
  schema: z.toJSONSchema(z.array(subtitleCue.loose()), { target: 'draft-7' }) as JSONSchema4,
}
