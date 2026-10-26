import { describe, expect, it } from 'vitest'

import { resolveProject } from '@/contexts/resolveProject'

describe('resolveProject', () => {
  it('moves a manager with one reachable project into it, and asks for it to be saved', () => {
    expect(
      resolveProject({ type: 'manager', roles: ['atlas-manager'], currentProject: null }),
    ).toEqual({ project: 'sahaj-atlas', persist: true })
  })

  it('replaces a stored project the manager can no longer reach when one remains', () => {
    expect(
      resolveProject({
        type: 'manager',
        roles: ['atlas-manager'],
        currentProject: 'wemeditate-web',
      }),
    ).toEqual({ project: 'sahaj-atlas', persist: true })
  })

  it('keeps a reachable stored project without saving', () => {
    expect(
      resolveProject({ type: 'manager', roles: ['atlas-manager'], currentProject: 'sahaj-atlas' }),
    ).toEqual({ project: 'sahaj-atlas', persist: false })
  })

  it('asks a manager with several projects, or none, to choose', () => {
    expect(resolveProject({ type: 'manager', roles: ['atlas-manager', 'web-translator'] })).toEqual(
      { project: null, persist: false },
    )
    expect(resolveProject({ type: 'manager', roles: [] })).toEqual({
      project: null,
      persist: false,
    })
  })

  it('never moves an admin, whose null is the All Content view', () => {
    expect(
      resolveProject({ type: 'admin', roles: ['atlas-manager'], currentProject: null }),
    ).toEqual({ project: null, persist: false })
  })
})
