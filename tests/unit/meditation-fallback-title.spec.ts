import { describe, expect, it } from 'vitest'

import { meditationTitleFromWeights } from '@/collections/Meditations/hooks/fallbackTitle'

describe('meditationTitleFromWeights', () => {
  it('returns null when there are no weights', () => {
    expect(meditationTitleFromWeights(undefined)).toBeNull()
    expect(meditationTitleFromWeights(null)).toBeNull()
    expect(meditationTitleFromWeights({})).toBeNull()
  })

  it('returns null for non-object inputs', () => {
    expect(meditationTitleFromWeights('anahat')).toBeNull()
    expect(meditationTitleFromWeights(42)).toBeNull()
  })

  it('builds the title from a single node label', () => {
    expect(meditationTitleFromWeights({ anahat: 42 })).toBe('Meditation for Anahat')
  })

  it('picks the highest-weighted node', () => {
    expect(meditationTitleFromWeights({ mooladhara: 10, anahat: 30, sahasrara: 20 })).toBe(
      'Meditation for Anahat',
    )
  })

  it('maps channel slugs to their human labels', () => {
    expect(meditationTitleFromWeights({ pingala: 5 })).toBe('Meditation for Right Channel')
    expect(meditationTitleFromWeights({ ida: 5 })).toBe('Meditation for Left Channel')
    expect(meditationTitleFromWeights({ sushumna: 5 })).toBe('Meditation for Center Channel')
  })

  it('ignores non-numeric weights', () => {
    expect(meditationTitleFromWeights({ anahat: 'lots', nabhi: 5 })).toBe('Meditation for Nabhi')
    expect(meditationTitleFromWeights({ anahat: 'lots', nabhi: null })).toBeNull()
  })

  it('falls back to the raw slug for an unknown node', () => {
    expect(meditationTitleFromWeights({ mystery: 5 })).toBe('Meditation for mystery')
  })

  it('keeps the first-inserted slug on a weight tie', () => {
    expect(meditationTitleFromWeights({ agnya: 10, anahat: 10 })).toBe('Meditation for Agnya')
  })
})
