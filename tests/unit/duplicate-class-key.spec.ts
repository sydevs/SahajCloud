/**
 * `classKey` is what `refuseDuplicateClass` and the bulk import both compare,
 * so anything it leaves out is a class the Atlas refuses to list a second
 * time. Each case here pairs two classes a volunteer would call distinct.
 */

import { describe, expect, it } from 'vitest'

import { classKey } from '@/collections/Events/hooks/refuseDuplicateClass'
import type { SupportedTimezones } from '@/payload-types'

const BERLIN: SupportedTimezones = 'Europe/Berlin'

const offline = (firstDate: string, street = 'Hauptstrasse 1') => ({
  address: { street },
  eventType: 'offline' as const,
  schedule: { firstDate, firstDate_tz: BERLIN },
})

describe('classKey', () => {
  it('reads the same for a class repeated exactly', () => {
    expect(classKey(offline('2026-03-02T17:00:00.000Z'))).toBe(
      classKey(offline('2026-03-02T17:00:00.000Z')),
    )
  })

  it('tells two one-off classes on different dates apart', () => {
    expect(classKey(offline('2026-03-02T17:00:00.000Z'))).not.toBe(
      classKey(offline('2026-03-09T17:00:00.000Z')),
    )
  })

  it('keeps one local date when the UTC instant crosses midnight', () => {
    const sameLocalDay = classKey({
      ...offline('2026-03-02T23:30:00.000Z'),
      schedule: {
        firstDate: '2026-03-02T23:30:00.000Z',
        firstDate_tz: 'Pacific/Auckland' satisfies SupportedTimezones,
      },
    })
    expect(sameLocalDay).toContain('2026-03-03')
  })

  it('tells two weekly classes apart by interval', () => {
    const weekly = (interval: number) => ({
      ...offline('2026-03-02T17:00:00.000Z'),
      schedule: {
        firstDate: '2026-03-02T17:00:00.000Z',
        firstDate_tz: BERLIN,
        interval,
        recurrenceType: 'WEEKLY' as const,
        weekdays: ['MO' as const],
      },
    })
    expect(classKey(weekly(1))).not.toBe(classKey(weekly(2)))
  })

  it('tells two monthly classes apart by day of the month', () => {
    const monthly = (monthDay: number) => ({
      ...offline('2026-03-02T17:00:00.000Z'),
      schedule: {
        firstDate: '2026-03-02T17:00:00.000Z',
        firstDate_tz: BERLIN,
        monthDay,
        monthlyMode: 'date' as const,
        recurrenceType: 'MONTHLY' as const,
      },
    })
    expect(classKey(monthly(2))).not.toBe(classKey(monthly(17)))
  })

  it('tells two monthly classes apart by which weekday of the month', () => {
    const monthly = (weekNumber: '1' | '3') => ({
      ...offline('2026-03-02T17:00:00.000Z'),
      schedule: {
        firstDate: '2026-03-02T17:00:00.000Z',
        firstDate_tz: BERLIN,
        monthlyMode: 'weekday' as const,
        recurrenceType: 'MONTHLY' as const,
        weekNumber,
        weekdayOfMonth: 'MO' as const,
      },
    })
    expect(classKey(monthly('1'))).not.toBe(classKey(monthly('3')))
  })

  it('tells two online classes apart by their join link', () => {
    const online = (onlineUrl: string) => ({
      eventType: 'online' as const,
      onlineUrl,
      schedule: { firstDate: '2026-03-02T17:00:00.000Z', firstDate_tz: BERLIN },
    })
    expect(classKey(online('https://meet.example/a'))).not.toBe(
      classKey(online('https://meet.example/b')),
    )
  })

  it('still reads one key for the same online class written two ways', () => {
    const online = (onlineUrl: string) => ({
      eventType: 'online' as const,
      onlineUrl,
      schedule: { firstDate: '2026-03-02T17:00:00.000Z', firstDate_tz: BERLIN },
    })
    expect(classKey(online('https://Meet.Example/A '))).toBe(
      classKey(online('https://meet.example/a')),
    )
  })

  it('answers null for a class with no time to compare', () => {
    expect(classKey({ eventType: 'offline', inactive: true })).toBeNull()
  })
})
