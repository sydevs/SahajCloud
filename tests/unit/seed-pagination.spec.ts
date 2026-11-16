import { describe, it, expect } from 'vitest'

import {
  EXPECTED_COUNTS,
  getCountTargets,
  getScriptMetadata,
  getExpectedCounts,
  isNotApplicable,
  verifyCountsForScript,
  getCollectionMetadata,
  type ScriptName,
} from '../../seeds/lib/expectedCounts'
import { getDefaultBatchSize, validatePaginationParam } from '../../seeds/lib/pagination'

/**
 * `preview-fixture` is the only script left that states collection floors, so
 * every case here reads its registry rather than a literal of its own.
 */
const FIXTURE_COUNTS = getExpectedCounts('preview-fixture')

describe('Pagination Utilities', () => {
  describe('getDefaultBatchSize', () => {
    it('returns 100 without file uploads', () => {
      const batchSize = getDefaultBatchSize(false)
      expect(batchSize).toBe(100)
    })

    it('returns 10 with file uploads', () => {
      // File uploads use a reduced batch size to avoid I/O overhead
      const batchSize = getDefaultBatchSize(true)
      expect(batchSize).toBe(10)
    })
  })

  describe('getScriptMetadata', () => {
    it('returns the fixture script metadata', () => {
      const metadata = getScriptMetadata('preview-fixture')

      expect(metadata.collections.map((c) => c.slug)).toEqual([
        'managers',
        'regions',
        'forms',
        'events',
        'users',
        'user-submissions',
      ])
      expect(metadata.requiresPagination).toBe(false)
      // Summed across every step, not read off one of them.
      expect(metadata.totalItems).toBeGreaterThan(
        Math.max(...metadata.collections.map((c) => c.totalItems)),
      )
    })

    it('answers with no collections for a script that targets globals', () => {
      expect(getScriptMetadata('translations').collections).toEqual([])
    })

    it('includes a recommended batch size', () => {
      expect(getScriptMetadata('preview-fixture').recommendedBatchSize).toBeGreaterThan(0)
    })
  })

  describe('getCollectionMetadata', () => {
    it('returns metadata for a specific collection', () => {
      const regions = getCollectionMetadata('preview-fixture', 'regions')

      expect(regions?.slug).toBe('regions')
      expect(regions?.dependencies).toEqual(['managers'])
      expect(regions?.requiresPagination).toBe(false)
    })

    it('returns undefined for non-existent collection', () => {
      expect(getCollectionMetadata('preview-fixture', 'non-existent')).toBeUndefined()
    })
  })

  describe('getExpectedCounts', () => {
    it('returns the floors a script declares', () => {
      expect(Object.keys(getExpectedCounts('preview-fixture')).length).toBeGreaterThan(0)
    })
  })

  describe('verifyCountsForScript', () => {
    /** Every floor met exactly, which each case then varies one entry of. */
    const atTheFloor = () => ({ ...FIXTURE_COUNTS })

    it('passes when actual counts meet expected minimums', () => {
      const { results, allPassed } = verifyCountsForScript('preview-fixture', atTheFloor())

      expect(allPassed).toBe(true)
      expect(results).toHaveLength(Object.keys(FIXTURE_COUNTS).length)
      expect(results.every((r) => r.passed)).toBe(true)
    })

    it('fails when actual counts are below expected', () => {
      const { results, allPassed } = verifyCountsForScript('preview-fixture', {
        ...atTheFloor(),
        users: FIXTURE_COUNTS.users - 1,
      })

      expect(allPassed).toBe(false)
      expect(results.find((r) => r.collection === 'users')?.passed).toBe(false)
    })

    it('handles missing collections as zero count', () => {
      const { users: _omitted, ...withoutUsers } = atTheFloor()
      const { results, allPassed } = verifyCountsForScript('preview-fixture', withoutUsers)

      expect(allPassed).toBe(false)
      const usersResult = results.find((r) => r.collection === 'users')
      expect(usersResult?.actual).toBe(0)
      expect(usersResult?.passed).toBe(false)
    })

    describe('with pagination', () => {
      it('adjusts expected count for the paginated collection', () => {
        const limit = FIXTURE_COUNTS.users - 2
        const { results, allPassed } = verifyCountsForScript(
          'preview-fixture',
          { ...atTheFloor(), users: limit },
          { collection: 'users', offset: 0, limit },
        )

        // users: expects min(0 + limit, floor) = limit, actual = limit → passes
        expect(results.find((r) => r.collection === 'users')?.expected).toBe(limit)
        expect(allPassed).toBe(true)
      })

      it('uses full expected count for the collections not being paginated', () => {
        const { results } = verifyCountsForScript('preview-fixture', atTheFloor(), {
          collection: 'users',
          offset: 0,
          limit: 1,
        })

        expect(results.find((r) => r.collection === 'regions')?.expected).toBe(
          FIXTURE_COUNTS.regions,
        )
      })

      it('adjusts for an intermediate batch — the offset counts too', () => {
        // Resuming at row 2 with a batch of 2 expects 4, not 2. Dropping the
        // `offset` term from `min(offset + limit, floor)` has to fail here.
        const { results, allPassed } = verifyCountsForScript(
          'preview-fixture',
          { ...atTheFloor(), users: 4 },
          { collection: 'users', offset: 2, limit: 2 },
        )

        expect(results.find((r) => r.collection === 'users')?.expected).toBe(4)
        expect(allPassed).toBe(true)
      })

      it('caps adjusted expected at full count', () => {
        const { results } = verifyCountsForScript('preview-fixture', atTheFloor(), {
          collection: 'users',
          offset: 20,
          limit: 100,
        })

        // Expected = min(20 + 100, floor) = floor
        expect(results.find((r) => r.collection === 'users')?.expected).toBe(FIXTURE_COUNTS.users)
      })

      it('does not adjust when limit is 0 (bulk import)', () => {
        const { results, allPassed } = verifyCountsForScript(
          'preview-fixture',
          { ...atTheFloor(), users: 1 },
          { collection: 'users', offset: 0, limit: 0 },
        )

        const users = results.find((r) => r.collection === 'users')
        expect(users?.expected).toBe(FIXTURE_COUNTS.users)
        expect(users?.passed).toBe(false)
        expect(allPassed).toBe(false)
      })
    })
  })
})

describe('Collection Metadata', () => {
  describe('dependency ordering', () => {
    it('lists every step after the steps it depends on', () => {
      const slugs = getScriptMetadata('preview-fixture').collections.map((c) => c.slug)

      for (const step of getScriptMetadata('preview-fixture').collections) {
        for (const dependency of step.dependencies) {
          // Named first: `indexOf` answers -1 for a step that does not exist,
          // and -1 is less than every index, so the ordering check blesses it.
          expect(slugs, `${step.slug} → ${dependency}`).toContain(dependency)
          expect(slugs.indexOf(dependency), `${step.slug} → ${dependency}`).toBeLessThan(
            slugs.indexOf(step.slug),
          )
        }
      }
    })
  })
})

describe('validatePaginationParam', () => {
  it('returns null when the param is omitted', () => {
    expect(validatePaginationParam('offset', null)).toBeNull()
    expect(validatePaginationParam('limit', null)).toBeNull()
  })

  it('accepts non-negative integer strings, including 0', () => {
    expect(validatePaginationParam('offset', '0')).toBeNull()
    expect(validatePaginationParam('offset', '42')).toBeNull()
    expect(validatePaginationParam('limit', '100')).toBeNull()
  })

  it('rejects non-integer, negative, decimal, and empty values with a 400-shaped error', () => {
    expect(validatePaginationParam('offset', 'abc')).toEqual({
      error: 'Invalid offset parameter',
      hint: 'offset must be a non-negative integer',
    })
    expect(validatePaginationParam('limit', '-1')?.error).toBe('Invalid limit parameter')
    expect(validatePaginationParam('offset', '1.5')?.error).toBe('Invalid offset parameter')
    expect(validatePaginationParam('limit', '')?.error).toBe('Invalid limit parameter')
  })
})

const ALL_SCRIPTS = Object.keys(EXPECTED_COUNTS) as ScriptName[]

// Each script that states no floor, and the reason it gives. A closed list in
// both directions: a new `{}` entry fails the membership case, and a reason
// rewritten into something vaguer fails its own.
const NO_FLOOR_REASONS: Partial<Record<ScriptName, RegExp>> = {
  'file-transcripts': /without a transcript/,
  translations: /global/,
}

describe('a script that can state no floor says so', () => {
  const unverifiable = ALL_SCRIPTS.filter((script) => isNotApplicable(EXPECTED_COUNTS[script]))

  it("covers the globals-only script, and the one whose floor is the target's own library", () => {
    expect(unverifiable.sort()).toEqual(Object.keys(NO_FLOOR_REASONS).sort())
  })

  unverifiable.forEach((script) => {
    it(`reports ${script}'s reason rather than passing silently`, () => {
      const { results, allPassed, skippedReason } = verifyCountsForScript(script, {})

      expect(results).toEqual([])
      expect(allPassed).toBe(true)
      expect(skippedReason).toMatch(NO_FLOOR_REASONS[script]!)
      // Nothing to count and no floor to count against, consistently.
      expect(getExpectedCounts(script)).toEqual({})
      expect(getCountTargets(script)).toEqual([])
    })
  })

  it('leaves a verifiable script reporting no reason', () => {
    const { skippedReason, results } = verifyCountsForScript('preview-fixture', {
      ...FIXTURE_COUNTS,
    })

    expect(skippedReason).toBeUndefined()
    expect(results).toHaveLength(Object.keys(FIXTURE_COUNTS).length)
  })
})

describe('getCountTargets', () => {
  it('keeps the script metadata order', () => {
    expect(getCountTargets('preview-fixture').map((target) => target.collection)).toEqual([
      'managers',
      'regions',
      'forms',
      'events',
      'users',
      'user-submissions',
    ])
  })

  it('carries the filter a floor is stated under, and nothing more', () => {
    const targets = getCountTargets('preview-fixture')
    const registrations = targets.find((target) => target.collection === 'user-submissions')

    // Literal, not read back from the registry: an unfiltered count passes on
    // contact rows alone, and `pending` is the status the fixture exists to
    // show, so a floor counting `accepted` would pass while it was gone.
    expect(registrations?.where).toEqual({
      and: [{ status: { equals: 'pending' } }, { type: { equals: 'registration' } }],
    })
    expect(targets.find((target) => target.collection === 'managers')?.where).toBeUndefined()
  })

  /**
   * The invariant the seed route's `getDatabaseCounts` rests on. It was broken
   * once: a script expected 40 rows in a collection the route never counted, so
   * every run of it reported verification failed on 0.
   */
  it('covers every floor every script declares', () => {
    const uncounted = ALL_SCRIPTS.flatMap((script) => {
      const counted = new Set<string>(getCountTargets(script).map((target) => target.collection))
      return Object.keys(getExpectedCounts(script))
        .filter((collection) => !counted.has(collection))
        .map((collection) => `${script}:${collection}`)
    })

    expect(uncounted).toEqual([])
  })
})
