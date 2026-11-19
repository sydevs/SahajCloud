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

const ALL_SCRIPTS = Object.keys(EXPECTED_COUNTS) as ScriptName[]

/**
 * ⚠ **No surviving script states a collection floor**, so nothing here can
 * exercise `verifyCountsForScript`'s floor arithmetic or a dependency order.
 * #1169 retired the one-shot importers and #1181 the `preview-fixture` seed,
 * which was the last registry with steps in it. What is left are the
 * registry-wide invariants, which hold over an empty registry and fail the day
 * a script is added that breaks one.
 */
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
    it('answers with no collections for a script that targets globals', () => {
      expect(getScriptMetadata('translations').collections).toEqual([])
    })

    it('includes a recommended batch size even with no collections to page', () => {
      expect(getScriptMetadata('translations').recommendedBatchSize).toBe(
        getDefaultBatchSize(false),
      )
    })
  })

  describe('getCollectionMetadata', () => {
    it('returns undefined for a collection the script does not declare', () => {
      expect(getCollectionMetadata('translations', 'non-existent')).toBeUndefined()
    })
  })
})

describe('Collection Metadata', () => {
  describe('dependency ordering', () => {
    it('lists every step after the steps it depends on', () => {
      for (const script of ALL_SCRIPTS) {
        const slugs = getScriptMetadata(script).collections.map((c) => c.slug)

        for (const step of getScriptMetadata(script).collections) {
          for (const dependency of step.dependencies) {
            // Named first: `indexOf` answers -1 for a step that does not exist,
            // and -1 is less than every index, so the ordering check blesses it.
            expect(slugs, `${step.slug} → ${dependency}`).toContain(dependency)
            expect(slugs.indexOf(dependency), `${step.slug} → ${dependency}`).toBeLessThan(
              slugs.indexOf(step.slug),
            )
          }
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

// Each script that states no floor, and the reason it gives. A closed list in
// both directions: a new `{}` entry fails the membership case, and a reason
// rewritten into something vaguer fails its own.
const NO_FLOOR_REASONS: Partial<Record<ScriptName, RegExp>> = {
  'file-transcripts': /without a transcript/,
  translations: /global/,
  'wm-web-locales': /global/,
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
})

describe('getCountTargets', () => {
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
