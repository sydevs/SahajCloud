import { describe, it, expect } from 'vitest'

import { activeRegistrationWhere } from '@/lib/registrations/active'

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
import {
  getDefaultBatchSize,
  validatePaginationParam,
  type PaginationOptions,
} from '../../seeds/lib/pagination'

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
    it('returns metadata for tags script', () => {
      const metadata = getScriptMetadata('tags')

      expect(metadata).toBeDefined()
      expect(metadata.collections).toHaveLength(2)
      expect(metadata.collections[0].slug).toBe('user-choices')
      expect(metadata.collections[1].slug).toBe('song-tags')
      // image-tags removed - now inline enum strings on Images collection
      expect(metadata.requiresPagination).toBe(false)
      expect(metadata.totalItems).toBe(34) // 27 + 7 (no more image-tags)
    })

    it('returns metadata for wemeditate script', () => {
      const metadata = getScriptMetadata('wemeditate')

      expect(metadata).toBeDefined()
      expect(metadata.collections).toHaveLength(5)
      expect(metadata.collections.map((c) => c.slug)).toEqual([
        'authors',
        'albums',
        'songs',
        'pages',
        'lectures',
      ])
      expect(metadata.requiresPagination).toBe(true) // pages requires pagination
    })

    it('returns metadata for meditations script', () => {
      const metadata = getScriptMetadata('meditations')

      expect(metadata).toBeDefined()
      expect(metadata.collections).toHaveLength(3)
      expect(metadata.collections.map((c) => c.slug)).toEqual([
        'narrators',
        'frames',
        'meditations',
      ])
      expect(metadata.requiresPagination).toBe(true) // frames and meditations require pagination
    })

    it('returns metadata for storyblok script', () => {
      const metadata = getScriptMetadata('storyblok')

      expect(metadata).toBeDefined()
      expect(metadata.collections).toHaveLength(2)
      expect(metadata.collections.map((c) => c.slug)).toEqual(['lessons', 'lectures'])
      expect(metadata.requiresPagination).toBe(true) // lessons requires pagination for consistency
    })

    it('includes a recommended batch size', () => {
      const metadata = getScriptMetadata('tags')

      expect(metadata.recommendedBatchSize).toBeGreaterThan(0)
    })
  })

  describe('getCollectionMetadata', () => {
    it('returns metadata for a specific collection', () => {
      const framesMetadata = getCollectionMetadata('meditations', 'frames')

      expect(framesMetadata).toBeDefined()
      expect(framesMetadata?.slug).toBe('frames')
      expect(framesMetadata?.totalItems).toBe(60)
      expect(framesMetadata?.requiresPagination).toBe(true)
      expect(framesMetadata?.hasFileUploads).toBe(true)
    })

    it('returns undefined for non-existent collection', () => {
      const metadata = getCollectionMetadata('meditations', 'non-existent')
      expect(metadata).toBeUndefined()
    })
  })

  describe('getExpectedCounts', () => {
    const scripts: ScriptName[] = ['tags', 'wemeditate', 'meditations', 'storyblok']

    scripts.forEach((script) => {
      it(`returns expected counts for ${script}`, () => {
        const counts = getExpectedCounts(script)

        expect(counts).toBeDefined()
        expect(Object.keys(counts).length).toBeGreaterThan(0)
      })
    })
  })

  describe('verifyCountsForScript', () => {
    it('passes when actual counts meet expected minimums', () => {
      const actualCounts = {
        'user-choices': 30,
        'song-tags': 10,
      }

      const { results, allPassed } = verifyCountsForScript('tags', actualCounts)

      expect(allPassed).toBe(true)
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.passed)).toBe(true)
    })

    it('fails when actual counts are below expected', () => {
      const actualCounts = {
        'user-choices': 10, // Expected is 27
        'song-tags': 7,
      }

      const { results, allPassed } = verifyCountsForScript('tags', actualCounts)

      expect(allPassed).toBe(false)
      const failedResult = results.find((r) => r.collection === 'user-choices')
      expect(failedResult?.passed).toBe(false)
    })

    it('handles missing collections as zero count', () => {
      const actualCounts = {
        'user-choices': 30,
        // song-tags missing
      }

      const { results, allPassed } = verifyCountsForScript('tags', actualCounts)

      expect(allPassed).toBe(false)
      const musicResult = results.find((r) => r.collection === 'song-tags')
      expect(musicResult?.actual).toBe(0)
      expect(musicResult?.passed).toBe(false)
    })

    describe('with pagination', () => {
      it('adjusts expected count for paginated collection', () => {
        const actualCounts = {
          'user-choices': 10,
          'song-tags': 7,
        }
        const pagination = { collection: 'user-choices', offset: 0, limit: 10 }
        const { results, allPassed } = verifyCountsForScript('tags', actualCounts, pagination)

        // user-choices: expects min(0+10, 27) = 10, actual = 10 → passes
        const meditationResult = results.find((r) => r.collection === 'user-choices')
        expect(meditationResult?.expected).toBe(10)
        expect(meditationResult?.passed).toBe(true)
        expect(allPassed).toBe(true)
      })

      it('uses full expected count for non-paginated collections', () => {
        const actualCounts = {
          'user-choices': 10,
          'song-tags': 7,
        }
        const pagination = { collection: 'user-choices', offset: 0, limit: 10 }
        const { results } = verifyCountsForScript('tags', actualCounts, pagination)

        // song-tags: not paginated, expects full 7
        const songResult = results.find((r) => r.collection === 'song-tags')
        expect(songResult?.expected).toBe(7)
      })

      it('caps adjusted expected at full count', () => {
        const actualCounts = {
          'user-choices': 27,
          'song-tags': 7,
        }
        const pagination = { collection: 'user-choices', offset: 20, limit: 100 }
        const { results } = verifyCountsForScript('tags', actualCounts, pagination)

        // Expected = min(20+100, 27) = 27 (capped at full count)
        const meditationResult = results.find((r) => r.collection === 'user-choices')
        expect(meditationResult?.expected).toBe(27)
      })

      it('does not adjust when limit is 0 (bulk import)', () => {
        const actualCounts = {
          'user-choices': 10,
          'song-tags': 7,
        }
        const pagination = { collection: 'user-choices', offset: 0, limit: 0 }
        const { results, allPassed } = verifyCountsForScript('tags', actualCounts, pagination)

        // limit=0 means bulk import, should use full expected count (27)
        const meditationResult = results.find((r) => r.collection === 'user-choices')
        expect(meditationResult?.expected).toBe(27)
        expect(meditationResult?.passed).toBe(false) // actual 10 < expected 27
        expect(allPassed).toBe(false)
      })

      it('adjusts for intermediate batch correctly', () => {
        // Simulating batch 3 of pages import (offset=20, limit=10)
        const actualCounts = {
          authors: 18,
          albums: 8,
          songs: 27,
          pages: 30, // After 3 batches
          lectures: 40,
        }
        const pagination = { collection: 'pages', offset: 20, limit: 10 }
        const { results, allPassed } = verifyCountsForScript('wemeditate', actualCounts, pagination)

        // pages: expects min(20+10, 60) = 30, actual = 30 → passes
        const pagesResult = results.find((r) => r.collection === 'pages')
        expect(pagesResult?.expected).toBe(30)
        expect(pagesResult?.passed).toBe(true)

        // Other collections use full expected counts
        const authorsResult = results.find((r) => r.collection === 'authors')
        expect(authorsResult?.expected).toBe(18)

        expect(allPassed).toBe(true)
      })
    })
  })
})

describe('Pagination Options', () => {
  describe('PaginationOptions type', () => {
    it('accepts valid pagination options', () => {
      const options: PaginationOptions = {
        offset: 0,
        limit: 25,
        collection: 'meditations',
      }

      expect(options.offset).toBe(0)
      expect(options.limit).toBe(25)
      expect(options.collection).toBe('meditations')
    })

    it('allows optional collection field', () => {
      const options: PaginationOptions = {
        offset: 10,
        limit: 50,
      }

      expect(options.collection).toBeUndefined()
    })
  })
})

describe('Collection Metadata', () => {
  describe('dependency ordering', () => {
    it('lists wemeditate collections in dependency order', () => {
      const metadata = getScriptMetadata('wemeditate')
      const slugs = metadata.collections.map((c) => c.slug)

      // Authors must come before pages (authors are referenced by pages)
      expect(slugs.indexOf('authors')).toBeLessThan(slugs.indexOf('pages'))

      // Albums must come before songs (albums are referenced by songs)
      expect(slugs.indexOf('albums')).toBeLessThan(slugs.indexOf('songs'))
    })

    it('lists meditations collections in dependency order', () => {
      const metadata = getScriptMetadata('meditations')
      const slugs = metadata.collections.map((c) => c.slug)

      // Narrators must come before meditations
      expect(slugs.indexOf('narrators')).toBeLessThan(slugs.indexOf('meditations'))

      // Frames must come before meditations
      expect(slugs.indexOf('frames')).toBeLessThan(slugs.indexOf('meditations'))
    })
  })

  describe('pagination requirements', () => {
    it('marks small collections as not requiring pagination', () => {
      const metadata = getScriptMetadata('tags')
      const meditationTags = metadata.collections.find((c) => c.slug === 'user-choices')
      const songTags = metadata.collections.find((c) => c.slug === 'song-tags')

      expect(meditationTags?.requiresPagination).toBe(false)
      expect(songTags?.requiresPagination).toBe(false)
    })

    it('marks large collections as requiring pagination', () => {
      const metadata = getScriptMetadata('wemeditate')
      const pages = metadata.collections.find((c) => c.slug === 'pages')

      expect(pages?.requiresPagination).toBe(true)
    })

    it('identifies collections with file uploads', () => {
      const metadata = getScriptMetadata('meditations')
      const frames = metadata.collections.find((c) => c.slug === 'frames')
      const meditations = metadata.collections.find((c) => c.slug === 'meditations')

      expect(frames?.hasFileUploads).toBe(true)
      expect(meditations?.hasFileUploads).toBe(true)
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
  'meditation-transcripts': /the target still carries/,
  'wm-app-translations': /global/,
  translations: /global/,
}

describe('a script that can state no floor says so', () => {
  const unverifiable = ALL_SCRIPTS.filter((script) => isNotApplicable(EXPECTED_COUNTS[script]))

  it("covers the globals-only scripts, and the one whose floor is the target's own library", () => {
    expect(unverifiable).toEqual(Object.keys(NO_FLOOR_REASONS))
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
    const { skippedReason, results } = verifyCountsForScript('tags', {
      'user-choices': 27,
      'song-tags': 7,
    })

    expect(skippedReason).toBeUndefined()
    expect(results).toHaveLength(2)
  })
})

describe('getCountTargets', () => {
  it('drops a step that lands in no collection of its own', () => {
    const atlas = getCountTargets('atlas').map((target) => target.collection)

    expect(atlas).not.toContain('pictures')
    expect(atlas).toContain('user-submissions')
  })

  it('keeps the script metadata order', () => {
    expect(getCountTargets('meditations').map((target) => target.collection)).toEqual([
      'narrators',
      'frames',
      'meditations',
    ])
  })

  it('carries the filter the atlas registration floor is stated under', () => {
    const registrations = getCountTargets('atlas').find(
      (target) => target.collection === 'user-submissions',
    )

    // An unfiltered count passes on contact, subscribe and proposal rows alone.
    expect(registrations?.where).toEqual(activeRegistrationWhere)
    expect(getCountTargets('tags').every((target) => target.where === undefined)).toBe(true)
  })

  /**
   * The invariant the seed route's `getDatabaseCounts` rests on. It was broken:
   * `wemeditate` expected 40 lectures the route never counted, so every run of
   * that script reported verification failed on 0.
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
