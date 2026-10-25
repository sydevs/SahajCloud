import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  programGroups,
  programStatus,
  sortPrograms,
} from '@/components/admin/Dashboard/AtlasDashboard/model'
import { dashboardChoiceFor } from '@/components/admin/Dashboard/model'

import { testData } from '../utils/testData'

const choiceFor = (overrides: Parameters<typeof testData.dummyUser>[1]) =>
  dashboardChoiceFor(testData.dummyUser('managers', overrides) as unknown as PayloadRequest['user'])

describe('Atlas manager dashboard', () => {
  it('gives the Atlas home to anyone working in that project, whatever their role', () => {
    expect(choiceFor({ type: 'manager', currentProject: 'sahaj-atlas' })).toEqual({ kind: 'atlas' })
    // No role is read, so an admin in the project sees what its managers see.
    expect(choiceFor({ type: 'admin', currentProject: 'sahaj-atlas' })).toEqual({ kind: 'atlas' })
  })

  it('contains the Atlas home to its own project', () => {
    expect(choiceFor({ type: 'manager', currentProject: 'wemeditate-web' })).toEqual({
      kind: 'placeholder',
      project: 'wemeditate-web',
    })
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

  it('prioritises confirmation and counts each active program once, excluding finished', () => {
    const base = { title: 'Program', updatedAt: '2026-10-23' }
    const programs = sortPrograms([
      { ...base, id: 1, published: false, _status: 'draft', verificationStage: 'verified' },
      { ...base, id: 2, published: true, _status: 'published', verificationStage: 'finished' },
      { ...base, id: 3, published: true, _status: 'published', verificationStage: 'reminded' },
      { ...base, id: 4, published: false, _status: 'draft', verificationStage: 'urgent' },
    ])
    expect(programs.map((program) => program.id)).toEqual([4, 3, 1, 2])
    expect(programs.map(programStatus)).toEqual(['review', 'review', 'draft', 'finished'])
    const groups = programGroups(programs)
    expect(groups.review.map((program) => program.id)).toEqual([4, 3])
    expect(groups.drafts.map((program) => program.id)).toEqual([1])
    expect(groups.published).toEqual([])
    // Program 3 is live and needs review: the summary line must not count it twice.
    const summary = groups.published.length + groups.drafts.length + groups.review.length
    expect(summary).toBe(programs.filter((program) => programStatus(program) !== 'finished').length)
  })
})
