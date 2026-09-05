import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { z } from 'zod'

export const SUBTITLES_SCHEMA_URI = 'https://sahajcloud.dev/schemas/subtitles.json'

/**
 * Parser for subtitle payloads arriving from **outside** the CMS — the
 * Storyblok importer reads them off a third-party response before anything is
 * written. Payload validates the stored column itself (see
 * `subtitlesFieldSchema` below), so this is not a second gate on writes.
 *
 * It mirrors `subtitlesJsonSchema`. `tests/unit/subtitles.spec.ts` pins the two
 * against one fixture set in both directions, so the mirror cannot drift
 * silently. They part company in one place, deliberately: Zod strips an unknown
 * key and the column refuses one. The importer writes Zod's stripped output, so
 * the value that reaches the column has already lost it.
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

/** Mirrors `subtitlesZodSchema` — see the note above. */
export const subtitlesJsonSchema: JSONSchema4 = {
  $id: SUBTITLES_SCHEMA_URI,
  title: 'Subtitles',
  type: 'array',
  items: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      startTimeMs: { type: 'number' },
      endTimeMs: { type: 'number' },
      durationMs: { type: 'number' },
    },
    required: ['content', 'startTimeMs', 'endTimeMs'],
    additionalProperties: false,
  },
}

/**
 * Wired onto every `subtitles` column as the field's `jsonSchema`, which makes
 * Payload BOTH generate the TypeScript type AND validate on write with Ajv.
 *
 * It replaces a hand-rolled `validate` that ran the Zod mirror instead. That
 * function existed because Ajv compiles through `new Function()`, which the
 * Cloudflare Workers isolate refuses (#317) — this app has run on Railway/Node
 * since, so the constraint is gone. The two agree on empty values as well as on
 * shape: Payload's built-in `json` validator skips `null`, `undefined`, `[]`
 * and `{}` exactly as the old `isEmpty` guard did
 * (`payload/dist/fields/validations.js`).
 */
export const subtitlesFieldSchema: JSONField['jsonSchema'] = {
  uri: SUBTITLES_SCHEMA_URI,
  fileMatch: [SUBTITLES_SCHEMA_URI],
  schema: subtitlesJsonSchema,
}
