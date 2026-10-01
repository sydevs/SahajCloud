import { describe, expect, it } from 'vitest'

import {
  DUPLICATE_ADDRESS_METERS,
  DUPLICATE_START_WINDOW_MINUTES,
} from '@/collections/EventImports/constants'
import { metersBetween } from '@/collections/EventImports/resolve/distance'
import {
  duplicateReason,
  findDuplicate,
  type DuplicateCandidate,
} from '@/collections/EventImports/resolve/duplicates'
import {
  occurrenceWeekdays,
  wallStartTime,
  type ComparableSchedule,
} from '@/collections/EventImports/resolve/schedule'

const BERLIN = { latitude: 52.52, longitude: 13.405 }

/** Metres per degree of latitude, so a spec can place a point a stated distance away. */
const METERS_PER_DEGREE_LATITUDE = 111_195.08

function northOf(point: typeof BERLIN, meters: number) {
  return { ...point, latitude: point.latitude + meters / METERS_PER_DEGREE_LATITUDE }
}

/** A weekly class, with its first date on a Monday. */
function weekly(
  startTime: string,
  weekdays: NonNullable<ComparableSchedule['weekdays']> = ['MO'],
  timezone: ComparableSchedule['firstDate_tz'] = 'Europe/Berlin',
): ComparableSchedule {
  // 2026-10-05 is a Monday. The instant is composed from the wall time in the
  // named zone, the way `mapCsvSchedule` composes `firstDate`.
  const offsets: Record<string, string> = {
    'Europe/Berlin': '+02:00',
    'America/New_York': '-04:00',
    'Asia/Kolkata': '+05:30',
  }
  const offset = offsets[timezone]
  if (!offset) throw new Error(`add an offset for ${timezone}`)
  return {
    firstDate: new Date(`2026-10-05T${startTime}:00${offset}`).toISOString(),
    firstDate_tz: timezone,
    recurrenceType: 'WEEKLY',
    weekdays,
  }
}

function candidate(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    cityKey: 'place.berlin',
    point: BERLIN,
    schedule: weekly('18:00'),
    ...overrides,
  }
}

describe('occurrenceWeekdays', () => {
  it('reads a weekly class from its weekdays, not its first date', () => {
    // `firstDate` is a Monday here, so taking the instant would answer ['MO']
    // and compare one of this class's days against all of another's.
    expect(occurrenceWeekdays(weekly('18:00', ['MO', 'TH']))).toEqual(['MO', 'TH'])
  })

  it("reads a one-off class from its first date's own weekday", () => {
    const oneOff: ComparableSchedule = {
      firstDate: '2026-10-07T16:00:00.000Z',
      firstDate_tz: 'Europe/Berlin',
    }
    expect(occurrenceWeekdays(oneOff)).toEqual(['WE'])
  })

  it('reads the weekday in the stored zone, not in UTC', () => {
    // 22:30 Monday in Berlin is 20:30 Monday UTC — but 00:30 Tuesday in Kolkata
    // is still Monday evening UTC. Reading the instant answers the wrong day.
    const lateKolkata: ComparableSchedule = {
      firstDate: '2026-10-05T19:00:00.000Z',
      firstDate_tz: 'Asia/Kolkata',
    }
    expect(occurrenceWeekdays(lateKolkata)).toEqual(['TU'])
  })

  it('reads a monthly class from its ordinal weekday', () => {
    const monthly: ComparableSchedule = {
      firstDate: '2026-10-05T16:00:00.000Z',
      firstDate_tz: 'Europe/Berlin',
      recurrenceType: 'MONTHLY',
      weekdayOfMonth: 'FR',
    }
    expect(occurrenceWeekdays(monthly)).toEqual(['FR'])
  })

  it('spans every weekday for a daily class', () => {
    const daily: ComparableSchedule = {
      firstDate: '2026-10-05T16:00:00.000Z',
      firstDate_tz: 'Europe/Berlin',
      recurrenceType: 'DAILY',
    }
    expect(occurrenceWeekdays(daily)).toHaveLength(7)
  })

  it('comes up empty for an unreadable schedule rather than throwing', () => {
    const broken: ComparableSchedule = {
      firstDate: 'not-a-date',
      firstDate_tz: 'Europe/Berlin',
    }
    expect(occurrenceWeekdays(broken)).toEqual([])
  })
})

describe('wallStartTime', () => {
  it('reads the class clock, not UTC', () => {
    expect(wallStartTime(weekly('18:00'))).toBe('18:00')
    expect(wallStartTime(weekly('18:00', ['MO'], 'America/New_York'))).toBe('18:00')
    expect(wallStartTime(weekly('18:00', ['MO'], 'Asia/Kolkata'))).toBe('18:00')
  })

  it('is null for an unreadable schedule', () => {
    expect(wallStartTime({ firstDate: '', firstDate_tz: 'Europe/Berlin' })).toBeNull()
  })
})

describe('duplicateReason', () => {
  it('matches one city at the same time', () => {
    expect(duplicateReason(candidate(), candidate({ point: null }))).toBe('city-and-time')
  })

  it('matches inside the start window and not outside it', () => {
    const inside = candidate({ point: null, schedule: weekly('18:20') })
    const outside = candidate({ point: null, schedule: weekly('18:31') })
    expect(DUPLICATE_START_WINDOW_MINUTES).toBe(30)
    expect(duplicateReason(candidate({ point: null }), inside)).toBe('city-and-time')
    expect(duplicateReason(candidate({ point: null }), outside)).toBeNull()
  })

  it('does not wrap the start window around midnight', () => {
    // 23:50 and 00:10 are 20 minutes apart on a clock face and almost a day
    // apart as classes.
    const lateEvening = candidate({ point: null, schedule: weekly('23:50') })
    const earlyMorning = candidate({ point: null, schedule: weekly('00:10') })
    expect(duplicateReason(lateEvening, earlyMorning)).toBeNull()
  })

  it('needs a shared weekday', () => {
    const tuesday = candidate({ point: null, schedule: weekly('18:00', ['TU']) })
    expect(duplicateReason(candidate({ point: null }), tuesday)).toBeNull()
    const alsoMonday = candidate({ point: null, schedule: weekly('18:00', ['TU', 'MO']) })
    expect(duplicateReason(candidate({ point: null }), alsoMonday)).toBe('city-and-time')
  })

  it('needs the same city', () => {
    const elsewhere = candidate({ point: null, cityKey: 'place.hamburg' })
    expect(duplicateReason(candidate({ point: null }), elsewhere)).toBeNull()
  })

  it('treats a missing city as no agreement, on either side', () => {
    // Two rows that both failed to resolve a city are not therefore in the same
    // one.
    const noCity = candidate({ point: null, cityKey: null })
    expect(duplicateReason(noCity, candidate({ point: null, cityKey: null }))).toBeNull()
    expect(duplicateReason(noCity, candidate({ point: null }))).toBeNull()
  })

  it('matches two addresses inside the threshold, whatever the time', () => {
    const near = candidate({ schedule: weekly('07:00'), point: northOf(BERLIN, 120) })
    expect(metersBetween(BERLIN, near.point!)).toBeLessThan(DUPLICATE_ADDRESS_METERS)
    expect(duplicateReason(candidate(), near)).toBe('nearby-address')
  })

  it('does not match two addresses outside it', () => {
    const far = candidate({ schedule: weekly('07:00'), point: northOf(BERLIN, 400) })
    expect(metersBetween(BERLIN, far.point!)).toBeGreaterThan(DUPLICATE_ADDRESS_METERS)
    expect(duplicateReason(candidate(), far)).toBeNull()
  })

  it('still needs a shared weekday for an identical address', () => {
    // A Tuesday class and a Thursday class in one hall are two classes — the
    // case a bare address match gets wrong.
    const otherDay = candidate({ schedule: weekly('18:00', ['TH']) })
    expect(duplicateReason(candidate(), otherDay)).toBeNull()
  })

  it('reports the address when a pair satisfies both rules', () => {
    expect(duplicateReason(candidate(), candidate({ point: northOf(BERLIN, 50) }))).toBe(
      'nearby-address',
    )
  })

  it('never matches a class whose schedule cannot be read', () => {
    // The row survives to be reported rather than taking a neighbour's hall
    // with it.
    const broken = candidate({ schedule: { firstDate: 'not-a-date', firstDate_tz: 'Europe/Berlin' } })
    expect(duplicateReason(candidate(), broken)).toBeNull()
    expect(duplicateReason(broken, candidate())).toBeNull()
  })

  it('never matches a class with no schedule', () => {
    // An inactive listing has none, and matching it on its hall alone would skip
    // a real class.
    const inactive = candidate({ schedule: null })
    expect(duplicateReason(candidate(), inactive)).toBeNull()
    expect(duplicateReason(inactive, candidate())).toBeNull()
    expect(duplicateReason(inactive, candidate({ schedule: null }))).toBeNull()
  })
})

describe('findDuplicate', () => {
  const rows = [
    { id: 1, key: candidate({ cityKey: 'place.hamburg', point: null }) },
    { id: 2, key: candidate({ point: null, schedule: weekly('18:15') }) },
    { id: 3, key: candidate({ point: null }) },
  ]

  it('returns the first match with its reason', () => {
    const hit = findDuplicate(candidate({ point: null }), rows, (row) => row.key)
    expect(hit?.entry.id).toBe(2)
    expect(hit?.reason).toBe('city-and-time')
  })

  it('returns null when nothing matches', () => {
    const friday = candidate({ point: null, schedule: weekly('18:00', ['FR']) })
    expect(findDuplicate(friday, rows, (row) => row.key)).toBeNull()
  })

  it('finds nothing in an empty list', () => {
    expect(findDuplicate(candidate(), [], (row: never) => row)).toBeNull()
  })
})
