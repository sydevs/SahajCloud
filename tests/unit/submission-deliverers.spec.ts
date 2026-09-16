import { describe, expect, it } from 'vitest'

import { SUBMISSION_TYPES } from '@/collections/UserSubmissions/fields'
import { DELIVERERS } from '@/jobs/DeliverSubmissions/deliverers'

/**
 * The delivery registry is total over the submission types.
 *
 * `DeliveryRegistry` already keys on the generated `UserSubmission['type']`
 * union, so a missing deliverer is normally a compile error — this covers the
 * window where it is not. `SUBMISSION_TYPES` is what *generates* that union, so
 * between adding an option there and running `pnpm generate:types` the union is
 * stale, the `Record` is satisfied, and `DELIVERERS[submission.type]` would be
 * `undefined` at runtime: a `TypeError` in a job with no caller watching, on a
 * row that already passed screening.
 *
 * Both directions are asserted. A stale row the other way — a deliverer for a
 * type the collection no longer offers — is dead code the type checker cannot
 * see either, since an extra key satisfies the `Record` just as happily.
 */
describe('DELIVERERS', () => {
  it('has exactly one deliverer per submission type', () => {
    expect(Object.keys(DELIVERERS).sort()).toEqual([...SUBMISSION_TYPES].sort())
  })

  it('maps every type to a callable', () => {
    for (const type of SUBMISSION_TYPES) {
      expect(typeof DELIVERERS[type], `${type} should have a deliverer`).toBe('function')
    }
  })
})
