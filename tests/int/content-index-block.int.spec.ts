import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { computeApiEndpoint } from '@/blocks/pages/ContentIndexBlock'

import { uniqueId } from '../utils/lexicalTestHelpers'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// =============================================================================
// Pure function tests for computeApiEndpoint hook
// =============================================================================

/**
 * Helper to invoke the hook with mock siblingData.
 * The hook only uses siblingData, so we can test it without a Payload instance.
 */
function callHook(siblingData: Record<string, unknown>): string | null {
  return computeApiEndpoint({ siblingData } as Parameters<typeof computeApiEndpoint>[0]) as
    | string
    | null
}

describe('computeApiEndpoint hook (pure)', () => {
  describe('meditations type', () => {
    it('generates user-choices endpoint with raw IDs', () => {
      const result = callHook({
        type: 'meditations',
        limit: 10,
        userChoiceFilters: [1, 2, 3],
      })
      expect(result).toBe('/api/user-choices?where[id][in]=1,2,3&depth=1&limit=10')
    })

    it('generates user-choices endpoint with populated objects', () => {
      const result = callHook({
        type: 'meditations',
        limit: 10,
        userChoiceFilters: [{ id: 10, title: 'Tag A' }, { id: 20, title: 'Tag B' }],
      })
      expect(result).toBe('/api/user-choices?where[id][in]=10,20&depth=1&limit=10')
    })

    it('appends depth=1 and limit in the correct order', () => {
      const result = callHook({
        type: 'meditations',
        limit: 25,
        userChoiceFilters: [5],
      })
      expect(result).toBe('/api/user-choices?where[id][in]=5&depth=1&limit=25')
    })
  })

  describe('pages type', () => {
    it('generates pages endpoint with string tag values', () => {
      const result = callHook({
        type: 'pages',
        limit: 10,
        pageFilters: ['wisdom', 'lifestyle'],
      })
      expect(result).toBe('/api/pages?where[tags][in]=wisdom,lifestyle&limit=10')
    })

    it('does not append depth for pages', () => {
      const result = callHook({
        type: 'pages',
        limit: 10,
        pageFilters: ['creativity'],
      })
      expect(result).not.toContain('depth')
    })
  })

  describe('songs type', () => {
    it('generates songs endpoint with raw IDs', () => {
      const result = callHook({
        type: 'songs',
        limit: 10,
        songFilters: [5, 6],
      })
      expect(result).toBe('/api/songs?where[tags][in]=5,6&limit=10')
    })

    it('generates songs endpoint with populated objects', () => {
      const result = callHook({
        type: 'songs',
        limit: 10,
        songFilters: [{ id: 7, title: 'Jazz' }],
      })
      expect(result).toBe('/api/songs?where[tags][in]=7&limit=10')
    })
  })

  describe('lectures type', () => {
    it('emits /for-audience with only limit — no where clause, no filter field required', () => {
      const result = callHook({ type: 'lectures', limit: 10 })
      expect(result).toBe('/api/lectures/for-audience?limit=10')
    })

    it('ignores any stale lecture filter data that may still be in siblingData', () => {
      const result = callHook({
        type: 'lectures',
        limit: 10,
        // simulate stale editor state from before the lectureFilters removal
        lectureFilters: [10, 11],
      })
      expect(result).toBe('/api/lectures/for-audience?limit=10')
      expect(result).not.toContain('where')
    })
  })

  describe('limit field coverage', () => {
    it('threads limit=100 through a filtered type', () => {
      const result = callHook({
        type: 'pages',
        limit: 100,
        pageFilters: ['wisdom'],
      })
      expect(result).toBe('/api/pages?where[tags][in]=wisdom&limit=100')
    })

    it('threads limit=25 through lectures (no-filter type)', () => {
      const result = callHook({ type: 'lectures', limit: 25 })
      expect(result).toBe('/api/lectures/for-audience?limit=25')
    })
  })

  describe('invalid limit', () => {
    it('returns null when limit is missing', () => {
      expect(callHook({ type: 'pages', pageFilters: ['wisdom'] })).toBeNull()
    })

    it('returns null when limit is 0', () => {
      expect(callHook({ type: 'pages', limit: 0, pageFilters: ['wisdom'] })).toBeNull()
    })

    it('returns null when limit exceeds 100', () => {
      expect(callHook({ type: 'pages', limit: 101, pageFilters: ['wisdom'] })).toBeNull()
    })

    it('returns null when limit is a string', () => {
      expect(callHook({ type: 'pages', limit: 'ten', pageFilters: ['wisdom'] })).toBeNull()
    })

    it('returns null when limit is a non-integer float', () => {
      expect(callHook({ type: 'pages', limit: 10.5, pageFilters: ['wisdom'] })).toBeNull()
    })

    it('returns null when limit is negative', () => {
      expect(callHook({ type: 'pages', limit: -1, pageFilters: ['wisdom'] })).toBeNull()
    })
  })

  describe('null/empty cases', () => {
    it('returns null when type is missing', () => {
      expect(callHook({ limit: 10 })).toBeNull()
    })

    it('returns null when type is unknown', () => {
      expect(callHook({ type: 'unknown', limit: 10 })).toBeNull()
    })

    it('returns null when type is the removed lecture-clips (stale block data)', () => {
      expect(callHook({ type: 'lecture-clips', limit: 10 })).toBeNull()
    })

    it('returns null when filters are missing for a filtered type', () => {
      expect(callHook({ type: 'songs', limit: 10 })).toBeNull()
    })

    it('returns null when filters are empty array', () => {
      expect(callHook({ type: 'songs', limit: 10, songFilters: [] })).toBeNull()
    })

    it('returns null when all filter values are null', () => {
      expect(callHook({ type: 'songs', limit: 10, songFilters: [null, undefined] })).toBeNull()
    })
  })

  describe('mixed ID formats', () => {
    it('handles mix of raw IDs and populated objects', () => {
      const result = callHook({
        type: 'songs',
        limit: 10,
        songFilters: [1, { id: 2, title: 'Tag' }, 3],
      })
      expect(result).toBe('/api/songs?where[tags][in]=1,2,3&limit=10')
    })

    it('skips null values in mixed filters', () => {
      const result = callHook({
        type: 'songs',
        limit: 10,
        songFilters: [1, null, 3],
      })
      expect(result).toBe('/api/songs?where[tags][in]=1,3&limit=10')
    })
  })
})

// =============================================================================
// Integration test — virtual field computed through Payload
// =============================================================================

describe('ContentIndexBlock apiEndpoint (integration)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /**
   * Create a page with a ContentIndexBlock as Lexical content.
   * Uses draft: true to bypass Payload's relationship validation for block fields.
   */
  async function createPageWithBlock(fields: Record<string, unknown>) {
    const content = {
      root: {
        type: 'root',
        children: [
          {
            type: 'block',
            version: 2,
            fields: {
              id: uniqueId(),
              blockName: 'Content Index',
              blockType: 'content-index',
              ...fields,
            },
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    }

    return payload.create({
      collection: 'pages',
      draft: true,
      data: { title: `Test Page ${uniqueId()}`, content: content as any },
    })
  }

  /** Extract block fields from a fetched page's Lexical content */
  function getBlockFields(page: { content?: any }): Record<string, unknown> {
    const root = page.content?.root as { children: Array<Record<string, unknown>> }
    return root.children[0].fields as Record<string, unknown>
  }

  it('computes apiEndpoint for pages with pageFilters', async () => {
    const page = await createPageWithBlock({
      type: 'pages',
      limit: 10,
      pageFilters: ['wisdom', 'lifestyle'],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      '/api/pages?where[tags][in]=wisdom,lifestyle&limit=10',
    )
  })

  it('computes apiEndpoint for songs with relationship filters', async () => {
    const songTag = await testData.createSongTag(payload)
    const page = await createPageWithBlock({
      type: 'songs',
      limit: 10,
      songFilters: [songTag.id],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      `/api/songs?where[tags][in]=${songTag.id}&limit=10`,
    )
  })

  it('computes apiEndpoint for meditations with user-choices base', async () => {
    const userChoice = await testData.createUserChoice(payload)
    const page = await createPageWithBlock({
      type: 'meditations',
      limit: 10,
      userChoiceFilters: [userChoice.id],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      `/api/user-choices?where[id][in]=${userChoice.id}&depth=1&limit=10`,
    )
  })

  it('computes apiEndpoint for lectures — /for-audience with only limit, no filter required', async () => {
    const page = await createPageWithBlock({
      type: 'lectures',
      limit: 10,
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe('/api/lectures/for-audience?limit=10')
  })

  it('returns null apiEndpoint when no filters are set for a filtered type', async () => {
    const page = await createPageWithBlock({ type: 'songs', limit: 10 })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBeNull()
  })

  it('returns null apiEndpoint when limit is missing', async () => {
    const page = await createPageWithBlock({
      type: 'pages',
      pageFilters: ['wisdom'],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBeNull()
  })

  it('clears stale filter values when type does not match', async () => {
    const songTag = await testData.createSongTag(payload)
    // Create a page with songs type and songFilters
    const page = await createPageWithBlock({
      type: 'songs',
      limit: 10,
      songFilters: [songTag.id],
      // Simulate stale data: pageFilters left over from a previous type selection
      pageFilters: ['wisdom'],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    const fields = getBlockFields(fetched)

    // Active filter should be present
    expect(fields.apiEndpoint).toBe(`/api/songs?where[tags][in]=${songTag.id}&limit=10`)
    // Stale filter should be removed entirely by afterRead hook
    expect(fields).not.toHaveProperty('pageFilters')
  })
})
