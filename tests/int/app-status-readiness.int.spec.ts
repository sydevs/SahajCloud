import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { appCardChecks } from '@/globals/WeMeditateAppStatus/sections/shared'
import { labelOf } from '@/lib/status'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// The readiness section (src/globals/WeMeditateAppStatus/sections/appCards.ts)
// fetches app-cards with exactly this narrowed select. These tests guard that
// appCardChecks + labelOf still resolve correctly under it — a future check that
// reads an unselected field would regress to a false "not ready" or a "#id" label.
// app-cards carry their display name in the top-level `label` field (there is no
// top-level title/name — those live inside the `default` view group), so labelOf
// resolves to `label`.
const READINESS_SELECT = { _status: true, default: true, label: true } as const

type LabelDoc = { id: number | string; title?: unknown; name?: unknown; label?: unknown }

describe('App Status Readiness Checks (#568)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('resolves labels and checks under the narrowed readiness select', async () => {
    const publishedCard = await testData.createAppCard(payload, {
      label: 'Published Card',
      default: { title: 'Published Title', subtitle: 'Published Subtitle', buttonText: 'Click Me' },
      _status: 'published',
    })
    const incompleteCard = await testData.createAppCard(payload, {
      label: 'Incomplete Card',
      default: { title: 'Only Title' }, // no subtitle / buttonText
      _status: 'published',
    })

    const { docs } = await payload.find({
      collection: 'app-cards',
      where: { id: { in: [publishedCard.id, incompleteCard.id] } },
      select: READINESS_SELECT,
    })
    expect(docs).toHaveLength(2)

    const pub = docs.find((d) => d.id === publishedCard.id) as unknown as Record<string, unknown>
    expect(labelOf(pub as LabelDoc)).toBe('Published Card')
    expect(appCardChecks(pub)).toEqual([
      { key: 'published', passed: true },
      { key: 'title-set', passed: true },
      { key: 'subtitle-set', passed: true },
      { key: 'button-label-set', passed: true },
    ])

    const incomplete = docs.find((d) => d.id === incompleteCard.id) as unknown as Record<
      string,
      unknown
    >
    expect(labelOf(incomplete as LabelDoc)).toBe('Incomplete Card')
    expect(appCardChecks(incomplete)).toEqual([
      { key: 'published', passed: true },
      { key: 'title-set', passed: true },
      { key: 'subtitle-set', passed: false },
      { key: 'button-label-set', passed: false },
    ])
  })

  it('produces identical readiness output with the narrowed select and a full fetch', async () => {
    const readyCard = await testData.createAppCard(payload, {
      label: 'Ready Card',
      default: { title: 'Ready Title', subtitle: 'Ready Subtitle', buttonText: 'Go!' },
      _status: 'published',
    })

    const { docs: narrowedDocs } = await payload.find({
      collection: 'app-cards',
      where: { id: { equals: readyCard.id } },
      select: READINESS_SELECT,
    })
    const { docs: fullDocs } = await payload.find({
      collection: 'app-cards',
      where: { id: { equals: readyCard.id } },
    })
    expect(narrowedDocs).toHaveLength(1)
    expect(fullDocs).toHaveLength(1)

    const narrowed = narrowedDocs[0] as unknown as Record<string, unknown>
    const full = fullDocs[0] as unknown as Record<string, unknown>

    // The narrowed select must not change what the readiness report computes.
    expect(appCardChecks(narrowed)).toEqual(appCardChecks(full))
    expect(labelOf(narrowed as LabelDoc)).toEqual(labelOf(full as LabelDoc))
    expect(labelOf(narrowed as LabelDoc)).toBe('Ready Card')
    expect(appCardChecks(narrowed)).toEqual([
      { key: 'published', passed: true },
      { key: 'title-set', passed: true },
      { key: 'subtitle-set', passed: true },
      { key: 'button-label-set', passed: true },
    ])
  })
})
