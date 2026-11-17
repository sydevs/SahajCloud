/**
 * Integration tests for the Cloudflare Stream webhook handler.
 *
 * These tests exercise the pure helpers exported from the route handler
 * (`parseSignatureHeader`, `verifySignature`, `handleStreamWebhook`) without
 * booting a Payload instance — the handler is designed to accept an injected
 * logger and fetch so tests stay fast.
 */
import type { Mock } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WebhookLogger } from '@/plugins/storage/cloudflareStreamWebhook'

import {
  computeStreamSignature,
  readyStreamPayload,
  STREAM_DOWNLOADS_ENABLED,
  STREAM_NOW_SECONDS,
  STREAM_SECRET,
  streamFetchAnswering,
  streamSignatureHeader,
} from '../utils/streamWebhook'

// Dynamic-import these after env is prepared so any module-level validation
// (none today, but cheap insurance) sees the expected env values. The
// `WebhookLogger` import above is type-only, so it is erased and does not
// evaluate the module early.
let parseSignatureHeader: typeof import('@/plugins/storage/cloudflareStreamWebhook').parseSignatureHeader
let verifySignature: typeof import('@/plugins/storage/cloudflareStreamWebhook').verifySignature
let handleStreamWebhook: typeof import('@/plugins/storage/cloudflareStreamWebhook').handleStreamWebhook

/**
 * The injected logger, mocked method-for-method off the real interface.
 *
 * Each method was `ReturnType<typeof vi.fn>`, which resolves the generic to its
 * *constraint* (`Mock<Procedure | Constructable>`) rather than its default — so
 * the mock was not callable as `(obj: object) => void` and every
 * `handleStreamWebhook({ logger })` call failed to typecheck (11 of #606
 * Phase 2's errors). Mapping over `WebhookLogger` also means a new method on
 * the interface breaks `makeLogger` here instead of going unmocked.
 */
type CapturedLogger = { [K in keyof WebhookLogger]: Mock<WebhookLogger[K]> }

function makeLogger(): CapturedLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('Cloudflare Stream webhook handler', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
      CLOUDFLARE_STREAM_WEBHOOK_SECRET: STREAM_SECRET,
      CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
      CLOUDFLARE_API_KEY: 'test-cloudflare-api-key-20chars',
    }

    const mod = await import('@/plugins/storage/cloudflareStreamWebhook')
    parseSignatureHeader = mod.parseSignatureHeader
    verifySignature = mod.verifySignature
    handleStreamWebhook = mod.handleStreamWebhook
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('parseSignatureHeader', () => {
    it('returns null for null / empty / non-string inputs', () => {
      expect(parseSignatureHeader(null)).toBeNull()
      expect(parseSignatureHeader('')).toBeNull()
      expect(parseSignatureHeader(undefined)).toBeNull()
    })

    it('parses a well-formed header', () => {
      const result = parseSignatureHeader('time=1700000000,sig1=deadbeef')
      expect(result).toEqual({ time: 1_700_000_000, sig: 'deadbeef' })
    })

    it('ignores extra unknown segments', () => {
      const result = parseSignatureHeader('time=1700000000,sig1=abc,sig2=ignored')
      expect(result).toEqual({ time: 1_700_000_000, sig: 'abc' })
    })

    it('returns null when time is not numeric', () => {
      expect(parseSignatureHeader('time=notanumber,sig1=abc')).toBeNull()
    })

    it('returns null when sig1 is missing', () => {
      expect(parseSignatureHeader('time=1700000000')).toBeNull()
    })

    it('returns null when time is missing', () => {
      expect(parseSignatureHeader('sig1=abc')).toBeNull()
    })

    it('returns null for malformed segments', () => {
      expect(parseSignatureHeader('nosep,sig1=abc')).toBeNull()
    })
  })

  describe('verifySignature', () => {
    it('accepts a valid signature', async () => {
      const body = readyStreamPayload()
      const sig = computeStreamSignature(body, STREAM_SECRET, STREAM_NOW_SECONDS)
      const header = `time=${STREAM_NOW_SECONDS},sig1=${sig}`
      const result = await verifySignature(body, header, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: true })
    })

    it('rejects a signature signed with the wrong secret', async () => {
      const body = readyStreamPayload()
      const sig = computeStreamSignature(
        body,
        'some-other-secret-32-chars-minimum!',
        STREAM_NOW_SECONDS,
      )
      const header = `time=${STREAM_NOW_SECONDS},sig1=${sig}`
      const result = await verifySignature(body, header, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'mismatch' })
    })

    it('rejects a stale signature (> 5 minutes in the past)', async () => {
      const body = readyStreamPayload()
      const staleTime = STREAM_NOW_SECONDS - 301
      const sig = computeStreamSignature(body, STREAM_SECRET, staleTime)
      const header = `time=${staleTime},sig1=${sig}`
      const result = await verifySignature(body, header, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'stale' })
    })

    it('rejects a signature from > 5 minutes in the future', async () => {
      const body = readyStreamPayload()
      const futureTime = STREAM_NOW_SECONDS + 301
      const sig = computeStreamSignature(body, STREAM_SECRET, futureTime)
      const header = `time=${futureTime},sig1=${sig}`
      const result = await verifySignature(body, header, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'stale' })
    })

    it('rejects a missing header', async () => {
      const result = await verifySignature('{}', null, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'missing' })
    })

    it('rejects a malformed header', async () => {
      const result = await verifySignature('{}', 'garbage', STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'malformed' })
    })

    it('rejects a signature with wrong length (different hex length)', async () => {
      const body = readyStreamPayload()
      const header = `time=${STREAM_NOW_SECONDS},sig1=deadbeef`
      const result = await verifySignature(body, header, STREAM_SECRET, STREAM_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'mismatch' })
    })
  })

  describe('handleStreamWebhook', () => {
    const makeFetchFn = (response: unknown, status = 200) =>
      vi.fn(streamFetchAnswering(response, status))

    it('enables downloads when a ready event arrives', async () => {
      const rawBody = readyStreamPayload()
      const header = streamSignatureHeader(rawBody)
      const fetchFn = makeFetchFn(STREAM_DOWNLOADS_ENABLED)
      const logger = makeLogger()

      // Freeze Date.now so verifySignature uses STREAM_NOW_SECONDS
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(200)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      const [url, init] = fetchFn.mock.calls[0]
      expect(url).toBe(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/stream/test-video-uid-abc123/downloads',
      )
      expect(init).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
      })
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'MP4 downloads enabled via webhook' }),
      )
    })

    it('logs and returns 200 on error state without calling downloads API', async () => {
      const rawBody = JSON.stringify({
        uid: 'bad-video',
        status: {
          state: 'error',
          errorReasonCode: 'ERR_MALFORMED_VIDEO',
          errorReasonText: 'The video was deemed to be corrupted',
        },
      })
      const header = streamSignatureHeader(rawBody)
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(200)
      expect(fetchFn).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Cloudflare Stream reported processing error',
          uid: 'bad-video',
          errorReasonCode: 'ERR_MALFORMED_VIDEO',
        }),
      )
    })

    it('ignores intermediate states without calling downloads API', async () => {
      const rawBody = JSON.stringify({
        uid: 'processing-video',
        status: { state: 'inprogress', pctComplete: '50.0' },
      })
      const header = streamSignatureHeader(rawBody)
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(200)
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('rejects with 401 when signature is invalid', async () => {
      const rawBody = readyStreamPayload()
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: `time=${STREAM_NOW_SECONDS},sig1=${'0'.repeat(64)}`,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(401)
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('rejects with 400 when signature header is missing', async () => {
      const logger = makeLogger()
      const result = await handleStreamWebhook({
        rawBody: readyStreamPayload(),
        signatureHeader: null,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })
      expect(result.status).toBe(400)
    })

    it('returns 503 when webhook secret is missing', async () => {
      const logger = makeLogger()
      const result = await handleStreamWebhook({
        rawBody: readyStreamPayload(),
        signatureHeader: 'time=1,sig1=abc',
        secret: undefined,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })
      expect(result.status).toBe(503)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('returns 503 when accountId or apiKey is missing but event is ready', async () => {
      const rawBody = readyStreamPayload()
      const header = streamSignatureHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: undefined,
        apiKey: undefined,
        logger,
      })

      expect(result.status).toBe(503)
    })

    it('returns 500 when downstream Cloudflare API returns success: false', async () => {
      const rawBody = readyStreamPayload()
      const header = streamSignatureHeader(rawBody)
      const fetchFn = makeFetchFn({
        success: false,
        errors: [{ message: 'Video not ready yet' }],
      })
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(500)
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Failed to enable MP4 downloads' }),
      )
    })

    it('returns 400 when body is not valid JSON', async () => {
      const rawBody = 'not-json'
      const header = streamSignatureHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })

      expect(result.status).toBe(400)
    })

    it('returns 400 when payload fails schema validation', async () => {
      const rawBody = JSON.stringify({ uid: 'abc' }) // missing status
      const header = streamSignatureHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })

      expect(result.status).toBe(400)
    })

    it('returns non-2xx when the downloads call times out (stalled Cloudflare API)', async () => {
      const rawBody = readyStreamPayload()
      const header = streamSignatureHeader(rawBody)
      const logger = makeLogger()

      // A fetch that never settles on its own but honours the AbortSignal the
      // timeout raises — exactly how the real `fetch` behaves on a stalled request.
      const stallingFetchFn = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      )

      vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)

      // A tiny timeout keeps the test fast while exercising the real timeout path.
      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: STREAM_SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: stallingFetchFn as unknown as typeof fetch,
        downloadsTimeoutMs: 20,
      })

      // Timeout → AbortSignal.timeout aborts the fetch → rejects → caught → 500 so Cloudflare retries.
      expect(result.status).toBe(500)
      expect(stallingFetchFn).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Error enabling MP4 downloads via webhook' }),
      )
    })
  })
})
