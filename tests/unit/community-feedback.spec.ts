import { describe, expect, it } from 'vitest'

import {
  computeCommunityVerdict,
  DENIAL_MINIMUM,
  readCommunityFeedback,
  WILSON_UPPER_BOUND_THRESHOLD,
} from '@/lib/eventVerification/communityFeedback'

describe('computeCommunityVerdict', () => {
  it('has no verdict before the first vote', () => {
    expect(computeCommunityVerdict({ confirmations: 0, denials: 0 })).toEqual({
      score: null,
      upperBound: null,
      denied: false,
    })
  })

  it('scores with the Wilson lower bound (conservative on few votes)', () => {
    const few = computeCommunityVerdict({ confirmations: 2, denials: 0 })
    const many = computeCommunityVerdict({ confirmations: 20, denials: 0 })
    expect(few.score).not.toBeNull()
    expect(many.score).not.toBeNull()
    // Same 100% positive ratio, but more votes ⇒ more confidence ⇒ higher rank.
    expect(many.score!).toBeGreaterThan(few.score!)
  })

  it(`denies at ≥${DENIAL_MINIMUM} denials when even the optimistic bound is under ${WILSON_UPPER_BOUND_THRESHOLD}`, () => {
    expect(computeCommunityVerdict({ confirmations: 0, denials: 5 }).denied).toBe(true)
  })

  it('never denies under the denial minimum, however damning the ratio', () => {
    expect(computeCommunityVerdict({ confirmations: 0, denials: 4 }).denied).toBe(false)
  })

  it('a single confirmation among 5 denials keeps the verdict open', () => {
    const verdict = computeCommunityVerdict({ confirmations: 1, denials: 5 })
    expect(verdict.upperBound!).toBeGreaterThanOrEqual(WILSON_UPPER_BOUND_THRESHOLD)
    expect(verdict.denied).toBe(false)
  })
})

describe('readCommunityFeedback', () => {
  it('round-trips the shape the sync hook writes', () => {
    expect(
      readCommunityFeedback({
        communityFeedback: { confirmations: 3, denials: 1, updatedAt: '2026-08-11T00:00:00Z' },
        otherNamespace: { anything: true },
      }),
    ).toEqual({ confirmations: 3, denials: 1, updatedAt: '2026-08-11T00:00:00Z' })
  })

  it('returns null for absent or malformed metadata', () => {
    expect(readCommunityFeedback(null)).toBeNull()
    expect(readCommunityFeedback({})).toBeNull()
    expect(readCommunityFeedback({ communityFeedback: { confirmations: 'many' } })).toBeNull()
  })
})
