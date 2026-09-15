/**
 * The retention policy's own invariants — the ones that make the windows safe
 * to change, and the ones whose breach is silent.
 */
import { describe, expect, it } from 'vitest'

import {
  CONTACT_ACCEPTED_DAYS,
  DURABLE_TYPES,
  HISTORY_WINDOW_HOURS,
  MACHINE_SPAM_DAYS,
  PROPOSAL_DAYS,
  PURGE_WINDOWS,
  RETENTION_DAYS,
} from '@/jobs/PurgeSubmissions/retention'
import { REPEAT_SENDER_MAX } from '@/jobs/ScreenSubmissions/senderHistory'

describe('Submission retention', () => {
  /**
   * The failure this pins is invisible at runtime: with retention shorter than
   * the screening window, the sender-history read finds nothing, counts zero,
   * and passes every submission. No error, no log line — screening just stops
   * working. So the relationship is asserted rather than left to a comment.
   */
  it('keeps contact rows well past the screening window', () => {
    expect(CONTACT_ACCEPTED_DAYS * 24).toBeGreaterThan(HISTORY_WINDOW_HOURS * 2)
  })

  it('keeps evidence longer than it keeps delivered mail', () => {
    expect(MACHINE_SPAM_DAYS).toBeGreaterThan(CONTACT_ACCEPTED_DAYS)
    expect(MACHINE_SPAM_DAYS).toBeGreaterThan(PROPOSAL_DAYS)
  })

  it('keeps a registration and a subscription forever', () => {
    expect(RETENTION_DAYS.registration).toBeNull()
    expect(RETENTION_DAYS.subscribe).toBeNull()
    // The same two types, said the other way: they are what pin a `users` row.
    expect([...DURABLE_TYPES].sort()).toEqual(['registration', 'subscribe'])
  })

  /**
   * `failed` means we accepted a submission, told the person nothing, and never
   * delivered it — the one state where deleting the row destroys the only
   * record that anything went wrong. No window may select it.
   */
  it('never purges a failed row', () => {
    for (const window of PURGE_WINDOWS) {
      const where = window.where(new Date().toISOString()) as {
        status?: { equals?: string; in?: string[] }
      }
      const selected = where.status?.in ?? (where.status?.equals ? [where.status.equals] : [])
      expect(selected).not.toContain('failed')
      expect(selected).not.toContain('pending')
    }
  })

  it('sweeps the longest window first, so the windows cannot overlap by accident', () => {
    const days = PURGE_WINDOWS.map((window) => window.days)
    expect(days[0]).toBe(Math.max(...days))
  })

  /**
   * A sender reaches `repeat_sender` only after several refusals, and each of
   * those rows has to still exist to be counted. The spam window is what keeps
   * them, so it must outlast the run of refusals it is counting.
   */
  it('keeps refused rows long enough for the repeat-sender threshold to be reachable', () => {
    expect(MACHINE_SPAM_DAYS * 24).toBeGreaterThan(HISTORY_WINDOW_HOURS * REPEAT_SENDER_MAX)
  })
})
