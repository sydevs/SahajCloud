import { describe, expect, it } from 'vitest'

import {
  DUPLICATE_ADDRESS_METERS,
  DUPLICATE_START_WINDOW_MINUTES,
  WEAK_DUPLICATE_METERS,
} from '@/collections/EventImports/constants'
import { metersBetween } from '@/collections/EventImports/resolve/distance'
import {
  duplicateMatch,
  findDuplicate,
  prepareCandidate,
  type DuplicateCandidate,
  type PreparedCandidate,
} from '@/collections/EventImports/resolve/duplicates'
import {
  occurrenceWeekdays,
  scheduleKey,
  schedulesOverlap,
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
    online: false,
    schedule: weekly('18:00'),
    ...overrides,
  })
}

/** The reason alone, for the cases that only ask which rule answered. */
function duplicateReason(a: PreparedCandidate, b: PreparedCandidate) {
  return duplicateMatch(a, b)?.reason ?? null
}

/** A one-off class on a local date. */
function oneOff(date: string, startTime = '18:00'): ComparableSchedule {
  return {
    firstDate: localWallTimeToInstant(date, startTime, 'Europe/Berlin'),
    firstDate_tz: 'Europe/Berlin',
  }
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

describe('duplicateMatch', () => {
  it('calls one town at the same time, with no hall to compare, a weak match', () => {
    expect(duplicateMatch(candidate(), cityOnly())).toEqual({
      reason: 'city-and-time',
      strength: 'weak',
    })
  })

  it('calls the same hall at the same time a strong match', () => {
    const near = candidate({ point: northOf(BERLIN, 120) })
    expect(metersBetween(BERLIN, near.point!)).toBeLessThan(DUPLICATE_ADDRESS_METERS)
    expect(duplicateMatch(candidate(), near)).toEqual({
      reason: 'nearby-address',
      strength: 'strong',
    })
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

  /** One hall, a morning class and an evening one: two classes. */
  it('needs the start times to agree even at one address', () => {
    const morning = candidate({ schedule: weekly('10:00'), point: northOf(BERLIN, 20) })
    const evening = candidate({ schedule: weekly('19:30') })
    expect(duplicateMatch(morning, evening)).toBeNull()
  })

  it('calls two halls a few hundred metres apart at the same time a weak match', () => {
    const block = candidate({ point: northOf(BERLIN, 400) })
    expect(metersBetween(BERLIN, block.point!)).toBeLessThan(WEAK_DUPLICATE_METERS)
    expect(duplicateMatch(candidate(), block)).toEqual({
      reason: 'city-and-time',
      strength: 'weak',
    })
  })

  /** Camden and Brixton: one city, one weekday, one hour, nine kilometres apart. */
  it('never matches two halls a town apart, whatever the clock says', () => {
    const across = candidate({ point: northOf(BERLIN, 9_000) })
    expect(duplicateMatch(candidate(), across)).toBeNull()
  })

  it('still needs a shared weekday for an identical address', () => {
    // A Tuesday class and a Thursday class in one hall are two classes — the
    // case a bare address match gets wrong.
    const otherDay = candidate({ schedule: weekly('18:00', ['TH']) })
    expect(duplicateReason(candidate(), otherDay)).toBeNull()
  })

  it('never matches an online class with one in a hall', () => {
    const online = cityOnly({ online: true })
    expect(duplicateMatch(online, cityOnly())).toBeNull()
    expect(duplicateMatch(online, cityOnly({ online: true }))).toEqual({
      reason: 'city-and-time',
      strength: 'weak',
    })
  })

  it('never matches a class whose schedule cannot be read', () => {
    // The row survives to be reported rather than taking a neighbour's hall
    // with it.
    const broken = candidate({
      schedule: { firstDate: 'not-a-date', firstDate_tz: 'Europe/Berlin' },
    })
    expect(duplicateReason(candidate(), broken)).toBeNull()
    expect(duplicateReason(broken, candidate())).toBeNull()
  })

  /**
   * A dormant listing has no schedule, so it can only repeat another dormant
   * listing — at its hall. Re-uploading a file must not create every inactive
   * class again.
   */
  it('matches a dormant listing only with another at the same hall', () => {
    const inactive = candidate({ schedule: null })
    expect(duplicateMatch(candidate(), inactive)).toBeNull()
    expect(duplicateMatch(inactive, candidate())).toBeNull()
    expect(duplicateMatch(inactive, candidate({ schedule: null }))).toEqual({
      reason: 'nearby-address',
      strength: 'strong',
    })
    expect(
      duplicateMatch(inactive, candidate({ schedule: null, point: northOf(BERLIN, 5_000) })),
    ).toBeNull()
  })
})

describe('schedulesOverlap', () => {
  it('keeps two one-offs on different dates apart', () => {
    // 2026-11-02 and 2026-12-07 are both Mondays at one hall.
    expect(
      schedulesOverlap(scheduleKey(oneOff('2026-11-02')), scheduleKey(oneOff('2026-12-07'))),
    ).toBe(false)
    expect(
      schedulesOverlap(scheduleKey(oneOff('2026-11-02')), scheduleKey(oneOff('2026-11-02'))),
    ).toBe(true)
  })

  it('finds a one-off inside a weekly series on its weekday', () => {
    expect(schedulesOverlap(scheduleKey(oneOff('2026-11-02')), scheduleKey(weekly('18:00')))).toBe(
      true,
    )
  })

  it('keeps a series that ended before the other began apart', () => {
    const ended: ComparableSchedule = {
      ...weekly('18:00'),
      endingType: 'until',
      untilDate: '2026-10-26T00:00:00.000Z',
    }
    const later: ComparableSchedule = {
      ...weekly('18:00'),
      firstDate: localWallTimeToInstant('2027-01-04', '18:00', 'Europe/Berlin'),
    }
    expect(schedulesOverlap(scheduleKey(ended), scheduleKey(later))).toBe(false)
    expect(schedulesOverlap(scheduleKey(ended), scheduleKey(weekly('18:00')))).toBe(true)
  })

  it('keeps the first and the third Monday of the month apart', () => {
    const monthly = (
      weekNumber: NonNullable<ComparableSchedule['weekNumber']>,
    ): ComparableSchedule => ({
      ...weekly('18:00'),
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekdays: undefined,
      weekdayOfMonth: 'MO',
      weekNumber,
    })
    expect(schedulesOverlap(scheduleKey(monthly('1')), scheduleKey(monthly('3')))).toBe(false)
    expect(schedulesOverlap(scheduleKey(monthly('1')), scheduleKey(monthly('1')))).toBe(true)
    // The last Monday is the fourth in some months.
    expect(schedulesOverlap(scheduleKey(monthly('4')), scheduleKey(monthly('-1')))).toBe(true)
  })

  it('treats a row resolved before the range was stored as unbounded', () => {
    const legacy = { weekdayMask: 0b1, startMinutes: 1080 }
    expect(schedulesOverlap(legacy, scheduleKey(oneOff('2026-11-02')))).toBe(true)
  })
})

describe('findDuplicate', () => {
  // Prepared once, the way the caller holds them: the existing events in the
  // subtree, plus the rows already accepted from this file.
  const existing = [
    cityOnly({ cityKey: 'place.hamburg' }),
    cityOnly({ schedule: weekly('18:15') }),
    cityOnly(),
    candidate(),
  ]

  it('returns the first match with its reason and strength', () => {
    expect(findDuplicate(cityOnly(), existing)).toEqual({
      index: 1,
      reason: 'city-and-time',
      strength: 'weak',
    })
  })

  it('prefers a strong match anywhere over an earlier weak one', () => {
    expect(findDuplicate(candidate(), existing)).toEqual({
      index: 3,
      reason: 'nearby-address',
      strength: 'strong',
    })
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
      online: false,
      schedule: weekly('18:30', ['MO', 'WE']),
    })
    // Monday is the low bit, Wednesday the third.
    expect(prepared.weekdayMask).toBe(0b0000101)
    expect(prepared.startMinutes).toBe(18 * 60 + 30)
  })

  it('leaves a class with no schedule overlapping nothing', () => {
    const prepared = prepareCandidate({
      cityKey: 'place.berlin',
      point: BERLIN,
      online: false,
      schedule: null,
    })
    expect(prepared).toMatchObject({ weekdayMask: 0, startMinutes: null, inactive: true })
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
