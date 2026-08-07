import { createHash } from 'node:crypto'

import { z } from 'zod'

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

/** Jurisdictions a bucket can be bound to, each reachable at its own host. */
export const R2_JURISDICTIONS = ['eu', 'fedramp'] as const
export type R2Jurisdiction = (typeof R2_JURISDICTIONS)[number]

/**
 * S3 endpoint for an account's buckets.
 *
 * A bucket created with a jurisdiction is reachable **only** through that
 * jurisdiction's host. Addressing it on the default host doesn't 404 — it
 * answers `AccessDenied`, which reads as a permissions problem and sends you
 * off auditing token scopes instead of the URL.
 * https://developers.cloudflare.com/r2/reference/data-location/
 */
export function r2S3Endpoint(accountId: string, jurisdiction?: string | null): string {
  if (!jurisdiction) return `https://${accountId}.r2.cloudflarestorage.com`
  if (!R2_JURISDICTIONS.includes(jurisdiction as R2Jurisdiction)) {
    // Otherwise this builds a plausible-looking host that fails at DNS.
    throw new Error(
      `Unknown R2 jurisdiction "${jurisdiction}" — expected one of: ${R2_JURISDICTIONS.join(', ')}`,
    )
  }
  return `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
}

/**
 * The Secret Access Key for an API token: the SHA-256 of its **value**.
 *
 * Hex, not base64 — R2 rejects any other encoding of the same digest, and the
 * failure surfaces as an opaque SignatureDoesNotMatch rather than anything
 * naming the encoding.
 */
export const r2SecretAccessKey = (apiToken: string): string =>
  createHash('sha256').update(apiToken).digest('hex')

const TokenVerifySchema = z.object({
  success: z.boolean(),
  // `.min(1)`: an empty id would reach the S3 client as a blank access key and
  // fail as SignatureDoesNotMatch, which names neither the token nor the cause.
  result: z.object({ id: z.string().min(1) }).nullish(),
})

/** Issues an authenticated `GET` against the Cloudflare API and returns the parsed body. */
export type CloudflareGet = (path: string) => Promise<unknown>

/**
 * The **Access Key ID** for an API token: the token's own id.
 *
 * Only the token's value is in the environment, so the id has to be looked up —
 * and *which* endpoint answers depends on how the token was created. Cloudflare
 * issues two kinds, and each is verifiable under one scope only:
 *
 * - **account-owned** (what it recommends for services, since they outlive any
 *   one person) → `/accounts/<id>/tokens/verify`
 * - **user-owned** → `/user/tokens/verify`
 *
 * The value alone doesn't say which it is, and asking the wrong one answers
 * `Invalid API Token` — indistinguishable from a genuinely bad token. So try
 * both before concluding anything.
 */
export async function r2AccessKeyId(accountId: string, cfGet: CloudflareGet): Promise<string> {
  const scopes = [`/accounts/${accountId}/tokens/verify`, '/user/tokens/verify']

  for (const path of scopes) {
    const parsed = TokenVerifySchema.safeParse(await cfGet(path))
    if (parsed.success && parsed.data.success && parsed.data.result) {
      return parsed.data.result.id
    }
  }

  throw new Error(
    `Could not resolve the API token's id — neither ${scopes.join(' nor ')} accepted it. ` +
      'Check CLOUDFLARE_API_KEY is valid and carries R2 Object Read & Write.',
  )
}
