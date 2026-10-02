import { describe, expect, it } from 'vitest'

import {
  STATE_LAYER_MIN_CITIES,
  STATE_LAYER_MIN_SUBDIVISIONS,
} from '@/collections/EventImports/constants'
import {
  decideStateLayer,
  type StateLayerCity,
} from '@/collections/EventImports/propose/states'
import { getRegionOptions } from '@/lib/geography'

/** `n` cities in one subdivision, keyed apart so the grouping can count them. */
function cities(subdivisionCode: string | null, n: number, prefix = 'c'): StateLayerCity[] {
  return Array.from({ length: n }, (_, index) => ({
    key: `${prefix}-${subdivisionCode ?? 'none'}-${index}`,
    subdivisionCode,
  }))
}

const IN = { targetLevel: 'country' as const, countryCode: 'IN' }

describe('decideStateLayer', () => {
  it('proposes a layer once the batch spans two subdivisions and eight cities', () => {
    const decision = decideStateLayer({
      ...IN,
      cities: [...cities('MH', 5), ...cities('GJ', 3)],
    })

    expect(decision.proposed).toBe(true)
    if (!decision.proposed) return
    expect(decision.states.map((state) => state.code)).toEqual(['GJ', 'MH'])
    expect(decision.states.map((state) => state.name)).toEqual(['Gujarat', 'Maharashtra'])
    expect(decision.states[1]!.cityKeys).toHaveLength(5)
    expect(decision.unplacedCityKeys).toEqual([])
  })

  it('refuses the layer one city below the threshold', () => {
    const under = decideStateLayer({
      ...IN,
      cities: [...cities('MH', STATE_LAYER_MIN_CITIES - 2), ...cities('GJ', 1)],
    })
    const at = decideStateLayer({
      ...IN,
      cities: [...cities('MH', STATE_LAYER_MIN_CITIES - 1), ...cities('GJ', 1)],
    })

    expect(under.proposed).toBe(false)
    expect(at.proposed).toBe(true)
    expect(STATE_LAYER_MIN_CITIES).toBe(8)
  })

  it('refuses the layer when every city is in one subdivision, however many there are', () => {
    const decision = decideStateLayer({ ...IN, cities: cities('MH', 20) })

    expect(decision.proposed).toBe(false)
    if (decision.proposed) return
    expect(decision.reason).toContain('Maharashtra')
    expect(STATE_LAYER_MIN_SUBDIVISIONS).toBe(2)
  })

  it('hangs a city with no subdivision off the country rather than failing it', () => {
    const decision = decideStateLayer({
      ...IN,
      cities: [...cities('MH', 4), ...cities('GJ', 3), ...cities(null, 2, 'unknown')],
    })

    expect(decision.proposed).toBe(true)
    if (!decision.proposed) return
    expect(decision.unplacedCityKeys).toEqual(['unknown-none-0', 'unknown-none-1'])
    expect(decision.states.flatMap((state) => state.cityKeys)).toHaveLength(7)
  })

  it('treats a subdivision this country does not list as unplaceable, not as a state', () => {
    // 'XX' is no subdivision of India, so it must not become a node named after
    // its own code — a city under it still belongs somewhere real.
    expect(getRegionOptions('IN').some((option) => option.value === 'XX')).toBe(false)

    const decision = decideStateLayer({
      ...IN,
      cities: [...cities('MH', 5), ...cities('GJ', 3), ...cities('XX', 2, 'bogus')],
    })

    expect(decision.proposed).toBe(true)
    if (!decision.proposed) return
    expect(decision.states.map((state) => state.code)).toEqual(['GJ', 'MH'])
    expect(decision.unplacedCityKeys).toEqual(['bogus-XX-0', 'bogus-XX-1'])
  })

  it('counts only placeable cities towards the subdivision threshold', () => {
    // Nine cities, but eight of them unplaceable: one subdivision is not two, so
    // a layer would add a level that groups nothing.
    const decision = decideStateLayer({
      ...IN,
      cities: [...cities('MH', 1), ...cities(null, 8, 'unknown')],
    })

    expect(decision.proposed).toBe(false)
  })

  it('matches a subdivision code whatever case Mapbox sent it in', () => {
    const decision = decideStateLayer({
      ...IN,
      cities: [...cities('mh', 5), ...cities('gj', 3)],
    })

    expect(decision.proposed).toBe(true)
    if (!decision.proposed) return
    expect(decision.states.map((state) => state.code)).toEqual(['GJ', 'MH'])
  })

  it('refuses a layer on a state or city target, and says which', () => {
    for (const targetLevel of ['region', 'city', 'venue'] as const) {
      const decision = decideStateLayer({
        targetLevel,
        countryCode: 'IN',
        cities: [...cities('MH', 5), ...cities('GJ', 3)],
      })

      expect(decision.proposed).toBe(false)
      if (decision.proposed) return
      expect(decision.reason).toContain(targetLevel)
    }
  })

  it('proposes nothing for a country whose subdivisions are not listed', () => {
    const decision = decideStateLayer({
      targetLevel: 'country',
      countryCode: 'ZZ',
      cities: [...cities('MH', 5), ...cities('GJ', 3)],
    })

    expect(getRegionOptions('ZZ')).toEqual([])
    expect(decision.proposed).toBe(false)
    if (decision.proposed) return
    expect(decision.reason).toContain('No city resolved to a subdivision')
  })

  it('places a UK city under no state, because ISO lists councils and not nations', () => {
    // The measured case behind `targetScope.ts`: `country-region-data` lists GB's
    // 217 councils, so a batch geocoded to England spans no listed subdivision.
    expect(getRegionOptions('GB').some((option) => option.label === 'England')).toBe(false)

    const decision = decideStateLayer({
      targetLevel: 'country',
      countryCode: 'GB',
      cities: cities(null, 10, 'uk'),
    })

    expect(decision.proposed).toBe(false)
  })
})
