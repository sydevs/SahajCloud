import { z } from 'zod'

import type { TranscriptSegment } from '@/lib/meditations/transcript'

const LEMONFOX_TRANSCRIPTIONS_URL = 'https://api.lemonfox.ai/v1/audio/transcriptions'

/** Lemonfox transcribes 30 minutes of audio in about a minute. */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Ask Lemonfox for a word-timestamped transcript of a recording.
 *
 * `audioUrl` must be publicly reachable: Lemonfox fetches it itself, so the
 * recording never passes through this process. Returns the parsed JSON body
 * untouched — {@link normalizeLemonfoxResponse} gives it a shape.
 */
export async function requestLemonfoxTranscript({
  apiKey,
  audioUrl,
  language,
  fetchFn = fetch,
}: {
  apiKey: string
  audioUrl: string
  /** A name from {@link LEMONFOX_LANGUAGES}. Omitted, Lemonfox detects the language. */
  language?: string
  fetchFn?: typeof fetch
}): Promise<unknown> {
  const form = new FormData()
  form.append('file', audioUrl)
  if (language) form.append('language', language)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')

  const response = await fetchFn(LEMONFOX_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`Lemonfox returned ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return response.json()
}

/** Lemonfox's error body is `{ error: { message } }`, as OpenAI's is. */
async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } }
    return typeof body.error?.message === 'string' ? body.error.message : undefined
  } catch {
    return undefined
  }
}

/**
 * Lemonfox exposes an OpenAI-compatible `verbose_json`, but documents no
 * schema for it. Word timings may sit inside each segment (WhisperX) or in one
 * top-level list (OpenAI), and a word Whisper cannot align carries no times.
 * Everything is optional here, and unknown keys are ignored.
 */
const rawWordSchema = z.object({
  word: z.string().optional(),
  text: z.string().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
})

const rawSegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  words: z.array(rawWordSchema).optional(),
})

const rawResponseSchema = z.object({
  segments: z.array(rawSegmentSchema).optional(),
  words: z.array(rawWordSchema).optional(),
})

type RawWord = z.infer<typeof rawWordSchema>

const roundToMillisecond = (seconds: number): number =>
  Math.round(Math.max(0, seconds) * 1000) / 1000

/**
 * Reduce a Lemonfox `verbose_json` body to the stored segment shape.
 *
 * A word without both times is dropped from `words` rather than given
 * estimated ones; its text still reads in the segment's `text`. Throws when the
 * body holds no timestamped segment, since a transcript the editor cannot seek
 * through is not one this feature can use.
 */
export function normalizeLemonfoxResponse(raw: unknown): TranscriptSegment[] {
  const parsed = rawResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('Lemonfox returned a response this app cannot read.')
  }

  const rawSegments = [...(parsed.data.segments ?? [])]
    .filter((segment) => segment.text.trim())
    .sort((a, b) => a.start - b.start)
  if (rawSegments.length === 0) {
    throw new Error('Lemonfox returned no timestamped speech for this recording.')
  }

  // Lemonfox's WhisperX shape carries `words` on each segment, and then every
  // bucket below is discarded — so only pay for the pass when one is missing.
  const topLevelWords = rawSegments.some((segment) => !segment.words)
    ? assignWordsToSegments(rawSegments, parsed.data.words ?? [])
    : rawSegments.map<RawWord[]>(() => [])

  return rawSegments.map((segment, index) => {
    const start = roundToMillisecond(segment.start)
    return {
      text: segment.text.trim(),
      start,
      end: Math.max(start, roundToMillisecond(segment.end)),
      words: (segment.words ?? topLevelWords[index]).flatMap((word) => {
        const text = (word.word ?? word.text ?? '').trim()
        if (!text || word.start === undefined || word.end === undefined) return []
        const wordStart = roundToMillisecond(word.start)
        return [{ text, start: wordStart, end: Math.max(wordStart, roundToMillisecond(word.end)) }]
      }),
    }
  })
}

/** Give each top-level word to the last segment that starts at or before it. */
function assignWordsToSegments(segments: { start: number }[], words: RawWord[]): RawWord[][] {
  const bySegment: RawWord[][] = segments.map(() => [])
  for (const word of words) {
    const at = word.start ?? Number.NEGATIVE_INFINITY
    let index = 0
    while (index + 1 < segments.length && segments[index + 1].start <= at) index += 1
    bySegment[index].push(word)
  }
  return bySegment
}

/**
 * The Lemonfox name of a meditation's locale: `en` → `english`, `pt-BR` →
 * `portuguese`, since Whisper knows languages, not regions. `undefined` for a
 * language Lemonfox does not list, which it then detects instead.
 */
export function lemonfoxLanguage(locale: string): string | undefined {
  try {
    const { language } = new Intl.Locale(locale)
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(language)?.toLowerCase()
    return name && LEMONFOX_LANGUAGES.has(name) ? name : undefined
  } catch {
    return undefined
  }
}

/**
 * The language names Lemonfox accepts, from its API reference
 * (https://www.lemonfox.ai/apis/speech-to-text). Naming the language improves
 * accuracy and latency; a name outside this list would be refused.
 */
const LEMONFOX_LANGUAGES = new Set(
  [
    'english chinese german spanish russian korean french japanese portuguese turkish polish',
    'catalan dutch arabic swedish italian indonesian hindi finnish vietnamese hebrew ukrainian',
    'greek malay czech romanian danish hungarian tamil norwegian thai urdu croatian bulgarian',
    'lithuanian latin maori malayalam welsh slovak telugu persian latvian bengali serbian',
    'azerbaijani slovenian kannada estonian macedonian breton basque icelandic armenian nepali',
    'mongolian bosnian kazakh albanian swahili galician marathi punjabi sinhala khmer shona',
    'yoruba somali afrikaans occitan georgian belarusian tajik sindhi gujarati amharic yiddish',
    'lao uzbek faroese pashto turkmen nynorsk maltese sanskrit luxembourgish myanmar tibetan',
    'tagalog malagasy assamese tatar hawaiian lingala hausa bashkir javanese sundanese cantonese',
  ]
    .join(' ')
    .split(' '),
)
