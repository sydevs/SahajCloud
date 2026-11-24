import type { Payload, PayloadRequest } from 'payload'

import { parseParams } from 'payload'
import * as qs from 'qs-esm'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { computeApiEndpoint } from '@/lib/richEditor/blocks/ContentIndexBlock'

import { uniqueId } from '../utils/lexicalTestHelpers'
import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/**
 * Payload's own REST parse of a computed endpoint's query string:
 * `qs.parse` with `createPayloadRequest`'s options, then payload's
 * `parseParams`. Reproducing neither is what keeps a case from passing against
 * an uncoerced string — `'false'` is truthy, and `sort` is split on commas
 * here and nowhere in this repo.
 */
function parseEndpointQuery(endpoint: string): Record<string, unknown> {
  const search = endpoint.split('?')[1] ?? ''
  const query = qs.parse(search, {
    arrayLimit: 1000,
    depth: 10,
    ignoreQueryPrefix: true,
  }) as Record<string, unknown>
  // `parseParams` mutates its argument, which is why the spread is not reused.
  return parseParams({ ...query }) as Record<string, unknown>
}

// --- Pure function tests for computeApiEndpoint hook ---

/**
 * Helper to invoke the hook with mock siblingData.
 * The hook only uses siblingData, so we can test it without a Payload instance.
 */
function callHook(siblingData: Record<string, unknown>): string | null {
  return computeApiEndpoint({ siblingData } as Parameters<typeof computeApiEndpoint>[0]) as
    string | null
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
        userChoiceFilters: [
          { id: 10, title: 'Tag A' },
          { id: 20, title: 'Tag B' },
        ],
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

  describe('user-choices type', () => {
    it('generates the mood + featured endpoint, with no depth', () => {
      const result = callHook({
        type: 'user-choices',
        limit: 20,
        userChoiceTypeFilters: ['mood'],
        userChoiceFeatured: 'featured',
      })
      expect(result).toBe(
        '/api/user-choices?where[type][in]=mood&where[isFeatured][equals]=true' +
          '&where[isParent][equals]=false&sort=order,id&limit=20',
      )
      // WeMeditate Web appends its own depth and strips a baked one.
      expect(result).not.toContain('depth')
    })

    it("omits the isFeatured clause for 'all'", () => {
      const result = callHook({
        type: 'user-choices',
        limit: 20,
        userChoiceTypeFilters: ['mood'],
        userChoiceFeatured: 'all',
      })
      expect(result).toBe(
        '/api/user-choices?where[type][in]=mood&where[isParent][equals]=false&sort=order,id&limit=20',
      )
      expect(result).not.toContain('isFeatured')
    })

    it("asks for the non-featured choices on 'not-featured'", () => {
      const result = callHook({
        type: 'user-choices',
        limit: 5,
        userChoiceTypeFilters: ['mood'],
        userChoiceFeatured: 'not-featured',
      })
      expect(result).toContain('where[isFeatured][equals]=false')
    })

    it('joins several kinds with commas', () => {
      const result = callHook({
        type: 'user-choices',
        limit: 10,
        userChoiceTypeFilters: ['mood', 'goal', 'duration'],
        userChoiceFeatured: 'featured',
      })
      expect(result).toContain('where[type][in]=mood,goal,duration')
    })

    it('always excludes parent categories, which name no meditation', () => {
      const result = callHook({
        type: 'user-choices',
        limit: 10,
        userChoiceTypeFilters: ['mood'],
        userChoiceFeatured: 'all',
      })
      expect(result).toContain('where[isParent][equals]=false')
    })

    it('returns null when no kind is selected', () => {
      expect(
        callHook({ type: 'user-choices', limit: 10, userChoiceFeatured: 'featured' }),
      ).toBeNull()
      expect(
        callHook({
          type: 'user-choices',
          limit: 10,
          userChoiceTypeFilters: [],
          userChoiceFeatured: 'featured',
        }),
      ).toBeNull()
    })

    it('returns null when the featured setting is missing or not an option', () => {
      expect(
        callHook({ type: 'user-choices', limit: 10, userChoiceTypeFilters: ['mood'] }),
      ).toBeNull()
      expect(
        callHook({
          type: 'user-choices',
          limit: 10,
          userChoiceTypeFilters: ['mood'],
          userChoiceFeatured: 'sometimes',
        }),
      ).toBeNull()
    })
  })

  describe('the four existing types are untouched', () => {
    /**
     * The `user-choices` type added its clauses through a new `params` builder
     * rather than by widening the one `filterField`/`queryParam` pair, so these
     * pin that the four endpoints WeMeditate Web and the app already read came
     * out of this change byte for byte.
     */
    it('spells each endpoint exactly as before', () => {
      expect(callHook({ type: 'meditations', limit: 6, userChoiceFilters: [1, 2] })).toBe(
        '/api/user-choices?where[id][in]=1,2&depth=1&limit=6',
      )
      expect(callHook({ type: 'pages', limit: 4, pageFilters: ['wisdom'] })).toBe(
        '/api/pages?where[tags][in]=wisdom&limit=4',
      )
      expect(callHook({ type: 'songs', limit: 5, songFilters: [3] })).toBe(
        '/api/songs?where[tags][in]=3&limit=5',
      )
      expect(callHook({ type: 'lectures', limit: 3 })).toBe(
        '/api/lectures/for-audience?limit=3',
      )
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

// --- Integration test — virtual field computed through Payload ---

describe('ContentIndexBlock apiEndpoint (integration)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id
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

  it('computes apiEndpoint for user-choices from both filter fields', async () => {
    const page = await createPageWithBlock({
      type: 'user-choices',
      limit: 20,
      userChoiceTypeFilters: ['mood'],
      userChoiceFeatured: 'featured',
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    expect(getBlockFields(fetched).apiEndpoint).toBe(
      '/api/user-choices?where[type][in]=mood&where[isFeatured][equals]=true' +
        '&where[isParent][equals]=false&sort=order,id&limit=20',
    )
  })

  it('clears the user-choice filter fields when the type changes away', async () => {
    const page = await createPageWithBlock({
      type: 'pages',
      limit: 10,
      pageFilters: ['wisdom'],
      // Stale state from an editor who chose User Choices first.
      userChoiceTypeFilters: ['mood'],
      userChoiceFeatured: 'featured',
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    const fields = getBlockFields(fetched)

    expect(fields.apiEndpoint).toBe('/api/pages?where[tags][in]=wisdom&limit=10')
    expect(fields).not.toHaveProperty('userChoiceTypeFilters')
    expect(fields).not.toHaveProperty('userChoiceFeatured')
  })

  /**
   * The block publishes a query string, so what it owes is that the string
   * works: this reads the computed endpoint back through Payload's own REST
   * parse, as an API client with the site's `select` and `depth=0`, and checks
   * which choices come out. Other cases in this file create user choices of
   * their own, so it asserts over the rows it made rather than the whole page.
   */
  it('answers the featured moods, in order, when read as a client', async () => {
    const mood = (overrides: Parameters<typeof testData.createUserChoice>[1]) =>
      testData.createUserChoice(payload, { type: 'mood', ...overrides })

    const parent = await mood({ title: `Parent ${uniqueId()}`, isFeatured: true, order: 1 })
    // `maintainIsParent` flips `isParent` on the parent once a child names it.
    await mood({ title: `Child ${uniqueId()}`, parent: parent.id, isFeatured: false, order: 9 })

    const tiedFirst = await mood({ title: `Tied A ${uniqueId()}`, isFeatured: true, order: 1 })
    const tiedSecond = await mood({ title: `Tied B ${uniqueId()}`, isFeatured: true, order: 1 })
    const later = await mood({ title: `Later ${uniqueId()}`, isFeatured: true, order: 2 })
    const notFeatured = await mood({ title: `Plain ${uniqueId()}`, isFeatured: false, order: 1 })
    const duration = await testData.createUserChoice(payload, {
      title: `Duration ${uniqueId()}`,
      type: 'duration',
      isFeatured: true,
      order: 1,
    })

    const page = await createPageWithBlock({
      type: 'user-choices',
      limit: 100,
      userChoiceTypeFilters: ['mood'],
      userChoiceFeatured: 'featured',
    })
    const fetched = await payload.findByID({ collection: 'pages', id: page.id, depth: 0 })
    const endpoint = getBlockFields(fetched).apiEndpoint as string

    const client = await testData.createClient(payload, adminUserId)
    const result = await payload.find({
      collection: 'user-choices',
      ...parseEndpointQuery(endpoint),
      // Both of these are WeMeditate Web's, not the endpoint's. The endpoint
      // carries no depth on purpose, and a client read at this config's default
      // depth is refused without `populate`; a client read with no `select` is
      // refused outright.
      depth: 0,
      select: {
        title: true,
        type: true,
        isFeatured: true,
        url: true,
        filename: true,
        color: true,
        morningMeditation: true,
        afternoonMeditation: true,
        eveningMeditation: true,
      },
      req: createClientAuthenticatedRequest(client.id, client.apiKey || 'test-key', [
        'wemeditate-web-client',
      ]) as PayloadRequest,
    })

    const returned = result.docs.map((doc) => doc.id)
    for (const excluded of [parent, notFeatured, duration]) {
      expect(returned).not.toContain(excluded.id)
    }

    // `order` first, then `id` as the tie-break the two `order: 1` moods need.
    const mine = returned.filter((id) =>
      [tiedFirst.id, tiedSecond.id, later.id].includes(id as number),
    )
    expect(mine).toEqual([tiedFirst.id, tiedSecond.id, later.id])
  })
})
