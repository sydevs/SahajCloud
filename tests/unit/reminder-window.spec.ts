/**
 * The reminder window's two expressions, held against each other.
 *
 * `SendSessionReminders` filters occurrence starts in memory and selects
 * registrations on `startingAt` in SQL. One rule, so the matrix below drives
 * both and compares verdicts: make either bound inclusive on its own and the
 * query drops rows the predicate would still remind, with nothing but missing
 * reminders to show it. Same arrangement as `registration-active.spec.ts`.
 */
import type { Where } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  REMINDER_WINDOW_MS,
  reminderWindow,
  reminderWindowWhere,
  withinReminderWindow,
} from '@/jobs/RegistrationNotifications/reminderWindow'

const NOW = new Date('2026-11-03T19:00:00.000Z')
const WINDOW = reminderWindow(NOW)

/** Each comparison a bound may be stated as, so a flipped operator is evaluated, not ignored. */
const COMPARISONS: Record<string, (value: string, bound: string) => boolean> = {
  greater_than: (value, bound) => value > bound,
  greater_than_equal: (value, bound) => value >= bound,
  less_than: (value, bound) => value < bound,
  less_than_equal: (value, bound) => value <= bound,
}

/**
 * Read the `Where` back as a predicate, whatever operators it states.
 *
 * String comparison is the right one here: `toISOString()` emits one
 * zero-padded UTC format, so lexicographic order is chronological order —
 * which is also what Postgres compares these bounds as.
 */
function admittedBySql(where: Where, field: string, iso: string): boolean {
  const clauses = where.and as Record<string, Record<string, string>>[]
  return clauses.every((clause) => {
    const [operator, bound] = Object.entries(clause[field]!)[0]!
    const compare = COMPARISONS[operator]
    if (!compare) throw new Error(`the window no longer bounds ${field} with a comparison`)
    return compare(iso, bound)
  })
}

/** Every boundary the half-open interval can be got wrong at. */
const INSTANTS: [label: string, iso: string][] = [
  ['a millisecond before the window opens', new Date(WINDOW.start.getTime() - 1).toISOString()],
  ['the instant the window opens', WINDOW.start.toISOString()],
  ['a millisecond after the window opens', new Date(WINDOW.start.getTime() + 1).toISOString()],
  ['midway through the window', new Date(WINDOW.start.getTime() + 12 * 3600_000).toISOString()],
  ['a millisecond before the window closes', new Date(WINDOW.end.getTime() - 1).toISOString()],
  ['the instant the window closes', WINDOW.end.toISOString()],
  ['a millisecond after the window closes', new Date(WINDOW.end.getTime() + 1).toISOString()],
]

describe('reminderWindow', () => {
  it('opens at the run clock and closes a reminder window later', () => {
    expect(WINDOW.start).toEqual(NOW)
    expect(WINDOW.end.getTime() - NOW.getTime()).toBe(REMINDER_WINDOW_MS)
  })

  it('reminds 24h ahead', () => {
    expect(REMINDER_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('withinReminderWindow', () => {
  /** A session starting exactly now has begun, so it is never reminded. */
  it('excludes the instant the window opens', () => {
    expect(withinReminderWindow(WINDOW.start, WINDOW)).toBe(false)
  })

  /** Runs are hourly, so a closing-instant session dropped here is never reminded. */
  it('includes the instant the window closes', () => {
    expect(withinReminderWindow(WINDOW.end, WINDOW)).toBe(true)
  })

  it('reads a Date, an ISO string and epoch milliseconds alike', () => {
    const inside = new Date(WINDOW.start.getTime() + 3600_000)
    expect(withinReminderWindow(inside, WINDOW)).toBe(true)
    expect(withinReminderWindow(inside.toISOString(), WINDOW)).toBe(true)
    expect(withinReminderWindow(inside.getTime(), WINDOW)).toBe(true)
  })
})

describe('reminderWindowWhere', () => {
  it.each(INSTANTS)('agrees with the predicate on %s', (_label, iso) => {
    const inSql = admittedBySql(reminderWindowWhere('startingAt', WINDOW), 'startingAt', iso)
    expect({ iso, inSql }).toEqual({ iso, inSql: withinReminderWindow(iso, WINDOW) })
  })

  it('bounds the column it is given, and no other', () => {
    const where = reminderWindowWhere('occurredAt', WINDOW)
    expect(where.and).toEqual([
      { occurredAt: { greater_than: WINDOW.start.toISOString() } },
      { occurredAt: { less_than_equal: WINDOW.end.toISOString() } },
    ])
  })
})
