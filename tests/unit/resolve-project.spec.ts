import { describe, expect, it } from 'vitest'

import { getManagerProjects, resolveProject, type ProjectUser } from '@/plugins/access/config'

// A listed region manager, as an authenticated request carries them: the Atlas
// role is derived from the join, so `roles` is empty.
const regionManager: ProjectUser = { type: 'manager', roles: [], managedRegions: { docs: [3] } }

describe('resolveProject', () => {
  it('moves a manager with one reachable project into it, and asks for it to be saved', () => {
    expect(resolveProject({ ...regionManager, currentProject: null })).toEqual({
      project: 'sahaj-atlas',
      persist: true,
    })
  })

  it('replaces a stored project the manager can no longer reach when one remains', () => {
    expect(resolveProject({ ...regionManager, currentProject: 'wemeditate-web' })).toEqual({
      project: 'sahaj-atlas',
      persist: true,
    })
  })

  it('keeps a reachable stored project without saving', () => {
    expect(resolveProject({ ...regionManager, currentProject: 'sahaj-atlas' })).toEqual({
      project: 'sahaj-atlas',
      persist: false,
    })
  })

  it('asks a manager with several projects, or none, to choose', () => {
    expect(resolveProject({ ...regionManager, roles: ['web-translator'] })).toEqual({
      project: null,
      persist: false,
    })
    expect(resolveProject({ type: 'manager', roles: [] })).toEqual({
      project: null,
      persist: false,
    })
  })

  it('never moves an admin, whose null is the All Content view', () => {
    expect(resolveProject({ ...regionManager, type: 'admin', currentProject: null })).toEqual({
      project: null,
      persist: false,
    })
  })

  it('counts a listed region or an assigned event as access to Sahaj Atlas', () => {
    const assignee: ProjectUser = { type: 'manager', roles: [], managedEvents: { docs: [12] } }
    expect(getManagerProjects(assignee)).toEqual(['sahaj-atlas'])
    expect(getManagerProjects(regionManager)).toEqual(['sahaj-atlas'])
    expect(resolveProject({ ...assignee, currentProject: null })).toEqual({
      project: 'sahaj-atlas',
      persist: true,
    })
    // Both joins name the same project, so holding both reaches it once.
    expect(getManagerProjects({ ...assignee, managedRegions: { docs: [3] } })).toEqual([
      'sahaj-atlas',
    ])
    expect(getManagerProjects({ ...assignee, managedEvents: { docs: [] } })).toEqual([])
    // A listed page reaches We Meditate Web the same way.
    expect(getManagerProjects({ type: 'manager', roles: [], managedPages: { docs: [5] } })).toEqual(
      ['wemeditate-web'],
    )
    // A stored role's project is unioned with the joins', not replaced by it.
    expect(getManagerProjects({ ...regionManager, roles: ['web-translator'] })).toEqual([
      'wemeditate-web',
      'sahaj-atlas',
    ])
  })
})
