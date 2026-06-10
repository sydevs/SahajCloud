import { describe, expect, it } from 'vitest'

import {
  composeEventTitle,
  DEFAULT_EVENT_TITLE_PREFIX,
  firstAddressSegment,
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
  it('joins the prefix and the first address segment', () => {
    expect(composeEventTitle('Meditation at', 'Beethovenstraße 12, Berlin')).toBe(
      'Meditation at Beethovenstraße 12',
    )
  })

  it('returns null when there is no usable venue', () => {
    expect(composeEventTitle('Meditation at', '')).toBeNull()
    expect(composeEventTitle('Meditation at', undefined)).toBeNull()
  })

  it('falls back to the venue alone when the prefix is blank', () => {
    expect(composeEventTitle('   ', 'Hall A, Wing 2')).toBe('Hall A')
  })

  it('exposes a sensible default prefix', () => {
    expect(DEFAULT_EVENT_TITLE_PREFIX).toBe('Meditation at')
  })
})
