import { describe, expect, it } from 'vitest'

import { parseRegistrationQuery } from '@/components/admin/EventRegistrations/model'

/**
 * The Registrations tab keeps its filter and page in the URL, so the server
 * reads them and Back works. Every value there is visitor-supplied.
 */
describe('parseRegistrationQuery', () => {
  it('shows the registered list from the first page by default', () => {
    expect(parseRegistrationQuery(undefined)).toEqual({ filter: 'active', page: 1 })
    expect(parseRegistrationQuery({})).toEqual({ filter: 'active', page: 1 })
  })

  it('reads a filter it offers and a page number', () => {
    expect(parseRegistrationQuery({ filter: 'withdrawn', page: '3' })).toEqual({
      filter: 'withdrawn',
      page: 3,
    })
  })

  it('falls back rather than passing an unrecognised value to the query', () => {
    expect(parseRegistrationQuery({ filter: 'spam', page: '0' })).toEqual({
      filter: 'active',
      page: 1,
    })
    expect(parseRegistrationQuery({ filter: '', page: '-4' })).toEqual({
      filter: 'active',
      page: 1,
    })
    expect(parseRegistrationQuery({ page: 'nonsense' })).toEqual({ filter: 'active', page: 1 })
  })

  /** Next hands a repeated parameter as an array, which `?page=1&page=2` is. */
  it('takes the first of a repeated parameter', () => {
    expect(parseRegistrationQuery({ filter: ['withdrawn', 'active'], page: ['2', '9'] })).toEqual({
      filter: 'withdrawn',
      page: 2,
    })
  })
})
