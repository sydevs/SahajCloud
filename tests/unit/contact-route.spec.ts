import { describe, expect, it } from 'vitest'

import { hasContactRoute } from '@/lib/events/contactRoute'

describe('hasContactRoute', () => {
  it('counts a phone or an email, never a name alone or a blank', () => {
    expect(hasContactRoute({ contactPhone: '+44 700' })).toBe(true)
    expect(hasContactRoute({ contactEmail: 'a@b.test' })).toBe(true)
    expect(hasContactRoute({ contactPhone: '', contactEmail: null })).toBe(false)
  })
})
