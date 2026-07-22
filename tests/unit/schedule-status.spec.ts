import { describe, expect, it } from 'vitest'

import { shouldFinish } from '@/lib/schedule/scheduleStatus'

describe('shouldFinish', () => {
  const scheduledEnded = { firstDate: '2020-01-01T10:00:00.000Z', upcomingDates: [] }
  const scheduledActive = {
    firstDate: '2020-01-01T10:00:00.000Z',
    upcomingDates: ['2026-07-01T10:00:00.000Z'],
  }

  it('finishes a non-inactive event whose schedule has run out', () => {
    expect(shouldFinish({ inactive: false, schedule: scheduledEnded })).toBe(true)
  })

  it('never finishes an inactive event (even with an empty schedule)', () => {
    expect(shouldFinish({ inactive: true, schedule: scheduledEnded })).toBe(false)
  })

  it('does not finish an event with upcoming dates', () => {
    expect(shouldFinish({ inactive: false, schedule: scheduledActive })).toBe(false)
  })

  it('does not finish a scheduleless event (no firstDate)', () => {
    expect(shouldFinish({ inactive: false, schedule: { upcomingDates: [] } })).toBe(false)
    expect(shouldFinish({ inactive: false, schedule: null })).toBe(false)
    expect(shouldFinish({ inactive: false })).toBe(false)
  })
})
