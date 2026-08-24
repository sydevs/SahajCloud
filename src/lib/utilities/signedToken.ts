import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Generic HMAC-signed, self-contained token for logged-out email links —
 * `<base64url(json claims + exp)>.<base64url(hmac-sha256)>`, signed with the
 * Payload `secret`, no server-side store. The same construction as the event
 * verify-link token (`@/lib/eventVerification/token`), generalized so new
 * link kinds (submission review, registration feedback) don't each hand-roll
 * crypto. A `kind` discriminator is baked into the claims so a token signed
 * for one link type can never be replayed against another.
 *
 * Pure (clock injected) — unit-testable without env or Payload.
 */

export interface SignedTokenOptions {
  /** Discriminates link types; verification requires an exact match. */
  kind: string
  ttlMs: number
}

interface Envelope {
  kind: string
  exp: number
  claims: Record<string, unknown>
}

function hmac(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Sign claims into a token. `now` is injectable for deterministic tests. */
export function signToken(
  claims: Record<string, unknown>,
  options: SignedTokenOptions,
  secret: string,
  now: Date = new Date(),
): string {
  const envelope: Envelope = {
    kind: options.kind,
    exp: now.getTime() + options.ttlMs,
    claims,
  }
  const payloadB64 = Buffer.from(JSON.stringify(envelope)).toString('base64url')
  return `${payloadB64}.${hmac(payloadB64, secret)}`
}

export type SignedTokenResult<T> =
  | { status: 'valid'; claims: T }
  | { status: 'expired' }
  | { status: 'invalid' }

/**
 * Verify a token's signature, kind, and expiry. The claims are returned
 * as-parsed — the caller narrows them (they were self-signed, so shape is
 * trusted once the signature checks out).
 */
export function verifyToken<T = Record<string, unknown>>(
  token: string | null | undefined,
  kind: string,
  secret: string,
  now: Date = new Date(),
): SignedTokenResult<T> {
  if (!token) return { status: 'invalid' }
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return { status: 'invalid' }

  const expected = hmac(payloadB64, secret)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { status: 'invalid' }
  }

  let envelope: Envelope
  try {
    envelope = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Envelope
  } catch {
    return { status: 'invalid' }
  }
  if (envelope.kind !== kind || typeof envelope.exp !== 'number') return { status: 'invalid' }
  if (envelope.exp <= now.getTime()) return { status: 'expired' }
  return { status: 'valid', claims: envelope.claims as T }
}
