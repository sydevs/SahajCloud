import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { isManager } from '@/plugins/access/adminOnly'

import { testData } from '../utils/testData'

const user = (
  collection: 'managers' | 'clients',
  overrides: Parameters<typeof testData.dummyUser>[1] = {},
) => testData.dummyUser(collection, overrides) as unknown as PayloadRequest['user']

describe('isManager', () => {
  it('holds for a non-admin manager only', () => {
    expect(isManager(user('managers', { type: 'manager' }))).toBe(true)
    expect(isManager(user('managers', { type: 'admin' }))).toBe(false)
    expect(isManager(user('managers', { type: 'inactive' }))).toBe(false)
    expect(isManager(user('clients'))).toBe(false)
    expect(isManager(null)).toBe(false)
  })

  it('narrows to the current project when one is named', () => {
    const atlas = user('managers', { type: 'manager', currentProject: 'sahaj-atlas' })
    expect(isManager(atlas, 'sahaj-atlas')).toBe(true)
    expect(isManager(atlas, 'wemeditate-web')).toBe(false)
    expect(isManager(user('managers', { type: 'manager' }), 'sahaj-atlas')).toBe(false)
  })
})
