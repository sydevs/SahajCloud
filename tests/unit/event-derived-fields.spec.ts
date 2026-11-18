import { describe, expect, it } from 'vitest'

import { hasContactRoute, paceAfter, repeatsForSchedule } from '@/lib/events/derivedFields'

const weekly = { repeats: 'weekly', schedule: { recurrenceType: 'WEEKLY' } } as const

describe('repeatsForSchedule', () => {
  it('reads the pace off the recurrence, a one-off, or no schedule at all', () => {
    expect(repeatsForSchedule({ recurrenceType: 'MONTHLY' })).toBe('monthly')
    expect(repeatsForSchedule({ firstDate: '2026-01-05T10:00:00.000Z' })).toBe('once')
    expect(repeatsForSchedule(null)).toBe('inactive')
  })
})

describe('paceAfter', () => {
  it('keeps a changed pace, whatever the recurrence says', () => {
    expect(paceAfter(weekly, { ...weekly, repeats: 'daily' })).toBe('daily')
    expect(paceAfter(weekly, { repeats: 'inactive', schedule: weekly.schedule })).toBe('inactive')
  })

  it('moves an unchanged pace with an edited recurrence', () => {
    expect(paceAfter(weekly, { schedule: { recurrenceType: 'MONTHLY' } })).toBe('monthly')
    expect(paceAfter(weekly, { ...weekly, schedule: { recurrenceType: null } })).toBe('once')
  })

  it('leaves the pace alone when the recurrence did not move', () => {
    expect(paceAfter(weekly, {})).toBe('weekly')
    expect(paceAfter(weekly, weekly)).toBe('weekly')
  })

  it('keeps a dormant class dormant', () => {
    const dormant = { ...weekly, repeats: 'inactive' } as const
    expect(paceAfter(dormant, { schedule: { recurrenceType: 'DAILY' } })).toBe('inactive')
  })
})

describe('hasContactRoute', () => {
  it('counts a phone or an email, never a name alone or a blank', () => {
    expect(hasContactRoute({ contactPhone: '+44 700' })).toBe(true)
    expect(hasContactRoute({ contactEmail: 'a@b.test' })).toBe(true)
    expect(hasContactRoute({ contactPhone: '', contactEmail: null })).toBe(false)
  })
})
