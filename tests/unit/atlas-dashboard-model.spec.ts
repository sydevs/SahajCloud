import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  parseProgramQuery,
  programStatus,
  programTabWhere,
  type Program,
} from '@/components/admin/Dashboard/AtlasDashboard/model'
import { dashboardChoiceFor } from '@/components/admin/Dashboard/model'
import type { RoleSlug } from '@/payload-types'

import { testData } from '../utils/testData'

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
      kind: 'placeholder',
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
      kind: 'placeholder',
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

describe('manager home model', () => {
  it('reads the tab, page and page size from the URL, falling back on anything else', () => {
    expect(parseProgramQuery({ tab: 'review', page: '3', limit: '25' })).toEqual({
      tab: 'review',
      page: 3,
      limit: 25,
    })
    expect(parseProgramQuery({ tab: 'nope', page: '-2', limit: '7' })).toEqual({
      tab: 'all',
      page: 1,
      limit: 50,
    })
    expect(parseProgramQuery(undefined)).toEqual({ tab: 'all', page: 1, limit: 50 })
  })

  it('filters each tab on the stored rank', () => {
    expect(programTabWhere('all')).toEqual({})
    expect(programTabWhere('review')).toEqual({ verificationRank: { less_than_equal: 1 } })
    expect(programTabWhere('drafts')).toEqual({
      and: [{ verificationRank: { equals: 2 } }, { _status: { equals: 'draft' } }],
    })
  })

  it('gives each program the status its tab lists it under', () => {
    const program = (stage: Program['verificationStage'], published: boolean): Program => ({
      id: 1,
      title: 'Program',
      updatedAt: '2026-10-23',
      _status: published ? 'published' : 'draft',
      verificationStage: stage,
      published,
    })
    expect(programStatus(program('urgent', true))).toBe('review')
    expect(programStatus(program('unverified', false))).toBe('review')
    expect(programStatus(program('verified', false))).toBe('draft')
    expect(programStatus(program('verified', true))).toBe('published')
    expect(programStatus(program('finished', true))).toBe('finished')
  })
})
