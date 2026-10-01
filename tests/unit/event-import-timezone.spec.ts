import { describe, expect, it } from 'vitest'

import { deriveImportTimezone } from '@/collections/EventImports/resolve/timezone'
import { SUPPORTED_TIMEZONES } from '@/lib/timezones'

function zone(latitude: number, longitude: number, override?: string): string {
  const result = deriveImportTimezone({ latitude, longitude, override })
  if (!result.ok) throw new Error(`expected a zone, got refusal: ${result.error}`)
  return result.timezone
}

function refusal(args: { latitude: number; longitude: number; override?: string }): string {
  const result = deriveImportTimezone(args)
  if (result.ok) throw new Error(`expected a refusal, got ${result.timezone}`)
  return result.error
}

describe('deriveImportTimezone', () => {
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

  it('takes the row override over the lookup', () => {
    // A border case a volunteer corrects by hand.
    expect(zone(52.52, 13.405, 'Europe/Prague')).toBe('Europe/Prague')
    expect(zone(52.52, 13.405, '  Europe/Prague  ')).toBe('Europe/Prague')
  })

  it('ignores a blank override rather than refusing it', () => {
    expect(zone(52.52, 13.405, '   ')).toBe('Europe/Berlin')
  })

  it('refuses an override the column cannot store', () => {
    // The enum is the gate for a hand-typed value too, or the row fails at
    // write with no line number on it.
    expect(refusal({ latitude: 52.52, longitude: 13.405, override: 'Mars/Olympus' })).toContain(
      'Mars/Olympus',
    )
    expect(refusal({ latitude: 52.52, longitude: 13.405, override: 'CET+1' })).toContain(
      'not one this CMS stores',
    )
  })

  it('refuses coordinates no zone covers instead of throwing', () => {
    // `tz-lookup` throws a RangeError; an uncaught one would lose every row
    // after it in the chunk.
    expect(refusal({ latitude: 100, longitude: 0 })).toContain('no timezone covers')
    expect(refusal({ latitude: Number.NaN, longitude: 0 })).toContain('no timezone covers')
  })
})

describe('deriveImportTimezone, when the lookup outruns the column', () => {
  it('refuses a looked-up zone the enum lacks, naming it', () => {
    // A `@vvo/tzdb` the boundary data has outgrown. The zone is what tells a
    // maintainer to bump the package and migrate the enum, so the message
    // carries it rather than blaming the row.
    const result = deriveImportTimezone({
      latitude: 52.52,
      longitude: 13.405,
      lookup: () => 'Europe/Atlantis',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Europe/Atlantis')
  })

  it('accepts a looked-up zone the enum has', () => {
    const result = deriveImportTimezone({
      latitude: 52.52,
      longitude: 13.405,
      lookup: () => 'Europe/Prague',
    })
    expect(result).toEqual({ ok: true, timezone: 'Europe/Prague' })
  })
})
