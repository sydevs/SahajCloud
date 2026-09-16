/**
 * The retention policy's own invariants — the ones that make the windows safe
 * to change, and the ones whose breach is silent.
 */
import { describe, expect, it } from 'vitest'

import {
  CONTACT_ACCEPTED_DAYS,
  DURABLE_TYPES,
  MACHINE_SPAM_DAYS,
  PROPOSAL_DAYS,
  PURGE_WINDOWS,
} from '@/jobs/PurgeSubmissions/retention'
import { HISTORY_WINDOW_HOURS, REPEAT_SENDER_MAX } from '@/jobs/ScreenSubmissions/senderHistory'

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

  /**
   * ⚠ This asserts the **sweep**, not a table beside it. The version that
   * asserted a `RETENTION_DAYS` table passed while the spam window deleted a
   * `rejected` registration at 90 days, because nothing read the table. A
   * window reaches a durable type by naming it, or by naming no type at all —
   * so both shapes have to fail here.
   */
  it('lets no window reach a registration or a subscription', () => {
    expect([...DURABLE_TYPES].sort()).toEqual(['registration', 'subscribe'])

    for (const window of PURGE_WINDOWS) {
      const where = window.where(new Date().toISOString()) as {
        type?: { equals?: string; in?: string[]; not_in?: string[] }
      }

      for (const durable of DURABLE_TYPES) {
        const reachable =
          where.type == null ||
          where.type.equals === durable ||
          (where.type.in?.includes(durable) ?? false) ||
          (where.type.not_in != null && !where.type.not_in.includes(durable))
        expect(reachable, `${window.name} may not select a ${durable} row`).toBe(false)
      }
    }
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

  /**
   * ⚠ The whole return on spelling a machine refusal `spam`. A decline is
   * `rejected` and goes with the rest of its type at 30 days; only a machine
   * refusal waits out the 90-day evidence window. While both were `rejected`,
   * nothing cheap could tell them apart and a decline got 90 days too.
   *
   * Each status reaching exactly one window is also what keeps the windows
   * disjoint, so a row cannot be counted twice by a sweep.
   */
  it('sends a declined proposal to the proposal window and a spam one to the spam window', () => {
    const selects = (name: string) => {
      const window = PURGE_WINDOWS.find((candidate) => candidate.name === name)
      const where = window?.where(new Date().toISOString()) as {
        status?: { equals?: string; in?: string[] }
      }
      return where.status?.in ?? (where.status?.equals ? [where.status.equals] : [])
    }

    expect(selects('proposals')).toContain('rejected')
    expect(selects('proposals')).not.toContain('spam')
    expect(selects('machineSpam')).toEqual(['spam'])
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
