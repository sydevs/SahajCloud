import { describe, expect, it } from 'vitest'

import {
  bucketForEvent,
  buildRegionCreateUrl,
  buildRegionTree,
  childLevelOf,
  type EventBucket,
  EVENT_BUCKET_ORDER,
  hasUnpublished,
  regionLevelLabel,
  regionPillLabel,
  regionPillStyle,
  regionPillTooltip,
  rollUpRegionCounts,
  type SidebarCountEventInput,
  type SidebarEventInput,
  type SidebarRegionInput,
  sortEventsIntoBuckets,
} from '@/lib/atlasSidebar/sidebarModel'
import type { Region } from '@/payload-types'

describe('bucketForEvent', () => {
  it('maps each verification stage to its display bucket', () => {
    const cases: Array<[SidebarEventInput['verificationStage'], EventBucket]> = [
      ['urgent', 'urgent'],
      ['reminded', 'needsVerification'],
      ['escalated', 'needsVerification'],
      // Pre-adoption stages share existing buckets: unverified sits with the
      // verification-pending events, denied with the system-unpublished ones.
      ['unverified', 'needsVerification'],
      ['expired', 'expired'],
      ['denied', 'expired'],
      ['verified', 'verified'],
      ['finished', 'finished'],
    ]
    for (const [stage, bucket] of cases) {
      expect(bucketForEvent({ verificationStage: stage })).toBe(bucket)
    }
  })

  it('puts any trashed event in the Trashed bucket regardless of stage', () => {
    expect(bucketForEvent({ verificationStage: 'expired', deletedAt: '2026-01-01' })).toBe(
      'trashed',
    )
    // Trash wins even over urgent (a manually-trashed urgent event).
    expect(bucketForEvent({ verificationStage: 'urgent', deletedAt: '2026-01-01' })).toBe('trashed')
  })
})

describe('sortEventsIntoBuckets', () => {
  const ev = (over: Partial<SidebarEventInput>): SidebarEventInput => ({
    id: 1,
    title: 'Event',
    verificationStage: 'verified',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  it('orders events by bucket then updatedAt desc', () => {
    const input: SidebarEventInput[] = [
      ev({ id: 1, verificationStage: 'finished' }),
      ev({ id: 2, verificationStage: 'verified', updatedAt: '2026-02-01T00:00:00.000Z' }),
      ev({ id: 3, verificationStage: 'verified', updatedAt: '2026-03-01T00:00:00.000Z' }),
      ev({ id: 4, verificationStage: 'urgent' }),
      ev({ id: 5, verificationStage: 'expired' }),
      ev({ id: 6, verificationStage: 'reminded' }),
      ev({ id: 7, verificationStage: 'verified', deletedAt: '2026-01-01' }),
    ]
    const out = sortEventsIntoBuckets(input)
    // urgent(4), needsVerification(6), expired(5), verified(3 before 2 by updatedAt desc), trashed(7), finished(1)
    expect(out.map((e) => e.id)).toEqual([4, 6, 5, 3, 2, 7, 1])
  })

  it('keeps EVENT_BUCKET_ORDER as the source of truth for ordering', () => {
    const input = EVENT_BUCKET_ORDER.map((_, i) => ev({ id: i + 1, verificationStage: 'finished' }))
    // All finished → relative order preserved (stable) when keys tie.
    expect(sortEventsIntoBuckets(input).every((e) => e.bucket === 'finished')).toBe(true)
  })

  it('falls back to a placeholder for blank titles', () => {
    const [item] = sortEventsIntoBuckets([ev({ title: '   ' })])
    expect(item.title).toBe('(untitled event)')
  })
})

describe('rollUpRegionCounts', () => {
  // Tree: country(1) > region(2) > city(3). Events sit on leaves and roll up.
  const subtree = new Set([1, 2, 3])
  const countEvent = (over: Partial<SidebarCountEventInput>): SidebarCountEventInput => ({
    regionId: 3,
    ancestorRegionIds: [1, 2],
    published: true,
    countsTowardTotal: true,
    ...over,
  })

  it('rolls each event up to its region and every ancestor in the subtree', () => {
    const counts = rollUpRegionCounts([countEvent({})], subtree)
    expect(counts.get(3)).toEqual({ published: 1, total: 1 })
    expect(counts.get(2)).toEqual({ published: 1, total: 1 })
    expect(counts.get(1)).toEqual({ published: 1, total: 1 })
  })

  it('ignores ancestors outside the subtree', () => {
    // ancestor 99 is above the owned root and not in the subtree.
    const counts = rollUpRegionCounts(
      [countEvent({ regionId: 3, ancestorRegionIds: [99, 1] })],
      subtree,
    )
    expect(counts.has(99)).toBe(false)
    expect(counts.get(1)).toEqual({ published: 1, total: 1 })
  })

  it('separates published from total (expired events count toward total only)', () => {
    const counts = rollUpRegionCounts(
      [
        countEvent({ published: true, countsTowardTotal: true }),
        countEvent({ published: false, countsTowardTotal: true }), // expired
        countEvent({ published: false, countsTowardTotal: false }), // finished
      ],
      subtree,
    )
    expect(counts.get(1)).toEqual({ published: 1, total: 2 })
  })
})

describe('buildRegionTree', () => {
  const region = (
    id: number,
    name: string,
    parentId: number | null,
    level: Region['level'] = 'city',
  ): SidebarRegionInput => ({
    id,
    name,
    level,
    parentId,
    ancestorIds: [],
  })

  it('carries each node level through to the built tree', () => {
    const tree = buildRegionTree([region(1, 'Country', null, 'country')], new Map())
    expect(tree[0].level).toBe('country')
  })

  it('nests regions under their parent and roots the topmost owned regions', () => {
    const regions = [region(3, 'City', 2), region(2, 'Region', 1), region(1, 'Country', null)]
    const tree = buildRegionTree(regions, new Map())
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe(1)
    expect(tree[0].children[0].id).toBe(2)
    expect(tree[0].children[0].children[0].id).toBe(3)
  })

  it('treats a region whose parent is outside the subtree as a display root', () => {
    // City(3) is owned but its parent Region(2) is not in the subtree set.
    const tree = buildRegionTree([region(3, 'City', 2)], new Map())
    expect(tree.map((n) => n.id)).toEqual([3])
  })

  it('sorts siblings alphabetically and attaches rolled-up counts', () => {
    const regions = [region(1, 'Root', null), region(2, 'Bravo', 1), region(3, 'Alpha', 1)]
    const counts = new Map([[1, { published: 1, total: 3 }]])
    const tree = buildRegionTree(regions, counts)
    expect(tree[0].counts).toEqual({ published: 1, total: 3 })
    expect(tree[0].children.map((c) => c.name)).toEqual(['Alpha', 'Bravo'])
  })
})

describe('childLevelOf', () => {
  it('maps each level to the level its child would be (venue is a leaf)', () => {
    expect(childLevelOf('country')).toBe('region')
    expect(childLevelOf('region')).toBe('city')
    expect(childLevelOf('city')).toBe('venue')
    expect(childLevelOf('venue')).toBeNull()
  })
})

describe('regionLevelLabel', () => {
  it('labels each level (venue reads as "Venue")', () => {
    expect(regionLevelLabel('country')).toBe('Country')
    expect(regionLevelLabel('region')).toBe('Region')
    expect(regionLevelLabel('city')).toBe('City')
    expect(regionLevelLabel('venue')).toBe('Venue')
  })
})

describe('buildRegionCreateUrl', () => {
  // The `parent` / `childLevel` param names are a contract: RegionCreatePrefill
  // reads them to seed the create form, and both the sidebar "+" links and the
  // child-tab "New …" buttons build the URL through this helper.
  it('builds the prefilled create URL with parent + childLevel params', () => {
    expect(buildRegionCreateUrl(42, 'city')).toBe(
      '/admin/collections/regions/create?parent=42&childLevel=city',
    )
  })

  it('accepts a string parent id', () => {
    expect(buildRegionCreateUrl('7', 'venue')).toBe(
      '/admin/collections/regions/create?parent=7&childLevel=venue',
    )
  })
})

describe('region pill helpers', () => {
  it('flags a subtree with unpublished (expired) events', () => {
    expect(hasUnpublished({ published: 1, total: 3 })).toBe(true)
    expect(hasUnpublished({ published: 2, total: 2 })).toBe(false)
  })

  it('describes the pill in its tooltip', () => {
    expect(regionPillTooltip({ published: 2, total: 2 })).toBe('All events are published')
    expect(regionPillTooltip({ published: 1, total: 3 })).toBe('2 unpublished events')
  })

  it('shows a single number + success when all events are published', () => {
    expect(regionPillLabel({ published: 2, total: 2 })).toBe('2')
    expect(regionPillStyle({ published: 2, total: 2 })).toBe('success')
  })

  it('shows published/total + warning when some are unpublished', () => {
    expect(regionPillLabel({ published: 1, total: 3 })).toBe('1/3')
    expect(regionPillStyle({ published: 1, total: 3 })).toBe('warning')
  })
})
