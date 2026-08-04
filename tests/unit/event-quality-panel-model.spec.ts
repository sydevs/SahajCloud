import { describe, expect, it } from 'vitest'

import type { ChecksMetadata } from '@/components/admin/EventQualityPanel/model'
import { buildPanelModel } from '@/components/admin/EventQualityPanel/model'
import { EVENT_QUALITY_CHECK_METADATA } from '@/lib/eventQuality'
import type { EventQualityReport } from '@/lib/eventQuality/types'

const metadata = EVENT_QUALITY_CHECK_METADATA as ChecksMetadata

const report = (overrides: Partial<Extract<EventQualityReport, { skipped: false }>> = {}) =>
  ({
    skipped: false,
    document: [
      { key: 'description.missing', status: 'failed' },
      { key: 'images.missing', status: 'passed' },
    ],
    perLocale: { en: [{ key: 'translation.title.missing', status: 'passed' }] },
    locales: ['en'],
    openCount: 1,
    ...overrides,
  }) satisfies EventQualityReport

describe('buildPanelModel', () => {
  it('renders nothing for an unsaved document', () => {
    expect(buildPanelModel(null, metadata)).toBeNull()
    expect(buildPanelModel(undefined, metadata)).toBeNull()
  })

  it('passes a skip reason straight through for the panel to explain', () => {
    expect(buildPanelModel({ skipped: true, reason: 'finished' }, metadata)).toEqual({
      skipped: true,
      reason: 'finished',
    })
  })

  it('groups items by tier and puts open findings first', () => {
    const model = buildPanelModel(report(), metadata)
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.groups.map((g) => g.tier)).toEqual(['completeness', 'translation'])
    expect(model.groups[0].items.map((i) => [i.key, i.status])).toEqual([
      ['description.missing', 'failed'],
      ['images.missing', 'passed'],
    ])
  })

  it('resolves every key to its registry label and description', () => {
    const model = buildPanelModel(report(), metadata)
    if (!model || model.skipped) throw new Error('expected a report model')
    const item = model.groups[0].items[0]
    expect(item.label).toBe(metadata['description.missing'].label)
    expect(item.description).toBe(metadata['description.missing'].description)
  })

  it('tags a per-locale item with the locale it is about', () => {
    const model = buildPanelModel(
      report({
        perLocale: {
          en: [{ key: 'translation.title.missing', status: 'passed' }],
          de: [{ key: 'translation.title.missing', status: 'failed' }],
        },
        locales: ['en', 'de'],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    const translations = model.groups.find((g) => g.tier === 'translation')
    expect(translations?.items.map((i) => [i.locale, i.status])).toEqual([
      ['de', 'failed'],
      ['en', 'passed'],
    ])
  })

  it('excludes pending items from the ratio — they are neither debt nor achievement', () => {
    const model = buildPanelModel(
      report({
        perLocale: {
          en: [{ key: 'translation.title.missing', status: 'passed' }],
          de: [{ key: 'translation.title.missing', status: 'pending' }],
        },
        locales: ['en', 'de'],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.pendingCount).toBe(1)
    // 4 items, 1 pending → 3 with a verdict, 1 of them open.
    expect(model.total).toBe(3)
    expect(model.resolved).toBe(2)
    expect(model.openCount).toBe(1)
  })

  it('drops a key with no metadata rather than rendering a bare slug', () => {
    // A key with no label means a stale cached report; showing a volunteer
    // manager "description.tooShort" helps nobody.
    const model = buildPanelModel(
      report({ document: [{ key: 'not.a.real.check', status: 'failed' }] }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.groups.flatMap((g) => g.items).map((i) => i.key)).toEqual([
      'translation.title.missing',
    ])
  })

  it('resolves every registry key, so no shipped check can render unlabelled', () => {
    const allKeys = Object.keys(metadata)
    const model = buildPanelModel(
      report({
        document: allKeys.map((key) => ({ key, status: 'failed' as const })),
        perLocale: {},
        locales: [],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.groups.flatMap((g) => g.items).length).toBe(allKeys.length)
  })
})
