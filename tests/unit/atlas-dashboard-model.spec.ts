import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  atlasDashboardLayout,
  needsAtlasDashboardFallback,
  programGroups,
  programStatus,
  sortPrograms,
} from '@/components/admin/AtlasDashboard/model'

import { testData } from '../utils/testData'

describe('Atlas organiser dashboard', () => {
  it('keeps the collection dashboard for admins and other projects', () => {
    for (const user of [
      testData.dummyUser('managers', { type: 'admin', currentProject: 'sahaj-atlas' }),
      testData.dummyUser('managers', { type: 'manager', currentProject: 'wemeditate-web' }),
    ]) {
      expect(atlasDashboardLayout({ req: { user } as PayloadRequest })[0].widgetSlug).toBe(
        'collections',
      )
    }
    expect(
      atlasDashboardLayout({
        req: {
          user: testData.dummyUser('managers', { type: 'manager', currentProject: 'sahaj-atlas' }),
        } as PayloadRequest,
      })[0].widgetSlug,
    ).toBe('atlas-programs')
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
  it('adds the organiser home for saved collection or empty layouts without duplicating the widget', () => {
    expect(needsAtlasDashboardFallback(undefined)).toBe(false)
    expect(needsAtlasDashboardFallback({ layouts: [] })).toBe(true)
    expect(needsAtlasDashboardFallback({ layouts: [{ id: 'collections-0' }] })).toBe(true)
    expect(needsAtlasDashboardFallback({ layouts: [{ id: 'atlas-programs-0' }] })).toBe(false)
  })
})
