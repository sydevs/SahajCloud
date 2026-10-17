/**
 * `decideStateLayer` against a subdivision table with no ISO codes in it.
 *
 * Its own file because `vi.mock` replaces `@/lib/geography` for the whole
 * module graph. `country-region-data` lists every subdivision of PR, FO and a
 * dozen more with no `shortCode`, so `getRegionOptions` hands back a `value` of
 * `undefined` — and the decision must skip those rather than throw on them,
 * whatever the table's own reader does about it.
 */
import { describe, expect, it, vi } from 'vitest'

import { decideStateLayer, type StateLayerCity } from '@/collections/EventImports/propose/states'

vi.mock('@/lib/geography', () => ({
  getRegionOptions: () => [
    { label: 'Adjuntas', value: undefined },
    { label: 'Aguada', value: undefined },
    { label: 'Ponce', value: 'PO' },
    { label: 'San Juan', value: 'SJ' },
  ],
}))

function cities(subdivisionCode: string | null, n: number): StateLayerCity[] {
  return Array.from({ length: n }, (_, index) => ({
    key: `${subdivisionCode ?? 'none'}-${index}`,
    subdivisionCode,
    isNew: true,
  }))
}

describe('decideStateLayer with codeless subdivisions', () => {
  it('decides instead of throwing', () => {
    const decision = decideStateLayer({
      targetLevel: 'country',
      countryCode: 'PR',
      cities: [...cities('PO', 4), ...cities('SJ', 4), ...cities(null, 2)],
    })

    expect(decision.proposed).toBe(true)
    if (!decision.proposed) return
    expect(decision.states.map((state) => state.code)).toEqual(['PO', 'SJ'])
    expect(decision.unplacedCityKeys).toEqual(['none-0', 'none-1'])
  })
})
