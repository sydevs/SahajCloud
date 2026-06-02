/**
 * Cloudflare Stream webhook helpers (pure, no Payload / Next.js dependency).
 *
 * Kept in `src/plugins/storage` rather than co-located with the route handler
 * because Next.js App Router routes may only export specific named exports
 * (GET, POST, etc.) — arbitrary helper exports cause a build error.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
import { z } from 'zod'

import {
  CloudflareStreamDownloadsResponseSchema,
  CloudflareStreamWebhookPayloadSchema,
} from './cloudflareSchemas'

const FIVE_MINUTES_SECONDS = 300

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
 * Constant-time string comparison. Both strings MUST be equal length;
 * a length mismatch is never a valid signature anyway.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
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
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${parsed.time}.${rawBody}`),
  )
  const expectedHex = bufferToHex(signed)

  if (!constantTimeEqual(parsed.sig.toLowerCase(), expectedHex)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true }
}

/**
 * Pure webhook processor. No Payload or Next.js dependency — the route handler
 * is a thin wrapper. Callers can inject `fetchFn` for tests.
 */
export async function handleStreamWebhook(params: {
  rawBody: string
  signatureHeader: string | null | undefined
  secret: string | undefined
  accountId: string | undefined
  apiKey: string | undefined
  logger: WebhookLogger
  fetchFn?: typeof fetch
}): Promise<{ status: number; body: unknown }> {
  const { rawBody, signatureHeader, secret, accountId, apiKey, logger } = params
  const doFetch = params.fetchFn ?? fetch

  if (!secret) {
    logger.warn({ msg: 'Cloudflare Stream webhook secret not configured' })
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
    logger.error({
      msg: 'Cloudflare Stream reported processing error',
      uid,
      state: status.state,
      errorReasonCode: status.errorReasonCode,
      errorReasonText: status.errorReasonText,
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
    logger.error({
      msg: 'Cannot enable MP4 downloads — Cloudflare credentials not configured',
      uid,
    })
    return { status: 503, body: { error: 'Cloudflare credentials not configured' } }
  }

  try {
    const response = await doFetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    )

    const result = CloudflareStreamDownloadsResponseSchema.parse(await response.json())

    if (!result.success) {
      const errors = result.errors.map((e) => e.message).join(', ')
      logger.error({ msg: 'Failed to enable MP4 downloads', uid, errors })
      return { status: 500, body: { error: 'Failed to enable downloads' } }
    }

    const downloadStatus = result.result?.default?.status ?? 'unknown'
    logger.info({ msg: 'MP4 downloads enabled via webhook', uid, status: downloadStatus })
    return { status: 200, body: { ok: true, action: 'downloads-enabled', downloadStatus } }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({
        msg: 'Cloudflare downloads API response validation failed',
        uid,
        issues: error.issues,
      })
      return { status: 500, body: { error: 'Invalid downstream response' } }
    }

    logger.error({
      msg: 'Error enabling MP4 downloads via webhook',
      uid,
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: 500, body: { error: 'Failed to enable downloads' } }
  }
}
