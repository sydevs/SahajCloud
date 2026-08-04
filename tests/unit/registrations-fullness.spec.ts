import { describe, expect, it } from 'vitest'

import { isEventFull } from '@/lib/registrations/fullness'

describe('isEventFull', () => {
  const atlas = (registrationLimit: number | null) => ({
    registrationMode: 'sahaj-atlas',
    registrationLimit,
  })

  it('is true once the count reaches a set atlas limit', () => {
    expect(isEventFull(atlas(3), 2)).toBe(false)
    expect(isEventFull(atlas(3), 3)).toBe(true)
    expect(isEventFull(atlas(3), 4)).toBe(true)
  })

  it('is never full for a blank (unlimited) limit', () => {
    expect(isEventFull(atlas(null), 0)).toBe(false)
    expect(isEventFull(atlas(null), 9999)).toBe(false)
    expect(isEventFull({ registrationMode: 'sahaj-atlas' }, 9999)).toBe(false)
  })

  it('is never full for external registration mode, even past a limit', () => {
    expect(isEventFull({ registrationMode: 'external', registrationLimit: 1 }, 50)).toBe(false)
  })

  it('treats a limit of 0 as full from the first registration (0 >= 0)', () => {
    expect(isEventFull(atlas(0), 0)).toBe(true)
  })
})
