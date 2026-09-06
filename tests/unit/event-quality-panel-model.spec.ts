import { describe, expect, it } from 'vitest'

import type { ChecksMetadata } from '@/components/admin/EventQualityPanel/model'
import { buildPanelModel } from '@/components/admin/EventQualityPanel/model'
import { EVENT_QUALITY_CHECK_METADATA } from '@/lib/eventQuality'
import type { EventQualityReport } from '@/lib/eventQuality/types'

const metadata = EVENT_QUALITY_CHECK_METADATA as ChecksMetadata

const report = (overrides: Partial<Extract<EventQualityReport, { skipped: false }>> = {}) =>
  ({
    skipped: false,
    checks: [
      { key: 'description.missing', status: 'failed' },
      { key: 'images.insufficient', status: 'passed' },
      { key: 'title.quality', status: 'passed' },
    ],
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

  it('puts open findings first, then what already passes, in one list', () => {
    // No grouping — four checks does not warrant headings, and the passing rows
    // read as a quiet confirmation directly under the work still to do.
    const model = buildPanelModel(report(), metadata)
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.items.map((i) => [i.key, i.status])).toEqual([
      ['description.missing', 'failed'],
      ['images.insufficient', 'passed'],
      ['title.quality', 'passed'],
    ])
  })

  it('resolves every key to its registry label and description', () => {
    const model = buildPanelModel(report(), metadata)
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.items[0].label).toBe(metadata['description.missing'].label)
    expect(model.items[0].description).toBe(metadata['description.missing'].description)
  })

  it('words a passing item as a state, not as the instruction', () => {
    // A tick beside "Improve the event description" read as an endorsement.
    const model = buildPanelModel(report(), metadata)
    if (!model || model.skipped) throw new Error('expected a report model')
    const passing = model.items.find((i) => i.status === 'passed')
    expect(passing?.label).toBe(metadata['images.insufficient'].passedLabel)
    expect(passing?.label).not.toBe(metadata['images.insufficient'].label)
  })

  it('prefers the check’s own account of what it found', () => {
    const model = buildPanelModel(
      report({
        checks: [
          { key: 'description.quality', status: 'failed', detail: 'It repeats the address.' },
        ],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.items[0].description).toBe('It repeats the address.')
  })

  it('excludes pending items from the ratio — they are neither debt nor achievement', () => {
    const model = buildPanelModel(
      report({
        checks: [
          { key: 'description.missing', status: 'failed' },
          { key: 'images.insufficient', status: 'passed' },
          { key: 'title.quality', status: 'pending' },
        ],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.pendingCount).toBe(1)
    // 3 items, 1 pending → 2 with a verdict, 1 of them open.
    expect(model.total).toBe(2)
    expect(model.resolved).toBe(1)
    expect(model.openCount).toBe(1)
  })

  it('drops a key with no metadata rather than rendering a bare slug', () => {
    // A key with no label means a stale cached report. Showing a volunteer
    // manager "description.quality" helps nobody.
    const model = buildPanelModel(
      report({
        checks: [
          { key: 'not.a.real.check', status: 'failed' },
          { key: 'title.quality', status: 'passed' },
        ],
      }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.items.map((i) => i.key)).toEqual(['title.quality'])
  })

  it('resolves every registry key, so no shipped check can render unlabelled', () => {
    const allKeys = Object.keys(metadata)
    const model = buildPanelModel(
      report({ checks: allKeys.map((key) => ({ key, status: 'failed' as const })) }),
      metadata,
    )
    if (!model || model.skipped) throw new Error('expected a report model')
    expect(model.items.length).toBe(allKeys.length)
  })
})
