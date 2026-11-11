import type { Mock } from 'vitest'

/**
 * What a capture handed the SDK. Every spec asserting on a Sentry report reads
 * this shape, and the two capture bodies pass the same object to
 * `captureException` and `captureMessage`, so there is one reader for both.
 */
export interface CapturedContext {
  extra?: Record<string, unknown>
  fingerprint?: string[]
  level?: string
  tags?: Record<string, string>
  user?: Record<string, string>
}

/** The context a mocked `captureException` / `captureMessage` saw on its latest call. */
export const capturedFrom = (mock: Mock): CapturedContext =>
  (mock.mock.calls.at(-1)?.[1] ?? {}) as CapturedContext
