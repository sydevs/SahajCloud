/**
 * Integration tests for the Cloudflare Stream webhook handler.
 *
 * These tests exercise the pure helpers exported from the route handler
 * (`parseSignatureHeader`, `verifySignature`, `handleStreamWebhook`) without
 * booting a Payload instance — the handler is designed to accept an injected
 * logger and fetch so tests stay fast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Dynamic-import these after env is prepared so any module-level validation
// (none today, but cheap insurance) sees the expected env values.
let parseSignatureHeader: typeof import('@/plugins/storage/cloudflareStreamWebhook').parseSignatureHeader
let verifySignature: typeof import('@/plugins/storage/cloudflareStreamWebhook').verifySignature
let handleStreamWebhook: typeof import('@/plugins/storage/cloudflareStreamWebhook').handleStreamWebhook

const FAKE_NOW_SECONDS = 1_750_000_000
const SECRET = 'test-webhook-signing-secret-with-32-plus-chars'

interface CapturedLogger {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
}

function makeLogger(): CapturedLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

async function computeSignature(rawBody: string, secret: string, time: number): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${time}.${rawBody}`))
  const bytes = new Uint8Array(signed)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function buildReadyPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    uid: 'test-video-uid-abc123',
    readyToStream: true,
    status: { state: 'ready', pctComplete: '100.000000' },
    ...overrides,
  })
}

describe('Cloudflare Stream webhook handler', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
      CLOUDFLARE_STREAM_WEBHOOK_SECRET: SECRET,
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
      const body = buildReadyPayload()
      const sig = await computeSignature(body, SECRET, FAKE_NOW_SECONDS)
      const header = `time=${FAKE_NOW_SECONDS},sig1=${sig}`
      const result = await verifySignature(body, header, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: true })
    })

    it('rejects a signature signed with the wrong secret', async () => {
      const body = buildReadyPayload()
      const sig = await computeSignature(
        body,
        'some-other-secret-32-chars-minimum!',
        FAKE_NOW_SECONDS,
      )
      const header = `time=${FAKE_NOW_SECONDS},sig1=${sig}`
      const result = await verifySignature(body, header, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'mismatch' })
    })

    it('rejects a stale signature (> 5 minutes in the past)', async () => {
      const body = buildReadyPayload()
      const staleTime = FAKE_NOW_SECONDS - 301
      const sig = await computeSignature(body, SECRET, staleTime)
      const header = `time=${staleTime},sig1=${sig}`
      const result = await verifySignature(body, header, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'stale' })
    })

    it('rejects a signature from > 5 minutes in the future', async () => {
      const body = buildReadyPayload()
      const futureTime = FAKE_NOW_SECONDS + 301
      const sig = await computeSignature(body, SECRET, futureTime)
      const header = `time=${futureTime},sig1=${sig}`
      const result = await verifySignature(body, header, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'stale' })
    })

    it('rejects a missing header', async () => {
      const result = await verifySignature('{}', null, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'missing' })
    })

    it('rejects a malformed header', async () => {
      const result = await verifySignature('{}', 'garbage', SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'malformed' })
    })

    it('rejects a signature with wrong length (different hex length)', async () => {
      const body = buildReadyPayload()
      const header = `time=${FAKE_NOW_SECONDS},sig1=deadbeef`
      const result = await verifySignature(body, header, SECRET, FAKE_NOW_SECONDS)
      expect(result).toEqual({ ok: false, reason: 'mismatch' })
    })
  })

  describe('handleStreamWebhook', () => {
    function makeFetchFn(response: unknown, status = 200): ReturnType<typeof vi.fn> {
      return vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    async function signedHeader(body: string): Promise<string> {
      const sig = await computeSignature(body, SECRET, FAKE_NOW_SECONDS)
      return `time=${FAKE_NOW_SECONDS},sig1=${sig}`
    }

    it('enables downloads when a ready event arrives', async () => {
      const rawBody = buildReadyPayload()
      const header = await signedHeader(rawBody)
      const fetchFn = makeFetchFn({
        success: true,
        errors: [],
        result: { default: { status: 'ready' } },
      })
      const logger = makeLogger()

      // Freeze Date.now so verifySignature uses FAKE_NOW_SECONDS
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
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
      const header = await signedHeader(rawBody)
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
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
      const header = await signedHeader(rawBody)
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: fetchFn as unknown as typeof fetch,
      })

      expect(result.status).toBe(200)
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('rejects with 401 when signature is invalid', async () => {
      const rawBody = buildReadyPayload()
      const fetchFn = makeFetchFn({})
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: `time=${FAKE_NOW_SECONDS},sig1=${'0'.repeat(64)}`,
        secret: SECRET,
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
        rawBody: buildReadyPayload(),
        signatureHeader: null,
        secret: SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })
      expect(result.status).toBe(400)
    })

    it('returns 503 when webhook secret is missing', async () => {
      const logger = makeLogger()
      const result = await handleStreamWebhook({
        rawBody: buildReadyPayload(),
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
      const rawBody = buildReadyPayload()
      const header = await signedHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        accountId: undefined,
        apiKey: undefined,
        logger,
      })

      expect(result.status).toBe(503)
    })

    it('returns 500 when downstream Cloudflare API returns success: false', async () => {
      const rawBody = buildReadyPayload()
      const header = await signedHeader(rawBody)
      const fetchFn = makeFetchFn({
        success: false,
        errors: [{ message: 'Video not ready yet' }],
      })
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
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
      const header = await signedHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })

      expect(result.status).toBe(400)
    })

    it('returns 400 when payload fails schema validation', async () => {
      const rawBody = JSON.stringify({ uid: 'abc' }) // missing status
      const header = await signedHeader(rawBody)
      const logger = makeLogger()
      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
      })

      expect(result.status).toBe(400)
    })

    it('returns non-2xx on fetch timeout', async () => {
      const rawBody = buildReadyPayload()
      const header = await signedHeader(rawBody)
      const logger = makeLogger()

      // Mock fetch that hangs indefinitely (simulates slow Cloudflare API)
      const stallingFetchFn = vi.fn(
        () =>
          new Promise(() => {
            // Never resolves — simulate a stalled request
          }),
      )

      vi.spyOn(Date, 'now').mockReturnValue(FAKE_NOW_SECONDS * 1000)

      // The timeout should fire and cause fetchWithTimeout to reject.
      // With a 45s timeout in the real code, this test verifies the timeout
      // path by ensuring the handler doesn't wait forever and returns an error.
      const result = await handleStreamWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        accountId: 'test-account-id',
        apiKey: 'test-api-key',
        logger,
        fetchFn: stallingFetchFn as unknown as typeof fetch,
      })

      // On timeout, fetchWithTimeout throws, which is caught as a generic error
      // and returns 500 to signal Cloudflare to retry
      expect(result.status).toBe(500)
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Error enabling MP4 downloads via webhook' }),
      )
    })
  })
})
