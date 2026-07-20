/**
 * Unit tests for the session-reminder exactly-once ledger helpers. Pure — no
 * Payload, no DB.
 */
import { describe, expect, it } from 'vitest'

import { asReminderLog, hasReminderFor } from '@/jobs/RegistrationNotifications/reminderLedger'

describe('reminder ledger', () => {
  describe('asReminderLog', () => {
    it('returns [] for non-array / nullish values', () => {
      expect(asReminderLog(null)).toEqual([])
      expect(asReminderLog(undefined)).toEqual([])
      expect(asReminderLog('nope')).toEqual([])
      expect(asReminderLog({})).toEqual([])
    })

    it('keeps well-formed entries and drops malformed ones', () => {
      const raw = [
        { occurrence: '2026-07-21T10:00:00.000Z', sentAt: '2026-07-20T10:00:00.000Z' },
        { sentAt: 'no-occurrence' },
        42,
        null,
      ]
      expect(asReminderLog(raw)).toEqual([
        { occurrence: '2026-07-21T10:00:00.000Z', sentAt: '2026-07-20T10:00:00.000Z' },
      ])
    })
  })

  describe('hasReminderFor', () => {
    const log = [{ occurrence: '2026-07-21T10:00:00.000Z', sentAt: '2026-07-20T10:00:00.000Z' }]

    it('is true only for a logged occurrence', () => {
      expect(hasReminderFor(log, '2026-07-21T10:00:00.000Z')).toBe(true)
      expect(hasReminderFor(log, '2026-07-22T10:00:00.000Z')).toBe(false)
      expect(hasReminderFor([], '2026-07-21T10:00:00.000Z')).toBe(false)
    })
  })
})
