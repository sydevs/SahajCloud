/**
 * Expected Counts Configuration
 *
 * Minimum expected database counts for each import script.
 * Used to verify imports completed successfully.
 *
 * Verification passes if actual >= expected (allows multiple
 * importers to contribute to the same collections).
 */

export type ScriptName = 'tags' | 'wemeditate' | 'meditations' | 'storyblok'

export interface ExpectedCounts {
  [collection: string]: number
}

/**
 * Minimum expected counts per script.
 *
 * Sources:
 * - tags: Hardcoded in TagsImporter (27 meditation + 7 music)
 * - wemeditate: imports/wemeditate/data.json counts
 * - meditations: imports/meditations/data.json counts
 * - storyblok: Based on current Storyblok content
 */
export const EXPECTED_COUNTS: Record<ScriptName, ExpectedCounts> = {
  tags: {
    'meditation-tags': 27,
    'music-tags': 7,
  },
  wemeditate: {
    authors: 25,
    albums: 8,
    music: 27,
    pages: 86,
  },
  meditations: {
    meditations: 73,
    frames: 60,
  },
  storyblok: {
    lessons: 17,
    lectures: 10,
  },
}

/**
 * Get expected counts for a script
 */
export function getExpectedCounts(script: ScriptName): ExpectedCounts {
  return EXPECTED_COUNTS[script] || {}
}

/**
 * Verify actual counts against expected minimums
 */
export interface VerificationResult {
  collection: string
  actual: number
  expected: number
  passed: boolean
}

export function verifyCountsForScript(
  script: ScriptName,
  actualCounts: Record<string, number>,
): { results: VerificationResult[]; allPassed: boolean } {
  const expected = EXPECTED_COUNTS[script]
  const results: VerificationResult[] = []
  let allPassed = true

  for (const [collection, expectedCount] of Object.entries(expected)) {
    const actual = actualCounts[collection] || 0
    const passed = actual >= expectedCount
    results.push({ collection, actual, expected: expectedCount, passed })
    if (!passed) allPassed = false
  }

  return { results, allPassed }
}
