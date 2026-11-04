import { describe, expect, it } from 'vitest'

import { parseRegistrationQuery } from '@/components/admin/EventRegistrations/data'
import { firstParam, pageParam } from '@/components/admin/helpers/searchParams'

/**
 * Every value here is visitor-supplied, and Next hands a repeated key over as
 * an array — so `?page=1&page=2` decides which one a view reads.
 */
describe('firstParam', () => {
  it('takes the first of a repeated key, and nothing from an absent one', () => {
    expect(firstParam({ filter: ['withdrawn', 'active'] }, 'filter')).toBe('withdrawn')
    expect(firstParam({ filter: 'active' }, 'filter')).toBe('active')
    expect(firstParam({}, 'filter')).toBeUndefined()
    expect(firstParam(undefined, 'filter')).toBeUndefined()
  })
})

describe('pageParam', () => {
  it('reads a page number', () => {
    expect(pageParam({ page: '3' })).toBe(3)
    expect(pageParam({ page: ['2', '9'] })).toBe(2)
  })

  it('falls back to the first page for anything that is not one', () => {
    for (const page of ['0', '-4', 'nonsense', '', undefined]) {
      expect(pageParam({ page })).toBe(1)
    }
    expect(pageParam(undefined)).toBe(1)
  })
})

/**
 * A view's own parse keeps only its vocabulary, which is what differs.
 * `atlas-manager-model.spec.ts` pins the dashboard's.
 */
describe('parseRegistrationQuery', () => {
  it('shows registrations active-first, refusing a filter it does not offer', () => {
    expect(parseRegistrationQuery({ filter: 'withdrawn', page: '3' })).toEqual({
      filter: 'withdrawn',
      page: 3,
    })
    expect(parseRegistrationQuery({ filter: 'spam' })).toEqual({ filter: 'active', page: 1 })
    expect(parseRegistrationQuery(undefined)).toEqual({ filter: 'active', page: 1 })
  })
})
