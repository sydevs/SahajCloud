import { describe, expect, it } from 'vitest'

import {
  DUPLICATE_ADDRESS_METERS,
  DUPLICATE_START_WINDOW_MINUTES,
} from '@/collections/EventImports/constants'
import { metersBetween } from '@/collections/EventImports/resolve/distance'
import {
  duplicateReason,
  findDuplicate,
  prepareCandidate,
  type DuplicateCandidate,
  type PreparedCandidate,
} from '@/collections/EventImports/resolve/duplicates'
import {
  occurrenceWeekdays,
  scheduleKey,
  wallStartTime,
  type ComparableSchedule,
} from '@/collections/EventImports/resolve/schedule'
import { localWallTimeToInstant } from '@/lib/schedule/time'

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
  // 2026-10-05 is a Monday. `localWallTimeToInstant` is what `mapCsvSchedule`
  // itself composes `firstDate` with, so the fixture cannot disagree with the
  // writer about which instant a wall time in a zone means.
  return {
    firstDate: localWallTimeToInstant('2026-10-05', startTime, timezone),
    firstDate_tz: timezone,
    recurrenceType: 'WEEKLY',
    weekdays,
  }
}

function candidate(overrides: Partial<DuplicateCandidate> = {}): PreparedCandidate {
  return prepareCandidate({
    cityKey: 'place.berlin',
    point: BERLIN,
    schedule: weekly('18:00'),
    ...overrides,
  })
}

/** A candidate with no point, so the address rule cannot answer first. */
function cityOnly(overrides: Partial<DuplicateCandidate> = {}): PreparedCandidate {
  return candidate({ point: null, ...overrides })
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
    expect(duplicateReason(candidate(), cityOnly())).toBe('city-and-time')
  })

  it('matches inside the start window and not outside it', () => {
    const inside = cityOnly({ schedule: weekly('18:20') })
    const outside = cityOnly({ schedule: weekly('18:31') })
    expect(DUPLICATE_START_WINDOW_MINUTES).toBe(30)
    expect(duplicateReason(cityOnly(), inside)).toBe('city-and-time')
    expect(duplicateReason(cityOnly(), outside)).toBeNull()
  })

  it('does not wrap the start window around midnight', () => {
    // 23:50 and 00:10 are 20 minutes apart on a clock face and almost a day
    // apart as classes.
    const lateEvening = cityOnly({ schedule: weekly('23:50') })
    const earlyMorning = cityOnly({ schedule: weekly('00:10') })
    expect(duplicateReason(lateEvening, earlyMorning)).toBeNull()
  })

  it('needs a shared weekday', () => {
    const tuesday = cityOnly({ schedule: weekly('18:00', ['TU']) })
    expect(duplicateReason(cityOnly(), tuesday)).toBeNull()
    const alsoMonday = cityOnly({ schedule: weekly('18:00', ['TU', 'MO']) })
    expect(duplicateReason(cityOnly(), alsoMonday)).toBe('city-and-time')
  })

  it('needs the same city', () => {
    const elsewhere = cityOnly({ cityKey: 'place.hamburg' })
    expect(duplicateReason(cityOnly(), elsewhere)).toBeNull()
  })

  it('treats a missing city as no agreement, on either side', () => {
    // Two rows that both failed to resolve a city are not therefore in the same
    // one.
    const noCity = cityOnly({ cityKey: null })
    expect(duplicateReason(noCity, cityOnly({ cityKey: null }))).toBeNull()
    expect(duplicateReason(noCity, cityOnly())).toBeNull()
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
  // Prepared once, the way the caller holds them: the existing events in the
  // subtree, plus the rows already accepted from this file.
  const existing = [
    cityOnly({ cityKey: 'place.hamburg' }),
    cityOnly({ schedule: weekly('18:15') }),
    cityOnly(),
  ]

  it('returns the first match with its reason', () => {
    expect(findDuplicate(cityOnly(), existing)).toEqual({ index: 1, reason: 'city-and-time' })
  })

  it('returns null when nothing matches', () => {
    expect(findDuplicate(cityOnly({ schedule: weekly('18:00', ['FR']) }), existing)).toBeNull()
  })

  it('finds nothing in an empty list', () => {
    expect(findDuplicate(candidate(), [])).toBeNull()
  })
})

describe('prepareCandidate', () => {
  it('reduces a schedule to a weekday mask and a start minute', () => {
    const prepared = prepareCandidate({
      cityKey: 'place.berlin',
      point: BERLIN,
      schedule: weekly('18:30', ['MO', 'WE']),
    })
    // Monday is the low bit, Wednesday the third.
    expect(prepared.weekdayMask).toBe(0b0000101)
    expect(prepared.startMinutes).toBe(18 * 60 + 30)
  })

  it('leaves a class with no schedule overlapping nothing', () => {
    const prepared = prepareCandidate({ cityKey: 'place.berlin', point: BERLIN, schedule: null })
    expect(prepared).toMatchObject({ weekdayMask: 0, startMinutes: null })
  })

  it('agrees with the readers it is derived from', () => {
    // The mask is the only form the comparison reads, so it has to carry the
    // same answer the readable derivation gives.
    const schedule = weekly('07:05', ['TU', 'SA'])
    expect(scheduleKey(schedule).startMinutes).toBe(7 * 60 + 5)
    expect(occurrenceWeekdays(schedule)).toEqual(['TU', 'SA'])
    expect(wallStartTime(schedule)).toBe('07:05')
  })
})
