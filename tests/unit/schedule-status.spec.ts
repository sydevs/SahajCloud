/**
 * Tests for the finished-event definition (#603).
 *
 * `shouldFinish` (in-memory, used by the ExpireEvents sweep and the
 * registration gate) and `notFinishedWhere` (SQL, used by the public feeds) must
 * decide "has this schedule run out?" identically. The final block pins that
 * agreement across a matrix — the two are separate implementations because a
 * `where` can't call a function, so nothing but a test keeps them honest.
 */
import type { Where } from 'payload'

import { describe, expect, it } from 'vitest'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'
import { lastOccurrenceEnd } from '@/lib/schedule/scheduleHooks'
import { shouldFinish } from '@/lib/schedule/scheduleStatus'

const NOW = new Date('2026-06-11T02:00:00.000Z')

const ONE_OFF_PAST = { firstDate: '2025-03-15T14:00:00.000Z', firstDate_tz: 'UTC' }
const ONE_OFF_FUTURE = { firstDate: '2027-03-15T14:00:00.000Z', firstDate_tz: 'UTC' }

describe('shouldFinish', () => {
  it('finishes a one-off whose date has passed', () => {
    expect(shouldFinish({ schedule: ONE_OFF_PAST }, NOW)).toBe(true)
  })

  it('does not finish a one-off still ahead of us', () => {
    expect(shouldFinish({ schedule: ONE_OFF_FUTURE }, NOW)).toBe(false)
  })

  it('does not finish an open-ended recurrence', () => {
    expect(
      shouldFinish({ schedule: { ...ONE_OFF_PAST, recurrenceType: 'DAILY', interval: 1 } }, NOW),
    ).toBe(false)
  })

  it('finishes a course whose final occurrence has passed', () => {
    expect(
      shouldFinish(
        {
          schedule: {
            ...ONE_OFF_PAST,
            recurrenceType: 'DAILY',
            interval: 1,
            endingType: 'count',
            count: 3,
          },
        },
        NOW,
      ),
    ).toBe(true)
  })

  it('does not finish a course still running', () => {
    expect(
      shouldFinish(
        {
          schedule: {
            ...ONE_OFF_PAST,
            recurrenceType: 'WEEKLY',
            interval: 1,
            endingType: 'until',
            untilDate: '2027-01-01',
          },
        },
        NOW,
      ),
    ).toBe(false)
  })

  // The MAX_MONTHS_AHEAD false positive the old upcomingDates check suffered
  // from: a yearly cadence has no occurrence in the next 6 months, so it read
  // as finished while it was still running.
  it('does not finish a monthly-every-12-months event', () => {
    expect(
      shouldFinish(
        {
          schedule: {
            ...ONE_OFF_PAST,
            recurrenceType: 'MONTHLY',
            interval: 12,
            monthlyMode: 'date',
            monthDay: 15,
          },
        },
        NOW,
      ),
    ).toBe(false)
  })

  it('never finishes an inactive event, even with a stale past firstDate', () => {
    expect(shouldFinish({ inactive: true, schedule: ONE_OFF_PAST }, NOW)).toBe(false)
  })

  it('never finishes an event with no schedule', () => {
    expect(shouldFinish({ schedule: null }, NOW)).toBe(false)
    expect(shouldFinish({ schedule: {} }, NOW)).toBe(false)
    expect(shouldFinish({}, NOW)).toBe(false)
  })

  it('keeps an event live until midnight in its own timezone', () => {
    // 02:00Z on Jun 11. A New York event dated Jun 10 is still on its own local
    // day (22:00 EDT Jun 10); the same date in UTC is already over.
    const justAfterUtcMidnight = new Date('2026-06-11T02:00:00.000Z')
    const dayOf = '2026-06-10T16:00:00.000Z'

    expect(
      shouldFinish({ schedule: { firstDate: dayOf, firstDate_tz: 'UTC' } }, justAfterUtcMidnight),
    ).toBe(true)
    expect(
      shouldFinish(
        { schedule: { firstDate: dayOf, firstDate_tz: 'America/New_York' } },
        justAfterUtcMidnight,
      ),
    ).toBe(false)
  })
})

describe('notFinishedWhere', () => {
  it('is an OR of the inactive escape, a null lastDate, and a future lastDate', () => {
    expect(notFinishedWhere(NOW)).toEqual({
      or: [
        { inactive: { equals: true } },
        { 'schedule.lastDate': { exists: false } },
        { 'schedule.lastDate': { greater_than_equal: NOW.toISOString() } },
      ],
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// The invariant: the SQL predicate and the in-memory check must agree.
// ──────────────────────────────────────────────────────────────────────────────
describe('notFinishedWhere agrees with shouldFinish', () => {
  /**
   * Evaluate `notFinishedWhere`'s three-branch OR against a row, the way
   * Postgres would. Deliberately specific to that shape rather than a general
   * `Where` interpreter — if the predicate's shape changes, this should fail to
   * compile-or-match and force a look, not silently keep passing.
   */
  const evaluate = (
    where: Where,
    row: { inactive?: boolean | null; lastDate?: string | null },
  ): boolean => {
    const branches = where.or as Array<Record<string, Record<string, unknown>>>
    const [inactiveBranch, nullBranch, futureBranch] = branches
    expect(branches).toHaveLength(3)

    if (row.inactive === (inactiveBranch.inactive.equals as boolean)) return true
    if (nullBranch['schedule.lastDate'].exists === false && row.lastDate == null) return true
    const threshold = futureBranch['schedule.lastDate'].greater_than_equal as string
    return row.lastDate != null && row.lastDate >= threshold
  }

  const cases: Array<{
    name: string
    inactive?: boolean
    schedule: Parameters<typeof lastOccurrenceEnd>[0]
  }> = [
    { name: 'one-off in the past', schedule: ONE_OFF_PAST },
    { name: 'one-off in the future', schedule: ONE_OFF_FUTURE },
    {
      name: 'one-off ending today in its own timezone',
      schedule: { firstDate: '2026-06-10T16:00:00.000Z', firstDate_tz: 'America/New_York' },
    },
    {
      name: 'one-off that ended today in UTC',
      schedule: { firstDate: '2026-06-10T16:00:00.000Z', firstDate_tz: 'UTC' },
    },
    {
      name: 'open-ended daily recurrence',
      schedule: { ...ONE_OFF_PAST, recurrenceType: 'DAILY', interval: 1 },
    },
    {
      name: 'monthly every 12 months, open-ended',
      schedule: {
        ...ONE_OFF_PAST,
        recurrenceType: 'MONTHLY',
        interval: 12,
        monthlyMode: 'date',
        monthDay: 15,
      },
    },
    {
      name: 'finished course (count)',
      schedule: {
        ...ONE_OFF_PAST,
        recurrenceType: 'DAILY',
        interval: 1,
        endingType: 'count',
        count: 3,
      },
    },
    {
      name: 'running course (until)',
      schedule: {
        ...ONE_OFF_PAST,
        recurrenceType: 'WEEKLY',
        interval: 1,
        endingType: 'until',
        untilDate: '2027-01-01',
      },
    },
    {
      name: 'course whose tail is excluded',
      schedule: {
        ...ONE_OFF_PAST,
        recurrenceType: 'DAILY',
        interval: 1,
        endingType: 'count',
        count: 3,
        exclusions: [{ startDate: '2025-03-17' }],
      },
    },
    { name: 'inactive with a stale past firstDate', inactive: true, schedule: ONE_OFF_PAST },
    { name: 'inactive with no schedule', inactive: true, schedule: {} },
    { name: 'no schedule at all', schedule: {} },
  ]

  it.each(cases)('$name', ({ inactive, schedule }) => {
    // The row as the DB would hold it: lastDate is what computeLastDate writes.
    const lastDate = lastOccurrenceEnd(schedule)
    const passesFeedFilter = evaluate(notFinishedWhere(NOW), {
      inactive: inactive ?? false,
      lastDate,
    })

    expect(passesFeedFilter).toBe(!shouldFinish({ inactive, schedule }, NOW))
  })
})
