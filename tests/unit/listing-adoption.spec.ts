import { describe, expect, it } from 'vitest'

import { newListingAdoption } from '@/lib/eventVerification'

describe('newListingAdoption', () => {
  /**
   * ⚠ **The silent half.** `skipVerifyHook` with a manager is what stamps a
   * listing `verified` with no `nextCheckAt`, which behaves correctly for a year
   * and then never comes up for re-verification.
   */
  it('runs the verification hook for an adopted listing, and states no stage', () => {
    expect(newListingAdoption(77)).toEqual({ data: {}, context: { skipVerifyHook: false } })
  })

  it('states `unverified` and skips the hook for a listing nobody has taken on', () => {
    expect(newListingAdoption(null)).toEqual({
      data: { verificationStage: 'unverified' },
      context: { skipVerifyHook: true },
    })
  })

  it('reads a populated manager as adopted, not as absent', () => {
    expect(newListingAdoption({ id: 77, name: 'Anna' }).context).toEqual({ skipVerifyHook: false })
  })

  // `relationId`'s own answer for each — a document with no numeric `id`
  // included, which is what a depth-0 read of a deleted manager comes back as.
  it.each([undefined, null, {}, { id: null }])('treats %p as unadopted', (manager) => {
    expect(newListingAdoption(manager).data).toEqual({ verificationStage: 'unverified' })
  })
})
