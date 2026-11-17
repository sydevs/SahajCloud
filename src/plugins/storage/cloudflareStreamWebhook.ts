/**
 * Cloudflare Stream webhook helpers. No Payload dependency.
 *
 * Kept in `src/plugins/storage` rather than co-located with the route handler
 * because Next.js App Router routes may only export specific named exports
 * (GET, POST, etc.) — arbitrary helper exports cause a build error.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
import { timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import type { CaptureLevel } from '@/plugins/sentry/capture'
import { capture, handlerTags } from '@/plugins/sentry/capture'

import {
  CloudflareStreamDownloadsResponseSchema,
  CloudflareStreamWebhookPayloadSchema,
} from './cloudflareSchemas'
import { isProductionDeployment } from './previewIsolation'

const FIVE_MINUTES_SECONDS = 300

/** Every report this webhook sends (#1182). */
const HANDLER_TAGS = handlerTags('cloudflare-stream-webhook')

/**
 * A missing secret or credential is the deployment's own gap: an answer on a
 * preview or locally, where nothing configures them, and an incident in
 * production. Same rule as a job's (`src/jobs/TranscribeRecording/`).
 */
const configGapLevel = (): CaptureLevel => (isProductionDeployment() ? 'error' : 'warning')

/**
 * Compare two strings without leaking where they first differ.
 *
 * ⚠ **A length mismatch returns early, and that is deliberate.** The length of a
 * secret is not itself a secret, and `timingSafeEqual` throws on unequal buffers
 * rather than answering. The check is on BYTE length, not `String.length` — two
 * strings of equal length can encode to different byte counts, and that
 * difference would throw instead of returning false.
 *
 * Local because this is the only caller. It lived in `@/lib/utilities` while the
 * preview-secret exchange shared it; that route is gone (#840).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type VerifyFailure = {
  ok: false
  reason: 'missing' | 'malformed' | 'stale' | 'mismatch'
}
export type VerifyResult = { ok: true } | VerifyFailure

export interface WebhookLogger {
  info: (obj: object) => void
  warn: (obj: object) => void
  error: (obj: object) => void
}

/**
 * Parse a `Webhook-Signature: time=<unix>,sig1=<hex>` header.
 * Tolerates extra segments (e.g. `sig2=...`) and is case-insensitive on keys.
 */
export function parseSignatureHeader(
  header: string | null | undefined,
): { time: number; sig: string } | null {
  if (!header || typeof header !== 'string') return null

  const parts = header.split(',')
  let time: number | null = null
  let sig: string | null = null

  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) return null
    const key = part.slice(0, idx).trim().toLowerCase()
    const value = part.slice(idx + 1).trim()
    if (!value) return null

    if (key === 'time') {
      if (!/^\d+$/.test(value)) return null
      time = parseInt(value, 10)
    } else if (key === 'sig1') {
      sig = value
    }
  }

  if (time === null || sig === null) return null
  return { time, sig }
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Verify a Cloudflare Stream webhook signature using HMAC-SHA256 over
 * `{time}.{rawBody}`. Uses Web Crypto (`crypto.subtle`) so it runs identically
 * in Workers, Node 20+, and Vitest.
 */
export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!signatureHeader) return { ok: false, reason: 'missing' }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) return { ok: false, reason: 'malformed' }

  if (Math.abs(nowSeconds - parsed.time) > FIVE_MINUTES_SECONDS) {
    return { ok: false, reason: 'stale' }
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${parsed.time}.${rawBody}`))
  const expectedHex = bufferToHex(signed)

  if (!constantTimeEqual(parsed.sig.toLowerCase(), expectedHex)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true }
}

/**
 * The webhook processor. The route handler is a thin wrapper. Callers can inject
 * `fetchFn` for tests, and `onReady` for the work a ready video starts beyond
 * its downloads.
 *
 * ⚠ **Every branch that answers 5xx, or 200 after recording an upstream
 * failure, reports for itself** (#1182). Cloudflare reads the status code and
 * retries; the signature 400s stay silent, because a caller's mistake is not an
 * incident (#670).
 */
export async function handleStreamWebhook(params: {
  rawBody: string
  signatureHeader: string | null | undefined
  secret: string | undefined
  accountId: string | undefined
  apiKey: string | undefined
  logger: WebhookLogger
  fetchFn?: typeof fetch
  /** Timeout for the MP4-downloads-enable call (default 45s). Overridable in tests. */
  downloadsTimeoutMs?: number
  /**
   * Called once downloads are enabled for a ready video — the moment its MP4,
   * and so its transcript, can exist (#1016). A throw is logged and never fails
   * the webhook: Cloudflare would retry the whole delivery for a transcript,
   * and the transcript's own panel offers the retry instead.
   */
  onReady?: (uid: string) => Promise<void>
}): Promise<{ status: number; body: unknown }> {
  const {
    rawBody,
    signatureHeader,
    secret,
    accountId,
    apiKey,
    logger,
    fetchFn,
    downloadsTimeoutMs = 45_000,
    onReady,
  } = params

  if (!secret) {
    capture({
      message: 'Cloudflare Stream webhook secret not configured',
      level: configGapLevel(),
      logger,
      tags: HANDLER_TAGS,
    })
    return { status: 503, body: { error: 'Webhook secret not configured' } }
  }

  const verification = await verifySignature(rawBody, signatureHeader, secret)
  if (!verification.ok) {
    const reason = verification.reason
    logger.warn({ msg: 'Cloudflare Stream webhook signature verification failed', reason })

    if (reason === 'missing' || reason === 'malformed') {
      return { status: 400, body: { error: `Bad signature header: ${reason}` } }
    }
    if (reason === 'stale') {
      return { status: 401, body: { error: 'Stale signature' } }
    }
    return { status: 401, body: { error: 'Invalid signature' } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const validation = CloudflareStreamWebhookPayloadSchema.safeParse(parsed)
  if (!validation.success) {
    logger.warn({
      msg: 'Cloudflare Stream webhook payload validation failed',
      issues: validation.error.issues,
    })
    return { status: 400, body: { error: 'Invalid webhook payload' } }
  }

  const payload = validation.data
  const { uid, status } = payload

  if (status.state === 'error') {
    capture({
      message: 'Cloudflare Stream reported processing error',
      extra: {
        uid,
        state: status.state,
        errorReasonCode: status.errorReasonCode,
        errorReasonText: status.errorReasonText,
      },
      level: 'error',
      logger,
      tags: HANDLER_TAGS,
    })
    return { status: 200, body: { ok: true, action: 'logged-error' } }
  }

  if (status.state !== 'ready') {
    logger.info({
      msg: 'Cloudflare Stream webhook received for non-terminal state; ignoring',
      uid,
      state: status.state,
    })
    return { status: 200, body: { ok: true, action: 'ignored' } }
  }

  if (!accountId || !apiKey) {
    capture({
      message: 'Cannot enable MP4 downloads — Cloudflare credentials not configured',
      extra: { uid },
      level: configGapLevel(),
      logger,
      tags: HANDLER_TAGS,
    })
    return { status: 503, body: { error: 'Cloudflare credentials not configured' } }
  }

  try {
    // Enable MP4 downloads with a bounded timeout so a stalled Cloudflare API
    // can't hang the webhook: on timeout `AbortSignal.timeout` aborts the fetch,
    // the catch below returns a non-2xx, and Cloudflare retries. `fetchFn` is
    // injected in tests; it defaults to the global `fetch` in production.
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`
    const response = await (fetchFn ?? fetch)(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(downloadsTimeoutMs),
    })

    const result = CloudflareStreamDownloadsResponseSchema.parse(await response.json())

    if (!result.success) {
      const errors = result.errors.map((e) => e.message).join(', ')
      capture({
        message: 'Failed to enable MP4 downloads',
        extra: { uid, errors },
        level: 'error',
        logger,
        tags: HANDLER_TAGS,
      })
      return { status: 500, body: { error: 'Failed to enable downloads' } }
    }

    const downloadStatus = result.result?.default?.status ?? 'unknown'
    logger.info({ msg: 'MP4 downloads enabled via webhook', uid, status: downloadStatus })
    if (onReady) {
      await onReady(uid).catch((error: unknown) => {
        capture({
          error,
          message: 'Stream video ready, but its follow-up work failed',
          extra: { uid },
          logger,
          tags: HANDLER_TAGS,
        })
      })
    }
    return { status: 200, body: { ok: true, action: 'downloads-enabled', downloadStatus } }
  } catch (error) {
    if (error instanceof z.ZodError) {
      capture({
        error,
        message: 'Cloudflare downloads API response validation failed',
        extra: { uid, issues: error.issues },
        logger,
        tags: HANDLER_TAGS,
      })
      return { status: 500, body: { error: 'Invalid downstream response' } }
    }

    capture({
      error,
      message: 'Error enabling MP4 downloads via webhook',
      extra: { uid },
      logger,
      tags: HANDLER_TAGS,
    })
    return { status: 500, body: { error: 'Failed to enable downloads' } }
  }
}
