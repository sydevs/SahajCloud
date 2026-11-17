/**
 * The `Webhook-Signature` header Cloudflare Stream sends, computed the way it
 * computes it: HMAC-SHA256 over `{time}.{rawBody}`, hex.
 *
 * Shared because two specs drive the webhook — one over the whole processor's
 * answers, one over what it reports — and a second copy of this could sign
 * differently from the verifier without either noticing.
 */
export async function computeStreamSignature(
  rawBody: string,
  secret: string,
  time: number,
): Promise<string> {
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

/** That signature as the full header value. */
export const streamSignatureHeader = async (
  rawBody: string,
  secret: string,
  time: number,
): Promise<string> => `time=${time},sig1=${await computeStreamSignature(rawBody, secret, time)}`
