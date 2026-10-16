/**
 * The Lemonfox speech-to-text connection: the HTTP call and the key behind it.
 *
 * Here rather than inside the transcription job, because two parties need it —
 * the job that calls the vendor, and the writer that must know whether
 * transcription is available before it promises one.
 */
import { serverEnv } from '@/lib/env'

import { lemonfoxLanguage } from './languages'

const LEMONFOX_TRANSCRIPTIONS_URL = 'https://api.lemonfox.ai/v1/audio/transcriptions'

/**
 * Roughly 3× the expected worst case: the longest allowed recording is 50
 * minutes (`extractAudioDuration.ts`) and the vendor claims 30 minutes of audio
 * in under a minute.
 *
 * ⚠ Not Cloudflare's 125 s proxy read timeout. That bound governs a request
 * arriving *through* our zone at the origin; this is an outbound call from the
 * container to the vendor, made by a queued job with no HTTP client waiting.
 */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000

/** The configured Lemonfox key, or `undefined` when transcription is unavailable. */
export const lemonfoxApiKey = (): string | undefined => serverEnv.LEMONFOX_API_KEY

/**
 * Ask Lemonfox for a timestamped transcript of a recording.
 *
 * `audioUrl` must be publicly reachable: Lemonfox fetches it itself, so the
 * recording never passes through this process. Returns the parsed JSON body
 * untouched — `normalizeLemonfoxResponse` gives it a shape.
 */
export async function requestLemonfoxTranscript({
  apiKey,
  audioUrl,
  locale,
  fetchFn = fetch,
}: {
  apiKey: string
  audioUrl: string
  /** The meditation's locale. Mapped here, so no caller repeats the mapping. */
  locale?: string
  fetchFn?: typeof fetch
}): Promise<unknown> {
  const form = new FormData()
  form.append('file', audioUrl)
  const language = locale ? lemonfoxLanguage(locale) : undefined
  if (language) form.append('language', language)
  // The only format carrying timings. No `timestamp_granularities[]`: nothing
  // stores word timings, and asking for them is 85% of the body for nobody.
  form.append('response_format', 'verbose_json')

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
