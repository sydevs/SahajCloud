import { describe, expect, it } from 'vitest'

import { labelText } from '@/components/admin/helpers/labelText'

describe('labelText', () => {
  it('takes a plain label as it stands', () => {
    expect(labelText('Start time', 'startTime')).toBe('Start time')
  })

  it('prefers English in a locale map', () => {
    // Not the first key: a map's order is the config's, so `cs` can precede
    // `en`, and the admin reads English by default.
    expect(labelText({ cs: 'Čas', en: 'Start time' }, 'startTime')).toBe('Start time')
  })

  it('takes the first locale when English is absent', () => {
    expect(labelText({ cs: 'Čas', fr: 'Heure' }, 'startTime')).toBe('Čas')
  })

  it('falls back to the fallback for every empty shape', () => {
    expect(labelText(undefined, 'startTime')).toBe('startTime')
    expect(labelText({}, 'startTime')).toBe('startTime')
    expect(labelText({ en: '' }, 'startTime')).toBe('startTime')
  })
})
