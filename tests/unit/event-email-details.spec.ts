import { describe, expect, it } from 'vitest'

import {
  formatLongDate,
  formatShortDate,
  humanDurationSince,
  scheduleOneLine,
} from '@/lib/notifications/eventDetails'

type Schedule = Parameters<typeof scheduleOneLine>[0]

// 9:26 AM in Asia/Calcutta (UTC+5:30) == 03:56 UTC.
const FIRST_DATE = '2026-06-13T03:56:00.000Z'
const base = { firstDate: FIRST_DATE, firstDate_tz: 'Asia/Calcutta', interval: 1 }

describe('scheduleOneLine', () => {
  it('summarises a weekly schedule as recurrence + start time (12h, no seconds/tz)', () => {
    const line = scheduleOneLine({
      ...base,
      recurrenceType: 'WEEKLY',
      weekdays: ['SA'],
    } as Schedule)
    expect(line).toBe('Every week on Saturday at 9:26 AM')
    expect(line).not.toMatch(/:\d\d:\d\d/) // no seconds
    expect(line).not.toContain('Asia') // no timezone
  })

  it('handles daily, multi-day weekly, and monthly variants', () => {
    expect(scheduleOneLine({ ...base, recurrenceType: 'DAILY' } as Schedule)).toBe(
      'Every day at 9:26 AM',
    )
    expect(
      scheduleOneLine({
        ...base,
        interval: 2,
        recurrenceType: 'WEEKLY',
        weekdays: ['SA', 'SU'],
      } as Schedule),
    ).toBe('Every 2 weeks on Saturday, Sunday at 9:26 AM')
    expect(
      scheduleOneLine({
        ...base,
        recurrenceType: 'MONTHLY',
        monthlyMode: 'date',
        monthDay: 12,
      } as Schedule),
    ).toBe('Every month on the 12th at 9:26 AM')
    expect(
      scheduleOneLine({
        ...base,
        recurrenceType: 'MONTHLY',
        monthlyMode: 'weekday',
        weekNumber: '1',
        weekdayOfMonth: 'SA',
      } as Schedule),
    ).toBe('Every month on the first Saturday at 9:26 AM')
  })

  it('formats a one-off event as a date + time', () => {
    const line = scheduleOneLine({ ...base } as Schedule)
    expect(line).toContain('13 June 2026 at 9:26 AM')
  })

  it('returns empty string with no schedule', () => {
    expect(scheduleOneLine(null)).toBe('')
    expect(scheduleOneLine({} as Schedule)).toBe('')
  })
})

describe('formatLongDate', () => {
  it('formats a full deadline date', () => {
    expect(formatLongDate('2026-07-19T12:00:00.000Z')).toContain('19 July 2026')
  })

  it('returns empty string for an invalid date', () => {
    expect(formatLongDate('not-a-date')).toBe('')
  })
})

describe('formatShortDate', () => {
  it('formats a compact date (short month, no weekday)', () => {
    expect(formatShortDate('2026-07-19T12:00:00.000Z')).toBe('19 Jul 2026')
  })

  it('returns empty string for an invalid date', () => {
    expect(formatShortDate('not-a-date')).toBe('')
  })
})

describe('humanDurationSince', () => {
  const now = new Date('2026-06-13T00:00:00.000Z')
  const ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  it('renders a coarse duration', () => {
    expect(humanDurationSince(ago(90), now)).toBe('3 months')
    expect(humanDurationSince(ago(21), now)).toBe('3 weeks')
    expect(humanDurationSince(ago(5), now)).toBe('5 days')
    expect(humanDurationSince(ago(0.5), now)).toBe('less than a day')
  })
})
