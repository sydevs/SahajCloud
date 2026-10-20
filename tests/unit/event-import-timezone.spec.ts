import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'
import { timezoneAt } from '@/plugins/eventImport/timezone'

// Partially mocked: every case below wants the real boundary data, and only the
// last block substitutes an answer — no coordinates can produce a zone the enum
// lacks, so that branch is unreachable without this.
vi.mock('@photostructure/tz-lookup', async (importOriginal) => {
  const actual = await importOriginal<{ default: (lat: number, lon: number) => string }>()
  return { default: vi.fn(actual.default) }
})
const tzlookup = vi.mocked((await import('@photostructure/tz-lookup')).default)
const actualLookup = tzlookup.getMockImplementation()!

afterEach(() => {
  tzlookup.mockReset()
  tzlookup.mockImplementation(actualLookup)
})

function zone(latitude: number, longitude: number): string {
  const result = timezoneAt(latitude, longitude)
  if (!result.ok) throw new Error(`expected a zone, got refusal: ${result.error}`)
  return result.timezone
}

function refusal(latitude: number, longitude: number): string {
  const result = timezoneAt(latitude, longitude)
  if (result.ok) throw new Error(`expected a refusal, got ${result.timezone}`)
  return result.error
}

describe('timezoneAt', () => {
  it('reads the zone off the coordinates', () => {
    expect(zone(52.52, 13.405)).toBe('Europe/Berlin')
    expect(zone(22.5726, 88.3639)).toBe('Asia/Kolkata')
    expect(zone(40.7128, -74.006)).toBe('America/New_York')
  })

  it('distinguishes two zones inside one country', () => {
    // The reason the country column cannot answer this, and the whole case for
    // a coordinate lookup: both of these rows would say `US`.
    expect(zone(40.7128, -74.006)).not.toBe(zone(34.0522, -118.2437))
    expect(zone(34.0522, -118.2437)).toBe('America/Los_Angeles')
  })

  it('returns only zones the firstDate_tz column stores', () => {
    const stored = new Set(SUPPORTED_TIMEZONES.map(({ value }) => value))
    // Sampled across every inhabited continent — a zone outside the enum is a
    // row Postgres would refuse at write.
    const points: [number, number][] = [
      [52.52, 13.405],
      [22.5726, 88.3639],
      [-33.8688, 151.2093],
      [-23.5505, -46.6333],
      [-1.2921, 36.8219],
      [55.7558, 37.6173],
      [19.4326, -99.1332],
      [35.6762, 139.6503],
    ]
    for (const [latitude, longitude] of points) {
      expect(stored.has(zone(latitude, longitude))).toBe(true)
    }
  })

  it('reads current boundaries, not the ones a stale dataset froze', () => {
    // `tz-lookup` put Ciudad Juárez in America/Ojinaga, an hour out for half
    // the year; tzdb split it off in 2022.
    expect(zone(31.738, -106.487)).toBe('America/Ciudad_Juarez')
  })

  it('refuses coordinates no zone covers instead of throwing', () => {
    // The lookup throws for these; an uncaught throw would lose every row
    // after it in the batch.
    expect(refusal(100, 0)).toContain('no timezone covers')
    expect(refusal(Number.NaN, 0)).toContain('no timezone covers')
  })
})

describe('timezoneAt, when the lookup outruns the column', () => {
  it('refuses a looked-up zone the enum lacks, naming it', () => {
    // A `@vvo/tzdb` the boundary data has outgrown. The zone is what tells a
    // maintainer to bump the package and migrate the enum, so the message
    // carries it rather than blaming the row.
    tzlookup.mockReturnValue('Europe/Atlantis')
    expect(refusal(52.52, 13.405)).toContain('Europe/Atlantis')
  })

  it('accepts a looked-up zone the enum has', () => {
    tzlookup.mockReturnValue('Europe/Prague')
    expect(timezoneAt(52.52, 13.405)).toEqual({ ok: true, timezone: 'Europe/Prague' })
  })
})
