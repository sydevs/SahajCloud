import type { Payload } from 'payload'

import { vi } from 'vitest'

/** The message fields a sender spec asserts on. */
export interface SentMessage {
  to: string
  from: string
  subject: string
  html: string
  replyTo?: string
}

/**
 * A `payload` stand-in for a unit spec that only sends email — no bootstrap, no
 * DB, no SMTP.
 *
 * `findGlobal` rejects because the unit lane has no translations global to read;
 * `resolveEmailStrings` catches that and falls back to the English defaults,
 * which is what a spec asserting an envelope needs. `secret` is a real-length
 * string because `signUnsubscribeToken` derives a key from it.
 */
export function stubEmailPayload(): {
  payload: Payload
  sendEmail: ReturnType<typeof vi.fn<(message: SentMessage) => Promise<undefined>>>
} {
  const sendEmail = vi.fn(async (_message: SentMessage) => undefined)

  const stub = {
    sendEmail,
    findGlobal: vi.fn(async () => {
      throw new Error('no translations global in the unit lane')
    }),
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    secret: 'test-secret-key-with-32-chars-minimum',
  }

  return { payload: stub as unknown as Payload, sendEmail }
}
