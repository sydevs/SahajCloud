import { createHash } from 'node:crypto'

/**
 * R2's S3-compatible API, addressed from a Cloudflare API token.
 *
 * R2's `Object Read & Write` permission is honoured **only** by the
 * S3-compatible API, which signs with AWS SigV4 — the Cloudflare REST API
 * rejects object-scoped tokens outright (`10002 Unauthorized`, or `10000
 * Authentication error` when the token is bucket-scoped). So an S3 client is
 * the only way in, and it needs an access-key pair rather than a bearer token.
 *
 * Cloudflare's documented bridge is to derive that pair from the token itself:
 * https://developers.cloudflare.com/r2/api/tokens/
 */

/** Default S3 endpoint for an account's buckets (no jurisdiction). */
export const r2S3Endpoint = (accountId: string): string =>
  `https://${accountId}.r2.cloudflarestorage.com`

/**
 * The Secret Access Key for an API token: the SHA-256 of its **value**.
 *
 * Hex, not base64 — R2 rejects any other encoding of the same digest, and the
 * failure surfaces as an opaque SignatureDoesNotMatch rather than anything
 * naming the encoding.
 */
export const r2SecretAccessKey = (apiToken: string): string =>
  createHash('sha256').update(apiToken).digest('hex')
