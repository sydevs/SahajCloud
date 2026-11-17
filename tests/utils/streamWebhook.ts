/**
 * Fixtures for the Cloudflare Stream webhook processor, shared by the two specs
 * that drive it — one over the answers it returns, one over what it reports.
 *
 * A second copy of the signature could sign differently from the verifier
 * without either spec noticing, and the secret and the frozen clock have to
 * match the header for any of it to verify.
 */
import { createHmac } from 'node:crypto'

export const STREAM_SECRET = 'test-webhook-signing-secret-with-32-plus-chars'

/** The instant both specs freeze `Date.now()` to, so a signed header is fresh. */
export const STREAM_NOW_SECONDS = 1_750_000_000

/**
 * The signature Cloudflare computes: HMAC-SHA256 over `{time}.{rawBody}`, hex.
 *
 * `node:crypto`, not the `crypto.subtle` dance the verifier runs — the unit lane
 * is node-only, and a fixture owes the plain spelling of what it asserts.
 */
export const computeStreamSignature = (rawBody: string, secret: string, time: number): string =>
  createHmac('sha256', secret).update(`${time}.${rawBody}`).digest('hex')

/** That signature as the full `Webhook-Signature` header value. */
export const streamSignatureHeader = (
  rawBody: string,
  secret: string = STREAM_SECRET,
  time: number = STREAM_NOW_SECONDS,
): string => `time=${time},sig1=${computeStreamSignature(rawBody, secret, time)}`

export const STREAM_UID = 'test-video-uid-abc123'

/** A delivery for a video Cloudflare has finished transcoding. */
export const readyStreamPayload = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    uid: STREAM_UID,
    readyToStream: true,
    status: { state: 'ready', pctComplete: '100.000000' },
    ...overrides,
  })

/**
 * A `fetchFn` answering the downloads call with `body`.
 *
 * ⚠ **A fresh `Response` per call.** A body is single-use, so one captured
 * instance serves exactly one test and then reads empty — which `clearAllMocks`
 * does not restore.
 */
export const streamFetchAnswering = (body: unknown, status = 200): typeof fetch =>
  (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as unknown as typeof fetch

/** The downloads call succeeding, which is the path a ready video takes. */
export const STREAM_DOWNLOADS_ENABLED = {
  success: true,
  errors: [],
  result: { default: { status: 'ready' } },
}
