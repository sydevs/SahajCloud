import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  atlasDashboardLayout,
  needsAtlasDashboardFallback,
  programSummary,
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

  it('prioritises confirmation and counts actual draft state, excluding finished counts', () => {
    const base = { title: 'Program', updatedAt: '2026-10-23' }
    const data = programSummary([
      { ...base, id: 1, published: false, _status: 'draft', verificationStage: 'verified' },
      { ...base, id: 2, published: true, _status: 'published', verificationStage: 'finished' },
      { ...base, id: 3, published: true, _status: 'published', verificationStage: 'reminded' },
      { ...base, id: 4, published: false, _status: 'draft', verificationStage: 'urgent' },
    ])
    expect(data).toMatchObject({ published: 1, drafts: 2, needsConfirmation: 2 })
    expect(data.events.map((event) => event.id)).toEqual([4, 3, 1, 2])
  })
  it('adds the organiser home for saved collection or empty layouts without duplicating the widget', () => {
    expect(needsAtlasDashboardFallback(undefined)).toBe(false)
    expect(needsAtlasDashboardFallback({ layouts: [] })).toBe(true)
    expect(needsAtlasDashboardFallback({ layouts: [{ id: 'collections-0' }] })).toBe(true)
    expect(needsAtlasDashboardFallback({ layouts: [{ id: 'atlas-programs-0' }] })).toBe(false)
  })
})
