import { z } from 'zod'

/**
 * Parser for subtitle payloads arriving from **outside** the CMS — the
 * Storyblok importer reads them off a third-party response before anything is
 * written. Payload validates the stored column itself (see
 * `subtitlesSchema` below), so this is not a second gate on writes.
 *
 * It is the same cue shape the column declares below — one literal, read in two
 * modes. `tests/unit/subtitles.spec.ts` pins the pair against one fixture set in
 * both directions. They part company on empty values only, which an optional
 * column accepts either way.
 */
const subtitleCue = {
  content: z.string(),
  startTimeMs: z.number(),
  endTimeMs: z.number(),
  durationMs: z.number().optional(),
}

/** Strips an unknown key, which is what a parser of foreign data should do. */
export const subtitlesZodSchema = z.array(z.object(subtitleCue))

export type Subtitles = z.infer<typeof subtitlesZodSchema>

/**
 * The shape every `subtitles` column declares, passed to `jsonField` as
 * `Subtitles` at each of its three fields. Declaring it makes Payload BOTH
 * generate the TypeScript type AND validate on write with Ajv.
 *
 * It replaces a hand-rolled `validate` that ran the Zod mirror instead. That
 * function existed because Ajv compiles through `new Function()`, which the
 * Cloudflare Workers isolate refuses (#317) — this app has run on Railway/Node
 * since, so the constraint is gone. The two agree on empty values as well as on
 * shape: Payload's built-in `json` validator skips `null`, `undefined`, `[]`
 * and `{}` exactly as the old `isEmpty` guard did
 * (`payload/dist/fields/validations.js`).
 *
 * `looseObject`, not `object`: the stored column keeps an unknown key, because
 * the validator this replaced did. Closing the shape would make a cue written
 * under an earlier one fail every later save of its document, including one
 * that never touched the subtitles.
 */
export const subtitlesSchema = z.array(z.looseObject(subtitleCue))
