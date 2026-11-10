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
/**
 * The one cue shape for every timed phrase this app stores. The two readers
 * below keep it open; `transcripts` closes it, because that column
 * has a single internal writer and no row written under an earlier shape.
 */
export const subtitleCue = {
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

/**
 * One spoken word with its own timings, in the same milliseconds a cue counts.
 *
 * Here rather than beside the Lemonfox reader that produces it: the grouper
 * below is this app's cue vocabulary, not the vendor's, so a second provider
 * reads into this shape instead of teaching the grouper its own.
 */
export type TimedWord = {
  content: string
  startTimeMs: number
  endTimeMs: number
}

/**
 * The house cue length, measured against the 1,102 cues already stored: median
 * 26 characters, p95 exactly 30.
 */
export const SUBTITLE_CUE_MAX_CHARS = 30

/**
 * Group spoken words into subtitle cues of at most {@link SUBTITLE_CUE_MAX_CHARS}
 * characters.
 *
 * A cue takes its start from its first word and its end from its last, so a
 * silence between two words stays a silence: nothing stretches a cue to meet
 * the next one. A single word longer than the limit is its own cue and exceeds
 * it — splitting a word mid-syllable reads worse than one long line.
 */
export function groupWordsIntoCues(
  words: readonly TimedWord[],
  maxChars: number = SUBTITLE_CUE_MAX_CHARS,
): Subtitles {
  const cues: Subtitles = []
  let line: TimedWord[] = []
  let length = 0

  const flush = () => {
    if (line.length === 0) return
    const first = line[0]!
    const last = line[line.length - 1]!
    cues.push({
      content: line.map((word) => word.content).join(' '),
      startTimeMs: first.startTimeMs,
      endTimeMs: Math.max(first.startTimeMs, last.endTimeMs),
    })
    line = []
    length = 0
  }

  for (const word of words) {
    const content = word.content.trim()
    if (!content) continue
    // The space this word would need, which the first word of a cue does not.
    const added = line.length === 0 ? content.length : content.length + 1
    if (line.length > 0 && length + added > maxChars) flush()
    line.push({ ...word, content })
    length += line.length === 1 ? content.length : added
  }
  flush()

  return cues
}
