import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { dashboardChoiceFor } from '@/components/admin/Dashboard/DashboardView'
import type { RoleSlug } from '@/payload-types'

import { testData } from '../utils/testData'

// The view module also holds the components it renders, and Payload's UI
// package imports stylesheets the unit lane cannot load. Only
// `dashboardChoiceFor` runs here, and it reads none of them.
vi.mock('@payloadcms/ui', () => ({}))
vi.mock('@payloadcms/ui/rsc', () => ({}))

const choiceFor = (overrides: Parameters<typeof testData.dummyUser>[1]) =>
  dashboardChoiceFor(testData.dummyUser('managers', overrides) as unknown as PayloadRequest['user'])

const atlas: { en: RoleSlug[] } = { en: ['atlas-manager'] }

describe('dashboardChoiceFor', () => {
  it('gives an Atlas manager their programs and an admin the overview', () => {
    expect(choiceFor({ type: 'manager', roles: atlas, currentProject: 'sahaj-atlas' })).toEqual({
      kind: 'atlas-manager',
    })
    expect(choiceFor({ type: 'admin', currentProject: 'sahaj-atlas' })).toEqual({
      kind: 'atlas-admin',
    })
  })

  it('renders the project a single-project manager is about to be moved into', () => {
    expect(choiceFor({ type: 'manager', roles: atlas, currentProject: null })).toEqual({
      kind: 'atlas-manager',
    })
  })

  it('counts an assigned event as access to Sahaj Atlas, with no role', () => {
    const assignee = {
      ...testData.dummyUser('managers', { type: 'manager', currentProject: 'sahaj-atlas' }),
      managedEvents: { docs: [7] },
    }
    expect(dashboardChoiceFor(assignee as unknown as PayloadRequest['user'])).toEqual({
      kind: 'atlas-manager',
    })
  })

  it('does not honour a stored project the manager can no longer reach', () => {
    const translator = { type: 'manager' as const, roles: { en: ['web-translator' as const] } }
    // One reachable project: rendered as the project they are moved into.
    expect(choiceFor({ ...translator, currentProject: 'sahaj-atlas' })).toEqual({
      kind: 'no-dashboard',
      project: 'wemeditate-web',
    })
    // Several, none of them stored: asked to choose.
    expect(
      choiceFor({
        type: 'manager',
        roles: { en: ['web-translator', 'meditations-editor'] },
        currentProject: 'sahaj-atlas',
      }),
    ).toEqual({ kind: 'select-project' })
  })

  it('contains the Atlas homes to their own project', () => {
    expect(choiceFor({ type: 'admin', currentProject: 'wemeditate-app' })).toEqual({
      kind: 'no-dashboard',
      project: 'wemeditate-app',
    })
  })

  it('asks a manager with no project to choose, and leaves All Content to the cards', () => {
    expect(choiceFor({ type: 'manager', currentProject: null })).toEqual({ kind: 'select-project' })
    // `currentProject: null` on an admin is the deliberate All Content view.
    expect(choiceFor({ type: 'admin', currentProject: null })).toEqual({ kind: 'collections' })
    expect(dashboardChoiceFor(undefined)).toEqual({ kind: 'collections' })
  })
})
