import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Album, AppCard, Image } from '@/payload-types'

import { appCardsForUser } from '@/endpoints'
import { evaluateRules } from '@/lib/appCards/evaluateRules'
import { weightedSample } from '@/lib/appCards/weightedSample'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// ── Unit: evaluateRules ────────────────────────────────────────────────────────

describe('evaluateRules', () => {
  it('returns true for null / undefined / empty rules', () => {
    expect(evaluateRules(null, {})).toBe(true)
    expect(evaluateRules(undefined, {})).toBe(true)
    expect(evaluateRules({}, {})).toBe(true)
    expect(evaluateRules({ logic: 'AND' }, {})).toBe(true)
    expect(evaluateRules({ logic: 'OR' }, { hasRealization: true })).toBe(true)
  })

  it('matches a boolean rule when caller value equals stored value', () => {
    expect(evaluateRules({ hasRealization: true }, { hasRealization: true })).toBe(true)
    expect(evaluateRules({ hasRealization: false }, { hasRealization: false })).toBe(true)
  })

  it('fails a boolean rule when caller value differs', () => {
    expect(evaluateRules({ hasRealization: true }, { hasRealization: false })).toBe(false)
    expect(evaluateRules({ hasRealization: false }, { hasRealization: true })).toBe(false)
  })

  it('fails a boolean rule when caller omits the param', () => {
    expect(evaluateRules({ hasRealization: true }, {})).toBe(false)
  })

  it('matches a range rule at inclusive bounds', () => {
    const rules = { pathProgress: { min: 1, max: 5 } }
    expect(evaluateRules(rules, { pathProgress: 1 })).toBe(true)
    expect(evaluateRules(rules, { pathProgress: 3 })).toBe(true)
    expect(evaluateRules(rules, { pathProgress: 5 })).toBe(true)
  })

  it('fails a range rule outside the bounds', () => {
    const rules = { pathProgress: { min: 1, max: 5 } }
    expect(evaluateRules(rules, { pathProgress: 0 })).toBe(false)
    expect(evaluateRules(rules, { pathProgress: 6 })).toBe(false)
  })

  it('treats open-ended min / max as ±Infinity', () => {
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: -100 })).toBe(true)
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: 5 })).toBe(true)
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: 6 })).toBe(false)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 9 })).toBe(false)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 10 })).toBe(true)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 9999 })).toBe(true)
  })

  it('fails a range rule when caller omits the param', () => {
    expect(evaluateRules({ pathProgress: { min: 0, max: 5 } }, {})).toBe(false)
  })

  it('applies AND logic by default (all rules must pass)', () => {
    const rules = {
      hasRealization: true,
      pathProgress: { min: 1, max: 5 },
    }
    expect(evaluateRules(rules, { hasRealization: true, pathProgress: 3 })).toBe(true)
    expect(evaluateRules(rules, { hasRealization: true, pathProgress: 6 })).toBe(false)
    expect(evaluateRules(rules, { hasRealization: false, pathProgress: 3 })).toBe(false)
  })

  it('applies OR logic (any rule may pass)', () => {
    const rules = {
      logic: 'OR' as const,
      hasRealization: true,
      pathProgress: { min: 10, max: 20 },
    }
    expect(evaluateRules(rules, { hasRealization: true, pathProgress: 1 })).toBe(true)
    expect(evaluateRules(rules, { hasRealization: false, pathProgress: 15 })).toBe(true)
    expect(evaluateRules(rules, { hasRealization: false, pathProgress: 1 })).toBe(false)
  })

  it('treats missing caller param as failure for OR logic too', () => {
    const rules = {
      logic: 'OR' as const,
      hasRealization: true,
      pathProgress: { min: 1, max: 5 },
    }
    // Neither param supplied → both rules fail → OR is false
    expect(evaluateRules(rules, {})).toBe(false)
  })
})

// ── Unit: weightedSample ───────────────────────────────────────────────────────

describe('weightedSample', () => {
  const weightOf = (x: { w: number }) => x.w

  it('returns [] for empty input', () => {
    expect(weightedSample([], 5, weightOf)).toEqual([])
  })

  it('returns [] when limit is 0 or negative', () => {
    expect(weightedSample([{ w: 1 }], 0, weightOf)).toEqual([])
    expect(weightedSample([{ w: 1 }], -1, weightOf)).toEqual([])
  })

  it('returns the single item for a single-element input', () => {
    const result = weightedSample([{ w: 3 }], 5, weightOf)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ w: 3 })
  })

  it('returns at most `limit` items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, w: 1 }))
    const result = weightedSample(items, 3, weightOf)
    expect(result).toHaveLength(3)
  })

  it('returns all items when limit exceeds input length', () => {
    const items = [{ id: 1, w: 1 }, { id: 2, w: 2 }]
    const result = weightedSample(items, 10, weightOf)
    expect(result).toHaveLength(2)
  })

  it('never produces duplicates (sampling without replacement)', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i, w: 1 }))
    for (let trial = 0; trial < 50; trial++) {
      const result = weightedSample(items, 15, weightOf)
      const ids = result.map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('falls back to uniform random when all weights are zero', () => {
    const items = [{ id: 'a', w: 0 }, { id: 'b', w: 0 }, { id: 'c', w: 0 }]
    const result = weightedSample(items, 2, weightOf)
    expect(result).toHaveLength(2)
    const ids = new Set(result.map((x) => x.id))
    expect(ids.size).toBe(2)
  })

  it('distributes roughly in proportion to weights over many trials', () => {
    const items = [
      { id: 'low', w: 1 },
      { id: 'high', w: 5 },
    ]
    const counts = { low: 0, high: 0 }
    const iterations = 5000

    for (let i = 0; i < iterations; i++) {
      const [picked] = weightedSample(items, 1, weightOf)
      counts[picked.id as 'low' | 'high']++
    }

    // Expected: high ~5x more frequent than low (5000 * 5/6 ≈ 4167 vs 833).
    // Loose tolerance: high should outpace low by at least 3x.
    expect(counts.high).toBeGreaterThan(counts.low * 3)
  })

  it('supports an injected random function for determinism', () => {
    const items = [{ id: 'a', w: 1 }, { id: 'b', w: 1 }, { id: 'c', w: 1 }]
    // Always returns 0 → always picks index 0 from the current pool
    const pickFirst = () => 0
    const result = weightedSample(items, 3, weightOf, pickFirst)
    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})

// ── Integration: /api/app-cards/for-user endpoint ──────────────────────────────

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
): Promise<{ status: number; body: unknown }> {
  const req = {
    payload,
    query,
    headers: {},
    routeParams: {},
  } as unknown as PayloadRequest

  const response = (await appCardsForUser.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('appCardsForUser endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let heroCardAll: AppCard
  let heroCardRealized: AppCard
  let highlightsCard: AppCard
  let draftHeroCard: AppCard
  let bothSectionsCard: AppCard
  let contentAlbum: Album
  let contentCard: AppCard

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const img = await testData.createMediaImage(payload, { alt: 'Shared card image' })
    const imageId = img.id

    // Hero card with no rules — matches any caller
    heroCardAll = await testData.createAppCard(payload, {
      title: 'Hero All',
      image: imageId,
      targetSections: ['hero'],
      weight: 3,
      _status: 'published',
    })

    // Hero card requiring hasRealization=true AND pathProgress between 1 and 5
    heroCardRealized = await testData.createAppCard(payload, {
      title: 'Hero Realized',
      image: imageId,
      targetSections: ['hero'],
      rules: {
        logic: 'AND',
        hasRealization: true,
        pathProgress: { min: 1, max: 5 },
      },
      weight: 3,
      _status: 'published',
    })

    // Highlights-only card
    highlightsCard = await testData.createAppCard(payload, {
      title: 'Highlights Only',
      image: imageId,
      targetSections: ['highlights'],
      weight: 3,
      _status: 'published',
    })

    // Draft card that should never appear
    draftHeroCard = await testData.createAppCard(payload, {
      title: 'Draft Hero',
      image: imageId,
      targetSections: ['hero'],
      weight: 3,
      _status: 'draft',
    })

    // Card targeted to both sections
    bothSectionsCard = await testData.createAppCard(payload, {
      title: 'Hero and Highlights',
      image: imageId,
      targetSections: ['hero', 'highlights'],
      weight: 3,
      _status: 'published',
    })

    // Card with content relationship — verifies depth:1 population
    contentAlbum = await testData.createAlbum(payload, { title: 'Content Album' })
    contentCard = await testData.createAppCard(payload, {
      title: 'Content Card',
      image: imageId,
      type: 'content',
      content: { relationTo: 'albums', value: contentAlbum.id },
      appPage: null,
      targetSections: ['hero'],
      weight: 3,
      _status: 'published',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when targetSection is missing', async () => {
    const { status } = await callEndpoint(payload, { limit: 5 })
    expect(status).toBe(400)
  })

  it('returns 400 when targetSection is invalid', async () => {
    const { status } = await callEndpoint(payload, { targetSection: 'footer', limit: 5 })
    expect(status).toBe(400)
  })

  it('returns 400 when limit is missing', async () => {
    const { status } = await callEndpoint(payload, { targetSection: 'hero' })
    expect(status).toBe(400)
  })

  it('returns 400 when limit is out of range', async () => {
    const low = await callEndpoint(payload, { targetSection: 'hero', limit: 0 })
    expect(low.status).toBe(400)
    const high = await callEndpoint(payload, { targetSection: 'hero', limit: 21 })
    expect(high.status).toBe(400)
  })

  it('excludes draft cards', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).not.toContain(draftHeroCard.id)
  })

  it('filters by targetSection = hero', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(heroCardAll.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(highlightsCard.id)
  })

  it('filters by targetSection = highlights', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'highlights',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(highlightsCard.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(heroCardAll.id)
  })

  it('excludes cards whose rules do not match caller inputs', async () => {
    // Caller without hasRealization → heroCardRealized fails
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(heroCardRealized.id)
  })

  it('includes cards whose rules match caller inputs', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
      hasRealization: 'true',
      pathProgress: 3,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).toContain(heroCardRealized.id)
  })

  it('respects the limit parameter', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 1,
    })
    const docs = (body as { docs: AppCard[] }).docs
    expect(docs).toHaveLength(1)
  })

  it('populates relationships at depth 1', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    const docs = (body as { docs: AppCard[] }).docs
    const card = docs.find((c) => c.id === contentCard.id)
    expect(card).toBeDefined()
    // image relationship populated
    const image = card!.image as Image
    expect(typeof image).toBe('object')
    expect(image.id).toBeDefined()
    // content relationship populated
    const content = card!.content as { relationTo: string; value: Album }
    expect(content.relationTo).toBe('albums')
    expect(typeof content.value).toBe('object')
    expect((content.value as Album).title).toBe('Content Album')
  })
})
