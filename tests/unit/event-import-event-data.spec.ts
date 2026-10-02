import { describe, expect, it } from 'vitest'

import { eventCreateData } from '@/collections/EventImports/commit/eventData'
import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import type { ResolvedRow } from '@/collections/EventImports/resolve/resolveRow'

/**
 * A Monday, and deliberately in the past.
 *
 * ⚠ **A near-future anchor makes the whole schedule assertion vacuous.** The
 * mapper resolves "the next Tuesday" against whatever date it is handed, so an
 * anchor inside this week agrees with the wall clock — the first draft here used
 * one, and swapping the stored anchor for `Temporal.Now` left all 23 cases green.
 * A past anchor can never agree again.
 */
const ANCHOR = '2026-01-05'

function resolved(overrides: Partial<ResolvedRow> = {}): ResolvedRow {
  return {
    latitude: 48.137,
    longitude: 11.575,
    timezone: 'Europe/Berlin',
    cityKey: 'munich',
    placeName: 'Munich',
    placeId: 'place.munich',
    mapboxId: 'address.123',
    subdivisionCode: 'BY',
    languages: ['de'],
    inactive: false,
    anchorDate: ANCHOR,
    weekdayMask: 0b10,
    startMinutes: 1110,
    ...overrides,
  }
}

function values(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    title: 'Tuesday Evening Meditation',
    eventType: 'offline',
    country: 'de',
    city: 'Giesing',
    address: 'Oranienstraße 25',
    postcode: '81541',
    venueName: 'Community Hall',
    room: 'Room 2',
    scheduleType: 'weekly',
    startTime: '18:30',
    weekdays: 'TU',
    ...overrides,
  }
}

function build(
  overrides: {
    values?: Partial<RawImportRow>
    resolved?: Partial<ResolvedRow>
    managerId?: number | null
  } = {},
) {
  return eventCreateData({
    values: values(overrides.values),
    resolved: resolved(overrides.resolved),
    regionId: 42,
    managerId: overrides.managerId ?? null,
  })
}

function dataOf(result: ReturnType<typeof build>): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join('; ')}`)
  return result.data
}

describe('eventCreateData — the verification recipe', () => {
  /**
   * ⚠ **The acceptance criterion the whole import turns on.** A row with no
   * coordinator is published unverified and unadopted, and `skipVerifyHook` is
   * what stops `syncVerificationOnSave` adopting it on nobody's cadence.
   */
  it('publishes an unadopted class unverified, with the verify hook skipped', () => {
    const result = build({ managerId: null })

    expect(dataOf(result)).toMatchObject({
      _status: 'published',
      verificationStage: 'unverified',
      manager: null,
    })
    expect(result.ok && result.context).toEqual({ skipVerifyHook: true })
  })

  it('leaves an adopted class’s stage to the verification hook', () => {
    const result = build({ managerId: 77 })
    const data = dataOf(result)

    expect(data).toMatchObject({ _status: 'published', manager: 77 })
    expect(data).not.toHaveProperty('verificationStage')
    expect(result.ok && result.context).toEqual({ skipVerifyHook: false })
  })
})

describe('eventCreateData — the schedule', () => {
  /**
   * ⚠ **Against the stored anchor, never today.** "The next Tuesday" is what the
   * reviewer approved, so a commit run a week later must still build the date the
   * review showed.
   */
  it('re-derives the first date from the row’s stored anchor', () => {
    const schedule = dataOf(build()).schedule as { firstDate: string; firstDate_tz: string }

    // 18:30 on Tuesday 2026-01-06 in Europe/Berlin (CET, UTC+1) is 17:30Z.
    expect(schedule.firstDate).toBe('2026-01-06T17:30:00.000Z')
    expect(schedule.firstDate_tz).toBe('Europe/Berlin')
  })

  it('writes no schedule for a dormant class, and marks it inactive', () => {
    const data = dataOf(
      build({ values: { scheduleType: 'inactive', contactPhone: '+49 30 123456' } }),
    )

    expect(data).not.toHaveProperty('schedule')
    expect(data.inactive).toBe(true)
  })

  it('reports an unmappable schedule rather than throwing', () => {
    const result = build({ values: { startTime: 'half past six' } })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors.join(' ')).toMatch(/startTime/)
  })

  it('reports an unreadable stored anchor rather than throwing', () => {
    const result = build({ resolved: { anchorDate: 'not-a-date' } })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors.join(' ')).toMatch(/resolve it again/)
  })
})

describe('eventCreateData — the address', () => {
  it('takes the point from the resolve step and the street from the CSV', () => {
    const address = dataOf(build()).address as Record<string, unknown>

    expect(address).toMatchObject({
      mapboxId: 'address.123',
      street: 'Oranienstraße 25',
      room: 'Room 2',
      venueName: 'Community Hall',
      postCode: '81541',
      latitude: 48.137,
      longitude: 11.575,
    })
  })

  /**
   * ⚠ **The suburb the volunteer wrote, not the metro Mapbox filed it under.**
   * The metro merge is a grouping decision about the region tree; writing its
   * answer into the address would address a Giesing class to Munich.
   */
  it('addresses the class to the city the volunteer wrote', () => {
    expect((dataOf(build()).address as { city: string }).city).toBe('Giesing')
  })

  it('prefers the geocoded subdivision code over the CSV’s state name', () => {
    const address = dataOf(build({ values: { state: 'Bavaria' } })).address as { region: string }
    expect(address.region).toBe('BY')
  })

  it.each([
    ['the name ISO lists', 'Bayern'],
    ['the code itself', 'BY'],
    ['either, in any case', 'bayern'],
  ])('converts a state given as %s, where the geocode named no subdivision', (_label, state) => {
    const address = dataOf(build({ values: { state }, resolved: { subdivisionCode: null } }))
      .address as { region: string }
    expect(address.region).toBe('BY')
  })

  /**
   * ⚠ **ISO lists the endonym**, so the obvious English spelling is exactly what
   * does not match — which is why the geocode's own answer is preferred rather
   * than merely tried first.
   */
  it.each(['Bavaria', 'Nowhereland', 'ZZ', '   '])(
    'writes no subdivision for a state of "%s", rather than publishing it',
    (state) => {
      const address = dataOf(build({ values: { state }, resolved: { subdivisionCode: null } }))
        .address as { region: string | null }
      expect(address.region).toBeNull()
    },
  )

  it('uppercases the country, which the column holds as alpha-2', () => {
    expect((dataOf(build()).address as { country: string }).country).toBe('DE')
  })

  it('writes no address for an online class, and keeps its join link', () => {
    const data = dataOf(
      build({
        values: {
          eventType: 'online',
          onlineUrl: 'https://meet.example.org/abc',
          address: '',
          city: 'Berlin',
        },
      }),
    )

    expect(data).not.toHaveProperty('address')
    expect(data).toMatchObject({ eventType: 'online', onlineUrl: 'https://meet.example.org/abc' })
  })
})

describe('eventCreateData — the rest of the row', () => {
  it('hands a blank title to the auto-fill rather than clearing it', () => {
    expect(dataOf(build({ values: { title: '   ' } })).title).toBe('')
  })

  it('takes the languages the resolve step settled', () => {
    expect(dataOf(build({ resolved: { languages: ['de', 'en'] } })).languages).toEqual(['de', 'en'])
  })

  it('always registers through the Atlas', () => {
    expect(dataOf(build({ managerId: null })).registrationMode).toBe('sahaj-atlas')
    expect(dataOf(build({ managerId: 77 })).registrationMode).toBe('sahaj-atlas')
  })

  it('reads a registration cap, and calls an empty column unlimited', () => {
    expect(dataOf(build({ values: { registrationLimit: '25' } })).registrationLimit).toBe(25)
    expect(dataOf(build({ values: { registrationLimit: '' } })).registrationLimit).toBeNull()
  })

  it.each(['12 people', '-1', '2.5', 'lots'])(
    'refuses a registration cap of "%s" rather than guessing',
    (limit) => {
      const result = build({ values: { registrationLimit: limit } })
      expect(result.ok).toBe(false)
      expect(!result.ok && result.errors.join(' ')).toMatch(/registrationLimit/)
    },
  )

  it('turns a plain-text description into rich text, and keeps a blank one null', () => {
    expect(
      dataOf(build({ values: { description: 'A free weekly class.' } })).description,
    ).toMatchObject({
      root: { type: 'root' },
    })
    expect(dataOf(build()).description).toBeNull()
  })

  it('publishes the contact details the row carries, and nulls the rest', () => {
    const data = dataOf(
      build({ values: { contactName: ' Anna ', contactEmail: 'anna@example.org' } }),
    )

    expect(data).toMatchObject({
      contactName: 'Anna',
      contactEmail: 'anna@example.org',
      contactPhone: null,
      website: null,
    })
  })

  it('files the class under the region the placement step chose', () => {
    expect(dataOf(build()).region).toBe(42)
  })
})
