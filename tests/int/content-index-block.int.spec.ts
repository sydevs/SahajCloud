import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { computeApiEndpoint } from '@/hooks/contentIndexBlockHooks'

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
    it('generates meditation-tags endpoint with raw IDs', () => {
      const result = callHook({
        type: 'meditations',
        meditationFilters: [1, 2, 3],
      })
      expect(result).toBe('/api/meditation-tags?where[id][in]=1,2,3&depth=1')
    })

    it('generates meditation-tags endpoint with populated objects', () => {
      const result = callHook({
        type: 'meditations',
        meditationFilters: [{ id: 10, title: 'Tag A' }, { id: 20, title: 'Tag B' }],
      })
      expect(result).toBe('/api/meditation-tags?where[id][in]=10,20&depth=1')
    })

    it('appends depth=1 for meditation-tags queries', () => {
      const result = callHook({
        type: 'meditations',
        meditationFilters: [5],
      })
      expect(result).toContain('&depth=1')
    })
  })

  describe('pages type', () => {
    it('generates pages endpoint with string tag values', () => {
      const result = callHook({
        type: 'pages',
        pageFilters: ['wisdom', 'lifestyle'],
      })
      expect(result).toBe('/api/pages?where[tags][in]=wisdom,lifestyle')
    })

    it('does not append depth for pages', () => {
      const result = callHook({
        type: 'pages',
        pageFilters: ['creativity'],
      })
      expect(result).not.toContain('depth')
    })
  })

  describe('songs type', () => {
    it('generates songs endpoint with raw IDs', () => {
      const result = callHook({
        type: 'songs',
        songFilters: [5, 6],
      })
      expect(result).toBe('/api/songs?where[tags][in]=5,6')
    })

    it('generates songs endpoint with populated objects', () => {
      const result = callHook({
        type: 'songs',
        songFilters: [{ id: 7, title: 'Jazz' }],
      })
      expect(result).toBe('/api/songs?where[tags][in]=7')
    })
  })

  describe('lectures type', () => {
    it('generates lectures endpoint with raw IDs', () => {
      const result = callHook({
        type: 'lectures',
        lectureFilters: [10, 11],
      })
      expect(result).toBe('/api/lectures?where[tags][in]=10,11')
    })

    it('generates lectures endpoint with populated objects', () => {
      const result = callHook({
        type: 'lectures',
        lectureFilters: [{ id: 100, label: 'Beginner' }],
      })
      expect(result).toBe('/api/lectures?where[tags][in]=100')
    })
  })

  describe('null/empty cases', () => {
    it('returns null when type is missing', () => {
      expect(callHook({})).toBeNull()
    })

    it('returns null when type is unknown', () => {
      expect(callHook({ type: 'unknown' })).toBeNull()
    })

    it('returns null when filters are missing', () => {
      expect(callHook({ type: 'songs' })).toBeNull()
    })

    it('returns null when filters are empty array', () => {
      expect(callHook({ type: 'songs', songFilters: [] })).toBeNull()
    })

    it('returns null when all filter values are null', () => {
      expect(callHook({ type: 'songs', songFilters: [null, undefined] })).toBeNull()
    })
  })

  describe('mixed ID formats', () => {
    it('handles mix of raw IDs and populated objects', () => {
      const result = callHook({
        type: 'lectures',
        lectureFilters: [1, { id: 2, label: 'Tag' }, 3],
      })
      expect(result).toBe('/api/lectures?where[tags][in]=1,2,3')
    })

    it('skips null values in mixed filters', () => {
      const result = callHook({
        type: 'songs',
        songFilters: [1, null, 3],
      })
      expect(result).toBe('/api/songs?where[tags][in]=1,3')
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
      pageFilters: ['wisdom', 'lifestyle'],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      '/api/pages?where[tags][in]=wisdom,lifestyle',
    )
  })

  it('computes apiEndpoint for songs with relationship filters', async () => {
    const songTag = await testData.createSongTag(payload)
    const page = await createPageWithBlock({
      type: 'songs',
      songFilters: [songTag.id],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      `/api/songs?where[tags][in]=${songTag.id}`,
    )
  })

  it('computes apiEndpoint for meditations with meditation-tags base', async () => {
    const meditationTag = await testData.createMeditationTag(payload)
    const page = await createPageWithBlock({
      type: 'meditations',
      meditationFilters: [meditationTag.id],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      `/api/meditation-tags?where[id][in]=${meditationTag.id}&depth=1`,
    )
  })

  it('computes apiEndpoint for lectures with lecture-tags filters', async () => {
    const lectureTag = await testData.createLectureTag(payload)
    const page = await createPageWithBlock({
      type: 'lectures',
      lectureFilters: [lectureTag.id],
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      `/api/lectures?where[tags][in]=${lectureTag.id}`,
    )
  })

  it('returns null apiEndpoint when no filters are set', async () => {
    const page = await createPageWithBlock({ type: 'songs' })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBeNull()
  })
})
