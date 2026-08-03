import { describe, expect, it } from 'vitest'

import {
  addressPlaceName,
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  firstAddressSegment,
  titleSlotForLocalTime,
  titleSlotForSchedule,
} from '@/collections/Events/hooks/eventTitle'

describe('firstAddressSegment', () => {
  it('returns the first comma-segment, trimmed', () => {
    expect(firstAddressSegment('Beethovenstraße 12, 2nd floor, Berlin')).toBe('Beethovenstraße 12')
  })

  it('returns the whole value when there is no comma', () => {
    expect(firstAddressSegment('Community Hall')).toBe('Community Hall')
  })

  it('returns an empty string for empty / non-string input', () => {
    expect(firstAddressSegment('')).toBe('')
    expect(firstAddressSegment('   ')).toBe('')
    expect(firstAddressSegment(undefined)).toBe('')
    expect(firstAddressSegment(null)).toBe('')
    expect(firstAddressSegment(42)).toBe('')
  })
})

describe('composeEventTitle', () => {
  it('interpolates %{place} with the first address segment', () => {
    expect(
      composeEventTitle('Evening Meditation at %{place}', { street: 'Beethovenstraße 12, Berlin' }),
    ).toBe('Evening Meditation at Beethovenstraße 12')
  })

  it('places the interpolation wherever the locale puts it', () => {
    // The point of a whole-sentence template rather than a prefix: a locale can
    // lead with the place, or wrap it.
    expect(composeEventTitle('%{place} — Abendmeditation', { street: 'Hackengasse 10' })).toBe(
      'Hackengasse 10 — Abendmeditation',
    )
  })

  it('returns null when there is no usable venue', () => {
    expect(composeEventTitle('Meditation at %{place}', { street: '' })).toBeNull()
    expect(composeEventTitle('Meditation at %{place}', undefined)).toBeNull()
  })

  it('falls back to the venue alone for a blank or placeholder-less template', () => {
    expect(composeEventTitle('   ', { street: 'Hall A, Wing 2' })).toBe('Hall A')
    expect(composeEventTitle('Meditation at', { street: 'Hall A, Wing 2' })).toBe('Hall A')
  })
})

describe('addressPlaceName', () => {
  it('prefers the venue name over the street', () => {
    // "Broadstairs Friends Meeting House" is what a seeker sees on the door;
    // "9 St Peter's Park Rd" tells them almost nothing.
    expect(
      addressPlaceName({
        venueName: 'Broadstairs Friends Meeting House',
        street: "9 St Peter's Park Rd",
      }),
    ).toBe('Broadstairs Friends Meeting House')
  })

  it('falls back to the street when there is no venue name', () => {
    expect(addressPlaceName({ street: 'Beethovenstraße 12, Berlin' })).toBe('Beethovenstraße 12')
    expect(addressPlaceName({ venueName: '   ', street: 'Hall A' })).toBe('Hall A')
  })

  it('returns empty when there is neither', () => {
    expect(addressPlaceName(undefined)).toBe('')
    expect(addressPlaceName({})).toBe('')
    expect(addressPlaceName({ venueName: '', street: '' })).toBe('')
  })
})

describe('titleSlotForLocalTime', () => {
  it.each([
    ['05:00', 'morning'],
    ['09:30', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['16:59', 'afternoon'],
    ['17:00', 'evening'],
    ['19:30', 'evening'],
    ['21:59', 'evening'],
  ] as const)('maps %s to %s', (time, slot) => {
    expect(titleSlotForLocalTime(time)).toBe(slot)
  })

  it('falls back to default for a late start or an unusable time', () => {
    expect(titleSlotForLocalTime('22:00')).toBe('default')
    expect(titleSlotForLocalTime('00:17')).toBe('default')
    expect(titleSlotForLocalTime('04:59')).toBe('default')
    expect(titleSlotForLocalTime(null)).toBe('default')
    expect(titleSlotForLocalTime(undefined)).toBe('default')
    expect(titleSlotForLocalTime('nonsense')).toBe('default')
  })
})

describe('titleSlotForSchedule', () => {
  it('reads the local wall-clock hour, not the UTC one', () => {
    // 19:00 in Auckland is 07:00 UTC. Taking the UTC hour would call this a
    // morning class.
    expect(
      titleSlotForSchedule({
        firstDate: '2021-07-27T07:00:00.000Z',
        firstDate_tz: 'Pacific/Auckland',
      }),
    ).toBe('evening')
  })

  it('treats a missing timezone as UTC', () => {
    expect(titleSlotForSchedule({ firstDate: '2024-09-06T09:00:00.000Z' })).toBe('morning')
  })

  it('falls back to default with no schedule (inactive events) or a bad date', () => {
    expect(titleSlotForSchedule(null)).toBe('default')
    expect(titleSlotForSchedule(undefined)).toBe('default')
    expect(titleSlotForSchedule({})).toBe('default')
    expect(titleSlotForSchedule({ firstDate: 'not-a-date', firstDate_tz: 'UTC' })).toBe('default')
    expect(
      titleSlotForSchedule({ firstDate: '2024-09-06T09:00:00.000Z', firstDate_tz: 'Nowhere' }),
    ).toBe('default')
  })
})

describe('EVENT_TITLE_DEFAULTS', () => {
  it('defines a complete, place-interpolating sentence for every slot', () => {
    // Each slot must be a whole sentence, not a fragment concatenated in code —
    // that is what lets a locale reorder the time of day and the place.
    for (const [slot, template] of Object.entries(EVENT_TITLE_DEFAULTS)) {
      expect(template, slot).toContain('%{place}')
    }
    expect(Object.keys(EVENT_TITLE_DEFAULTS).sort()).toEqual([
      'afternoon',
      'default',
      'evening',
      'morning',
    ])
    expect(EVENT_TITLE_DEFAULTS.default).toBe('Meditation at %{place}')
  })
})
