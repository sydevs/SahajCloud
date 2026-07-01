import { describe, expect, it, vi } from 'vitest'

import { shapeMeditation, type MeditationCardData } from '@/lib/meditations/meditationShape'
import type { Image, Meditation, Narrator } from '@/payload-types'

const img = (url: string) => ({ id: 1, url }) as unknown as Image
const narrator = (name: string) => ({ id: 2, name }) as unknown as Narrator

/** A complete, shapeable meditation; override individual fields per case. */
function makeMeditation(overrides: Partial<Meditation>): Meditation {
  return {
    id: 10,
    title: 'Meditation for Anahat',
    durationMinutes: 12,
    thumbnail: img('https://cdn.example/thumb.jpg'),
    narrator: narrator('Jane'),
    ...overrides,
  } as unknown as Meditation
}

describe('shapeMeditation', () => {
  it('maps a complete meditation to a flat card', () => {
    const card = shapeMeditation(makeMeditation({}))
    expect(card).toEqual({
      id: 10,
      title: 'Meditation for Anahat',
      durationMinutes: 12,
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      narratorName: 'Jane',
    } satisfies MeditationCardData)
  })

  it('returns null when the public title is missing (never falls back to a label)', () => {
    expect(shapeMeditation(makeMeditation({ title: null }))).toBeNull()
    expect(shapeMeditation(makeMeditation({ title: undefined }))).toBeNull()
    expect(shapeMeditation(makeMeditation({ title: '' }))).toBeNull()
  })

  it('returns null when durationMinutes is not a number', () => {
    expect(shapeMeditation(makeMeditation({ durationMinutes: null }))).toBeNull()
    expect(shapeMeditation(makeMeditation({ durationMinutes: undefined }))).toBeNull()
  })

  it('returns null when the thumbnail cannot resolve a URL', () => {
    expect(shapeMeditation(makeMeditation({ thumbnail: null }))).toBeNull()
    // A depth:0 raw id carries no url to extract.
    expect(shapeMeditation(makeMeditation({ thumbnail: 99 }))).toBeNull()
  })

  it('emits narratorName: null when the narrator relationship is not populated', () => {
    const card = shapeMeditation(makeMeditation({ narrator: 7 }))
    expect(card).not.toBeNull()
    expect(card?.narratorName).toBeNull()
  })

  it('warns (does not throw) when it drops an incomplete meditation', () => {
    const warn = vi.fn()
    const card = shapeMeditation(makeMeditation({ title: null }), { warn })
    expect(card).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })
})
