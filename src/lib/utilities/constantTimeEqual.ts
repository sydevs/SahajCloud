/**
 * Compare two strings without leaking where they first differ.
 *
 * ⚠ **A length mismatch returns early, and that is deliberate.** The length of
 * a secret is not itself a secret, and `node:crypto.timingSafeEqual` throws on
 * unequal buffers rather than answering.
 *
 * Char codes rather than buffers, so it runs identically in Workers, Node and
 * Vitest — `cloudflareStreamWebhook` verifies a signature inside a Worker
 * runtime with no `node:crypto`.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
