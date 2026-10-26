import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import type { RoleSlug } from '@/payload-types'
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

  it('narrows to the project the manager works in, as resolveProject decides it', () => {
    const roles: { en: RoleSlug[] } = { en: ['atlas-manager', 'web-translator'] }
    const atlas = user('managers', { type: 'manager', roles, currentProject: 'sahaj-atlas' })
    expect(isManager(atlas, 'sahaj-atlas')).toBe(true)
    expect(isManager(atlas, 'wemeditate-web')).toBe(false)
    // Two projects and none chosen: in neither yet.
    expect(isManager(user('managers', { type: 'manager', roles }), 'sahaj-atlas')).toBe(false)
    // A stored project their roles no longer reach does not count.
    const stale = user('managers', {
      type: 'manager',
      roles: { en: ['web-translator', 'meditations-editor'] },
      currentProject: 'sahaj-atlas',
    })
    expect(isManager(stale, 'sahaj-atlas')).toBe(false)
  })
})
