import { timingSafeEqual } from 'node:crypto'

/**
 * Compare two strings without leaking where they first differ.
 *
 * ⚠ **A length mismatch returns early, and that is deliberate.** The length of
 * a secret is not itself a secret, and `timingSafeEqual` throws on unequal
 * buffers rather than answering. The check is on BYTE length, not
 * `String.length` — two strings of equal length can encode to different byte
 * counts, and that difference would throw instead of returning false.
 *
 * ⚠ **Node only.** `src/middleware.ts` runs on Next.js's edge runtime, where
 * `node:crypto` is unavailable. Do not import this there.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
