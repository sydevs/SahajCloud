/**
 * The Lemonfox connection: the request it builds, how it reports a refusal,
 * the locale mapping, and when it considers itself unavailable.
 *
 * Fixture pre-mortem: the error bodies below claim Lemonfox answers an
 * OpenAI-shaped `{ error: { message } }`. That claim is only read back by
 * `readErrorMessage` in `src/lib/lemonfox/transcribe.ts`, which this spec and
 * that module are the two halves of, so nothing here depends on repo config.
 * The key cases do: `LEMONFOX_API_KEY: ''` in `vitest.config.mts` is what makes
 * the unset case the lane's default, and it is checked there.
 *
 * Nothing here re-tests `normalizeLemonfoxResponse` — `lemonfox-response.spec.ts`
 * owns it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lemonfoxLanguage } from '@/lib/lemonfox/languages'
import { requestLemonfoxTranscript } from '@/lib/lemonfox/transcribe'

const AUDIO_URL = 'https://media.example.test/meditations/evening-calm-abc123.mp3'

const okResponse = (body: unknown = { segments: [] }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'text/plain' } })

/** The one request the client made, as a `FormData` the assertions can read. */
async function sentForm(fetchFn: ReturnType<typeof vi.fn>): Promise<FormData> {
  expect(fetchFn).toHaveBeenCalledTimes(1)
  const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
  return await new Response(init.body as BodyInit).formData()
}

describe('requestLemonfoxTranscript', () => {
  it('sends the recording URL, verbose_json and the mapped language', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())

    await requestLemonfoxTranscript({
      apiKey: 'lf-test-key',
      audioUrl: AUDIO_URL,
      locale: 'pt-BR',
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    const form = await sentForm(fetchFn)
    // The R2 URL, not the bytes: Lemonfox fetches it, so a 50-minute recording
    // never passes through this process.
    expect(form.get('file')).toBe(AUDIO_URL)
    expect(form.get('response_format')).toBe('verbose_json')
    expect(form.get('language')).toBe('portuguese')
  })

  // Nothing stores word timings since #957, and asking for them was most of
  // the response body.
  it('asks for no word timings', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())

    await requestLemonfoxTranscript({
      apiKey: 'lf-test-key',
      audioUrl: AUDIO_URL,
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect((await sentForm(fetchFn)).get('timestamp_granularities[]')).toBeNull()
  })

  it('names no language for a locale Lemonfox does not list, so it detects one', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())

    await requestLemonfoxTranscript({
      apiKey: 'lf-test-key',
      audioUrl: AUDIO_URL,
      locale: 'kl',
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect((await sentForm(fetchFn)).get('language')).toBeNull()
  })

  it('authenticates as a bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())

    await requestLemonfoxTranscript({
      apiKey: 'lf-test-key',
      audioUrl: AUDIO_URL,
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.lemonfox.ai/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lf-test-key')
  })

  it("reports the vendor's own message on a refusal", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Audio file is too long.' } }), {
        status: 422,
      }),
    )

    await expect(
      requestLemonfoxTranscript({
        apiKey: 'lf-test-key',
        audioUrl: AUDIO_URL,
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Lemonfox returned 422: Audio file is too long.')
  })

  it('reports the bare status when the error body is unreadable', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    await expect(
      requestLemonfoxTranscript({
        apiKey: 'lf-test-key',
        audioUrl: AUDIO_URL,
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Lemonfox returned 502')
  })
})

describe('lemonfoxLanguage', () => {
  it('names the language, dropping the region', () => {
    expect(lemonfoxLanguage('en')).toBe('english')
    expect(lemonfoxLanguage('pt-BR')).toBe('portuguese')
    expect(lemonfoxLanguage('en-AU')).toBe('english')
  })

  it('names nothing for a language Lemonfox does not list', () => {
    expect(lemonfoxLanguage('kl')).toBeUndefined()
  })

  it('names nothing for a locale that is not one', () => {
    expect(lemonfoxLanguage('not a locale')).toBeUndefined()
    expect(lemonfoxLanguage('')).toBeUndefined()
  })
})

describe('lemonfoxApiKey', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const read = async (): Promise<string | undefined> => {
    const { lemonfoxApiKey } = await import('@/lib/lemonfox/transcribe')
    return lemonfoxApiKey()
  }

  it('is undefined with no key set', async () => {
    process.env = { ...originalEnv }
    delete process.env.LEMONFOX_API_KEY
    await expect(read()).resolves.toBeUndefined()
  })

  // The lane's own default: `vitest.config.mts` sets it empty so no run can
  // spend a developer's real key.
  it('is undefined for an empty or blank key', async () => {
    process.env = { ...originalEnv, LEMONFOX_API_KEY: '' }
    await expect(read()).resolves.toBeUndefined()

    vi.resetModules()
    process.env = { ...originalEnv, LEMONFOX_API_KEY: '   ' }
    await expect(read()).resolves.toBeUndefined()
  })

  it('is the key when one is set', async () => {
    process.env = { ...originalEnv, LEMONFOX_API_KEY: 'lf-live-key' }
    await expect(read()).resolves.toBe('lf-live-key')
  })
})
