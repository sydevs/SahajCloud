/**
 * The Lemonfox client and the normalizer that turns its `verbose_json` body into
 * stored transcript segments.
 *
 * Lemonfox documents no schema for `verbose_json` beyond `text`. The fixtures
 * cover the two OpenAI-compatible shapes it may take: word timings inside each
 * segment (WhisperX), or in one top-level list (OpenAI).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  lemonfoxLanguage,
  normalizeLemonfoxResponse,
  requestLemonfoxTranscript,
} from '@/jobs/TranscribeMeditation/lemonfox'
import { sampleLemonfoxResponse } from '@/jobs/TranscribeMeditation/sampleResponse'
import { LOCALES } from '@/lib/locales'

describe('normalizeLemonfoxResponse', () => {
  it('keeps word timings given inside each segment', () => {
    const segments = normalizeLemonfoxResponse({
      text: 'Close your eyes. Breathe.',
      segments: [
        {
          id: 0,
          text: ' Close your eyes.',
          start: 1.2,
          end: 2.6,
          avg_logprob: -0.2,
          words: [
            { word: 'Close', start: 1.2, end: 1.5, score: 0.9 },
            { word: 'your', start: 1.5, end: 1.8 },
            { word: 'eyes.', start: 1.8, end: 2.6 },
          ],
        },
        {
          id: 1,
          text: 'Breathe.',
          start: 4,
          end: 4.8,
          words: [{ word: 'Breathe.', start: 4, end: 4.8 }],
        },
      ],
    })

    expect(segments).toEqual([
      {
        text: 'Close your eyes.',
        start: 1.2,
        end: 2.6,
        words: [
          { text: 'Close', start: 1.2, end: 1.5 },
          { text: 'your', start: 1.5, end: 1.8 },
          { text: 'eyes.', start: 1.8, end: 2.6 },
        ],
      },
      { text: 'Breathe.', start: 4, end: 4.8, words: [{ text: 'Breathe.', start: 4, end: 4.8 }] },
    ])
  })

  it('gives each top-level word to the segment it falls in', () => {
    const segments = normalizeLemonfoxResponse({
      segments: [
        { text: 'Sit up.', start: 0, end: 1 },
        { text: 'Relax.', start: 5, end: 6 },
      ],
      words: [
        { word: 'Sit', start: 0, end: 0.4 },
        { word: 'up.', start: 0.4, end: 1 },
        { word: 'Relax.', start: 5.1, end: 6 },
      ],
    })

    expect(segments.map((segment) => segment.words.map((word) => word.text))).toEqual([
      ['Sit', 'up.'],
      ['Relax.'],
    ])
  })

  it('drops a word Whisper could not align, and keeps it in the text', () => {
    const [segment] = normalizeLemonfoxResponse({
      segments: [
        {
          text: 'Count to 108.',
          start: 0,
          end: 2,
          words: [
            { word: 'Count', start: 0, end: 0.5 },
            { word: 'to', start: 0.5, end: 0.7 },
            { word: '108.' },
          ],
        },
      ],
    })

    expect(segment.text).toBe('Count to 108.')
    expect(segment.words.map((word) => word.text)).toEqual(['Count', 'to'])
  })

  it('rounds to the millisecond, orders segments, and skips empty ones', () => {
    const segments = normalizeLemonfoxResponse({
      segments: [
        { text: 'Second.', start: 3.33333, end: 3.1, words: [] },
        { text: '   ', start: 2, end: 2.5 },
        { text: 'First.', start: 0.0004, end: 1.23456, words: [] },
      ],
    })

    expect(segments).toEqual([
      { text: 'First.', start: 0, end: 1.235, words: [] },
      // An end before the start is clamped up to it.
      { text: 'Second.', start: 3.333, end: 3.333, words: [] },
    ])
  })

  it('refuses a body with no timestamped speech', () => {
    expect(() => normalizeLemonfoxResponse({ text: 'Hello' })).toThrow(/no timestamped speech/)
    expect(() => normalizeLemonfoxResponse({ segments: [] })).toThrow(/no timestamped speech/)
  })

  it('refuses a body it cannot read', () => {
    expect(() => normalizeLemonfoxResponse('Hello')).toThrow(/cannot read/)
    expect(() => normalizeLemonfoxResponse({ segments: [{ text: 'Hi' }] })).toThrow(/cannot read/)
  })
})

describe('sampleLemonfoxResponse', () => {
  it('normalizes into phrases that all fall inside the recording', () => {
    const segments = normalizeLemonfoxResponse(sampleLemonfoxResponse(276))

    expect(segments).toHaveLength(10)
    expect(segments[0].start).toBe(0)
    expect(segments.at(-1)!.end).toBeLessThan(276)
    for (const segment of segments) expect(segment.words.length).toBeGreaterThan(0)
  })

  it('fits a short recording without one phrase running into the next', () => {
    const segments = normalizeLemonfoxResponse(sampleLemonfoxResponse(42))

    segments.forEach((segment, index) => {
      const nextStart = segments[index + 1]?.start ?? 42
      expect(segment.end).toBeLessThanOrEqual(nextStart)
    })
  })

  it('falls back to ten minutes when the duration is unknown', () => {
    const segments = normalizeLemonfoxResponse(sampleLemonfoxResponse(null))

    expect(segments.at(-1)!.start).toBe(552)
  })
})

describe('lemonfoxLanguage', () => {
  it.each([
    ['en', 'english'],
    ['en-AU', 'english'],
    ['fr', 'french'],
    ['pt-BR', 'portuguese'],
    ['hy', 'armenian'],
  ])('names %s as %s', (locale, name) => {
    expect(lemonfoxLanguage(locale)).toBe(name)
  })

  it('names a language Lemonfox accepts for every locale the app has', () => {
    for (const { code } of LOCALES) expect(lemonfoxLanguage(code), code).toBeDefined()
  })

  it('names nothing Lemonfox does not list, so it detects the language instead', () => {
    expect(lemonfoxLanguage('zu')).toBeUndefined()
    expect(lemonfoxLanguage('not a locale')).toBeUndefined()
  })
})

describe('requestLemonfoxTranscript', () => {
  it('sends the recording URL with word timestamps requested', async () => {
    const fetchFn = vi.fn(async () => Response.json({ segments: [] }))

    await requestLemonfoxTranscript({
      apiKey: 'test-key',
      audioUrl: 'https://assets.example.com/meditation.mp3',
      language: 'english',
      fetchFn,
    })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    const form = init.body as FormData
    expect(url).toBe('https://api.lemonfox.ai/v1/audio/transcriptions')
    expect(init.headers).toEqual({ Authorization: 'Bearer test-key' })
    expect(Object.fromEntries(form.entries())).toEqual({
      file: 'https://assets.example.com/meditation.mp3',
      language: 'english',
      response_format: 'verbose_json',
      'timestamp_granularities[]': 'word',
    })
  })

  it('leaves the language out when there is none to name', async () => {
    const fetchFn = vi.fn(async () => Response.json({ segments: [] }))

    await requestLemonfoxTranscript({ apiKey: 'k', audioUrl: 'https://x/a.mp3', fetchFn })

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.body as FormData).has('language')).toBe(false)
  })

  it("surfaces Lemonfox's own error message", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(
        { status: 401, error: { message: 'You provided an invalid API key.' } },
        { status: 401 },
      ),
    )

    await expect(
      requestLemonfoxTranscript({
        apiKey: 'bad',
        audioUrl: 'https://x/a.mp3',
        language: 'english',
        fetchFn,
      }),
    ).rejects.toThrow('Lemonfox returned 401: You provided an invalid API key.')
  })
})
