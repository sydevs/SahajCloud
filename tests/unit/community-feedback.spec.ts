import { describe, expect, it } from 'vitest'

import {
  computeCommunityVerdict,
  DENIAL_MINIMUM,
  communityFeedbackJsonSchema,
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

describe('communityFeedbackJsonSchema', () => {
  // The schema replaced a runtime reader: Payload generates the field's type
  // from it AND validates writes against it, so the shape is guaranteed on the
  // way in rather than defensively re-checked on the way out.
  it('declares exactly the three keys the sync hook writes', () => {
    expect(Object.keys(communityFeedbackJsonSchema.properties ?? {}).sort()).toEqual([
      'confirmations',
      'denials',
      'updatedAt',
    ])
  })

  it('is closed, so an unknown namespace key fails validation on write', () => {
    expect(communityFeedbackJsonSchema.additionalProperties).toBe(false)
  })
})
